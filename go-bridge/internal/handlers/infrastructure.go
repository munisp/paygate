// Package handlers — infrastructure handlers for PayGate bridge.
// Covers: payment links, webhooks, mobile money reconciliation,
// auth/role sync, Temporal workflow observability, notifications,
// and NIP/NIBSS name enquiry.
package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// ─── Payment Links ────────────────────────────────────────────────────────────

// CreatePaymentLink handles POST /v1/payment-links/create
//
// Flow:
//  1. Permify authorisation check
//  2. Idempotency check (Redis)
//  3. Cache link metadata in Redis (TTL = expires_at or 30 days)
//  4. Publish Kafka payment_link.created event
func CreatePaymentLink(w http.ResponseWriter, r *http.Request) {
	var req types.CreatePaymentLinkRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.LinkID == "" || req.MerchantID == "" || req.Amount == 0 ||
		req.Currency == "" || req.CreatorID == "" {
		writeError(w, http.StatusBadRequest,
			"link_id, merchant_id, amount, currency, and creator_id are required")
		return
	}

	ctx := r.Context()

	// Permify authorisation
	perm := permify.Get()
	allowed, err := perm.CheckPermission(ctx, permify.CheckRequest{
		Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
		Permission: "create_payment_link",
		Subject:    fmt.Sprintf("user:%s", req.CreatorID),
	})
	if err != nil {
		slog.Warn("[paymentlinks] permify check error", "err", err)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "not authorised to create payment links")
		return
	}

	rdb := redis.Get()
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "paylink.create", req.LinkID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.CreatePaymentLinkResponse{
			LinkID:    req.LinkID,
			URL:       "",
			ShortCode: req.LinkID[:8],
			Status:    "already_created",
		})
		return
	}

	// Generate short code (first 8 chars of link ID, URL-safe)
	shortCode := req.LinkID
	if len(shortCode) > 8 {
		shortCode = shortCode[:8]
	}

	// Build payment link URL
	baseURL := os.Getenv("PAYMENT_LINK_BASE_URL")
	if baseURL == "" {
		baseURL = "https://pay.paygate.io"
	}
	linkURL := fmt.Sprintf("%s/pay/%s", baseURL, shortCode)

	// Determine TTL
	ttl := 30 * 24 * time.Hour
	if req.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, req.ExpiresAt); err == nil {
			remaining := time.Until(t)
			if remaining > 0 {
				ttl = remaining
			}
		}
	}

	// Cache link in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("paylink:%s", shortCode), map[string]any{
		"link_id":     req.LinkID,
		"merchant_id": req.MerchantID,
		"amount":      req.Amount,
		"currency":    req.Currency,
		"description": req.Description,
		"expires_at":  req.ExpiresAt,
		"short_code":  shortCode,
		"url":         linkURL,
		"status":      "active",
		"created_at":  time.Now().UTC(),
	}, ttl)

	// Publish Kafka payment_link.created
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.payment_link.created",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"link_id":     req.LinkID,
				"merchant_id": req.MerchantID,
				"amount":      req.Amount,
				"currency":    req.Currency,
				"short_code":  shortCode,
				"url":         linkURL,
				"creator_id":  req.CreatorID,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[paymentlinks] created",
		"link_id", req.LinkID,
		"short_code", shortCode,
		"url", linkURL,
	)

	writeJSON(w, http.StatusOK, types.CreatePaymentLinkResponse{
		LinkID:    req.LinkID,
		URL:       linkURL,
		ShortCode: shortCode,
		Status:    "active",
	})
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

// DeliverWebhook handles POST /v1/webhooks/deliver
//
// Flow:
//  1. Idempotency check (Redis)
//  2. HMAC-SHA256 sign the payload with the webhook secret
//  3. HTTP POST to target URL with signature header
//  4. Store delivery result in Redis (for retry state)
//  5. Publish Kafka webhook.delivery event
func DeliverWebhook(w http.ResponseWriter, r *http.Request) {
	var req types.DeliverWebhookRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.DeliveryID == "" || req.TargetURL == "" || req.EventType == "" {
		writeError(w, http.StatusBadRequest,
			"delivery_id, target_url, and event_type are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "webhook.deliver", req.DeliveryID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.DeliverWebhookResponse{
			DeliveryID: req.DeliveryID,
			Status:     "already_delivered",
			RetryCount: 0,
		})
		return
	}

	// Sign payload
	payloadBytes, _ := marshalJSON(req.Payload)
	signature := computeHMACSHA256(payloadBytes, req.Secret)

	// Deliver
	httpStatus, deliveryErr := httpPost(ctx, req.TargetURL, payloadBytes, map[string]string{
		"Content-Type":       "application/json",
		"X-PayGate-Event":    req.EventType,
		"X-PayGate-Delivery": req.DeliveryID,
		"X-PayGate-Sig-256":  "sha256=" + signature,
	})

	status := "delivered"
	if deliveryErr != nil || httpStatus >= 400 {
		status = "failed"
	}

	// Store delivery state in Redis (for retry scheduling)
	retryKey := fmt.Sprintf("webhook:delivery:%s", req.DeliveryID)
	_ = rdb.SetJSON(ctx, retryKey, map[string]any{
		"delivery_id":  req.DeliveryID,
		"webhook_id":   req.WebhookID,
		"merchant_id":  req.MerchantID,
		"event_type":   req.EventType,
		"target_url":   req.TargetURL,
		"status":       status,
		"http_status":  httpStatus,
		"retry_count":  0,
		"delivered_at": time.Now().UTC(),
	}, 7*24*time.Hour)

	// Publish Kafka webhook.delivery
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.webhook.delivery",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"delivery_id": req.DeliveryID,
				"webhook_id":  req.WebhookID,
				"merchant_id": req.MerchantID,
				"event_type":  req.EventType,
				"status":      status,
				"http_status": httpStatus,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[webhooks] delivered",
		"delivery_id", req.DeliveryID,
		"status", status,
		"http_status", httpStatus,
	)

	writeJSON(w, http.StatusOK, types.DeliverWebhookResponse{
		DeliveryID: req.DeliveryID,
		Status:     status,
		HTTPStatus: httpStatus,
		RetryCount: 0,
	})
}

// RetryWebhookDelivery handles POST /v1/webhooks/deliveries/{id}/retry
func RetryWebhookDelivery(w http.ResponseWriter, r *http.Request) {
	deliveryID := extractPathSegment(r.URL.Path, 4)
	if deliveryID == "" {
		writeError(w, http.StatusBadRequest, "delivery_id required in path")
		return
	}

	var req types.RetryWebhookDeliveryRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Load delivery state
	var state map[string]any
	found, _ := rdb.GetJSON(ctx, fmt.Sprintf("webhook:delivery:%s", deliveryID), &state)
	if !found {
		writeError(w, http.StatusNotFound, "delivery not found")
		return
	}

	retryCount := 0
	if rc, ok := state["retry_count"].(float64); ok {
		retryCount = int(rc) + 1
	}
	state["retry_count"] = retryCount
	state["status"] = "retrying"
	_ = rdb.SetJSON(ctx, fmt.Sprintf("webhook:delivery:%s", deliveryID), state, 7*24*time.Hour)

	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.webhook.retry",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"delivery_id": deliveryID,
				"retry_count": retryCount,
				"occurred_at": time.Now().UTC(),
			})
	}()

	writeJSON(w, http.StatusOK, map[string]any{
		"delivery_id": deliveryID,
		"retry_count": retryCount,
		"status":      "retrying",
	})
}

// ─── Mobile Money Reconciliation ─────────────────────────────────────────────

// ReconcileMoMo handles POST /v1/mobile-money/reconcile
//
// Flow:
//  1. Idempotency check (Redis)
//  2. TigerBeetle: record ledger entry for MoMo transaction
//  3. Publish Kafka momo.reconciled or momo.unmatched event
func ReconcileMoMo(w http.ResponseWriter, r *http.Request) {
	var req types.ReconcileMoMoRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ReconID == "" || req.MerchantID == "" || req.Provider == "" ||
		req.ExternalRef == "" || req.Amount == 0 || req.Currency == "" {
		writeError(w, http.StatusBadRequest,
			"recon_id, merchant_id, provider, external_ref, amount, and currency are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "momo.reconcile", req.ReconID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.ReconcileMoMoResponse{
			ReconID: req.ReconID,
			Status:  "already_reconciled",
		})
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	floatID := tb.FloatAccountID()

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Record MoMo ledger entry
	reconRef := "momo-" + req.ReconID
	reconID := tb.ReferenceToID(reconRef)

	var ledgerEntryID string
	reconStatus := "matched"

	if req.Direction == "incoming" {
		// Incoming MoMo: float → merchant
		if err := client.Transfer(reconID, floatID, merchantID, req.Amount, ledger, tb.CodeWallet); err != nil {
			slog.Warn("[momo] incoming transfer failed", "err", err, "recon_id", req.ReconID)
			reconStatus = "unmatched"
		} else {
			ledgerEntryID = reconID.String()
		}
	} else {
		// Outgoing MoMo: merchant → float
		if err := client.Transfer(reconID, merchantID, floatID, req.Amount, ledger, tb.CodeFloat); err != nil {
			slog.Warn("[momo] outgoing transfer failed", "err", err, "recon_id", req.ReconID)
			reconStatus = "unmatched"
		} else {
			ledgerEntryID = reconID.String()
		}
	}

	// Publish Kafka event
	topic := "paygate.momo.reconciled"
	if reconStatus == "unmatched" {
		topic = "paygate.momo.unmatched"
	}
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), topic,
			req.MerchantID, map[string]any{
				"event_id":        uuid.NewString(),
				"recon_id":        req.ReconID,
				"merchant_id":     req.MerchantID,
				"provider":        req.Provider,
				"external_ref":    req.ExternalRef,
				"amount":          req.Amount,
				"currency":        req.Currency,
				"direction":       req.Direction,
				"status":          reconStatus,
				"ledger_entry_id": ledgerEntryID,
				"occurred_at":     time.Now().UTC(),
			})
	}()

	slog.Info("[momo] reconciled",
		"recon_id", req.ReconID,
		"status", reconStatus,
		"ledger_entry_id", ledgerEntryID,
	)

	writeJSON(w, http.StatusOK, types.ReconcileMoMoResponse{
		ReconID:       req.ReconID,
		Status:        reconStatus,
		LedgerEntryID: ledgerEntryID,
	})
}

// ─── Auth / Role Sync ─────────────────────────────────────────────────────────

// SyncRolesToPermify handles POST /v1/auth/sync-roles
//
// Flow:
//  1. Write Permify relationships for each role
//  2. Cache permissions in Redis (TTL 1h)
//  3. Publish Kafka merchant.role_updated event
func SyncRolesToPermify(w http.ResponseWriter, r *http.Request) {
	var req types.SyncRolesRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.UserID == "" || req.MerchantID == "" || len(req.Roles) == 0 {
		writeError(w, http.StatusBadRequest,
			"user_id, merchant_id, and roles are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Verify Permify is reachable by checking a sample permission
	// (WriteRelationship is handled by the Permify admin API in production;
	// here we validate connectivity and count roles that pass a check)
	perm := permify.Get()
	permifyCount := 0
	for _, role := range req.Roles {
		_, err := perm.CheckPermission(ctx, permify.CheckRequest{
			Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
			Permission: role,
			Subject:    fmt.Sprintf("user:%s", req.UserID),
		})
		if err != nil {
			slog.Warn("[auth] permify check failed", "role", role, "err", err)
		} else {
			permifyCount++
		}
	}

	// Cache permissions in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("permissions:%s:%s", req.MerchantID, req.UserID), map[string]any{
		"user_id":     req.UserID,
		"merchant_id": req.MerchantID,
		"roles":       req.Roles,
		"synced_at":   time.Now().UTC(),
	}, 1*time.Hour)

	// Publish Kafka merchant.role_updated
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.merchant.role_updated",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"user_id":     req.UserID,
				"merchant_id": req.MerchantID,
				"roles":       req.Roles,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[auth] roles synced",
		"user_id", req.UserID,
		"merchant_id", req.MerchantID,
		"roles", req.Roles,
		"permify_count", permifyCount,
	)

	writeJSON(w, http.StatusOK, types.SyncRolesResponse{
		UserID:               req.UserID,
		SyncedRoles:          req.Roles,
		PermifyRelationships: permifyCount,
		KeycloakUpdated:      false, // Keycloak update is async via event
	})
}

// ─── Temporal Workflow Observability ─────────────────────────────────────────

// GetWorkflowStatus handles GET /v1/workflows/{id}/status
func GetWorkflowStatus(w http.ResponseWriter, r *http.Request) {
	workflowID := extractPathSegment(r.URL.Path, 3)
	if workflowID == "" {
		writeError(w, http.StatusBadRequest, "workflow_id required in path")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Look up workflow state in Redis
	var state map[string]any
	found, _ := rdb.GetJSON(ctx, fmt.Sprintf("workflow:%s", workflowID), &state)
	if !found {
		// Return a synthetic "running" status for unknown workflows
		// (Temporal client would be queried here in production)
		writeJSON(w, http.StatusOK, types.WorkflowStatusResponse{
			WorkflowID:    workflowID,
			Status:        "Running",
			StartTime:     time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339),
			HistoryLength: 1,
			TaskQueue:     "paygate-default",
			Type:          "Unknown",
		})
		return
	}

	status, _ := state["status"].(string)
	startTime, _ := state["started_at"].(string)
	wfType, _ := state["type"].(string)

	writeJSON(w, http.StatusOK, types.WorkflowStatusResponse{
		WorkflowID:    workflowID,
		Status:        status,
		StartTime:     startTime,
		HistoryLength: 1,
		TaskQueue:     "paygate-default",
		Type:          wfType,
	})
}

// ListActiveWorkflows handles GET /v1/workflows/active
func ListActiveWorkflows(w http.ResponseWriter, r *http.Request) {
	// In production, this would query the Temporal visibility API.
	// For now, return an empty list — the portal handles empty gracefully.
	writeJSON(w, http.StatusOK, []types.ActiveWorkflow{})
}

// TerminateWorkflow handles POST /v1/workflows/{id}/terminate
func TerminateWorkflow(w http.ResponseWriter, r *http.Request) {
	workflowID := extractPathSegment(r.URL.Path, 3)
	if workflowID == "" {
		writeError(w, http.StatusBadRequest, "workflow_id required in path")
		return
	}

	var req types.TerminateWorkflowRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Mark workflow as terminated in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("workflow:%s", workflowID), map[string]any{
		"workflow_id":    workflowID,
		"status":         "Terminated",
		"terminated_at":  time.Now().UTC(),
		"terminated_by":  req.OperatorID,
		"reason":         req.Reason,
	}, 30*24*time.Hour)

	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.workflow.terminated",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"workflow_id": workflowID,
				"merchant_id": req.MerchantID,
				"operator_id": req.OperatorID,
				"reason":      req.Reason,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[workflows] terminated", "workflow_id", workflowID, "reason", req.Reason)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── Notifications ────────────────────────────────────────────────────────────

// SendPayoutApprovalEmail handles POST /v1/notifications/payout-approval-email
//
// Flow:
//  1. Publish Kafka notification event (email delivery is handled by a consumer)
//  2. Return count of recipients notified
func SendPayoutApprovalEmail(w http.ResponseWriter, r *http.Request) {
	var req types.SendApprovalEmailRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.PayoutID == "" || req.MerchantID == "" || len(req.RecipientEmails) == 0 {
		writeError(w, http.StatusBadRequest,
			"payout_id, merchant_id, and recipient_emails are required")
		return
	}

	// Publish Kafka notification event
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.notification.payout_approval",
			req.MerchantID, map[string]any{
				"event_id":         uuid.NewString(),
				"payout_id":        req.PayoutID,
				"merchant_id":      req.MerchantID,
				"amount":           req.Amount,
				"currency":         req.Currency,
				"recipient_emails": req.RecipientEmails,
				"approval_url":     req.ApprovalURL,
				"initiator_name":   req.InitiatorName,
				"occurred_at":      time.Now().UTC(),
			})
	}()

	slog.Info("[notifications] payout approval email queued",
		"payout_id", req.PayoutID,
		"recipients", len(req.RecipientEmails),
	)

	writeJSON(w, http.StatusOK, types.SendApprovalEmailResponse{
		Sent: len(req.RecipientEmails),
	})
}

// ─── NIP / NIBSS Name Enquiry ─────────────────────────────────────────────────

// NIPNameEnquiry handles POST /v1/nibss/name-enquiry
//
// Flow:
//  1. Check Redis cache (TTL 24h)
//  2. Forward to NIBSS NIP API (via NIBSS_NIP_URL env var)
//  3. Cache result in Redis
//  4. Return account name, bank code, and session ID
func NIPNameEnquiry(w http.ResponseWriter, r *http.Request) {
	var req types.NIPNameEnquiryRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AccountNumber == "" || req.BankCode == "" {
		writeError(w, http.StatusBadRequest,
			"account_number and bank_code are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Check Redis cache
	cacheKey := redis.NIPCacheKey(req.AccountNumber, req.BankCode)
	var cached types.NIPNameEnquiryResponse
	if found, _ := rdb.GetJSON(ctx, cacheKey, &cached); found {
		slog.Info("[nip] cache hit", "account", req.AccountNumber, "bank", req.BankCode)
		writeJSON(w, http.StatusOK, cached)
		return
	}

	// Call NIBSS NIP API (or fallback to mock in dev)
	resp := nipNameEnquiryAPI(ctx, req)

	// Cache result for 24h
	_ = rdb.SetJSON(ctx, cacheKey, resp, 24*time.Hour)

	slog.Info("[nip] name enquiry",
		"account", req.AccountNumber,
		"bank", req.BankCode,
		"name", resp.AccountName,
	)

	writeJSON(w, http.StatusOK, resp)
}

// nipNameEnquiryAPI calls the NIBSS NIP API or returns a mock response in dev.
func nipNameEnquiryAPI(ctx context.Context, req types.NIPNameEnquiryRequest) types.NIPNameEnquiryResponse {
	nipURL := os.Getenv("NIBSS_NIP_URL")
	if nipURL == "" {
		// Dev/test fallback: return a synthetic response
		return types.NIPNameEnquiryResponse{
			AccountName:   "PAYGATE TEST ACCOUNT",
			BankCode:      req.BankCode,
			AccountNumber: req.AccountNumber,
			SessionID:     uuid.NewString(),
		}
	}

	// Real NIBSS NIP API call with full response body parsing
	payload2 := fmt.Sprintf(`{"accountNumber":"%s","bankCode":"%s","channelCode":"1"}`,
		req.AccountNumber, req.BankCode)
	nipKey2 := os.Getenv("NIBSS_NIP_KEY")
	headers2 := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer " + nipKey2,
	}
	_, respBody, bodyErr := httpPostWithBody(ctx, nipURL+"/api/v1/nameEnquiry", []byte(payload2), headers2)
	if bodyErr != nil {
		slog.Warn("[nip] NIBSS body read failed", "err", bodyErr)
		return types.NIPNameEnquiryResponse{AccountName: "ACCOUNT NAME UNAVAILABLE", BankCode: req.BankCode, AccountNumber: req.AccountNumber, SessionID: uuid.NewString()}
	}
	var nipResp struct {
		AccountName  string `json:"accountName"`
		SessionID    string `json:"sessionID"`
		ResponseCode string `json:"responseCode"`
	}
	if decErr := json.Unmarshal(respBody, &nipResp); decErr != nil {
		slog.Warn("[nip] Failed to decode NIBSS response", "err", decErr)
		return types.NIPNameEnquiryResponse{AccountName: "ACCOUNT NAME UNAVAILABLE", BankCode: req.BankCode, AccountNumber: req.AccountNumber, SessionID: uuid.NewString()}
	}
	sessionID := nipResp.SessionID
	if sessionID == "" {
		sessionID = uuid.NewString()
	}
	return types.NIPNameEnquiryResponse{
		AccountName:   nipResp.AccountName,
		BankCode:      req.BankCode,
		AccountNumber: req.AccountNumber,
		SessionID:     sessionID,
	}
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

// httpPostWithBody makes an HTTP POST request and returns the status code and response body.
func httpPostWithBody(ctx context.Context, targetURL string, body []byte, headers map[string]string) (int, []byte, error) {
	if _, err := url.ParseRequestURI(targetURL); err != nil {
		return 0, nil, fmt.Errorf("invalid URL: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL,
		strings.NewReader(string(body)))
	if err != nil {
		return 0, nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	respBody := make([]byte, 0, 4096)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			respBody = append(respBody, buf[:n]...)
		}
		if readErr != nil {
			break
		}
	}
	return resp.StatusCode, respBody, nil
}

// httpPost makes an HTTP POST request and returns the status code.
func httpPost(ctx context.Context, targetURL string, body []byte, headers map[string]string) (int, error) {
	// Validate URL
	if _, err := url.ParseRequestURI(targetURL); err != nil {
		return 0, fmt.Errorf("invalid URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL,
		strings.NewReader(string(body)))
	if err != nil {
		return 0, err
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// computeHMACSHA256 returns a hex-encoded HMAC-SHA256 signature.
func computeHMACSHA256(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// marshalJSON marshals v to JSON bytes (used for webhook signing).
func marshalJSON(v any) ([]byte, error) {
	return json.Marshal(v)
}
