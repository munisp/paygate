package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func biometricChallenge(secret, deviceID, nonce string) string {
	mac := hmac.New(sha256.New, []byte(secret+deviceID))
	mac.Write([]byte(nonce))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestBiometricToken_ValidChallenge(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-biometric-secret")

	body, _ := json.Marshal(BiometricTokenRequest{
		UserID:    "u1",
		DeviceID:  "d1",
		Nonce:     "n1",
		Challenge: biometricChallenge("test-biometric-secret", "d1", "n1"),
	})
	req := httptest.NewRequest("POST", "/v1/auth/biometric-token", bytes.NewReader(body))
	w := httptest.NewRecorder()
	BiometricToken(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", w.Code, w.Body.String())
	}
	var resp BiometricTokenResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || resp.Token == "" {
		t.Fatalf("expected token in response, got %v (%s)", err, w.Body.String())
	}
}

func TestBiometricToken_InvalidChallenge(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-biometric-secret")

	body, _ := json.Marshal(BiometricTokenRequest{
		UserID: "u1", DeviceID: "d1", Nonce: "n1", Challenge: "deadbeef",
	})
	req := httptest.NewRequest("POST", "/v1/auth/biometric-token", bytes.NewReader(body))
	w := httptest.NewRecorder()
	BiometricToken(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestBiometricRevoke_ReallyRevokes(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if IsBiometricTokenRevoked(token) {
		t.Fatal("token should not be revoked before revoke call")
	}
	body, _ := json.Marshal(map[string]string{
		"user_id": "u1", "device_id": "d1", "token": token,
	})
	req := httptest.NewRequest("POST", "/v1/auth/biometric-revoke", bytes.NewReader(body))
	w := httptest.NewRecorder()
	BiometricRevoke(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !IsBiometricTokenRevoked(token) {
		t.Fatal("token must be in the denylist after revoke")
	}
}

func TestBiometricRevoke_MissingToken(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"user_id": "u1"})
	req := httptest.NewRequest("POST", "/v1/auth/biometric-revoke", bytes.NewReader(body))
	w := httptest.NewRecorder()
	BiometricRevoke(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
