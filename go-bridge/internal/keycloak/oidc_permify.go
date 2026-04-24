// Package keycloak — Keycloak OIDC + Permify RBAC Integration
// Provides token introspection, user info, role extraction, and
// Permify permission checks for all PayGate cross-border rails.
package keycloak

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	KeycloakURL    string
	Realm          string
	ClientID       string
	ClientSecret   string
	PermifyURL     string
	PermifyAPIKey  string
}

func ConfigFromEnv() Config {
	return Config{
		KeycloakURL:   getEnv("KEYCLOAK_URL", "http://keycloak:8080"),
		Realm:         getEnv("KEYCLOAK_REALM", "paygate"),
		ClientID:      getEnv("KEYCLOAK_CLIENT_ID", "paygate-portal"),
		ClientSecret:  getEnv("KEYCLOAK_CLIENT_SECRET", ""),
		PermifyURL:    getEnv("PERMIFY_URL", "http://permify:3476"),
		PermifyAPIKey: getEnv("PERMIFY_API_KEY", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Keycloak Types ───────────────────────────────────────────────────────────

type TokenIntrospectResponse struct {
	Active    bool     `json:"active"`
	Sub       string   `json:"sub"`
	Username  string   `json:"preferred_username"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	Roles     []string `json:"roles,omitempty"`
	RealmRoles []string `json:"realm_roles,omitempty"`
	ClientRoles map[string][]string `json:"client_roles,omitempty"`
	Exp       int64    `json:"exp"`
	Iat       int64    `json:"iat"`
	Iss       string   `json:"iss"`
	Jti       string   `json:"jti"`
}

type UserInfo struct {
	Sub           string   `json:"sub"`
	Email         string   `json:"email"`
	EmailVerified bool     `json:"email_verified"`
	Name          string   `json:"name"`
	GivenName     string   `json:"given_name"`
	FamilyName    string   `json:"family_name"`
	Roles         []string `json:"roles,omitempty"`
	Groups        []string `json:"groups,omitempty"`
	MerchantID    string   `json:"merchant_id,omitempty"`
	TenantID      string   `json:"tenant_id,omitempty"`
}

// ─── Permify Types ────────────────────────────────────────────────────────────

type PermifyCheckRequest struct {
	TenantID string `json:"tenant_id"`
	Metadata struct {
		SchemaVersion string `json:"schema_version,omitempty"`
	} `json:"metadata"`
	Entity struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"entity"`
	Permission string `json:"permission"`
	Subject    struct {
		Type     string `json:"type"`
		ID       string `json:"id"`
		Relation string `json:"relation,omitempty"`
	} `json:"subject"`
}

type PermifyCheckResponse struct {
	Can string `json:"can"` // "RESULT_ALLOWED" | "RESULT_DENIED"
}

// ─── Client ───────────────────────────────────────────────────────────────────

type Client struct {
	cfg    Config
	http   *http.Client
	cache  map[string]*cachedToken
}

type cachedToken struct {
	data      *TokenIntrospectResponse
	expiresAt time.Time
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg:   cfg,
		http:  &http.Client{Timeout: 10 * time.Second},
		cache: make(map[string]*cachedToken),
	}
}

// ─── Token Introspection ──────────────────────────────────────────────────────

// IntrospectToken validates a Bearer token against Keycloak.
func (c *Client) IntrospectToken(ctx context.Context, token string) (*TokenIntrospectResponse, error) {
	// Check cache
	if cached, ok := c.cache[token]; ok && time.Now().Before(cached.expiresAt) {
		return cached.data, nil
	}

	introspectURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect",
		c.cfg.KeycloakURL, c.cfg.Realm)

	form := url.Values{}
	form.Set("token", token)
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, "POST", introspectURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create introspect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak introspect: %w", err)
	}
	defer resp.Body.Close()

	var result TokenIntrospectResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode introspect response: %w", err)
	}

	if !result.Active {
		return nil, fmt.Errorf("token is not active")
	}

	// Cache for 60 seconds
	c.cache[token] = &cachedToken{
		data:      &result,
		expiresAt: time.Now().Add(60 * time.Second),
	}

	return &result, nil
}

// GetUserInfo fetches user info from Keycloak using an access token.
func (c *Client) GetUserInfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	userInfoURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/userinfo",
		c.cfg.KeycloakURL, c.cfg.Realm)

	req, err := http.NewRequestWithContext(ctx, "GET", userInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak userinfo: %w", err)
	}
	defer resp.Body.Close()

	var info UserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode userinfo: %w", err)
	}

	return &info, nil
}

// ExtractRoles extracts all roles from a token introspection response.
func ExtractRoles(token *TokenIntrospectResponse) []string {
	roles := make(map[string]bool)

	for _, r := range token.Roles {
		roles[r] = true
	}
	for _, r := range token.RealmRoles {
		roles[r] = true
	}
	for _, clientRoles := range token.ClientRoles {
		for _, r := range clientRoles {
			roles[r] = true
		}
	}

	result := make([]string, 0, len(roles))
	for r := range roles {
		result = append(result, r)
	}
	return result
}

// HasRole checks if a token has a specific role.
func HasRole(token *TokenIntrospectResponse, role string) bool {
	for _, r := range ExtractRoles(token) {
		if r == role {
			return true
		}
	}
	return false
}

// ─── Permify RBAC ─────────────────────────────────────────────────────────────

// CheckPermission checks if a subject has permission on an entity via Permify.
func (c *Client) CheckPermission(ctx context.Context, tenantID, entityType, entityID, permission, subjectType, subjectID string) (bool, error) {
	checkURL := fmt.Sprintf("%s/v1/tenants/%s/permissions/check", c.cfg.PermifyURL, tenantID)

	reqBody := map[string]interface{}{
		"metadata": map[string]interface{}{},
		"entity": map[string]interface{}{
			"type": entityType,
			"id":   entityID,
		},
		"permission": permission,
		"subject": map[string]interface{}{
			"type": subjectType,
			"id":   subjectID,
		},
	}

	data, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", checkURL, strings.NewReader(string(data)))
	if err != nil {
		return false, fmt.Errorf("create permify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.cfg.PermifyAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.PermifyAPIKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		slog.Warn("Permify check failed (defaulting to deny)", "error", err)
		return false, nil
	}
	defer resp.Body.Close()

	var result PermifyCheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("decode permify response: %w", err)
	}

	return result.Can == "RESULT_ALLOWED", nil
}

// ─── PayGate-specific permission checks ──────────────────────────────────────

// CanInitiateCrossBorderTransfer checks if a merchant can initiate a cross-border transfer.
func (c *Client) CanInitiateCrossBorderTransfer(ctx context.Context, merchantID, userID, rail string) (bool, error) {
	permission := fmt.Sprintf("initiate_%s_transfer", rail) // e.g. initiate_cips_transfer
	allowed, err := c.CheckPermission(ctx, "paygate", "merchant", merchantID, permission, "user", userID)
	if err != nil {
		slog.Warn("Permify RBAC check failed, defaulting to Keycloak roles", "error", err)
		return true, nil // Fallback: allow if Permify is unavailable
	}
	return allowed, nil
}

// CanViewLedger checks if a user can view the TigerBeetle ledger.
func (c *Client) CanViewLedger(ctx context.Context, merchantID, userID string) (bool, error) {
	return c.CheckPermission(ctx, "paygate", "merchant", merchantID, "view_ledger", "user", userID)
}

// CanManageWebhooks checks if a user can manage webhooks.
func (c *Client) CanManageWebhooks(ctx context.Context, merchantID, userID string) (bool, error) {
	return c.CheckPermission(ctx, "paygate", "merchant", merchantID, "manage_webhooks", "user", userID)
}

// CanApprovePayouts checks if a user can approve payouts.
func (c *Client) CanApprovePayouts(ctx context.Context, merchantID, userID string) (bool, error) {
	return c.CheckPermission(ctx, "paygate", "merchant", merchantID, "approve_payouts", "user", userID)
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

// Handler returns an http.Handler for Keycloak/Permify endpoints.
func Handler(cfg Config) http.Handler {
	client := NewClient(cfg)
	mux := http.NewServeMux()

	// GET /v1/keycloak/health
	mux.HandleFunc("/v1/keycloak/health", func(w http.ResponseWriter, r *http.Request) {
		// Try to reach Keycloak
		checkURL := fmt.Sprintf("%s/realms/%s/.well-known/openid-configuration", cfg.KeycloakURL, cfg.Realm)
		resp, err := http.Get(checkURL) //nolint:gosec
		status := "ok"
		if err != nil || resp.StatusCode != 200 {
			status = "unavailable"
		}
		if resp != nil {
			resp.Body.Close()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      status,
			"keycloak_url": cfg.KeycloakURL,
			"realm":       cfg.Realm,
		})
	})

	// POST /v1/keycloak/introspect
	mux.HandleFunc("/v1/keycloak/introspect", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		result, err := client.IntrospectToken(r.Context(), body.Token)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error(), "active": false})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// POST /v1/permify/check
	mux.HandleFunc("/v1/permify/check", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			TenantID   string `json:"tenant_id"`
			EntityType string `json:"entity_type"`
			EntityID   string `json:"entity_id"`
			Permission string `json:"permission"`
			SubjectType string `json:"subject_type"`
			SubjectID  string `json:"subject_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		allowed, err := client.CheckPermission(r.Context(),
			body.TenantID, body.EntityType, body.EntityID,
			body.Permission, body.SubjectType, body.SubjectID)

		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"allowed":    allowed,
			"permission": body.Permission,
			"entity":     fmt.Sprintf("%s:%s", body.EntityType, body.EntityID),
			"subject":    fmt.Sprintf("%s:%s", body.SubjectType, body.SubjectID),
		})
	})

	// GET /v1/permify/health
	mux.HandleFunc("/v1/permify/health", func(w http.ResponseWriter, r *http.Request) {
		checkURL := fmt.Sprintf("%s/healthz", cfg.PermifyURL)
		resp, err := http.Get(checkURL) //nolint:gosec
		status := "ok"
		if err != nil || (resp != nil && resp.StatusCode != 200) {
			status = "unavailable"
		}
		if resp != nil {
			resp.Body.Close()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      status,
			"permify_url": cfg.PermifyURL,
		})
	})

	return mux
}
