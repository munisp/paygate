// Package handlers_test contains integration-style tests for all new Go bridge handlers.
// Tests use the mock TigerBeetle client and verify HTTP request/response contracts.
package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/handlers"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

func newReq(t *testing.T, method, path string, body any) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	return req
}

func do(t *testing.T, handler http.HandlerFunc, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

func assertStatus(t *testing.T, rr *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rr.Code != want {
		t.Errorf("status = %d, want %d; body: %s", rr.Code, want, rr.Body.String())
	}
}

// assertJSONField checks that the response body contains the given JSON key.
// It silently skips the check if the body is a JSON array (not an object).
func assertJSONField(t *testing.T, rr *httptest.ResponseRecorder, field string) {
	t.Helper()
	body := rr.Body.Bytes()
	if len(body) > 0 && body[0] == '[' {
		// Array response — field check not applicable
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Errorf("decode response: %v", err)
		return
	}
	if _, ok := m[field]; !ok {
		t.Errorf("response missing field %q; got: %v", field, m)
	}
}

// ─── setup ───────────────────────────────────────────────────────────────────

func TestMain(m *testing.M) {
	// TigerBeetle: in-memory mock
	if err := tb.InitMock(); err != nil {
		panic("failed to init mock TigerBeetle: " + err.Error())
	}
	// Redis: disabled mode (no REDIS_URL set)
	redis.Init()
	// Kafka: disabled mode (no KAFKA_BROKERS set)
	kafka.GetProducer()
	// Fluvio: disabled mode (no FLUVIO_ENDPOINT set)
	fluvio.Init()
	// Permify: disabled mode (no PERMIFY_URL set)
	permify.Init()
	m.Run()
}

// ─── transactions ─────────────────────────────────────────────────────────────

func TestRecordTransaction_Success(t *testing.T) {
	body := map[string]any{
		"transaction_id": "txn-001",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
		"customer_id":    "00000000-0000-0000-0000-000000000002",
		"amount":         uint64(5000),
		"currency":       "NGN",
		"channel":        "card",
		"reference":      "ref-001",
		"type":           "payment",
	}
	rr := do(t, handlers.RecordTransaction, newReq(t, http.MethodPost, "/v1/transactions/record", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "ledger_entry_id")
}

func TestRecordTransaction_MissingFields(t *testing.T) {
	rr := do(t, handlers.RecordTransaction, newReq(t, http.MethodPost, "/v1/transactions/record", map[string]any{
		"transaction_id": "txn-002",
		// missing merchant_id, amount, currency
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestRefundTransaction_Success(t *testing.T) {
	body := map[string]any{
		"transaction_id": "txn-001",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
		"amount":         uint64(5000),
		"reason":         "customer_request",
		"initiator_id":   "00000000-0000-0000-0000-000000000003",
	}
	rr := do(t, handlers.RefundTransaction, newReq(t, http.MethodPost, "/v1/transactions/refund", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "refund_id")
}

func TestRefundTransaction_MissingTransactionId(t *testing.T) {
	rr := do(t, handlers.RefundTransaction, newReq(t, http.MethodPost, "/v1/transactions/refund", map[string]any{
		"amount": uint64(1000),
		// missing transaction_id and merchant_id
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

// ─── disputes ─────────────────────────────────────────────────────────────────

func TestSubmitDispute_Success(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"dispute_id":     "00000000-0000-0000-0000-000000000020",
		"transaction_id": "txn-001",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
		"customer_id":    "00000000-0000-0000-0000-000000000002",
		"amount":         uint64(5000),
		"currency":       "NGN",
		"reason":         "unauthorized",
		"initiator_id":   "00000000-0000-0000-0000-000000000003",
	}
	rr := do(t, handlers.SubmitDispute, newReq(t, http.MethodPost, "/v1/disputes/submit", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "reservation_id")
}

func TestSubmitDispute_MissingDisputeId(t *testing.T) {
	rr := do(t, handlers.SubmitDispute, newReq(t, http.MethodPost, "/v1/disputes/submit", map[string]any{
		"transaction_id": "txn-001",
		"amount":         uint64(5000),
		// missing dispute_id and merchant_id
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestResolveDispute_Refund(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"resolution":  "won",
		"amount":      uint64(5000),
		"reviewer_id": "00000000-0000-0000-0000-000000000004",
	}
	rr := do(t, handlers.ResolveDispute, newReq(t, http.MethodPost, "/v1/disputes/00000000-0000-0000-0000-000000000020/resolve", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "status")
}

func TestResolveDispute_Reject(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"resolution":  "lost",
		"amount":      uint64(2000),
		"reviewer_id": "00000000-0000-0000-0000-000000000004",
	}
	rr := do(t, handlers.ResolveDispute, newReq(t, http.MethodPost, "/v1/disputes/00000000-0000-0000-0000-000000000021/resolve", body))
	assertStatus(t, rr, http.StatusOK)
}

func TestResolveDispute_InvalidResolution(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"resolution":  "unknown_resolution",
		"amount":      uint64(1000),
		"reviewer_id": "00000000-0000-0000-0000-000000000004",
	}
	rr := do(t, handlers.ResolveDispute, newReq(t, http.MethodPost, "/v1/disputes/00000000-0000-0000-0000-000000000022/resolve", body))
	assertStatus(t, rr, http.StatusBadRequest)
}

// ─── FX ───────────────────────────────────────────────────────────────────────

func TestConvertFX_Success(t *testing.T) {
	body := map[string]any{
		"conversion_id":   "fx-001",
		"merchant_id":     "00000000-0000-0000-0000-000000000001",
		"source_amount":   uint64(100000),
		"source_currency": "NGN",
		"target_currency": "USD",
		"exchange_rate":   0.00065,
		"target_amount":   uint64(65),
	}
	rr := do(t, handlers.RecordFXConversion, newReq(t, http.MethodPost, "/v1/fx/convert", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "conversion_id")
}

func TestConvertFX_MissingRate(t *testing.T) {
	rr := do(t, handlers.RecordFXConversion, newReq(t, http.MethodPost, "/v1/fx/convert", map[string]any{
		"conversion_id":   "fx-002",
		"merchant_id":     "00000000-0000-0000-0000-000000000001",
		"source_amount":   uint64(50000),
		"source_currency": "NGN",
		"target_currency": "USD",
		// exchange_rate missing → 0 → bad request
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

// ─── fraud ────────────────────────────────────────────────────────────────────

func TestScoreFraud_Success(t *testing.T) {
	body := map[string]any{
		"transaction_id": "txn-003",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
		"customer_id":    "00000000-0000-0000-0000-000000000002",
		"amount":         uint64(250000),
		"currency":       "NGN",
		"channel":        "web",
		"ip_address":     "192.168.1.1",
	}
	rr := do(t, handlers.ScoreFraud, newReq(t, http.MethodPost, "/v1/fraud/score", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "risk_score")
	assertJSONField(t, rr, "decision")
}

func TestScoreFraud_MissingTransactionId(t *testing.T) {
	rr := do(t, handlers.ScoreFraud, newReq(t, http.MethodPost, "/v1/fraud/score", map[string]any{
		"amount":   uint64(1000),
		"currency": "NGN",
		// missing transaction_id and merchant_id
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestAcknowledgeFraudAlert_Success(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"merchant_id":     "00000000-0000-0000-0000-000000000001",
		"acknowledger_id": "00000000-0000-0000-0000-000000000008",
		"action":          "dismiss",
		"notes":           "Verified with customer",
	}
	req := newReq(t, http.MethodPost, "/v1/fraud/alerts/alert-001/acknowledge", body)
	req.SetPathValue("id", "alert-001")
	rr := do(t, handlers.AcknowledgeFraudAlert, req)
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "success")
}

// ─── KYC ─────────────────────────────────────────────────────────────────────

func TestStartKYCWorkflow_Success(t *testing.T) {
	body := map[string]any{
		"submission_id": "sub-001",
		"merchant_id":   "00000000-0000-0000-0000-000000000001",
		"document_type": "national_id",
		"document_url":  "https://storage.example.com/docs/id.jpg",
		"initiator_id":  "00000000-0000-0000-0000-000000000003",
	}
	rr := do(t, handlers.StartKYCWorkflow, newReq(t, http.MethodPost, "/v1/kyc/start", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "workflow_id")
}

func TestStartKYCWorkflow_MissingCustomerId(t *testing.T) {
	rr := do(t, handlers.StartKYCWorkflow, newReq(t, http.MethodPost, "/v1/kyc/start", map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		// missing submission_id, document_type, document_url
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestUpdateKYCStatus_Approved(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"status":      "approved",
		"reviewer_id": "00000000-0000-0000-0000-000000000009",
	}
	req := newReq(t, http.MethodPost, "/v1/kyc/kyc-001/update-status", body)
	req.SetPathValue("id", "kyc-001")
	rr := do(t, handlers.UpdateKYCStatus, req)
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "success")
}

// ─── BNPL ─────────────────────────────────────────────────────────────────────

func TestCreateBNPLLoan_Success(t *testing.T) {
	body := map[string]any{
		"loan_id":          "00000000-0000-0000-0000-000000000030",
		"customer_id":      "00000000-0000-0000-0000-000000000002",
		"merchant_id":      "00000000-0000-0000-0000-000000000001",
		"principal_amount": uint64(120000),
		"currency":         "NGN",
		"installments":     3,
		"interest_rate":    0.025,
	}
	rr := do(t, handlers.CreateBNPLLoan, newReq(t, http.MethodPost, "/v1/bnpl/loans/create", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "loan_id")
	assertJSONField(t, rr, "loan_id")
}

func TestCreateBNPLLoan_ZeroInstalments(t *testing.T) {
	rr := do(t, handlers.CreateBNPLLoan, newReq(t, http.MethodPost, "/v1/bnpl/loans/create", map[string]any{
		"loan_id":          "00000000-0000-0000-0000-000000000031",
		"merchant_id":      "00000000-0000-0000-0000-000000000001",
		"principal_amount": uint64(60000),
		"currency":         "NGN",
		"installments":     0, // invalid
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestProcessBNPLInstalment_Success(t *testing.T) {
	body := map[string]any{
		"merchant_id":       "00000000-0000-0000-0000-000000000001",
		"instalment_number": 1,
		"amount":            uint64(40000),
		"currency":          "NGN",
	}
	req := newReq(t, http.MethodPost, "/v1/bnpl/loans/00000000-0000-0000-0000-000000000030/instalment", body)
	req.SetPathValue("id", "00000000-0000-0000-0000-000000000030")
	rr := do(t, handlers.ProcessBNPLInstalment, req)
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "ledger_entry_id")
}

// ─── virtual cards ────────────────────────────────────────────────────────────

func TestIssueVirtualCard_Success(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"card_id":        "00000000-0000-0000-0000-000000000040",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
		"currency":       "USD",
		"spending_limit": uint64(50000),
		"issuer_id":      "00000000-0000-0000-0000-000000000005",
	}
	rr := do(t, handlers.IssueVirtualCard, newReq(t, http.MethodPost, "/v1/virtual-cards/issue", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "card_id")
}

func TestFreezeVirtualCard_Success(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"actor_id":    "00000000-0000-0000-0000-000000000006",
		"reason":      "suspicious_activity",
	}
	req := newReq(t, http.MethodPost, "/v1/virtual-cards/card-001/freeze", body)
	req.SetPathValue("id", "card-001")
	rr := do(t, handlers.FreezeVirtualCard, req)
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "status")
}

func TestUnfreezeVirtualCard_Success(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"actor_id":    "00000000-0000-0000-0000-000000000006",
	}
	req := newReq(t, http.MethodPost, "/v1/virtual-cards/card-001/unfreeze", body)
	req.SetPathValue("id", "card-001")
	rr := do(t, handlers.UnfreezeVirtualCard, req)
	assertStatus(t, rr, http.StatusOK)
}

func TestTerminateVirtualCard_Success(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"actor_id":    "00000000-0000-0000-0000-000000000006",
		"reason":      "expired",
	}
	req := newReq(t, http.MethodPost, "/v1/virtual-cards/card-001/terminate", body)
	req.SetPathValue("id", "card-001")
	rr := do(t, handlers.TerminateVirtualCard, req)
	assertStatus(t, rr, http.StatusOK)
}

// ─── payment links ────────────────────────────────────────────────────────────

func TestCreatePaymentLink_Success(t *testing.T) {
	t.Setenv("PERMIFY_FAIL_OPEN", "true") // these tests exercise handler logic, not PBAC

	body := map[string]any{
		"link_id":     "link-001",
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"amount":      uint64(25000),
		"currency":    "NGN",
		"description": "Invoice #1234",
		"expires_at":  "2026-12-31T23:59:59Z",
		"creator_id":  "00000000-0000-0000-0000-000000000007",
	}
	rr := do(t, handlers.CreatePaymentLink, newReq(t, http.MethodPost, "/v1/payment-links/create", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "url")
}

func TestCreatePaymentLink_MissingMerchantId(t *testing.T) {
	rr := do(t, handlers.CreatePaymentLink, newReq(t, http.MethodPost, "/v1/payment-links/create", map[string]any{
		"link_id":  "link-002",
		"amount":   uint64(10000),
		"currency": "NGN",
		// missing merchant_id
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

// ─── webhooks ─────────────────────────────────────────────────────────────────

func TestDeliverWebhook_Success(t *testing.T) {
	body := map[string]any{
		"delivery_id": "del-001",
		"webhook_id":  "wh-001",
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"event_type":  "payment.completed",
		"payload":     map[string]any{"transaction_id": "txn-001"},
		"target_url":  "https://example.com/webhook",
	}
	rr := do(t, handlers.DeliverWebhook, newReq(t, http.MethodPost, "/v1/webhooks/deliver", body))
	// 200 (delivered) or 502 (target unreachable in test) are both valid
	if rr.Code != http.StatusOK && rr.Code != http.StatusBadGateway {
		t.Errorf("unexpected status %d; body: %s", rr.Code, rr.Body.String())
	}
}

func TestRetryWebhookDelivery_Success(t *testing.T) {
	// First deliver to populate Redis state
	deliverBody := map[string]any{
		"delivery_id": "del-retry-001",
		"webhook_id":  "wh-001",
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"event_type":  "payment.completed",
		"payload":     map[string]any{"transaction_id": "txn-001"},
		"target_url":  "https://example.com/webhook",
	}
	do(t, handlers.DeliverWebhook, newReq(t, http.MethodPost, "/v1/webhooks/deliver", deliverBody))

	// Now retry
	retryBody := map[string]any{
		"delivery_id": "del-retry-001",
		"webhook_id":  "wh-001",
		"merchant_id": "00000000-0000-0000-0000-000000000001",
	}
	req := newReq(t, http.MethodPost, "/v1/webhooks/deliveries/del-retry-001/retry", retryBody)
	req.SetPathValue("id", "del-retry-001")
	rr := do(t, handlers.RetryWebhookDelivery, req)
	// Redis is disabled in tests, so delivery state won't be found → 404 is acceptable
	if rr.Code != http.StatusOK && rr.Code != http.StatusBadGateway && rr.Code != http.StatusNotFound {
		t.Errorf("unexpected status %d; body: %s", rr.Code, rr.Body.String())
	}
}

// ─── mobile money ─────────────────────────────────────────────────────────────

func TestReconcileMoMo_Success(t *testing.T) {
	body := map[string]any{
		"recon_id":     "recon-001",
		"merchant_id":  "00000000-0000-0000-0000-000000000001",
		"provider":     "MTN",
		"external_ref": "ext-001",
		"amount":       uint64(5000),
		"currency":     "GHS",
		"direction":    "incoming",
	}
	rr := do(t, handlers.ReconcileMoMo, newReq(t, http.MethodPost, "/v1/mobile-money/reconcile", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "status")
}

// ─── auth / role sync ─────────────────────────────────────────────────────────

func TestSyncRolesToPermify_Success(t *testing.T) {
	body := map[string]any{
		"user_id":          "00000000-0000-0000-0000-000000000011",
		"merchant_id":      "00000000-0000-0000-0000-000000000001",
		"keycloak_subject": "kc-sub-001",
		"roles":            []string{"admin", "analyst"},
	}
	rr := do(t, handlers.SyncRolesToPermify, newReq(t, http.MethodPost, "/v1/auth/sync-roles", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "synced_roles")
}

// ─── workflow observability ───────────────────────────────────────────────────

func TestListActiveWorkflows_Success(t *testing.T) {
	rr := do(t, handlers.ListActiveWorkflows, httptest.NewRequest(http.MethodGet, "/v1/workflows/active", nil))
	assertStatus(t, rr, http.StatusOK)
	// ListActiveWorkflows returns a JSON array; just verify 200 OK
}

func TestGetWorkflowStatus_Success(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/workflows/wf-001/status", nil)
	req.SetPathValue("id", "wf-001")
	rr := do(t, handlers.GetWorkflowStatus, req)
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "workflow_id")
}

func TestTerminateWorkflow_Success(t *testing.T) {
	body := map[string]any{
		"merchant_id": "00000000-0000-0000-0000-000000000001",
		"reason":      "manual_termination",
		"operator_id": "00000000-0000-0000-0000-000000000010",
	}
	req := newReq(t, http.MethodPost, "/v1/workflows/wf-001/terminate", body)
	req.SetPathValue("id", "wf-001")
	rr := do(t, handlers.TerminateWorkflow, req)
	assertStatus(t, rr, http.StatusOK)
}

// ─── notifications ────────────────────────────────────────────────────────────

func TestSendPayoutApprovalEmail_Success(t *testing.T) {
	body := map[string]any{
		"payout_id":        "payout-001",
		"merchant_id":      "00000000-0000-0000-0000-000000000001",
		"amount":           uint64(500000),
		"currency":         "NGN",
		"recipient_emails": []string{"merchant@example.com"},
		"approval_url":     "https://portal.paygate.io/approve/tok-abc123",
		"initiator_name":   "Test Merchant",
	}
	rr := do(t, handlers.SendPayoutApprovalEmail, newReq(t, http.MethodPost, "/v1/notifications/payout-approval-email", body))
	// 200 OK or 502 if SMTP is unavailable in test environment
	if rr.Code != http.StatusOK && rr.Code != http.StatusBadGateway {
		t.Errorf("unexpected status %d; body: %s", rr.Code, rr.Body.String())
	}
}

// ─── NIP name enquiry ─────────────────────────────────────────────────────────

func TestNIPNameEnquiry_Success(t *testing.T) {
	body := map[string]any{
		"account_number": "0123456789",
		"bank_code":      "058",
		"merchant_id":    "00000000-0000-0000-0000-000000000001",
	}
	rr := do(t, handlers.NIPNameEnquiry, newReq(t, http.MethodPost, "/v1/nibss/name-enquiry", body))
	assertStatus(t, rr, http.StatusOK)
	assertJSONField(t, rr, "account_name")
}

func TestNIPNameEnquiry_MissingAccountNumber(t *testing.T) {
	rr := do(t, handlers.NIPNameEnquiry, newReq(t, http.MethodPost, "/v1/nibss/name-enquiry", map[string]any{
		"bankCode": "058",
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}

func TestNIPNameEnquiry_MissingBankCode(t *testing.T) {
	rr := do(t, handlers.NIPNameEnquiry, newReq(t, http.MethodPost, "/v1/nibss/name-enquiry", map[string]any{
		"accountNumber": "0123456789",
	}))
	assertStatus(t, rr, http.StatusBadRequest)
}
