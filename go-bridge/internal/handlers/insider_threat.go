// Package handlers — insider threat HTTP handlers.
//
//	POST /v1/insider/session/bind               — bind session to device fingerprint
//	POST /v1/insider/action/gate                — gate a privileged action
//	GET  /v1/insider/dual-control/pending       — list pending dual-control requests
//	POST /v1/insider/dual-control/{id}/approve  — approve a pending request
//	POST /v1/insider/dual-control/{id}/reject   — reject a pending request
//	GET  /v1/insider/dual-control/{id}          — get a specific request
//	GET  /v1/insider/alerts                     — list insider threat alerts
//	GET  /v1/insider/health                     — health check
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/paygate/go-bridge/internal/insider"
	"github.com/paygate/go-bridge/internal/redis"
)

// ─── Session binding ──────────────────────────────────────────────────────────

type bindSessionRequest struct {
	SessionID string `json:"session_id"`
	ActorID   string `json:"actor_id"`
}

// BindInsiderSession binds a new session to the caller's device fingerprint.
func BindInsiderSession(w http.ResponseWriter, r *http.Request) {
	var req bindSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		http.Error(w, `{"error":"session_id required"}`, http.StatusBadRequest)
		return
	}

	ip := insider.ExtractIP(r)
	ua := r.Header.Get("User-Agent")
	deviceHash := insider.DeviceHash(ip, ua)

	svc := insider.Get()
	if err := svc.BindSession(r.Context(), req.SessionID, deviceHash); err != nil {
		http.Error(w, `{"error":"failed to bind session"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id":  req.SessionID,
		"device_hash": deviceHash,
		"bound_at":    time.Now(),
	})
}

// ─── Privileged action gate ───────────────────────────────────────────────────

type gateActionRequest struct {
	ActorID    string          `json:"actor_id"`
	MerchantID string          `json:"merchant_id"`
	Action     string          `json:"action"`
	ResourceID string          `json:"resource_id"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	GeoCountry string          `json:"geo_country,omitempty"`
}

// GatePrivilegedAction evaluates all insider-threat controls for a privileged action.
func GatePrivilegedAction(w http.ResponseWriter, r *http.Request) {
	var req gateActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ActorID == "" || req.Action == "" {
		http.Error(w, `{"error":"actor_id and action are required"}`, http.StatusBadRequest)
		return
	}

	ip := insider.ExtractIP(r)
	ua := r.Header.Get("User-Agent")
	sessionID := r.Header.Get("X-Session-ID")

	svc := insider.Get()
	result := svc.CheckPrivilegedAction(r.Context(), insider.ActionContext{
		ActorID:    req.ActorID,
		MerchantID: req.MerchantID,
		Action:     insider.PrivilegedAction(req.Action),
		ResourceID: req.ResourceID,
		Payload:    req.Payload,
		SessionID:  sessionID,
		IPAddress:  ip,
		UserAgent:  ua,
		DeviceHash: insider.DeviceHash(ip, ua),
		GeoCountry: req.GeoCountry,
	})

	status := http.StatusOK
	if !result.Allowed && result.PendingID == "" {
		status = http.StatusForbidden
	}

	writeJSON(w, status, map[string]any{
		"allowed":        result.Allowed,
		"pending_id":     result.PendingID,
		"risk_score":     result.RiskScore,
		"risk_level":     result.RiskLevel,
		"risk_factors":   result.RiskFactors,
		"blocked_reason": result.BlockedReason,
	})
}

// ─── Dual-control approval ────────────────────────────────────────────────────

type resolveDualControlRequest struct {
	ApproverID string `json:"approver_id"`
	Note       string `json:"note,omitempty"`
}

// ApproveDualControl approves a pending dual-control request.
func ApproveDualControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
		return
	}
	var req resolveDualControlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ApproverID == "" {
		http.Error(w, `{"error":"approver_id required"}`, http.StatusBadRequest)
		return
	}
	svc := insider.Get()
	resolved, err := svc.ResolveDualControlRequest(r.Context(), id, req.ApproverID, "approved", req.Note)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

// RejectDualControl rejects a pending dual-control request.
func RejectDualControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
		return
	}
	var req resolveDualControlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ApproverID == "" {
		http.Error(w, `{"error":"approver_id required"}`, http.StatusBadRequest)
		return
	}
	svc := insider.Get()
	resolved, err := svc.ResolveDualControlRequest(r.Context(), id, req.ApproverID, "rejected", req.Note)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, resolved)
}

// GetDualControlRequestHandler retrieves a specific dual-control request.
func GetDualControlRequestHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
		return
	}
	svc := insider.Get()
	req, err := svc.GetDualControlRequest(r.Context(), id)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, req)
}

// ListPendingDualControl lists all pending dual-control requests for a merchant.
func ListPendingDualControl(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	rc := redis.Get()
	if rc == nil {
		writeJSON(w, http.StatusOK, map[string]any{"requests": []any{}, "total": 0})
		return
	}

	// Scan Redis for all pending dual-control keys using KEYS pattern
	ctx := r.Context()
	// Enumerate known pending IDs via a Redis set per merchant
	setKey := fmt.Sprintf("insider:pending:%s", merchantID)
	ids, _, _ := rc.GetString(ctx, setKey)

	var pending []insider.DualControlRequest
	svc := insider.Get()

	// If no set key, try a direct lookup of recently created IDs stored in a list
	if ids == "" {
		// Return empty — in production a background job or Kafka consumer
		// would maintain the pending set
		writeJSON(w, http.StatusOK, map[string]any{"requests": []insider.DualControlRequest{}, "total": 0})
		return
	}

	// Parse comma-separated IDs
	var idList []string
	if err := json.Unmarshal([]byte(ids), &idList); err == nil {
		for _, id := range idList {
			req, err := svc.GetDualControlRequest(ctx, id)
			if err != nil {
				continue
			}
			if req.Status != "pending" {
				continue
			}
			if merchantID != "" && req.MerchantID != merchantID {
				continue
			}
			pending = append(pending, *req)
		}
	}

	if pending == nil {
		pending = []insider.DualControlRequest{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"requests": pending,
		"total":    len(pending),
	})
}

// ─── Alert listing ────────────────────────────────────────────────────────────

// ListInsiderThreatAlerts returns recent insider-threat alerts.
func ListInsiderThreatAlerts(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	rc := redis.Get()
	if rc == nil || merchantID == "" {
		writeJSON(w, http.StatusOK, map[string]any{"alerts": []any{}, "total": 0})
		return
	}

	ctx := r.Context()
	// Alerts are stored as a JSON array in Redis
	key := fmt.Sprintf("insider:alerts:%s", merchantID)
	raw, found, err := rc.GetString(ctx, key)
	if err != nil || !found {
		writeJSON(w, http.StatusOK, map[string]any{"alerts": []any{}, "total": 0})
		return
	}

	var alerts []map[string]any
	if err := json.Unmarshal([]byte(raw), &alerts); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"alerts": []any{}, "total": 0})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"alerts": alerts,
		"total":  len(alerts),
	})
}

// ─── Health ───────────────────────────────────────────────────────────────────

// InsiderThreatHealth returns the health of the insider-threat subsystem.
func InsiderThreatHealth(w http.ResponseWriter, r *http.Request) {
	svc := insider.Get()
	rustOK := false
	if svc != nil {
		client := &http.Client{Timeout: 200 * time.Millisecond}
		resp, err := client.Get(svc.RustScoringURL() + "/health")
		if err == nil && resp.StatusCode == http.StatusOK {
			rustOK = true
			resp.Body.Close()
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"rust_engine": map[string]any{"reachable": rustOK},
		"redis":       map[string]any{"connected": redis.Get() != nil},
		"dual_control_ttl": "4h",
		"velocity_limits": map[string]any{
			"per_minute": 10,
			"per_hour":   100,
			"per_day":    500,
		},
	})
}
