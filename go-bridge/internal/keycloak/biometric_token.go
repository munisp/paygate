// Package keycloak — biometric token exchange.
//
// Flow:
//  1. Mobile app performs local biometric authentication (FaceID / TouchID / fingerprint).
//  2. On success it calls POST /v1/auth/biometric-token with the stored refresh_token.
//  3. This handler exchanges the refresh_token for a fresh access_token via Keycloak's
//     standard token endpoint (grant_type=refresh_token), then returns the new pair.
//
// The refresh_token is stored in the device secure enclave (iOS Keychain / Android Keystore)
// and is only presented after a successful biometric challenge — the server never sees the
// biometric data itself.

package keycloak

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// BiometricTokenRequest is the payload sent by the mobile app after a successful
// local biometric challenge.
type BiometricTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
	DeviceID     string `json:"device_id"`   // stable device identifier for audit
	ClientID     string `json:"client_id"`   // Keycloak client_id (optional override)
}

// BiometricTokenResponse is returned to the mobile app.
type BiometricTokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshExpiresIn int    `json:"refresh_expires_in"`
	TokenType        string `json:"token_type"`
}

// keycloakTokenEndpoint returns the Keycloak token URL for the configured realm.
func keycloakTokenEndpoint() string {
	base := strings.TrimRight(os.Getenv("KEYCLOAK_URL"), "/")
	realm := os.Getenv("KEYCLOAK_REALM")
	if base == "" {
		base = "http://keycloak:8080"
	}
	if realm == "" {
		realm = "paygate"
	}
	return fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", base, realm)
}

// ExchangeRefreshToken exchanges a Keycloak refresh_token for a new access_token.
// This is the server-side leg of the biometric login flow.
func ExchangeRefreshToken(ctx context.Context, refreshToken, clientID string) (*BiometricTokenResponse, error) {
	if clientID == "" {
		clientID = os.Getenv("KEYCLOAK_CLIENT_ID")
	}
	clientSecret := os.Getenv("KEYCLOAK_CLIENT_SECRET")
	endpoint := keycloakTokenEndpoint()

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", clientID)
	if clientSecret != "" {
		form.Set("client_secret", clientSecret)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("keycloak biometric: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak biometric: token exchange: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		slog.Warn("[keycloak] biometric token exchange failed",
			"status", resp.StatusCode,
			"body", string(body),
		)
		return nil, fmt.Errorf("keycloak biometric: exchange failed (HTTP %d): %s", resp.StatusCode, body)
	}

	var result BiometricTokenResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("keycloak biometric: parse response: %w", err)
	}
	return &result, nil
}

// HandleBiometricToken is the HTTP handler for POST /v1/auth/biometric-token.
// It is intentionally NOT behind authMiddleware because the caller does not yet
// have a valid access_token — only a refresh_token stored in the device secure enclave.
func HandleBiometricToken(w http.ResponseWriter, r *http.Request) {
	var req BiometricTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request","message":"bad JSON body"}`, http.StatusBadRequest)
		return
	}
	if req.RefreshToken == "" {
		http.Error(w, `{"error":"invalid_request","message":"refresh_token required"}`, http.StatusBadRequest)
		return
	}

	result, err := ExchangeRefreshToken(r.Context(), req.RefreshToken, req.ClientID)
	if err != nil {
		slog.Warn("[keycloak] biometric exchange error", "device_id", req.DeviceID, "err", err)
		http.Error(w, `{"error":"token_exchange_failed","message":"biometric token exchange failed"}`, http.StatusUnauthorized)
		return
	}

	slog.Info("[keycloak] biometric token issued", "device_id", req.DeviceID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleBiometricRevoke revokes the device's refresh_token via Keycloak's revocation endpoint.
// Called when the user logs out or the device is deregistered.
func HandleBiometricRevoke(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
		DeviceID     string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	base := strings.TrimRight(os.Getenv("KEYCLOAK_URL"), "/")
	realm := os.Getenv("KEYCLOAK_REALM")
	if base == "" {
		base = "http://keycloak:8080"
	}
	if realm == "" {
		realm = "paygate"
	}
	revokeURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/revoke", base, realm)

	form := url.Values{}
	form.Set("token", req.RefreshToken)
	form.Set("token_type_hint", "refresh_token")
	form.Set("client_id", os.Getenv("KEYCLOAK_CLIENT_ID"))
	if secret := os.Getenv("KEYCLOAK_CLIENT_SECRET"); secret != "" {
		form.Set("client_secret", secret)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	httpReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, revokeURL, strings.NewReader(form.Encode()))
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil || (resp != nil && resp.StatusCode >= 400) {
		slog.Warn("[keycloak] biometric revoke failed", "device_id", req.DeviceID)
		http.Error(w, `{"error":"revoke_failed"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	slog.Info("[keycloak] biometric token revoked", "device_id", req.DeviceID)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}
