package handlers

// apisix_admin.go — HTTP handler layer for the APISIX Admin API.
//
// Exposes the following endpoints (all require INTERNAL_API_KEY auth):
//   GET    /v1/apisix/routes                   — list all routes
//   POST   /v1/apisix/routes                   — upsert a route
//   DELETE /v1/apisix/routes/{id}              — delete a route
//   GET    /v1/apisix/consumers                — list all consumers
//   POST   /v1/apisix/consumers                — upsert a consumer
//   DELETE /v1/apisix/consumers/{username}     — delete a consumer
//   GET    /v1/apisix/plugins                  — list plugin names
//   POST   /v1/apisix/plugins/enable           — enable plugin on a route
//   POST   /v1/apisix/plugins/disable          — disable plugin on a route
//   GET    /v1/apisix/health                   — APISIX connectivity check

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/paygate/go-bridge/internal/apisix"
)

// ─── Route handlers ──────────────────────────────────────────────────────────

// APISIXListRoutes returns all registered APISIX routes.
func APISIXListRoutes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "APISIX client not initialised — set APISIX_ADMIN_URL and APISIX_API_KEY",
		})
		return
	}

	routes, err := client.ListRoutes(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"routes": routes,
		"count":  len(routes),
	})
}

// APISIXUpsertRoute creates or updates an APISIX route.
func APISIXUpsertRoute(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var route apisix.Route
	if err := json.NewDecoder(r.Body).Decode(&route); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	if route.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "route.id is required"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.UpsertRoute(ctx, route); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":       true,
		"route_id": route.ID,
	})
}

// APISIXDeleteRoute removes an APISIX route by ID.
// Route ID is extracted from the URL path: /v1/apisix/routes/{id}
func APISIXDeleteRoute(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	routeID := strings.TrimPrefix(r.URL.Path, "/v1/apisix/routes/")
	routeID = strings.TrimSuffix(routeID, "/")
	if routeID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "route id required in path"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.DeleteRoute(ctx, routeID); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "deleted_route_id": routeID})
}

// ─── Consumer handlers ────────────────────────────────────────────────────────

// APISIXListConsumers returns all APISIX consumers (per-merchant API keys).
func APISIXListConsumers(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	// APISIX Admin API: GET /apisix/admin/consumers
	// We call the underlying do() method via a dedicated helper.
	consumers, err := client.ListConsumers(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"consumers": consumers,
		"count":     len(consumers),
	})
}

// APISIXUpsertConsumer creates or updates an APISIX consumer.
func APISIXUpsertConsumer(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var consumer apisix.Consumer
	if err := json.NewDecoder(r.Body).Decode(&consumer); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	if consumer.Username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "consumer.username is required"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.UpsertConsumer(ctx, consumer); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":       true,
		"username": consumer.Username,
	})
}

// APISIXDeleteConsumer removes an APISIX consumer by username.
// Username is extracted from the URL path: /v1/apisix/consumers/{username}
func APISIXDeleteConsumer(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	username := strings.TrimPrefix(r.URL.Path, "/v1/apisix/consumers/")
	username = strings.TrimSuffix(username, "/")
	if username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username required in path"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.DeleteConsumer(ctx, username); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "deleted_username": username})
}

// ─── Plugin handlers ──────────────────────────────────────────────────────────

// APISIXListPlugins returns the list of available APISIX plugin names.
func APISIXListPlugins(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	plugins, err := client.ListPlugins(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"plugins": plugins,
		"count":   len(plugins),
	})
}

// pluginToggleRequest is the request body for enable/disable plugin endpoints.
type pluginToggleRequest struct {
	RouteID    string                 `json:"route_id"`
	PluginName string                 `json:"plugin_name"`
	Config     map[string]interface{} `json:"config,omitempty"`
}

// APISIXEnablePlugin enables a named plugin on an existing APISIX route.
func APISIXEnablePlugin(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var req pluginToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	if req.RouteID == "" || req.PluginName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "route_id and plugin_name are required"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.EnablePlugin(ctx, req.RouteID, req.PluginName, req.Config); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":          true,
		"route_id":    req.RouteID,
		"plugin_name": req.PluginName,
		"action":      "enabled",
	})
}

// APISIXDisablePlugin disables a named plugin on an existing APISIX route.
func APISIXDisablePlugin(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var req pluginToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	if req.RouteID == "" || req.PluginName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "route_id and plugin_name are required"})
		return
	}

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "APISIX client not initialised"})
		return
	}

	if err := client.DisablePlugin(ctx, req.RouteID, req.PluginName); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":          true,
		"route_id":    req.RouteID,
		"plugin_name": req.PluginName,
		"action":      "disabled",
	})
}

// ─── Health handler ───────────────────────────────────────────────────────────

// APISIXHealth checks connectivity to the APISIX Admin API.
func APISIXHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	client := apisix.Get()
	if client == nil || !client.IsEnabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status":  "unavailable",
			"reason":  "APISIX client not initialised",
		})
		return
	}

	_, err := client.ListRoutes(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"status": "degraded",
			"error":  err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
