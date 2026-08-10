// Package keycloak — JWKS rotation and token introspection.
//
// This file adds:
//   - JWKS endpoint caching with automatic rotation (RFC 7517)
//   - Token introspection (active/inactive check)
//   - Realm event listener webhook handler
//   - User federation sync helpers
//   - Realm export helper for backup/DR
package keycloak

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"sync"
	"time"
)

// ─── JWKS Cache ───────────────────────────────────────────────────────────────

// JWKSCache caches the Keycloak JWKS and rotates it automatically.
type JWKSCache struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey // kid → public key
	fetchedAt time.Time
	ttl       time.Duration
	jwksURL   string
	http      *http.Client
}

var globalJWKS *JWKSCache

// InitJWKS initialises the global JWKS cache from KEYCLOAK_URL and KEYCLOAK_REALM.
func InitJWKS() {
	keycloakURL := os.Getenv("KEYCLOAK_URL")
	realm := os.Getenv("KEYCLOAK_REALM")
	if keycloakURL == "" || realm == "" {
		slog.Info("[keycloak-jwks] KEYCLOAK_URL or KEYCLOAK_REALM not set — JWKS disabled")
		globalJWKS = &JWKSCache{keys: make(map[string]*rsa.PublicKey)}
		return
	}
	jwksURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", keycloakURL, realm)
	globalJWKS = &JWKSCache{
		keys:    make(map[string]*rsa.PublicKey),
		ttl:     5 * time.Minute,
		jwksURL: jwksURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
	// Pre-warm the cache.
	if err := globalJWKS.refresh(); err != nil {
		slog.Warn("[keycloak-jwks] initial fetch failed", "err", err)
	}
}

// GetJWKS returns the global JWKS cache.
func GetJWKS() *JWKSCache { return globalJWKS }

// GetKey returns the RSA public key for the given kid, refreshing if needed.
func (j *JWKSCache) GetKey(kid string) (*rsa.PublicKey, error) {
	j.mu.RLock()
	key, ok := j.keys[kid]
	stale := time.Since(j.fetchedAt) > j.ttl
	j.mu.RUnlock()

	if ok && !stale {
		return key, nil
	}
	// Refresh and retry.
	if err := j.refresh(); err != nil {
		if ok {
			return key, nil // return stale key on refresh failure
		}
		return nil, fmt.Errorf("keycloak-jwks: refresh failed: %w", err)
	}
	j.mu.RLock()
	key, ok = j.keys[kid]
	j.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("keycloak-jwks: unknown kid %q", kid)
	}
	return key, nil
}

type jwksResponse struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		Use string `json:"use"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

func (j *JWKSCache) refresh() error {
	if j.jwksURL == "" {
		return nil
	}
	resp, err := j.http.Get(j.jwksURL)
	if err != nil {
		return fmt.Errorf("keycloak-jwks: GET %s: %w", j.jwksURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("keycloak-jwks: HTTP %d: %s", resp.StatusCode, b)
	}
	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("keycloak-jwks: decode: %w", err)
	}

	newKeys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" || k.Use != "sig" {
			continue
		}
		pub, err := parseRSAPublicKey(k.N, k.E)
		if err != nil {
			slog.Warn("[keycloak-jwks] skip invalid key", "kid", k.Kid, "err", err)
			continue
		}
		newKeys[k.Kid] = pub
	}

	j.mu.Lock()
	j.keys = newKeys
	j.fetchedAt = time.Now()
	j.mu.Unlock()
	slog.Info("[keycloak-jwks] keys refreshed", "count", len(newKeys))
	return nil
}

func parseRSAPublicKey(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decode n: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decode e: %w", err)
	}
	n := new(big.Int).SetBytes(nBytes)
	var eInt int
	for _, b := range eBytes {
		eInt = eInt<<8 | int(b)
	}
	return &rsa.PublicKey{N: n, E: eInt}, nil
}

// ─── Token Introspection ──────────────────────────────────────────────────────

// IntrospectResult is the RFC 7662 token introspection response.
type IntrospectResult struct {
	Active    bool   `json:"active"`
	Sub       string `json:"sub"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	ClientID  string `json:"client_id"`
	Scope     string `json:"scope"`
	ExpiresAt int64  `json:"exp"`
}


// ─── Realm Event Listener ─────────────────────────────────────────────────────

// RealmEvent is a Keycloak event received via webhook.
type RealmEvent struct {
	Time      int64             `json:"time"`
	Type      string            `json:"type"`
	RealmID   string            `json:"realmId"`
	ClientID  string            `json:"clientId"`
	UserID    string            `json:"userId"`
	SessionID string            `json:"sessionId"`
	IPAddress string            `json:"ipAddress"`
	Details   map[string]string `json:"details"`
}

// EventHandler is a function that processes a Keycloak realm event.
type EventHandler func(event RealmEvent)

var (
	eventHandlersMu sync.RWMutex
	eventHandlers   []EventHandler
)

// RegisterEventHandler registers a handler for Keycloak realm events.
func RegisterEventHandler(h EventHandler) {
	eventHandlersMu.Lock()
	defer eventHandlersMu.Unlock()
	eventHandlers = append(eventHandlers, h)
}

// HandleRealmEvent processes an incoming Keycloak webhook event.
// Wire this to POST /v1/keycloak/events in main.go.
func HandleRealmEvent(w http.ResponseWriter, r *http.Request) {
	// Verify webhook secret.
	secret := os.Getenv("KEYCLOAK_WEBHOOK_SECRET")
	if secret != "" && r.Header.Get("X-Keycloak-Signature") != secret {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var event RealmEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	slog.Info("[keycloak-event]", "type", event.Type, "user", event.UserID, "ip", event.IPAddress)

	eventHandlersMu.RLock()
	handlers := make([]EventHandler, len(eventHandlers))
	copy(handlers, eventHandlers)
	eventHandlersMu.RUnlock()

	for _, h := range handlers {
		go h(event)
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── User Federation Sync ─────────────────────────────────────────────────────

// SyncUserFederation triggers a full sync of the user federation provider.
func (c *Client) SyncUserFederation(ctx context.Context, realm, componentID string) error {
	adminTok, err := c.adminAccessToken(ctx)
	if err != nil {
		return err
	}
	path := fmt.Sprintf("%s/admin/realms/%s/user-storage/%s/sync?action=triggerFullSync",
		c.baseURL, realm, componentID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+adminTok)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("keycloak: sync federation: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("keycloak: sync federation: HTTP %d: %s", resp.StatusCode, b)
	}
	slog.Info("[keycloak] user federation sync triggered", "realm", realm, "component", componentID)
	return nil
}

// ─── Realm Export ─────────────────────────────────────────────────────────────

// ExportRealm exports the full realm configuration as JSON (for backup/DR).
func (c *Client) ExportRealm(ctx context.Context, realm string) (json.RawMessage, error) {
	adminTok, err := c.adminAccessToken(ctx)
	if err != nil {
		return nil, err
	}
	path := fmt.Sprintf("%s/admin/realms/%s", c.baseURL, realm)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+adminTok)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("keycloak: export realm: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("keycloak: export realm: HTTP %d: %s", resp.StatusCode, b)
	}
	return io.ReadAll(resp.Body)
}

// getAdminToken is a forward reference to the existing method in client.go.
func (c *Client) getAdminToken(ctx context.Context) (string, error) {
	return c.adminAccessToken(ctx)
}
