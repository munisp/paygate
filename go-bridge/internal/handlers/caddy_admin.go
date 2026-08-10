// Package handlers provides HTTP handlers for the Go bridge service.
package handlers

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/munisp/paygate/go-bridge/internal/caddy"
)

// CaddyAdminHandler provides REST endpoints for Caddy management.
type CaddyAdminHandler struct {
	client *caddy.Client
}

// NewCaddyAdminHandler creates a new CaddyAdminHandler.
func NewCaddyAdminHandler() *CaddyAdminHandler {
	adminURL := os.Getenv("CADDY_ADMIN_URL")
	if adminURL == "" {
		adminURL = "http://paygate_caddy:2019"
	}
	return &CaddyAdminHandler{
		client: caddy.NewClient(adminURL),
	}
}

// GetStatus returns Caddy upstream health and certificate status.
// GET /internal/bridge/caddy/status
func (h *CaddyAdminHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	upstreams, err := h.client.GetUpstreamStatus(ctx)
	if err != nil {
		http.Error(w, `{"error":"failed to get upstream status"}`, http.StatusInternalServerError)
		return
	}

	certs, err := h.client.ListCertificates(ctx)
	if err != nil {
		// Non-fatal — ACME certs are managed externally
		certs = nil
	}

	resp := map[string]interface{}{
		"upstreams":    upstreams,
		"certificates": certs,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ReloadConfig triggers a zero-downtime Caddy config reload.
// POST /internal/bridge/caddy/reload
// Body: { "caddyfile": "..." }
func (h *CaddyAdminHandler) ReloadConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Caddyfile string `json:"caddyfile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Caddyfile == "" {
		http.Error(w, `{"error":"caddyfile required"}`, http.StatusBadRequest)
		return
	}

	if err := h.client.ReloadConfig(r.Context(), body.Caddyfile); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "reloaded"})
}
