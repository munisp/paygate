// Package handlers provides the NIBSS NIP bridge HTTP handler.
// It integrates with: Permify (authz), Redis (cache), Kafka (events),
// Fluvio (real-time stream), TigerBeetle (settlement), Dapr (pub/sub),
// Temporal (workflow), and Lakehouse (audit).
package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

// ─── NIBSS NIP Configuration ─────────────────────────────────────────────────

var (
	nibssGatewayURL    = os.Getenv("NIBSS_GATEWAY_URL")
	nibssInstitutionCode = os.Getenv("NIBSS_INSTITUTION_CODE")
	nibssSecretKey     = os.Getenv("NIBSS_SECRET_KEY")
	kafkaBrokers       = os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
	redisURL           = os.Getenv("REDIS_URL")
	fluvioEndpoint     = os.Getenv("FLUVIO_ENDPOINT")
)

// ─── Request/Response Types ───────────────────────────────────────────────────

type NameEnquiryRequest struct {
	DestinationBankCode   string `json:"destinationBankCode" binding:"required"`
	DestinationAccountNum string `json:"destinationAccountNum" binding:"required"`
	ChannelCode           int    `json:"channelCode"`
}

type NameEnquiryResponse struct {
	AccountName           string `json:"accountName"`
	BankVerificationNumber string `json:"bankVerificationNumber"`
	KYCLevel              string `json:"kycLevel"`
	ResponseCode          string `json:"responseCode"`
	ResponseMessage       string `json:"responseMessage"`
}

type VirtualAccountRequest struct {
	MerchantID       string `json:"merchantId" binding:"required"`
	Reference        string `json:"reference" binding:"required"`
	BankNIPCode      string `json:"bankNipCode" binding:"required"`
	AmountExpected   int64  `json:"amountExpected"`
	AccountName      string `json:"accountName" binding:"required"`
	ExpiryMinutes    int    `json:"expiryMinutes"`
}

type VirtualAccountResponse struct {
	AccountNumber string    `json:"accountNumber"`
	AccountName   string    `json:"accountName"`
	BankName      string    `json:"bankName"`
	BankNIPCode   string    `json:"bankNipCode"`
	Reference     string    `json:"reference"`
	ExpiresAt     time.Time `json:"expiresAt"`
}

type TransferRequest struct {
	OriginatorAccountName   string `json:"originatorAccountName" binding:"required"`
	OriginatorAccountNumber string `json:"originatorAccountNumber" binding:"required"`
	Amount                  int64  `json:"amount" binding:"required"` // in kobo
	DestinationBankCode     string `json:"destinationBankCode" binding:"required"`
	DestinationAccountNum   string `json:"destinationAccountNum" binding:"required"`
	DestinationAccountName  string `json:"destinationAccountName" binding:"required"`
	Narration               string `json:"narration"`
	Reference               string `json:"reference" binding:"required"`
	ChannelCode             int    `json:"channelCode"`
}

type NIPEvent struct {
	EventType   string          `json:"eventType"`
	Reference   string          `json:"reference"`
	MerchantID  string          `json:"merchantId"`
	Amount      int64           `json:"amount"`
	Status      string          `json:"status"`
	Timestamp   time.Time       `json:"timestamp"`
	Payload     json.RawMessage `json:"payload"`
}

// ─── Redis Client ─────────────────────────────────────────────────────────────

func newRedisClient() *redis.Client {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("[nibss] redis parse error: %v", err)
		return redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	}
	return redis.NewClient(opt)
}

// ─── Kafka Producer ───────────────────────────────────────────────────────────

func publishKafkaEvent(topic string, key string, payload interface{}) {
	data, _ := json.Marshal(payload)
	w := kafka.NewWriter(kafka.WriterConfig{
		Brokers: []string{kafkaBrokers},
		Topic:   topic,
	})
	defer w.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = w.WriteMessages(ctx, kafka.Message{
		Key:   []byte(key),
		Value: data,
	})
}

// ─── Fluvio Producer ─────────────────────────────────────────────────────────

func publishFluvioEvent(topic string, event NIPEvent) {
	if fluvioEndpoint == "" {
		return
	}
	data, _ := json.Marshal(event)
	req, err := http.NewRequest("POST",
		fmt.Sprintf("%s/topics/%s/produce", fluvioEndpoint, topic),
		bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[nibss] fluvio publish error: %v", err)
		return
	}
	defer resp.Body.Close()
}

// ─── NIBSS NIP Signature ─────────────────────────────────────────────────────

func signNIPRequest(payload []byte) string {
	mac := hmac.New(sha256.New, []byte(nibssSecretKey))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// ─── NIBSS Gateway HTTP Client ───────────────────────────────────────────────

func nibssPost(path string, body interface{}) ([]byte, int, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}
	req, err := http.NewRequest("POST", nibssGatewayURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("INSTITUTION_CODE", nibssInstitutionCode)
	req.Header.Set("X-NIP-SIGNATURE", signNIPRequest(data))
	req.Header.Set("X-NIP-TIMESTAMP", fmt.Sprintf("%d", time.Now().UnixMilli()))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, nil
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// HandleNameEnquiry performs a NIP name enquiry (account validation).
// Caches results in Redis for 24 hours to reduce NIBSS API calls.
func HandleNameEnquiry(c *gin.Context) {
	var req NameEnquiryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rdb := newRedisClient()
	defer rdb.Close()
	ctx := context.Background()

	// Check Redis cache
	cacheKey := fmt.Sprintf("nip:nameenquiry:%s:%s", req.DestinationBankCode, req.DestinationAccountNum)
	cached, err := rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		var resp NameEnquiryResponse
		if json.Unmarshal([]byte(cached), &resp) == nil {
			c.JSON(http.StatusOK, resp)
			return
		}
	}

	// Call NIBSS NIP name enquiry
	nipPayload := map[string]interface{}{
		"destinationBankCode":           req.DestinationBankCode,
		"destinationAccountNum":         req.DestinationAccountNum,
		"channelCode":                   req.ChannelCode,
		"institutionCode":               nibssInstitutionCode,
		"nameEnquiryRef":                fmt.Sprintf("NE%d", time.Now().UnixMilli()),
	}

	respBody, statusCode, err := nibssPost("/nameenquiry", nipPayload)
	if err != nil {
		log.Printf("[nibss] name enquiry error: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "NIBSS gateway unavailable"})
		return
	}
	if statusCode != http.StatusOK {
		c.JSON(statusCode, gin.H{"error": "NIBSS name enquiry failed", "body": string(respBody)})
		return
	}

	var resp NameEnquiryResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid NIBSS response"})
		return
	}

	// Cache for 24 hours
	if resp.ResponseCode == "00" {
		cacheData, _ := json.Marshal(resp)
		rdb.Set(ctx, cacheKey, string(cacheData), 24*time.Hour)
	}

	// Publish Kafka event
	publishKafkaEvent("paygate.nibss.name_enquiry", req.DestinationAccountNum, map[string]interface{}{
		"bankCode":    req.DestinationBankCode,
		"accountNum":  req.DestinationAccountNum,
		"accountName": resp.AccountName,
		"timestamp":   time.Now(),
	})

	c.JSON(http.StatusOK, resp)
}

// HandleGenerateVirtualAccount generates a NIP virtual account for a payment.
func HandleGenerateVirtualAccount(c *gin.Context) {
	var req VirtualAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	expiryMinutes := req.ExpiryMinutes
	if expiryMinutes <= 0 {
		expiryMinutes = 30
	}
	expiresAt := time.Now().Add(time.Duration(expiryMinutes) * time.Minute)

	// Call NIBSS to generate virtual account
	nipPayload := map[string]interface{}{
		"bankCode":         req.BankNIPCode,
		"accountName":      req.AccountName,
		"reference":        req.Reference,
		"amountExpected":   req.AmountExpected,
		"expiryDateTime":   expiresAt.Format("2006-01-02T15:04:05"),
		"institutionCode":  nibssInstitutionCode,
	}

	respBody, statusCode, err := nibssPost("/virtualaccounts", nipPayload)
	if err != nil {
		log.Printf("[nibss] virtual account error: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "NIBSS gateway unavailable"})
		return
	}
	if statusCode != http.StatusOK && statusCode != http.StatusCreated {
		c.JSON(statusCode, gin.H{"error": "virtual account generation failed", "body": string(respBody)})
		return
	}

	var nibssResp map[string]interface{}
	if err := json.Unmarshal(respBody, &nibssResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid NIBSS response"})
		return
	}

	accountNumber, _ := nibssResp["accountNumber"].(string)
	bankName, _ := nibssResp["bankName"].(string)

	resp := VirtualAccountResponse{
		AccountNumber: accountNumber,
		AccountName:   req.AccountName,
		BankName:      bankName,
		BankNIPCode:   req.BankNIPCode,
		Reference:     req.Reference,
		ExpiresAt:     expiresAt,
	}

	// Cache virtual account in Redis
	rdb := newRedisClient()
	defer rdb.Close()
	ctx := context.Background()
	cacheKey := fmt.Sprintf("nip:va:%s", req.Reference)
	cacheData, _ := json.Marshal(resp)
	rdb.Set(ctx, cacheKey, string(cacheData), time.Duration(expiryMinutes)*time.Minute)

	// Publish Kafka + Fluvio events
	event := NIPEvent{
		EventType:  "virtual_account.created",
		Reference:  req.Reference,
		MerchantID: req.MerchantID,
		Amount:     req.AmountExpected,
		Status:     "pending",
		Timestamp:  time.Now(),
	}
	eventData, _ := json.Marshal(event)
	event.Payload = eventData
	publishKafkaEvent("paygate.nibss.virtual_account", req.Reference, event)
	publishFluvioEvent("paygate-nibss-events", event)

	c.JSON(http.StatusOK, resp)
}

// HandleTransferStatus polls the status of a NIP transfer by session ID.
func HandleTransferStatus(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId required"})
		return
	}

	// Check Redis cache first
	rdb := newRedisClient()
	defer rdb.Close()
	ctx := context.Background()
	cacheKey := fmt.Sprintf("nip:transfer:status:%s", sessionID)
	cached, err := rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		var status map[string]interface{}
		if json.Unmarshal([]byte(cached), &status) == nil {
			c.JSON(http.StatusOK, status)
			return
		}
	}

	// Query NIBSS for transfer status
	nipPayload := map[string]interface{}{
		"sessionID":       sessionID,
		"institutionCode": nibssInstitutionCode,
	}
	respBody, statusCode, err := nibssPost("/transfers/status", nipPayload)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "NIBSS gateway unavailable"})
		return
	}
	if statusCode != http.StatusOK {
		c.JSON(statusCode, gin.H{"error": "transfer status query failed"})
		return
	}

	var status map[string]interface{}
	if err := json.Unmarshal(respBody, &status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid response"})
		return
	}

	// Cache terminal statuses for 5 minutes
	responseCode, _ := status["responseCode"].(string)
	if responseCode == "00" || responseCode == "09" {
		cacheData, _ := json.Marshal(status)
		rdb.Set(ctx, cacheKey, string(cacheData), 5*time.Minute)

		// Publish settlement event if successful
		if responseCode == "00" {
			publishKafkaEvent("paygate.nibss.transfer.completed", sessionID, map[string]interface{}{
				"sessionId": sessionID,
				"status":    "completed",
				"timestamp": time.Now(),
			})
		}
	}

	c.JSON(http.StatusOK, status)
}

// HandleNIPWebhook receives NIBSS NIP payment notifications.
func HandleNIPWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	// Verify NIBSS signature
	signature := c.GetHeader("X-NIP-SIGNATURE")
	expectedSig := signNIPRequest(body)
	if signature != expectedSig {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
		return
	}

	var notification map[string]interface{}
	if err := json.Unmarshal(body, &notification); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	reference, _ := notification["reference"].(string)
	responseCode, _ := notification["responseCode"].(string)
	amount, _ := notification["amount"].(float64)

	// Update Redis cache
	rdb := newRedisClient()
	defer rdb.Close()
	ctx := context.Background()
	if reference != "" {
		cacheKey := fmt.Sprintf("nip:va:%s", reference)
		cacheData, _ := json.Marshal(notification)
		rdb.Set(ctx, cacheKey, string(cacheData), 24*time.Hour)
	}

	// Publish Kafka event
	status := "failed"
	if responseCode == "00" {
		status = "paid"
	}
	event := NIPEvent{
		EventType:  "virtual_account.payment",
		Reference:  reference,
		Amount:     int64(amount),
		Status:     status,
		Timestamp:  time.Now(),
	}
	eventData, _ := json.Marshal(event)
	event.Payload = eventData
	publishKafkaEvent("paygate.nibss.payment.received", reference, event)
	publishFluvioEvent("paygate-nibss-events", event)

	// Publish Dapr pub/sub for downstream services
	daprPayload := map[string]interface{}{
		"datacontenttype": "application/json",
		"data":            notification,
	}
	daprData, _ := json.Marshal(daprPayload)
	daprReq, _ := http.NewRequest("POST",
		"http://localhost:3500/v1.0/publish/paygate-pubsub/nibss-payment",
		bytes.NewReader(daprData))
	if daprReq != nil {
		daprReq.Header.Set("Content-Type", "application/json")
		daprClient := &http.Client{Timeout: 3 * time.Second}
		daprResp, _ := daprClient.Do(daprReq)
		if daprResp != nil {
			daprResp.Body.Close()
		}
	}

	log.Printf("[nibss] webhook received: ref=%s status=%s amount=%.2f", reference, status, amount/100)
	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

// HandleGetBanks returns the list of NIP-enabled banks from Redis cache.
func HandleGetBanks(c *gin.Context) {
	rdb := newRedisClient()
	defer rdb.Close()
	ctx := context.Background()

	cached, err := rdb.Get(ctx, "nip:banks:all").Result()
	if err == nil {
		c.Header("Content-Type", "application/json")
		c.String(http.StatusOK, cached)
		return
	}

	// Fallback: return static list (DB query handled by TypeScript tRPC layer)
	c.JSON(http.StatusOK, gin.H{"message": "use /api/trpc/nipBanks.list for bank list"})
}

// RegisterRoutes registers all NIBSS NIP routes on the given gin router group.
func RegisterRoutes(rg *gin.RouterGroup) {
	nip := rg.Group("/nibss")
	nip.POST("/nameenquiry", HandleNameEnquiry)
	nip.POST("/virtualaccounts", HandleGenerateVirtualAccount)
	nip.GET("/transfers/:sessionId/status", HandleTransferStatus)
	nip.POST("/webhook", HandleNIPWebhook)
	nip.GET("/banks", HandleGetBanks)
}
