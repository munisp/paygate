// PayGate Billing — Audit & RBAC Service
// Provides:
//   - Permission checks via Permify (fine-grained RBAC)
//   - Token validation via Keycloak (JWT introspection)
//   - Audit log ingestion to OpenSearch
//   - Real-time notifications on billing config changes

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type AuditEvent struct {
	ID          string      `json:"id"`
	TenantID    string      `json:"tenant_id"`
	ActorID     string      `json:"actor_id"`
	ActorRole   string      `json:"actor_role"`
	Action      string      `json:"action"`
	ResourceID  string      `json:"resource_id"`
	ResourceType string     `json:"resource_type"`
	BeforeState interface{} `json:"before_state,omitempty"`
	AfterState  interface{} `json:"after_state,omitempty"`
	Reason      string      `json:"reason,omitempty"`
	IPAddress   string      `json:"ip_address,omitempty"`
	UserAgent   string      `json:"user_agent,omitempty"`
	Timestamp   int64       `json:"timestamp"`
}

type PermissionCheckRequest struct {
	TenantID   string `json:"tenant_id"`
	ActorID    string `json:"actor_id"`
	Resource   string `json:"resource"`
	Permission string `json:"permission"`
}

type PermissionCheckResponse struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

var log *zap.Logger

func main() {
	log, _ = zap.NewProduction()
	defer log.Sync()

	router := gin.New()
	router.Use(gin.Recovery())

	// Health
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "go-audit-rbac"})
	})

	// Audit log ingestion
	router.POST("/audit/events", ingestAuditEvent)

	// Audit log query
	router.GET("/audit/events", queryAuditEvents)

	// Permission check (called by other services before mutating billing config)
	router.POST("/rbac/check", checkPermission)

	// Billing config change notification (called by Temporal workflow)
	router.POST("/notify/billing-change", notifyBillingChange)

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8092"
	}

	log.Info("Audit & RBAC service starting", zap.String("port", port))
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Server failed", zap.Error(err))
	}
}

// ingestAuditEvent writes an audit event to OpenSearch.
func ingestAuditEvent(c *gin.Context) {
	var event AuditEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	event.ID = uuid.New().String()
	event.Timestamp = time.Now().UTC().UnixMilli()
	event.IPAddress = c.ClientIP()
	event.UserAgent = c.GetHeader("User-Agent")

	if err := indexToOpenSearch(c.Request.Context(), "billing-audit-logs", event.ID, event); err != nil {
		log.Error("Failed to index audit event", zap.Error(err), zap.String("action", event.Action))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "audit indexing failed"})
		return
	}

	// Also write to PostgreSQL for structured queries
	if err := persistAuditEventToDB(c.Request.Context(), event); err != nil {
		log.Warn("Failed to persist audit event to DB (non-fatal)", zap.Error(err))
	}

	log.Info("Audit event ingested",
		zap.String("id", event.ID),
		zap.String("tenant_id", event.TenantID),
		zap.String("action", event.Action),
		zap.String("actor_id", event.ActorID),
	)

	c.JSON(http.StatusCreated, gin.H{"id": event.ID})
}

// queryAuditEvents queries OpenSearch for audit events.
func queryAuditEvents(c *gin.Context) {
	tenantID := c.Query("tenant_id")
	action := c.Query("action")
	actorID := c.Query("actor_id")
	from := c.DefaultQuery("from", "0")
	size := c.DefaultQuery("size", "50")

	must := []map[string]interface{}{}
	if tenantID != "" {
		must = append(must, map[string]interface{}{"term": map[string]interface{}{"tenant_id": tenantID}})
	}
	if action != "" {
		must = append(must, map[string]interface{}{"term": map[string]interface{}{"action": action}})
	}
	if actorID != "" {
		must = append(must, map[string]interface{}{"term": map[string]interface{}{"actor_id": actorID}})
	}

	query := map[string]interface{}{
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must": must,
			},
		},
		"sort": []map[string]interface{}{
			{"timestamp": map[string]interface{}{"order": "desc"}},
		},
		"from": from,
		"size": size,
	}

	opensearchURL := os.Getenv("OPENSEARCH_URL")
	body, _ := json.Marshal(query)
	url := fmt.Sprintf("%s/billing-audit-logs/_search", opensearchURL)

	req, _ := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	c.JSON(http.StatusOK, result)
}

// checkPermission validates a permission request against Permify.
func checkPermission(c *gin.Context) {
	var req PermissionCheckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// First validate the JWT token from the Authorization header
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if token != "" {
		if err := validateKeycloakToken(c.Request.Context(), token, req.TenantID); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token", "detail": err.Error()})
			return
		}
	}

	// Check permission in Permify
	allowed, reason, err := checkPermifyPermission(c.Request.Context(), req)
	if err != nil {
		log.Error("Permify check failed", zap.Error(err))
		// Fail open with warning in development, fail closed in production
		env := os.Getenv("APP_ENV")
		if env == "production" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "permission check failed"})
			return
		}
		allowed = true
		reason = "permify_unavailable_fail_open"
	}

	c.JSON(http.StatusOK, PermissionCheckResponse{
		Allowed: allowed,
		Reason:  reason,
	})
}

// notifyBillingChange sends a notification when billing config changes.
func notifyBillingChange(c *gin.Context) {
	var payload struct {
		TenantID  string `json:"tenant_id"`
		ActorID   string `json:"actor_id"`
		Action    string `json:"action"`
		ConfigID  string `json:"config_id"`
		Changes   interface{} `json:"changes"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Notify via portal notification API
	notifyURL := os.Getenv("PORTAL_INTERNAL_API_URL") + "/internal/notify-owner"
	internalKey := os.Getenv("INTERNAL_API_KEY")

	notifBody, _ := json.Marshal(map[string]string{
		"title":   "Billing Configuration Changed",
		"content": fmt.Sprintf("Tenant %s billing config (%s) was %s by actor %s", payload.TenantID, payload.ConfigID, payload.Action, payload.ActorID),
	})

	req, _ := http.NewRequestWithContext(c.Request.Context(), "POST", notifyURL, bytes.NewReader(notifBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Warn("Notification failed", zap.Error(err))
	} else {
		resp.Body.Close()
	}

	c.JSON(http.StatusOK, gin.H{"notified": true})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func indexToOpenSearch(ctx context.Context, index, docID string, doc interface{}) error {
	opensearchURL := os.Getenv("OPENSEARCH_URL")
	body, _ := json.Marshal(doc)
	url := fmt.Sprintf("%s/%s/_doc/%s", opensearchURL, index, docID)

	req, _ := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("opensearch error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func persistAuditEventToDB(ctx context.Context, event AuditEvent) error {
	portalURL := os.Getenv("PORTAL_INTERNAL_API_URL")
	internalKey := os.Getenv("INTERNAL_API_KEY")

	body, _ := json.Marshal(event)
	req, _ := http.NewRequestWithContext(ctx, "POST", portalURL+"/internal/audit-events", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func validateKeycloakToken(ctx context.Context, token, tenantID string) error {
	keycloakURL := os.Getenv("KEYCLOAK_URL")
	realm := os.Getenv("KEYCLOAK_REALM")
	clientID := os.Getenv("KEYCLOAK_CLIENT_ID")
	clientSecret := os.Getenv("KEYCLOAK_CLIENT_SECRET")

	url := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect", keycloakURL, realm)
	body := fmt.Sprintf("token=%s&client_id=%s&client_secret=%s", token, clientID, clientSecret)

	req, _ := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak introspect: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	active, _ := result["active"].(bool)
	if !active {
		return fmt.Errorf("token inactive or invalid")
	}
	return nil
}

func checkPermifyPermission(ctx context.Context, req PermissionCheckRequest) (bool, string, error) {
	permifyURL := os.Getenv("PERMIFY_URL")
	permifyKey := os.Getenv("PERMIFY_API_KEY")

	body, _ := json.Marshal(map[string]interface{}{
		"metadata": map[string]interface{}{
			"schema_version": "",
			"snap_token":     "",
			"depth":          20,
		},
		"entity": map[string]interface{}{
			"type": "billing_config",
			"id":   req.Resource,
		},
		"permission": req.Permission,
		"subject": map[string]interface{}{
			"type": "user",
			"id":   req.ActorID,
		},
	})

	url := fmt.Sprintf("%s/v1/tenants/%s/permissions/check", permifyURL, req.TenantID)
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+permifyKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return false, "", fmt.Errorf("permify check: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	can, _ := result["can"].(string)
	return can == "CHECK_RESULT_ALLOWED", can, nil
}
