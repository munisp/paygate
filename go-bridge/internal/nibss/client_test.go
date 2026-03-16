package nibss

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

func newTestServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, func()) {
	t.Helper()
	srv := httptest.NewServer(handler)
	return srv, srv.Close
}

func newTestClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	return &Client{
		baseURL:         baseURL,
		secretKey:       "test-secret",
		institutionCode: "999999",
		httpClient:      &http.Client{},
	}
}

// ─── New() ────────────────────────────────────────────────────────────────────

func TestNew_NotConfigured(t *testing.T) {
	os.Unsetenv("NIBSS_GATEWAY_URL")
	os.Unsetenv("NIBSS_SECRET_KEY")
	_, err := New()
	if err != ErrNotConfigured {
		t.Fatalf("expected ErrNotConfigured, got %v", err)
	}
}

func TestNew_Configured(t *testing.T) {
	t.Setenv("NIBSS_GATEWAY_URL", "http://localhost:9999")
	t.Setenv("NIBSS_SECRET_KEY", "secret")
	c, err := New()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c == nil {
		t.Fatal("expected non-nil client")
	}
}

// ─── SingleCreditTransfer ─────────────────────────────────────────────────────

func TestSingleCreditTransfer_Success(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		// Verify path
		if r.URL.Path != "/NIPInterface/rest/Intrabank/SingleCreditTransfer" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		// Verify signature header is present
		if r.Header.Get("X-NIBSS-Signature") == "" {
			t.Error("missing X-NIBSS-Signature header")
		}
		// Verify institution code header
		if r.Header.Get("InstitutionCode") != "999999" {
			t.Errorf("unexpected InstitutionCode: %s", r.Header.Get("InstitutionCode"))
		}
		json.NewEncoder(w).Encode(SingleCreditResponse{
			SessionID:       "20260316120000TEST0000000001",
			ResponseCode:    RespSuccess,
			ResponseMessage: "Approved",
			TransactionID:   "TXN123456",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	req := SingleCreditRequest{
		SessionID:                  "20260316120000TEST0000000001",
		DestinationInstitutionCode: "058",
		ChannelCode:                "2",
		BeneficiaryAccountName:     "John Doe",
		BeneficiaryAccountNumber:   "0123456789",
		BeneficiaryKYCLevel:        "1",
		OriginatorAccountName:      "PayGate Settlement",
		OriginatorAccountNumber:    "0000000000",
		OriginatorKYCLevel:         "3",
		TransactionLocation:        "6.5244,3.3792",
		Narration:                  "PayGate Settlement SETTLE-001",
		PaymentReference:           "PAY-REF-001",
		Amount:                     "100000",
	}
	resp, err := c.SingleCreditTransfer(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ResponseCode != RespSuccess {
		t.Errorf("expected response code %s, got %s", RespSuccess, resp.ResponseCode)
	}
	if resp.TransactionID != "TXN123456" {
		t.Errorf("expected transaction ID TXN123456, got %s", resp.TransactionID)
	}
}

func TestSingleCreditTransfer_GatewayError(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(SingleCreditResponse{
			SessionID:       "SESSION001",
			ResponseCode:    "51",
			ResponseMessage: "Insufficient funds",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	req := SingleCreditRequest{
		SessionID:                  "SESSION001",
		DestinationInstitutionCode: "058",
		ChannelCode:                "2",
		BeneficiaryAccountNumber:   "0123456789",
		BeneficiaryKYCLevel:        "1",
		OriginatorAccountName:      "PayGate",
		OriginatorAccountNumber:    "0000000000",
		OriginatorKYCLevel:         "3",
		TransactionLocation:        "6.5244,3.3792",
		Narration:                  "Test",
		PaymentReference:           "REF001",
		Amount:                     "100000",
	}
	_, err := c.SingleCreditTransfer(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for non-success response code")
	}
}

// ─── NameEnquiry ─────────────────────────────────────────────────────────────

func TestNameEnquiry_Success(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/NIPInterface/rest/Intrabank/NameEnquiry" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(NameEnquiryResponse{
			SessionID:       "SESSION002",
			ResponseCode:    RespSuccess,
			ResponseMessage: "Approved",
			AccountName:     "JOHN DOE",
			BankCode:        "058",
			KYCLevel:        "1",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	resp, err := c.NameEnquiry(context.Background(), "0123456789", "058")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.AccountName != "JOHN DOE" {
		t.Errorf("expected account name JOHN DOE, got %s", resp.AccountName)
	}
}

func TestNameEnquiry_NotFound(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(NameEnquiryResponse{
			SessionID:       "SESSION003",
			ResponseCode:    "35",
			ResponseMessage: "Invalid account",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	_, err := c.NameEnquiry(context.Background(), "9999999999", "058")
	if err == nil {
		t.Fatal("expected error for invalid account")
	}
}

// ─── QueryTransactionStatus ───────────────────────────────────────────────────

func TestQueryTransactionStatus_Success(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(TransactionStatusResponse{
			SessionID:       "SESSION004",
			ResponseCode:    RespSuccess,
			ResponseMessage: "Approved",
			Status:          "00",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	resp, err := c.QueryTransactionStatus(context.Background(), "SESSION004")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "00" {
		t.Errorf("expected status 00, got %s", resp.Status)
	}
}

func TestQueryTransactionStatus_Pending(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(TransactionStatusResponse{
			SessionID:       "SESSION005",
			ResponseCode:    RespPending,
			ResponseMessage: "Transaction pending",
			Status:          "09",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	_, err := c.QueryTransactionStatus(context.Background(), "SESSION005")
	if err != ErrPending {
		t.Fatalf("expected ErrPending, got %v", err)
	}
}

func TestQueryTransactionStatus_Failed(t *testing.T) {
	srv, cleanup := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(TransactionStatusResponse{
			SessionID:       "SESSION006",
			ResponseCode:    "57",
			ResponseMessage: "Transaction not permitted",
			Status:          "57",
		})
	})
	defer cleanup()

	c := newTestClient(t, srv.URL)
	_, err := c.QueryTransactionStatus(context.Background(), "SESSION006")
	if err == nil || err == ErrPending {
		t.Fatalf("expected failure error, got %v", err)
	}
}

// ─── sign() ──────────────────────────────────────────────────────────────────

func TestSign_Deterministic(t *testing.T) {
	c := &Client{secretKey: "test-key"}
	data := []byte(`{"test":"value"}`)
	sig1 := c.sign(data)
	sig2 := c.sign(data)
	if sig1 != sig2 {
		t.Error("sign() is not deterministic")
	}
	if len(sig1) != 64 {
		t.Errorf("expected 64-char hex signature, got %d chars", len(sig1))
	}
}

func TestSign_DifferentKeys(t *testing.T) {
	c1 := &Client{secretKey: "key1"}
	c2 := &Client{secretKey: "key2"}
	data := []byte(`{"test":"value"}`)
	if c1.sign(data) == c2.sign(data) {
		t.Error("different keys produced same signature")
	}
}

// ─── generateSessionID() ─────────────────────────────────────────────────────

func TestGenerateSessionID_Length(t *testing.T) {
	id := generateSessionID()
	if len(id) != 30 {
		t.Errorf("expected 30-char session ID, got %d: %s", len(id), id)
	}
}

func TestGenerateSessionID_Unique(t *testing.T) {
	ids := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := generateSessionID()
		if ids[id] {
			t.Errorf("duplicate session ID generated: %s", id)
		}
		ids[id] = true
	}
}
