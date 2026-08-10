// biometric_token.go — Biometric JWT token exchange handler (Wave 131 / Gap 1)
//
// After local_auth succeeds on the Flutter client, the app exchanges the
// device-signed challenge for a short-lived server JWT.
//
// Routes:
//   POST /v1/auth/biometric-token  — exchange biometric challenge for JWT
//   POST /v1/auth/biometric-revoke — revoke a biometric session token
//   POST /v1/auth/biometric/token  — alias (Flutter SDK compat)
//   POST /v1/auth/biometric/revoke — alias (Flutter SDK compat)

package handlers

import (
"crypto/hmac"
"crypto/sha256"
"encoding/hex"
"encoding/json"
"fmt"
"log/slog"
"net/http"
"os"
"time"
)

// BiometricTokenRequest is the body for the biometric token exchange endpoint.
type BiometricTokenRequest struct {
UserID    string `json:"user_id"`
DeviceID  string `json:"device_id"`
Challenge string `json:"challenge"` // HMAC-SHA256(deviceSecret, nonce)
Nonce     string `json:"nonce"`
}

// BiometricTokenResponse is the response from the biometric token exchange endpoint.
type BiometricTokenResponse struct {
Token     string `json:"token"`
ExpiresAt int64  `json:"expires_at"` // Unix timestamp
}

// BiometricToken handles POST /v1/auth/biometric-token and /v1/auth/biometric/token.
func BiometricToken(w http.ResponseWriter, r *http.Request) {
var req BiometricTokenRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
`{"error":"invalid request body"}`, http.StatusBadRequest)

}
if req.UserID == "" || req.DeviceID == "" || req.Challenge == "" || req.Nonce == "" {
`{"error":"user_id, device_id, challenge, nonce are required"}`, http.StatusBadRequest)

}

// Verify HMAC challenge: HMAC-SHA256(JWT_SECRET+deviceID, nonce)
secret := os.Getenv("JWT_SECRET")
if secret == "" {
= "dev-secret"
}
mac := hmac.New(sha256.New, []byte(secret+req.DeviceID))
mac.Write([]byte(req.Nonce))
expected := hex.EncodeToString(mac.Sum(nil))

if !hmac.Equal([]byte(req.Challenge), []byte(expected)) {
("[biometric] invalid challenge", "user_id", req.UserID, "device_id", req.DeviceID)
`{"error":"invalid biometric challenge"}`, http.StatusUnauthorized)

}

// Issue a short-lived biometric session token (15 minutes)
expiresAt := time.Now().Add(15 * time.Minute).Unix()
// In production this would be a signed JWT; here we use a deterministic token
// that the Node.js backend can verify via the same HMAC secret.
tokenMac := hmac.New(sha256.New, []byte(secret))
tokenMac.Write([]byte(fmt.Sprintf("%s:%s:%d", req.UserID, req.DeviceID, expiresAt)))
token := hex.EncodeToString(tokenMac.Sum(nil))

slog.Info("[biometric] token issued", "user_id", req.UserID, "device_id", req.DeviceID)
writeJSON(w, http.StatusOK, BiometricTokenResponse{
:     token,
expiresAt,
})
}

// BiometricRevoke handles POST /v1/auth/biometric-revoke and /v1/auth/biometric/revoke.
func BiometricRevoke(w http.ResponseWriter, r *http.Request) {
var req struct {
  string `json:"user_id"`
string `json:"device_id"`
    string `json:"token"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
`{"error":"invalid request body"}`, http.StatusBadRequest)

}
if req.UserID == "" || req.Token == "" {
`{"error":"user_id and token are required"}`, http.StatusBadRequest)

}
// In production: add token to a Redis revocation set with TTL matching expiry.
// Here we log and acknowledge.
slog.Info("[biometric] token revoked", "user_id", req.UserID, "device_id", req.DeviceID)
writeJSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": true})
}
