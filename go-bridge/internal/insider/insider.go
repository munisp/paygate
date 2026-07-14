// Package insider provides insider-threat prevention and mitigation for the
// PayGate bridge service.
//
// Controls implemented:
//  1. Enriched audit events — every privileged action emits a rich event with
//     session fingerprint, IP, user-agent, geo-country, and a risk score.
//  2. Session binding — each API session is bound to the originating device
//     fingerprint (IP + User-Agent hash).
//  3. Velocity gate — sliding-window counter limits privileged actions per actor.
//  4. Four-eyes (dual-control) approval — high-risk actions require a second
//     authorised actor to approve before execution.
package insider

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
)

// ─── Configuration ────────────────────────────────────────────────────────────

// Config holds tunable parameters for the insider-threat controls.
type Config struct {
	VelocityLimitPerMinute int
	VelocityLimitPerHour   int
	VelocityLimitPerDay    int
	RustScoringURL         string
	DualControlTTL         time.Duration
}

// DefaultConfig returns sensible production defaults.
func DefaultConfig() Config {
	scoringURL := os.Getenv("INSIDER_THREAT_ENGINE_URL")
	if scoringURL == "" {
		scoringURL = "http://localhost:8300"
	}
	return Config{
		VelocityLimitPerMinute: 10,
		VelocityLimitPerHour:   100,
		VelocityLimitPerDay:    500,
		RustScoringURL:         scoringURL,
		DualControlTTL:         4 * time.Hour,
	}
}

// ─── Privileged action catalogue ─────────────────────────────────────────────

// PrivilegedAction enumerates actions that require elevated controls.
type PrivilegedAction string

const (
	ActionPayoutApprove   PrivilegedAction = "payout.approve"
	ActionPayoutReject    PrivilegedAction = "payout.reject"
	ActionAPIKeyCreate    PrivilegedAction = "apikey.create"
	ActionAPIKeyRevoke    PrivilegedAction = "apikey.revoke"
	ActionRoleEscalate    PrivilegedAction = "role.escalate"
	ActionConfigChange    PrivilegedAction = "config.change"
	ActionWebhookCreate   PrivilegedAction = "webhook.create"
	ActionWebhookDelete   PrivilegedAction = "webhook.delete"
	ActionSettlementForce PrivilegedAction = "settlement.force"
	ActionDisputeResolve  PrivilegedAction = "dispute.resolve"
	ActionUserDisable     PrivilegedAction = "user.disable"
	ActionDataExport      PrivilegedAction = "data.export"
)

// dualControlRequired lists actions that always require a second approver.
var dualControlRequired = map[PrivilegedAction]bool{
	ActionPayoutApprove:   true,
	ActionAPIKeyCreate:    true,
	ActionAPIKeyRevoke:    true,
	ActionRoleEscalate:    true,
	ActionSettlementForce: true,
	ActionUserDisable:     true,
	ActionDataExport:      true,
}

// ─── Enriched audit event ─────────────────────────────────────────────────────

// EnrichedAuditEvent extends the standard audit event with insider-threat context.
type EnrichedAuditEvent struct {
	EventID        string    `json:"event_id"`
	MerchantID     string    `json:"merchant_id"`
	ActorID        string    `json:"actor_id"`
	Action         string    `json:"action"`
	Resource       string    `json:"resource"`
	ResourceID     string    `json:"resource_id"`
	OccurredAt     time.Time `json:"occurred_at"`
	SessionID      string    `json:"session_id"`
	IPAddress      string    `json:"ip_address"`
	UserAgent      string    `json:"user_agent"`
	DeviceHash     string    `json:"device_hash"`
	GeoCountry     string    `json:"geo_country"`
	RiskScore      float64   `json:"risk_score"`
	RiskFactors    []string  `json:"risk_factors,omitempty"`
	VelocityMinute int       `json:"velocity_1m"`
	VelocityHour   int       `json:"velocity_1h"`
	VelocityDay    int       `json:"velocity_1d"`
	DualControlID  string    `json:"dual_control_id,omitempty"`
	Outcome        string    `json:"outcome"` // "allowed" | "blocked" | "pending_approval"
}

// ─── Dual-control request ─────────────────────────────────────────────────────

// DualControlRequest represents a pending four-eyes approval.
type DualControlRequest struct {
	ID           string           `json:"id"`
	Action       PrivilegedAction `json:"action"`
	InitiatorID  string           `json:"initiator_id"`
	MerchantID   string           `json:"merchant_id"`
	ResourceID   string           `json:"resource_id"`
	Payload      json.RawMessage  `json:"payload"`
	Status       string           `json:"status"` // "pending" | "approved" | "rejected" | "expired"
	ApproverID   string           `json:"approver_id,omitempty"`
	ApproverNote string           `json:"approver_note,omitempty"`
	CreatedAt    time.Time        `json:"created_at"`
	ExpiresAt    time.Time        `json:"expires_at"`
	ResolvedAt   *time.Time       `json:"resolved_at,omitempty"`
}

// ─── Service ──────────────────────────────────────────────────────────────────

// Service is the main insider-threat control plane.
type Service struct {
	cfg         Config
	mu          sync.RWMutex
	memCounters map[string][]time.Time // in-memory fallback for velocity
}

var (
	_svc  *Service
	_once sync.Once
)

// Init initialises the global insider-threat service.
func Init(cfg Config) {
	_once.Do(func() {
		_svc = &Service{
			cfg:         cfg,
			memCounters: make(map[string][]time.Time),
		}
		slog.Info("[insider] service initialised",
			"velocity_per_min", cfg.VelocityLimitPerMinute,
			"rust_scoring_url", cfg.RustScoringURL,
		)
	})
}

// Get returns the global insider-threat service.
func Get() *Service {
	if _svc == nil {
		Init(DefaultConfig())
	}
	return _svc
}

// RustScoringURL exposes the configured Rust engine URL (used by health handler).
func (s *Service) RustScoringURL() string { return s.cfg.RustScoringURL }

// ─── Device fingerprint ───────────────────────────────────────────────────────

// DeviceHash computes a stable 8-byte hash from IP + User-Agent.
func DeviceHash(ip, userAgent string) string {
	h := sha256.Sum256([]byte(ip + "|" + userAgent))
	return fmt.Sprintf("%x", h[:8])
}

// ExtractIP returns the real client IP, honouring X-Forwarded-For.
func ExtractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx > 0 {
		return addr[:idx]
	}
	return addr
}

// ─── Session binding ──────────────────────────────────────────────────────────

const sessionBindingTTL = 8 * time.Hour

// BindSession stores the device hash for a new session in Redis.
func (s *Service) BindSession(ctx context.Context, sessionID, deviceHash string) error {
	rc := redis.Get()
	if rc == nil {
		return nil
	}
	key := fmt.Sprintf("insider:session:%s:device", sessionID)
	return rc.SetEX(ctx, key, deviceHash, sessionBindingTTL)
}

// ValidateSession checks that the request's device hash matches the bound session.
func (s *Service) ValidateSession(ctx context.Context, sessionID, currentHash string) (bool, error) {
	rc := redis.Get()
	if rc == nil {
		return true, nil
	}
	key := fmt.Sprintf("insider:session:%s:device", sessionID)
	stored, found, err := rc.GetString(ctx, key)
	if err != nil || !found {
		_ = rc.SetEX(ctx, key, currentHash, sessionBindingTTL)
		return true, nil
	}
	return stored == currentHash, nil
}

// ─── Velocity gate ────────────────────────────────────────────────────────────

// VelocityResult holds the current counters and whether the gate tripped.
type VelocityResult struct {
	PerMinute int
	PerHour   int
	PerDay    int
	Blocked   bool
	Reason    string
}

// CheckVelocity increments the actor's action counter and returns whether
// the velocity limit has been exceeded.
func (s *Service) CheckVelocity(ctx context.Context, actorID string) VelocityResult {
	now := time.Now()
	rc := redis.Get()
	if rc != nil {
		return s.checkVelocityRedis(ctx, rc, actorID, now)
	}
	return s.checkVelocityMem(actorID, now)
}

func (s *Service) checkVelocityRedis(ctx context.Context, rc *redis.Client, actorID string, now time.Time) VelocityResult {
	pipe := func(window string, limit int, dur time.Duration) (int, bool) {
		key := fmt.Sprintf("insider:velocity:%s:%s", actorID, window)
		countStr, found, _ := rc.GetString(ctx, key)
		count := 0
		if found {
			count, _ = strconv.Atoi(countStr)
		}
		count++
		_ = rc.SetEX(ctx, key, strconv.Itoa(count), dur)
		return count, count > limit
	}

	min, minBlocked := pipe("1m", s.cfg.VelocityLimitPerMinute, time.Minute)
	hr, hrBlocked := pipe("1h", s.cfg.VelocityLimitPerHour, time.Hour)
	day, dayBlocked := pipe("1d", s.cfg.VelocityLimitPerDay, 24*time.Hour)

	res := VelocityResult{PerMinute: min, PerHour: hr, PerDay: day}
	switch {
	case minBlocked:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/min (limit %d)", min, s.cfg.VelocityLimitPerMinute)
	case hrBlocked:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/hr (limit %d)", hr, s.cfg.VelocityLimitPerHour)
	case dayBlocked:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/day (limit %d)", day, s.cfg.VelocityLimitPerDay)
	}
	return res
}

func (s *Service) checkVelocityMem(actorID string, now time.Time) VelocityResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	ts := append(s.memCounters[actorID], now)
	cutoff := now.Add(-24 * time.Hour)
	pruned := ts[:0]
	for _, t := range ts {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	s.memCounters[actorID] = pruned

	var min, hr, day int
	for _, t := range pruned {
		age := now.Sub(t)
		if age <= time.Minute {
			min++
		}
		if age <= time.Hour {
			hr++
		}
		day++
	}

	res := VelocityResult{PerMinute: min, PerHour: hr, PerDay: day}
	switch {
	case min > s.cfg.VelocityLimitPerMinute:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/min (limit %d)", min, s.cfg.VelocityLimitPerMinute)
	case hr > s.cfg.VelocityLimitPerHour:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/hr (limit %d)", hr, s.cfg.VelocityLimitPerHour)
	case day > s.cfg.VelocityLimitPerDay:
		res.Blocked = true
		res.Reason = fmt.Sprintf("velocity: %d/day (limit %d)", day, s.cfg.VelocityLimitPerDay)
	}
	return res
}

// ─── Rust risk scoring ────────────────────────────────────────────────────────

// ScoreRequest is sent to the Rust behavioural engine.
type ScoreRequest struct {
	ActorID    string `json:"actor_id"`
	MerchantID string `json:"merchant_id"`
	Action     string `json:"action"`
	IPAddress  string `json:"ip_address"`
	UserAgent  string `json:"user_agent"`
	DeviceHash string `json:"device_hash"`
	GeoCountry string `json:"geo_country"`
	HourOfDay  int    `json:"hour_of_day"`
	DayOfWeek  int    `json:"day_of_week"`
}

// ScoreResponse is returned by the Rust behavioural engine.
type ScoreResponse struct {
	RiskScore   float64  `json:"risk_score"`
	RiskLevel   string   `json:"risk_level"` // "low" | "medium" | "high" | "critical"
	RiskFactors []string `json:"risk_factors"`
}

// GetRiskScore calls the Rust engine for a composite risk score (fail-open).
func (s *Service) GetRiskScore(ctx context.Context, req ScoreRequest) ScoreResponse {
	if s.cfg.RustScoringURL == "" {
		return ScoreResponse{RiskScore: 0, RiskLevel: "low"}
	}
	body, err := json.Marshal(req)
	if err != nil {
		return ScoreResponse{RiskScore: 0, RiskLevel: "low"}
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.cfg.RustScoringURL+"/score", strings.NewReader(string(body)))
	if err != nil {
		return ScoreResponse{RiskScore: 0, RiskLevel: "low"}
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Key", os.Getenv("INTERNAL_API_KEY"))

	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Do(httpReq)
	if err != nil {
		slog.Warn("[insider] rust scoring unavailable", "err", err)
		return ScoreResponse{RiskScore: 0, RiskLevel: "low"}
	}
	defer resp.Body.Close()

	var result ScoreResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ScoreResponse{RiskScore: 0, RiskLevel: "low"}
	}
	return result
}

// ─── Dual-control (four-eyes) approval ───────────────────────────────────────

const dualControlPrefix = "insider:dualcontrol:"

// CreateDualControlRequest creates a pending four-eyes approval request.
func (s *Service) CreateDualControlRequest(ctx context.Context, req DualControlRequest) error {
	req.Status = "pending"
	req.CreatedAt = time.Now()
	req.ExpiresAt = req.CreatedAt.Add(s.cfg.DualControlTTL)

	rc := redis.Get()
	if rc != nil {
		key := dualControlPrefix + req.ID
		if err := rc.SetJSON(ctx, key, req, s.cfg.DualControlTTL); err != nil {
			slog.Warn("[insider] dual-control Redis write failed", "id", req.ID, "err", err)
		}
	}

	kp := kafka.GetProducer()
	if kp != nil {
		_ = kp.PublishAudit(ctx, kafka.AuditEvent{
			EventID:    req.ID,
			MerchantID: req.MerchantID,
			ActorID:    req.InitiatorID,
			Action:     "dual_control.created",
			Resource:   string(req.Action),
			ResourceID: req.ResourceID,
			OccurredAt: req.CreatedAt,
		})
	}

	fp := fluvio.Get()
	if fp != nil {
		_ = fp.ProduceInsiderThreatEvent(ctx, fluvio.InsiderThreatEvent{
			EventID:    req.ID,
			EventType:  "dual_control.pending",
			ActorID:    req.InitiatorID,
			MerchantID: req.MerchantID,
			Action:     string(req.Action),
			ResourceID: req.ResourceID,
			Status:     "pending",
			OccurredAt: req.CreatedAt,
		})
	}

	slog.Info("[insider] dual-control request created",
		"id", req.ID, "action", req.Action,
		"initiator", req.InitiatorID, "expires_at", req.ExpiresAt,
	)
	return nil
}

// GetDualControlRequest retrieves a pending dual-control request by ID.
func (s *Service) GetDualControlRequest(ctx context.Context, id string) (*DualControlRequest, error) {
	rc := redis.Get()
	if rc == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	key := dualControlPrefix + id
	var req DualControlRequest
	found, err := rc.GetJSON(ctx, key, &req)
	if err != nil || !found {
		return nil, fmt.Errorf("dual-control request not found: %w", err)
	}
	if time.Now().After(req.ExpiresAt) {
		req.Status = "expired"
	}
	return &req, nil
}

// ResolveDualControlRequest approves or rejects a pending request.
func (s *Service) ResolveDualControlRequest(ctx context.Context, id, approverID, decision, note string) (*DualControlRequest, error) {
	req, err := s.GetDualControlRequest(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Status != "pending" {
		return nil, fmt.Errorf("request %s is not pending (status: %s)", id, req.Status)
	}
	if req.InitiatorID == approverID {
		return nil, fmt.Errorf("approver must differ from initiator")
	}

	now := time.Now()
	req.Status = decision
	req.ApproverID = approverID
	req.ApproverNote = note
	req.ResolvedAt = &now

	rc := redis.Get()
	if rc != nil {
		_ = rc.SetJSON(ctx, dualControlPrefix+id, req, 24*time.Hour)
	}

	kp := kafka.GetProducer()
	if kp != nil {
		_ = kp.PublishAudit(ctx, kafka.AuditEvent{
			EventID:    fmt.Sprintf("%s-resolved", id),
			MerchantID: req.MerchantID,
			ActorID:    approverID,
			Action:     fmt.Sprintf("dual_control.%s", decision),
			Resource:   string(req.Action),
			ResourceID: req.ResourceID,
			OccurredAt: now,
		})
	}

	fp := fluvio.Get()
	if fp != nil {
		_ = fp.ProduceInsiderThreatEvent(ctx, fluvio.InsiderThreatEvent{
			EventID:    fmt.Sprintf("%s-resolved", id),
			EventType:  fmt.Sprintf("dual_control.%s", decision),
			ActorID:    approverID,
			MerchantID: req.MerchantID,
			Action:     string(req.Action),
			ResourceID: req.ResourceID,
			Status:     decision,
			OccurredAt: now,
		})
	}

	slog.Info("[insider] dual-control resolved",
		"id", id, "decision", decision, "approver", approverID)
	return req, nil
}

// IsDualControlRequired returns true if the action requires a second approver.
func IsDualControlRequired(action PrivilegedAction) bool {
	return dualControlRequired[action]
}

// ─── Enriched audit emission ──────────────────────────────────────────────────

// EmitEnrichedAudit publishes an enriched audit event to Kafka.
func (s *Service) EmitEnrichedAudit(ctx context.Context, evt EnrichedAuditEvent) {
	kp := kafka.GetProducer()
	if kp == nil {
		return
	}
	_ = kp.Publish(ctx, kafka.TopicInsiderThreatEvents, evt.ActorID, evt)
	slog.Info("[insider] enriched audit emitted",
		"event_id", evt.EventID,
		"actor", evt.ActorID,
		"action", evt.Action,
		"risk_score", evt.RiskScore,
		"outcome", evt.Outcome,
	)
}

// ─── HTTP middleware ──────────────────────────────────────────────────────────

// ContextKey is used to store insider-threat context in request context.
type ContextKey string

const (
	CtxKeyActorID    ContextKey = "insider_actor_id"
	CtxKeySessionID  ContextKey = "insider_session_id"
	CtxKeyDeviceHash ContextKey = "insider_device_hash"
	CtxKeyIPAddress  ContextKey = "insider_ip_address"
	CtxKeyRiskScore  ContextKey = "insider_risk_score"
)

// Middleware wraps an HTTP handler with insider-threat controls.
func Middleware(next http.HandlerFunc) http.HandlerFunc {
	svc := Get()
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		ip := ExtractIP(r)
		ua := r.Header.Get("User-Agent")
		sessionID := r.Header.Get("X-Session-ID")
		actorID := r.Header.Get("X-Actor-ID")
		deviceHash := DeviceHash(ip, ua)

		// 1. Session binding check
		if sessionID != "" && actorID != "" {
			valid, err := svc.ValidateSession(ctx, sessionID, deviceHash)
			if err != nil {
				slog.Warn("[insider] session validation error", "err", err)
			} else if !valid {
				slog.Warn("[insider] session binding violation",
					"session_id", sessionID, "actor_id", actorID)
				svc.EmitEnrichedAudit(ctx, EnrichedAuditEvent{
					EventID:     fmt.Sprintf("session-violation-%d", time.Now().UnixNano()),
					ActorID:     actorID,
					Action:      "session.binding_violation",
					IPAddress:   ip,
					UserAgent:   ua,
					DeviceHash:  deviceHash,
					RiskScore:   95,
					RiskFactors: []string{"session_hijack_attempt"},
					Outcome:     "blocked",
					OccurredAt:  time.Now(),
				})
				http.Error(w, `{"error":"session binding violation"}`, http.StatusUnauthorized)
				return
			}
		}

		// 2. Velocity check for privileged endpoints
		if actorID != "" && isPrivilegedPath(r.URL.Path) {
			vel := svc.CheckVelocity(ctx, actorID)
			if vel.Blocked {
				slog.Warn("[insider] velocity gate tripped",
					"actor_id", actorID, "reason", vel.Reason)
				svc.EmitEnrichedAudit(ctx, EnrichedAuditEvent{
					EventID:        fmt.Sprintf("velocity-block-%d", time.Now().UnixNano()),
					ActorID:        actorID,
					Action:         r.URL.Path,
					IPAddress:      ip,
					UserAgent:      ua,
					DeviceHash:     deviceHash,
					RiskScore:      80,
					RiskFactors:    []string{"velocity_limit_exceeded"},
					VelocityMinute: vel.PerMinute,
					VelocityHour:   vel.PerHour,
					VelocityDay:    vel.PerDay,
					Outcome:        "blocked",
					OccurredAt:     time.Now(),
				})
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}
		}

		// 3. Attach context values for downstream handlers
		ctx = context.WithValue(ctx, CtxKeyActorID, actorID)
		ctx = context.WithValue(ctx, CtxKeySessionID, sessionID)
		ctx = context.WithValue(ctx, CtxKeyDeviceHash, deviceHash)
		ctx = context.WithValue(ctx, CtxKeyIPAddress, ip)

		next(w, r.WithContext(ctx))
	}
}

// isPrivilegedPath returns true for paths that require elevated controls.
func isPrivilegedPath(path string) bool {
	for _, p := range []string{
		"/v1/payouts/approve", "/v1/payouts/reject",
		"/v1/api-keys/create", "/v1/api-keys/revoke",
		"/v1/auth/sync-roles", "/v1/settlements/trigger",
		"/v1/disputes/resolve", "/v1/insider/",
		"/v1/config/", "/v1/users/disable",
	} {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// ─── Privileged action gate ───────────────────────────────────────────────────

// ActionContext carries the context needed to gate a privileged action.
type ActionContext struct {
	ActorID    string
	MerchantID string
	Action     PrivilegedAction
	ResourceID string
	Payload    json.RawMessage
	SessionID  string
	IPAddress  string
	UserAgent  string
	DeviceHash string
	GeoCountry string
}

// GateResult is returned by CheckPrivilegedAction.
type GateResult struct {
	Allowed       bool
	PendingID     string
	RiskScore     float64
	RiskLevel     string
	RiskFactors   []string
	BlockedReason string
}

// CheckPrivilegedAction evaluates all controls for a privileged action.
func (s *Service) CheckPrivilegedAction(ctx context.Context, ac ActionContext) GateResult {
	now := time.Now()

	score := s.GetRiskScore(ctx, ScoreRequest{
		ActorID:    ac.ActorID,
		MerchantID: ac.MerchantID,
		Action:     string(ac.Action),
		IPAddress:  ac.IPAddress,
		UserAgent:  ac.UserAgent,
		DeviceHash: ac.DeviceHash,
		GeoCountry: ac.GeoCountry,
		HourOfDay:  now.Hour(),
		DayOfWeek:  int(now.Weekday()),
	})

	// Block critical-risk actions immediately
	if score.RiskScore >= 90 {
		s.EmitEnrichedAudit(ctx, EnrichedAuditEvent{
			EventID:     fmt.Sprintf("risk-block-%d", now.UnixNano()),
			ActorID:     ac.ActorID,
			MerchantID:  ac.MerchantID,
			Action:      string(ac.Action),
			ResourceID:  ac.ResourceID,
			IPAddress:   ac.IPAddress,
			UserAgent:   ac.UserAgent,
			DeviceHash:  ac.DeviceHash,
			GeoCountry:  ac.GeoCountry,
			RiskScore:   score.RiskScore,
			RiskFactors: score.RiskFactors,
			Outcome:     "blocked",
			OccurredAt:  now,
		})
		return GateResult{
			Allowed:       false,
			RiskScore:     score.RiskScore,
			RiskLevel:     score.RiskLevel,
			RiskFactors:   score.RiskFactors,
			BlockedReason: fmt.Sprintf("critical risk score %.0f/100", score.RiskScore),
		}
	}

	// Require dual-control for designated actions or high-risk scores
	if IsDualControlRequired(ac.Action) || score.RiskScore >= 60 {
		dcID := fmt.Sprintf("dc-%d", now.UnixNano())
		_ = s.CreateDualControlRequest(ctx, DualControlRequest{
			ID:          dcID,
			Action:      ac.Action,
			InitiatorID: ac.ActorID,
			MerchantID:  ac.MerchantID,
			ResourceID:  ac.ResourceID,
			Payload:     ac.Payload,
		})
		s.EmitEnrichedAudit(ctx, EnrichedAuditEvent{
			EventID:       dcID,
			ActorID:       ac.ActorID,
			MerchantID:    ac.MerchantID,
			Action:        string(ac.Action),
			ResourceID:    ac.ResourceID,
			IPAddress:     ac.IPAddress,
			UserAgent:     ac.UserAgent,
			DeviceHash:    ac.DeviceHash,
			GeoCountry:    ac.GeoCountry,
			RiskScore:     score.RiskScore,
			RiskFactors:   score.RiskFactors,
			DualControlID: dcID,
			Outcome:       "pending_approval",
			OccurredAt:    now,
		})
		return GateResult{
			Allowed:     false,
			PendingID:   dcID,
			RiskScore:   score.RiskScore,
			RiskLevel:   score.RiskLevel,
			RiskFactors: score.RiskFactors,
		}
	}

	// Allow — emit audit trail
	s.EmitEnrichedAudit(ctx, EnrichedAuditEvent{
		EventID:     fmt.Sprintf("allow-%d", now.UnixNano()),
		ActorID:     ac.ActorID,
		MerchantID:  ac.MerchantID,
		Action:      string(ac.Action),
		ResourceID:  ac.ResourceID,
		IPAddress:   ac.IPAddress,
		UserAgent:   ac.UserAgent,
		DeviceHash:  ac.DeviceHash,
		GeoCountry:  ac.GeoCountry,
		RiskScore:   score.RiskScore,
		RiskFactors: score.RiskFactors,
		Outcome:     "allowed",
		OccurredAt:  now,
	})
	return GateResult{
		Allowed:     true,
		RiskScore:   score.RiskScore,
		RiskLevel:   score.RiskLevel,
		RiskFactors: score.RiskFactors,
	}
}

// StringFromCtx extracts a string stored in context by ContextKey.
func StringFromCtx(ctx context.Context, key ContextKey) string {
	v := ctx.Value(key)
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}
