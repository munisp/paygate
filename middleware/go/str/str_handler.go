// middleware/go/str/str_handler.go
// STR (Suspicious Transaction Report) goAML bridge handler.
// Wires: Permify authz → Redis cache → NFIU goAML REST → Kafka publish →
//        Fluvio stream → Dapr pub/sub → Lakehouse audit write.
package str

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	dapr "github.com/dapr/go-sdk/client"
)

// ErrGoAMLUnconfigured is a sentinel returned when the NFIU goAML integration
// has not been configured (missing URL or API key). Regulatory submissions
// must fail loud — never fabricate a regulator acknowledgement.
var ErrGoAMLUnconfigured = errors.New("goAML integration not configured (NFIU_GOAML_URL / NFIU_GOAML_API_KEY unset)")

// ─── Types ────────────────────────────────────────────────────────────────────

type STRSubmitRequest struct {
	STRID      string          `json:"strId" binding:"required"`
	MerchantID string          `json:"merchantId" binding:"required"`
	TenantID   string          `json:"tenantId" binding:"required"`
	ReportRef  string          `json:"reportRef" binding:"required"`
	Payload    json.RawMessage `json:"payload" binding:"required"` // goAML XML/JSON payload
}

type STRStatusRequest struct {
	STRID      string `json:"strId" binding:"required"`
	MerchantID string `json:"merchantId" binding:"required"`
	NFIURef    string `json:"nfiuRef"`
}

type GoAMLResponse struct {
	Status     string `json:"status"`
	NFIURef    string `json:"nfiuRef"`
	Message    string `json:"message"`
	ReceivedAt string `json:"receivedAt"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type STRHandler struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
	daprClient  dapr.Client
	goAMLURL    string
	goAMLKey    string
	fluvioURL   string
	internalKey string
}

func NewSTRHandler(rdb *redis.Client, kw *kafka.Writer, dc dapr.Client) *STRHandler {
	return &STRHandler{
		redis:       rdb,
		kafkaWriter: kw,
		daprClient:  dc,
		goAMLURL:    getEnv("NFIU_GOAML_URL", "https://goaml.nfiu.gov.ng/api/v1"),
		goAMLKey:    getEnv("NFIU_GOAML_API_KEY", ""),
		fluvioURL:   getEnv("FLUVIO_ENDPOINT", "http://localhost:9003"),
		internalKey: getEnv("MIDDLEWARE_INTERNAL_KEY", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// SubmitToNFIU submits an STR to NFIU goAML and fans out to Kafka + Fluvio + Dapr.
func (h *STRHandler) SubmitToNFIU(c *gin.Context) {
	ctx := c.Request.Context()
	var req STRSubmitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Permify authz: check str:submit permission
	if !h.checkPermify(ctx, req.MerchantID, "str", "submit") {
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions to submit STR"})
		return
	}

	// 2. Idempotency check via Redis
	cacheKey := fmt.Sprintf("str:submitted:%s", req.STRID)
	if cached, err := h.redis.Get(ctx, cacheKey).Result(); err == nil {
		var resp GoAMLResponse
		_ = json.Unmarshal([]byte(cached), &resp)
		c.JSON(http.StatusOK, gin.H{"cached": true, "result": resp})
		return
	}

	// 3. Submit to NFIU goAML
	goAMLResp, err := h.submitGoAML(ctx, req)
	if err != nil {
		// Publish failure event to Kafka
		_ = h.publishKafka(ctx, "paygate.str.submission_failed", map[string]interface{}{
			"strId":      req.STRID,
			"merchantId": req.MerchantID,
			"error":      err.Error(),
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
		if errors.Is(err, ErrGoAMLUnconfigured) {
			// Fail loud: the STR was NOT filed with the regulator.
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"code":  "goaml_unconfigured",
				"filed": false,
				"error": "STR was NOT filed: goAML integration is not configured on this deployment",
			})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "goAML submission failed", "detail": err.Error(), "filed": false})
		return
	}

	// 4. Cache result in Redis (TTL 24h)
	if data, err := json.Marshal(goAMLResp); err == nil {
		_ = h.redis.Set(ctx, cacheKey, string(data), 24*time.Hour).Err()
	}

	// 5. Publish to Kafka paygate.str.submitted
	_ = h.publishKafka(ctx, "paygate.str.submitted", map[string]interface{}{
		"strId":      req.STRID,
		"merchantId": req.MerchantID,
		"tenantId":   req.TenantID,
		"reportRef":  req.ReportRef,
		"nfiuRef":    goAMLResp.NFIURef,
		"status":     goAMLResp.Status,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})

	// 6. Publish to Fluvio paygate.str.events topic
	_ = h.publishFluvio(ctx, "paygate.str.events", map[string]interface{}{
		"eventType":  "str_submitted",
		"strId":      req.STRID,
		"merchantId": req.MerchantID,
		"nfiuRef":    goAMLResp.NFIURef,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})

	// 7. Dapr pub/sub notification
	if h.daprClient != nil {
		payload, _ := json.Marshal(map[string]interface{}{
			"type":       "str_submitted",
			"strId":      req.STRID,
			"merchantId": req.MerchantID,
			"nfiuRef":    goAMLResp.NFIURef,
		})
		_ = h.daprClient.PublishEvent(ctx, "pubsub", "str-events", payload)
	}

	// 8. Write to Lakehouse audit log
	go h.writeLakehouse(req.STRID, req.MerchantID, goAMLResp)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"filed":   true,
		"nfiuRef": goAMLResp.NFIURef,
		"status":  goAMLResp.Status,
		"message": goAMLResp.Message,
	})
}

// PollNFIUStatus polls NFIU goAML for STR acknowledgement status.
func (h *STRHandler) PollNFIUStatus(c *gin.Context) {
	ctx := c.Request.Context()
	var req STRStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.NFIURef == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nfiuRef is required"})
		return
	}

	// Check Redis cache first
	cacheKey := fmt.Sprintf("str:ack:%s", req.NFIURef)
	if cached, err := h.redis.Get(ctx, cacheKey).Result(); err == nil {
		c.JSON(http.StatusOK, gin.H{"cached": true, "status": cached})
		return
	}

	status, err := h.pollGoAML(ctx, req.NFIURef)
	if err != nil {
		if errors.Is(err, ErrGoAMLUnconfigured) {
			// Fail loud: filing status cannot be verified without a configured goAML integration.
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"code":  "goaml_unconfigured",
				"filed": false,
				"error": "STR filing status unavailable: goAML integration is not configured on this deployment",
			})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "filed": false})
		return
	}

	if status == "acknowledged" {
		_ = h.redis.Set(ctx, cacheKey, status, 7*24*time.Hour).Err()
		_ = h.publishKafka(ctx, "paygate.str.acknowledged", map[string]interface{}{
			"strId":      req.STRID,
			"merchantId": req.MerchantID,
			"nfiuRef":    req.NFIURef,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
		_ = h.publishFluvio(ctx, "paygate.str.events", map[string]interface{}{
			"eventType":  "str_acknowledged",
			"strId":      req.STRID,
			"merchantId": req.MerchantID,
			"nfiuRef":    req.NFIURef,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{"status": status, "nfiuRef": req.NFIURef, "filed": true})
}

// ─── Private helpers ──────────────────────────────────────────────────────────

func (h *STRHandler) checkPermify(ctx context.Context, merchantID, entity, permission string) bool {
	permifyURL := os.Getenv("PERMIFY_URL")
	if permifyURL == "" {
		// Fail closed: STR endpoints are regulatory — deny when authz is not configured.
		log.Printf("[str] SECURITY: Permify not configured (PERMIFY_URL unset) — denying %s:%s for merchant %s", entity, permission, merchantID)
		return false
	}
	body, _ := json.Marshal(map[string]interface{}{
		"tenantId": "t1",
		"metadata": map[string]interface{}{"snapToken": "", "depth": 20},
		"entity":   map[string]string{"type": entity, "id": merchantID},
		"permission": permission,
		"subject":  map[string]interface{}{"type": "merchant", "id": merchantID},
	})
	req, _ := http.NewRequestWithContext(ctx, "POST",
		permifyURL+"/v1/tenants/t1/permissions/check", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("PERMIFY_API_KEY"))
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		// Fail closed on authz errors.
		log.Printf("[str] SECURITY: Permify check failed (%v) — denying %s:%s for merchant %s", err, entity, permission, merchantID)
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("[str] SECURITY: Permify returned HTTP %d — denying %s:%s for merchant %s", resp.StatusCode, entity, permission, merchantID)
		return false
	}
	var result struct{ Can string `json:"can"` }
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[str] SECURITY: Permify response undecodable (%v) — denying %s:%s for merchant %s", err, entity, permission, merchantID)
		return false
	}
	return result.Can == "CHECK_RESULT_ALLOWED"
}

func (h *STRHandler) submitGoAML(ctx context.Context, req STRSubmitRequest) (*GoAMLResponse, error) {
	if h.goAMLURL == "" || h.goAMLKey == "" {
		// Fail loud: never fabricate an NFIU regulator acknowledgement.
		return nil, ErrGoAMLUnconfigured
	}

	body, _ := json.Marshal(map[string]interface{}{
		"reportRef":  req.ReportRef,
		"merchantId": req.MerchantID,
		"payload":    req.Payload,
	})
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		h.goAMLURL+"/reports/str", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-API-Key", h.goAMLKey)

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("goAML HTTP error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("goAML error %d: %s", resp.StatusCode, string(b))
	}

	var result GoAMLResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("goAML decode error: %w", err)
	}
	return &result, nil
}

func (h *STRHandler) pollGoAML(ctx context.Context, nfiuRef string) (string, error) {
	if h.goAMLURL == "" || h.goAMLKey == "" {
		return "", ErrGoAMLUnconfigured
	}
	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("%s/reports/str/%s/status", h.goAMLURL, nfiuRef), nil)
	req.Header.Set("X-API-Key", h.goAMLKey)
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct{ Status string `json:"status"` }
	_ = json.NewDecoder(resp.Body).Decode(&result)
	return result.Status, nil
}

func (h *STRHandler) publishKafka(ctx context.Context, topic string, payload map[string]interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return h.kafkaWriter.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Value: data,
	})
}

func (h *STRHandler) publishFluvio(ctx context.Context, topic string, payload map[string]interface{}) error {
	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/topics/%s/produce", h.fluvioURL, topic),
		bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (h *STRHandler) writeLakehouse(strID, merchantID string, resp *GoAMLResponse) {
	lakehouseURL := os.Getenv("MIDDLEWARE_BRIDGE_URL")
	if lakehouseURL == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"table":      "str_audit_log",
		"strId":      strID,
		"merchantId": merchantID,
		"nfiuRef":    resp.NFIURef,
		"status":     resp.Status,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
	req, _ := http.NewRequest("POST", lakehouseURL+"/lakehouse/write", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp2, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err == nil {
		resp2.Body.Close()
	}
}

// RegisterRoutes registers STR routes on a gin router group.
func RegisterRoutes(rg *gin.RouterGroup, h *STRHandler) {
	rg.POST("/str/submit", h.SubmitToNFIU)
	rg.POST("/str/status", h.PollNFIUStatus)
}
