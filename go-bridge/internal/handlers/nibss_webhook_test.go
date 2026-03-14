package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func signBody(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestPTSPConfirmationWebhook_MissingSignature(t *testing.T) {
	payload := NIBSSConfirmationPayload{
		BatchID: "batch_001", Status: "confirmed", Reference: "NIBSS-REF-001",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/v1/pos/settlement/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	PTSPConfirmationWebhook(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestPTSPConfirmationWebhook_InvalidSignature(t *testing.T) {
	os.Setenv("NIBSS_WEBHOOK_SECRET", "test-secret")
	defer os.Unsetenv("NIBSS_WEBHOOK_SECRET")

	payload := NIBSSConfirmationPayload{
		BatchID: "batch_001", Status: "confirmed", Reference: "NIBSS-REF-001",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/v1/pos/settlement/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-NIBSS-Signature", "invalid-signature")
	w := httptest.NewRecorder()
	PTSPConfirmationWebhook(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestPTSPConfirmationWebhook_ValidSignature_MissingFields(t *testing.T) {
	secret := "test-secret-key"
	os.Setenv("NIBSS_WEBHOOK_SECRET", secret)
	defer os.Unsetenv("NIBSS_WEBHOOK_SECRET")

	// Missing reference field
	payload := map[string]string{"batch_id": "batch_001", "status": "confirmed"}
	body, _ := json.Marshal(payload)
	sig := signBody(body, secret)
	req := httptest.NewRequest("POST", "/v1/pos/settlement/confirm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-NIBSS-Signature", sig)
	w := httptest.NewRecorder()
	PTSPConfirmationWebhook(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestVerifyHMAC(t *testing.T) {
	secret := "my-secret"
	body := []byte(`{"batch_id":"b1","status":"confirmed","reference":"R1"}`)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	if !verifyHMAC(body, sig, secret) {
		t.Error("expected HMAC to be valid")
	}
	if verifyHMAC(body, "bad-signature", secret) {
		t.Error("expected HMAC to be invalid")
	}
	if verifyHMAC(body, sig, "wrong-secret") {
		t.Error("expected HMAC to be invalid with wrong secret")
	}
}
