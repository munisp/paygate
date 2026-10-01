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
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/paygate/go-bridge/internal/redis"
)

// revokedBioKey is the Redis denylist key for a revoked biometric token (jti).
func revokedBioKey(token string) string { return "revoked:bio:" + token }

// bioRedisClient returns the global Redis client when backed by a real server,
// else nil.  Never panics (Init may not have run in unit tests).
func bioRedisClient() *redis.Client {
	defer func() { _ = recover() }()
	rc := redis.Get()
	if rc != nil && rc.Enabled() {
		return rc
	}
	return nil
}

// ─── Secret resolution (fail closed) ──────────────────────────────────────────

var (
	biometricSecretOnce sync.Once
	biometricSecret     string
)

// biometricHMACSecret resolves the HMAC secret for biometric challenge/token
// operations. Fail closed per remediation spec #16/#19:
//   - JWT_SECRET set → use it.
//   - Unset in production → return "" (handlers reject with 503; NEVER fall
//     back to a well-known hardcoded default).
//   - Unset in dev → generate a per-boot random secret and log a warning.
func biometricHMACSecret() string {
	biometricSecretOnce.Do(func() {
		biometricSecret = os.Getenv("JWT_SECRET")
		if biometricSecret != "" {
			return
		}
		env := strings.ToLower(os.Getenv("ENV"))
		appEnv := strings.ToLower(os.Getenv("APP_ENV"))
		if env == "production" || env == "prod" || appEnv == "production" || appEnv == "prod" {
			slog.Error("FATAL: JWT_SECRET must be set when ENV=production — biometric token endpoints will reject all requests (fail closed)")
			biometricSecret = ""
			return
		}
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			slog.Error("FATAL: crypto/rand unavailable — biometric token endpoints disabled", "err", err)
			biometricSecret = ""
			return
		}
		biometricSecret = hex.EncodeToString(b)
		slog.Warn("JWT_SECRET unset — generated per-boot random secret for biometric tokens (dev only; tokens are NOT verifiable by other services)")
	})
	return biometricSecret
}

// ─── Token revocation denylist (in-memory, TTL-bound) ─────────────────────────

var (
	revokedBiometricMu sync.Mutex
	revokedBiometric   = map[string]int64{} // token → unix time when the entry may be purged
)

// revokeBiometricToken adds a token to the revocation denylist. The durable
// entry is Redis: SET revoked:bio:{jti} 1 EX 900 (the full 15-minute token
// lifetime). The in-memory map is kept as a dev-mode fallback and a secondary
// local cache. Fail-loud: when Redis is configured, a failed write returns an
// error and the caller must reject the revocation request.
func revokeBiometricToken(ctx context.Context, token string) error {
	revokedBiometricMu.Lock()
	// Lazy purge of expired entries
	now := time.Now().Unix()
	for t, exp := range revokedBiometric {
		if exp < now {
			delete(revokedBiometric, t)
		}
	}
	revokedBiometric[token] = time.Now().Add(15 * time.Minute).Unix()
	revokedBiometricMu.Unlock()

	if rc := bioRedisClient(); rc != nil {
		if err := rc.SetEX(ctx, revokedBioKey(token), "1", 900*time.Second); err != nil {
			return fmt.Errorf("redis biometric revocation write failed: %w", err)
		}
	}
	return nil
}

// ErrBiometricRevocationCheckUnavailable is returned when the revocation
// denylist cannot be consulted (Redis configured but unreachable). Verifiers
// MUST fail closed on this error — never treat an unchecked token as valid.
var ErrBiometricRevocationCheckUnavailable = fmt.Errorf("biometric revocation check unavailable (redis error)")

// IsBiometricTokenRevokedCtx reports whether a biometric session token (jti)
// has been revoked. Reads Redis (revoked:bio:{jti}) when configured; on a
// Redis error it returns ErrBiometricRevocationCheckUnavailable (fail closed).
// The in-memory map is consulted in dev mode (Redis disabled) and as a local
// fallback check.
func IsBiometricTokenRevokedCtx(ctx context.Context, token string) (bool, error) {
	revokedBiometricMu.Lock()
	exp, ok := revokedBiometric[token]
	if ok && exp < time.Now().Unix() {
		delete(revokedBiometric, token)
		ok = false
	}
	revokedBiometricMu.Unlock()
	if ok {
		return true, nil
	}

	if rc := bioRedisClient(); rc != nil {
		_, found, err := rc.GetString(ctx, revokedBioKey(token))
		if err != nil {
			return false, ErrBiometricRevocationCheckUnavailable
		}
		return found, nil
	}
	return false, nil
}

// IsBiometricTokenRevoked reports whether a biometric session token has been
// revoked. Verifiers of biometric tokens MUST consult this denylist. Fail
// closed: if the revocation backend cannot be consulted, the token is treated
// as revoked.
func IsBiometricTokenRevoked(token string) bool {
	revoked, err := IsBiometricTokenRevokedCtx(context.Background(), token)
	if err != nil {
		slog.Error("[biometric] revocation check failed — treating token as revoked (fail closed)", "err", err)
		return true
	}
	return revoked
}

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
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.UserID == "" || req.DeviceID == "" || req.Challenge == "" || req.Nonce == "" {
		http.Error(w, `{"error":"user_id, device_id, challenge, nonce are required"}`, http.StatusBadRequest)
		return
	}

	// Verify HMAC challenge: HMAC-SHA256(JWT_SECRET+deviceID, nonce).
	// Fail closed: no well-known default secret is ever used.
	secret := biometricHMACSecret()
	if secret == "" {
		slog.Error("[biometric] token exchange refused: JWT_SECRET not configured")
		http.Error(w, `{"error":"biometric token service not configured"}`, http.StatusServiceUnavailable)
		return
	}
	mac := hmac.New(sha256.New, []byte(secret+req.DeviceID))
	mac.Write([]byte(req.Nonce))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(req.Challenge), []byte(expected)) {
		slog.Warn("[biometric] invalid challenge", "user_id", req.UserID, "device_id", req.DeviceID)
		http.Error(w, `{"error":"invalid biometric challenge"}`, http.StatusUnauthorized)
		return
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
		Token:     token,
		ExpiresAt: expiresAt,
	})
}

// BiometricRevoke handles POST /v1/auth/biometric-revoke and /v1/auth/biometric/revoke.
func BiometricRevoke(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"user_id"`
		DeviceID string `json:"device_id"`
		Token    string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.UserID == "" || req.Token == "" {
		http.Error(w, `{"error":"user_id and token are required"}`, http.StatusBadRequest)
		return
	}
	// Real revocation: write the token to the denylist (Redis revoked:bio:{jti}
	// with EX 900 when Redis is configured; in-memory in dev) for the full
	// token lifetime (15 min). Verifiers consult IsBiometricTokenRevoked before
	// trusting a biometric session token.
	if err := revokeBiometricToken(r.Context(), req.Token); err != nil {
		slog.Error("[biometric] revocation write failed — rejecting request (fail loud)", "err", err)
		http.Error(w, `{"error":"revocation store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	slog.Info("[biometric] token revoked", "user_id", req.UserID, "device_id", req.DeviceID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": true})
}
