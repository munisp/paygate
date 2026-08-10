// Package keycloak provides a Keycloak Admin REST API client for the PayGate
// bridge service.
//
// It handles:
//   - Token introspection (validate bearer tokens)
//   - User management (create, get, update, disable)
//   - Role management (assign / revoke realm roles)
//   - Group membership (sync merchant groups)
//   - Service account token acquisition (client_credentials flow)
//
// Environment variables:
//   KEYCLOAK_URL           — base URL, e.g. https://auth.paygate.ng
//   KEYCLOAK_REALM         — realm name, e.g. "paygate"
//   KEYCLOAK_CLIENT_ID     — confidential client ID
//   KEYCLOAK_CLIENT_SECRET — client secret
package keycloak

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// TokenResponse is the OAuth2 token endpoint response.
type TokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// IntrospectResponse is the token introspection response.
type IntrospectResponse struct {
	Active   bool   `json:"active"`
	Sub      string `json:"sub"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Exp      int64  `json:"exp"`
}

// UserRepresentation mirrors the Keycloak UserRepresentation object.
type UserRepresentation struct {
	ID         string            `json:"id,omitempty"`
	Username   string            `json:"username"`
	Email      string            `json:"email"`
	FirstName  string            `json:"firstName,omitempty"`
	LastName   string            `json:"lastName,omitempty"`
	Enabled    bool              `json:"enabled"`
	Attributes map[string][]string `json:"attributes,omitempty"`
}

// RoleRepresentation mirrors the Keycloak RoleRepresentation object.
type RoleRepresentation struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is a Keycloak Admin REST API client.
type Client struct {
	baseURL      string
	realm        string
	clientID     string
	clientSecret string
	httpClient   *http.Client
	enabled      bool

	mu          sync.Mutex
	adminToken  string
	tokenExpiry time.Time
}

var globalClient *Client

// Init initialises the global Keycloak client from environment variables.
func Init() {
	baseURL := os.Getenv("KEYCLOAK_URL")
	if baseURL == "" {
		slog.Info("[keycloak] KEYCLOAK_URL not set — Keycloak integration disabled (dev mode)")
		globalClient = &Client{enabled: false}
		return
	}
	globalClient = &Client{
		baseURL:      strings.TrimRight(baseURL, "/"),
		realm:        getEnvOr("KEYCLOAK_REALM", "paygate"),
		clientID:     os.Getenv("KEYCLOAK_CLIENT_ID"),
		clientSecret: os.Getenv("KEYCLOAK_CLIENT_SECRET"),
		httpClient:   &http.Client{Timeout: 10 * time.Second},
		enabled:      true,
	}
	slog.Info("[keycloak] client initialised", "url", baseURL, "realm", globalClient.realm)
}

// Get returns the global Keycloak client.
func Get() *Client {
	if globalClient == nil {
		Init()
	}
	return globalClient
}

// ─── Token management ─────────────────────────────────────────────────────────

// adminAccessToken returns a valid admin access token, refreshing if needed.
func (c *Client) adminAccessToken(ctx context.Context) (string, error) {
	if !c.enabled {
		return "", nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.adminToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.adminToken, nil
	}

	tokenURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", c.baseURL, c.realm)
	data := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("keycloak: build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("keycloak: token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("keycloak: token request failed %d: %s", resp.StatusCode, body)
	}

	var tr TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", fmt.Errorf("keycloak: decode token response: %w", err)
	}

	c.adminToken = tr.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(tr.ExpiresIn-30) * time.Second)
	return c.adminToken, nil
}

// ─── Token introspection ──────────────────────────────────────────────────────

// IntrospectToken validates a bearer token and returns its claims.
func (c *Client) IntrospectToken(ctx context.Context, token string) (*IntrospectResponse, error) {
	if !c.enabled {
		return &IntrospectResponse{Active: true, Sub: "dev-user"}, nil
	}

	introspectURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect", c.baseURL, c.realm)
	data := url.Values{
		"token":         {token},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, introspectURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("keycloak: build introspect request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak: introspect request: %w", err)
	}
	defer resp.Body.Close()

	var ir IntrospectResponse
	if err := json.NewDecoder(resp.Body).Decode(&ir); err != nil {
		return nil, fmt.Errorf("keycloak: decode introspect response: %w", err)
	}
	return &ir, nil
}

// ─── User management ──────────────────────────────────────────────────────────

// CreateUser creates a new user in the realm.
func (c *Client) CreateUser(ctx context.Context, user UserRepresentation) (string, error) {
	if !c.enabled {
		slog.Info("[keycloak] CreateUser (stub)", "username", user.Username)
		return "dev-user-id", nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return "", err
	}

	body, _ := json.Marshal(user)
	apiURL := fmt.Sprintf("%s/admin/realms/%s/users", c.baseURL, c.realm)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("keycloak: create user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("keycloak: create user %d: %s", resp.StatusCode, b)
	}

	// Extract user ID from Location header: .../users/{id}
	location := resp.Header.Get("Location")
	parts := strings.Split(location, "/")
	return parts[len(parts)-1], nil
}

// GetUser retrieves a user by ID.
func (c *Client) GetUser(ctx context.Context, userID string) (*UserRepresentation, error) {
	if !c.enabled {
		return &UserRepresentation{ID: userID, Username: "dev-user", Enabled: true}, nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.baseURL, c.realm, userID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak: get user: %w", err)
	}
	defer resp.Body.Close()

	var u UserRepresentation
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("keycloak: decode user: %w", err)
	}
	return &u, nil
}

// DisableUser sets a user's enabled flag to false.
func (c *Client) DisableUser(ctx context.Context, userID string) error {
	if !c.enabled {
		slog.Info("[keycloak] DisableUser (stub)", "user_id", userID)
		return nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return err
	}

	update := map[string]bool{"enabled": false}
	body, _ := json.Marshal(update)
	apiURL := fmt.Sprintf("%s/admin/realms/%s/users/%s", c.baseURL, c.realm, userID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak: disable user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("keycloak: disable user %d: %s", resp.StatusCode, b)
	}
	return nil
}

// ─── Role management ──────────────────────────────────────────────────────────

// AssignRealmRole assigns a realm role to a user.
func (c *Client) AssignRealmRole(ctx context.Context, userID, roleName string) error {
	if !c.enabled {
		slog.Info("[keycloak] AssignRealmRole (stub)", "user_id", userID, "role", roleName)
		return nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return err
	}

	// First get the role representation
	roleURL := fmt.Sprintf("%s/admin/realms/%s/roles/%s", c.baseURL, c.realm, roleName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, roleURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak: get role: %w", err)
	}
	defer resp.Body.Close()

	var role RoleRepresentation
	if err := json.NewDecoder(resp.Body).Decode(&role); err != nil {
		return fmt.Errorf("keycloak: decode role: %w", err)
	}

	// Assign the role to the user
	assignURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/role-mappings/realm", c.baseURL, c.realm, userID)
	body, _ := json.Marshal([]RoleRepresentation{role})

	req2, err := http.NewRequestWithContext(ctx, http.MethodPost, assignURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+token)

	resp2, err := c.httpClient.Do(req2)
	if err != nil {
		return fmt.Errorf("keycloak: assign role: %w", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp2.Body)
		return fmt.Errorf("keycloak: assign role %d: %s", resp2.StatusCode, b)
	}
	return nil
}

// RevokeRealmRole removes a realm role from a user.
func (c *Client) RevokeRealmRole(ctx context.Context, userID, roleName string) error {
	if !c.enabled {
		slog.Info("[keycloak] RevokeRealmRole (stub)", "user_id", userID, "role", roleName)
		return nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return err
	}

	roleURL := fmt.Sprintf("%s/admin/realms/%s/roles/%s", c.baseURL, c.realm, roleName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, roleURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak: get role for revoke: %w", err)
	}
	defer resp.Body.Close()

	var role RoleRepresentation
	if err := json.NewDecoder(resp.Body).Decode(&role); err != nil {
		return fmt.Errorf("keycloak: decode role for revoke: %w", err)
	}

	deleteURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/role-mappings/realm", c.baseURL, c.realm, userID)
	body, _ := json.Marshal([]RoleRepresentation{role})

	req2, err := http.NewRequestWithContext(ctx, http.MethodDelete, deleteURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+token)

	resp2, err := c.httpClient.Do(req2)
	if err != nil {
		return fmt.Errorf("keycloak: revoke role: %w", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp2.Body)
		return fmt.Errorf("keycloak: revoke role %d: %s", resp2.StatusCode, b)
	}
	return nil
}

// ─── Group management ─────────────────────────────────────────────────────────

// SyncMerchantGroup ensures a merchant group exists and adds the user to it.
func (c *Client) SyncMerchantGroup(ctx context.Context, userID, merchantID string) error {
	if !c.enabled {
		slog.Info("[keycloak] SyncMerchantGroup (stub)", "user_id", userID, "merchant_id", merchantID)
		return nil
	}

	token, err := c.adminAccessToken(ctx)
	if err != nil {
		return err
	}

	groupName := "merchant-" + merchantID

	// Search for existing group
	searchURL := fmt.Sprintf("%s/admin/realms/%s/groups?search=%s", c.baseURL, c.realm, url.QueryEscape(groupName))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak: search group: %w", err)
	}
	defer resp.Body.Close()

	var groups []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&groups); err != nil {
		return fmt.Errorf("keycloak: decode groups: %w", err)
	}

	var groupID string
	for _, g := range groups {
		if g.Name == groupName {
			groupID = g.ID
			break
		}
	}

	// Create group if it doesn't exist
	if groupID == "" {
		createURL := fmt.Sprintf("%s/admin/realms/%s/groups", c.baseURL, c.realm)
		body, _ := json.Marshal(map[string]string{"name": groupName})
		req2, err := http.NewRequestWithContext(ctx, http.MethodPost, createURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req2.Header.Set("Content-Type", "application/json")
		req2.Header.Set("Authorization", "Bearer "+token)

		resp2, err := c.httpClient.Do(req2)
		if err != nil {
			return fmt.Errorf("keycloak: create group: %w", err)
		}
		resp2.Body.Close()

		location := resp2.Header.Get("Location")
		parts := strings.Split(location, "/")
		groupID = parts[len(parts)-1]
	}

	// Add user to group
	memberURL := fmt.Sprintf("%s/admin/realms/%s/users/%s/groups/%s", c.baseURL, c.realm, userID, groupID)
	req3, err := http.NewRequestWithContext(ctx, http.MethodPut, memberURL, nil)
	if err != nil {
		return err
	}
	req3.Header.Set("Authorization", "Bearer "+token)

	resp3, err := c.httpClient.Do(req3)
	if err != nil {
		return fmt.Errorf("keycloak: add user to group: %w", err)
	}
	defer resp3.Body.Close()

	if resp3.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp3.Body)
		return fmt.Errorf("keycloak: add user to group %d: %s", resp3.StatusCode, b)
	}

	slog.Info("[keycloak] user synced to merchant group", "user_id", userID, "group", groupName)
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getEnvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
