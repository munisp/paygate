package handlers

import (
"bytes"
"crypto/hmac"
"crypto/sha256"
"encoding/hex"
"encoding/json"
"fmt"
"io"
"log/slog"
"net/http"
	"github.com/paygate/go-bridge/internal/httpclient"
"os"
"time"
)

// NIBSSConfirmationPayload is the webhook body sent by NIBSS when a PTSP batch is confirmed.
type NIBSSConfirmationPayload struct {
BatchID     string `json:"batch_id"`
Status      string `json:"status"`       // "confirmed" | "failed"
ConfirmedAt string `json:"confirmed_at"` // ISO-8601
Reference   string `json:"reference"`    // NIBSS reference
}

// PTSPConfirmationWebhook handles POST /v1/pos/settlement/confirm
//
// Security: validates HMAC-SHA256 signature in X-NIBSS-Signature header.
// After validation, calls the merchant portal tRPC confirmBatch procedure
// via the internal bridge URL.
func PTSPConfirmationWebhook(w http.ResponseWriter, r *http.Request) {
// Read raw body for HMAC verification
rawBody, err := io.ReadAll(r.Body)
if err != nil {
writeError(w, http.StatusBadRequest, "failed to read request body")
return
}
defer r.Body.Close()

// Verify HMAC-SHA256 signature
sigHeader := r.Header.Get("X-NIBSS-Signature")
if sigHeader == "" {
writeError(w, http.StatusUnauthorized, "missing X-NIBSS-Signature header")
return
}
secret := os.Getenv("NIBSS_WEBHOOK_SECRET")
if secret == "" {
secret = os.Getenv("MIDDLEWARE_INTERNAL_KEY") // fallback to internal key
}
if !verifyHMAC(rawBody, sigHeader, secret) {
slog.Warn("[NIBSS Webhook] HMAC verification failed",
"signature", sigHeader,
"body_len", len(rawBody))
writeError(w, http.StatusUnauthorized, "invalid HMAC signature")
return
}

// Parse payload
var payload NIBSSConfirmationPayload
if err := json.Unmarshal(rawBody, &payload); err != nil {
writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid JSON: %v", err))
return
}
if payload.BatchID == "" || payload.Status == "" || payload.Reference == "" {
writeError(w, http.StatusBadRequest, "batch_id, status, and reference are required")
return
}

slog.Info("[NIBSS Webhook] Received confirmation",
"batch_id", payload.BatchID,
"status", payload.Status,
"reference", payload.Reference)

// Forward to merchant portal tRPC via internal bridge
portalURL := os.Getenv("MERCHANT_PORTAL_URL")
if portalURL == "" {
portalURL = "http://localhost:3000"
}
internalKey := os.Getenv("MIDDLEWARE_INTERNAL_KEY")

tRPCPayload := map[string]interface{}{
"json": map[string]interface{}{
"batchId":         payload.BatchID,
"nibssReference":  payload.Reference,
"confirmedAt":     payload.ConfirmedAt,
"status":          payload.Status,
},
}
bodyBytes, _ := json.Marshal(tRPCPayload)

req, err := http.NewRequest("POST",
portalURL+"/api/trpc/pos.confirmBatch",
bytes.NewReader(bodyBytes))
if err != nil {
slog.Error("[NIBSS Webhook] Failed to build portal request", "err", err)
writeError(w, http.StatusInternalServerError, "failed to forward to portal")
return
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("X-Internal-Key", internalKey)

client := httpclient.Default
resp, err := client.Do(req)
if err != nil {
slog.Error("[NIBSS Webhook] Portal call failed", "err", err)
writeError(w, http.StatusBadGateway, "portal call failed")
return
}
defer resp.Body.Close()

if resp.StatusCode >= 400 {
slog.Error("[NIBSS Webhook] Portal returned error", "status", resp.StatusCode)
writeError(w, http.StatusBadGateway, fmt.Sprintf("portal returned %d", resp.StatusCode))
return
}

slog.Info("[NIBSS Webhook] Confirmation forwarded successfully",
"batch_id", payload.BatchID,
"portal_status", resp.StatusCode)

w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusOK)
json.NewEncoder(w).Encode(map[string]interface{}{
"ok":       true,
"batch_id": payload.BatchID,
"status":   payload.Status,
})
}

// verifyHMAC validates the HMAC-SHA256 signature of the body.
func verifyHMAC(body []byte, signature, secret string) bool {
mac := hmac.New(sha256.New, []byte(secret))
mac.Write(body)
expected := hex.EncodeToString(mac.Sum(nil))
return hmac.Equal([]byte(expected), []byte(signature))
}
