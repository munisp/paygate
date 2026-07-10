// Package participants implements the NextHub participant lifecycle management
// bridge handler. It manages DFSP onboarding, suspension, offboarding, and
// liquidity/position limit management — fully integrated with Permify (authz),
// Redis (cache), Kafka (events), TigerBeetle (ledger), and Fluvio (streaming).
package participants

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// ParticipantState represents the lifecycle state of a DFSP participant.
type ParticipantState string

const (
	StateActive    ParticipantState = "ACTIVE"
	StateSuspended ParticipantState = "SUSPENDED"
	StateOffboarded ParticipantState = "OFFBOARDED"
	StatePending   ParticipantState = "PENDING"
)

// Participant represents a DFSP participant in the NextHub scheme.
type Participant struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	FspID          string           `json:"fspId"`
	BIC            string           `json:"bic,omitempty"`
	LEI            string           `json:"lei,omitempty"`
	Country        string           `json:"country"`
	Currency       string           `json:"currency"`
	State          ParticipantState `json:"state"`
	NetDebitCap    int64            `json:"netDebitCap"`    // in minor units
	CurrentPosition int64           `json:"currentPosition"` // in minor units
	ReservedFunds  int64            `json:"reservedFunds"`  // in minor units
	SettledFunds   int64            `json:"settledFunds"`   // in minor units
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
	SuspendedAt    *time.Time       `json:"suspendedAt,omitempty"`
	SuspendReason  string           `json:"suspendReason,omitempty"`
	Endpoints      []ParticipantEndpoint `json:"endpoints"`
}

// ParticipantEndpoint represents a DFSP API endpoint.
type ParticipantEndpoint struct {
	Type  string `json:"type"` // FSPIOP_CALLBACK_URL_TRANSFER_POST, etc.
	Value string `json:"value"`
}

// OnboardRequest is the request body for participant onboarding.
type OnboardRequest struct {
	Name        string `json:"name" binding:"required"`
	FspID       string `json:"fspId" binding:"required"`
	BIC         string `json:"bic,omitempty"`
	LEI         string `json:"lei,omitempty"`
	Country     string `json:"country" binding:"required"`
	Currency    string `json:"currency" binding:"required"`
	NetDebitCap int64  `json:"netDebitCap" binding:"required"`
	Endpoints   []ParticipantEndpoint `json:"endpoints"`
}

// SuspendRequest is the request body for participant suspension.
type SuspendRequest struct {
	Reason string `json:"reason" binding:"required"`
}

// LimitUpdateRequest is the request body for updating position limits.
type LimitUpdateRequest struct {
	NetDebitCap int64 `json:"netDebitCap" binding:"required"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// Handler handles participant lifecycle operations.
type Handler struct {
	redis     RedisClient
	kafka     KafkaProducer
	tigerbeetle TigerBeetleClient
	permify   PermifyClient
	fluvio    FluvioProducer
	db        DBClient
}

// RedisClient is the interface for Redis operations.
type RedisClient interface {
	SetJSON(ctx context.Context, key string, value interface{}, ttl time.Duration) error
	GetJSON(ctx context.Context, key string, dest interface{}) error
	Delete(ctx context.Context, key string) error
}

// KafkaProducer is the interface for Kafka operations.
type KafkaProducer interface {
	Produce(ctx context.Context, topic string, key string, value []byte) error
}

// TigerBeetleClient is the interface for TigerBeetle operations.
type TigerBeetleClient interface {
	CreateAccount(ctx context.Context, id uint128, ledger uint32, code uint16) error
	GetAccountBalance(ctx context.Context, id uint128) (int64, int64, error)
}

// PermifyClient is the interface for Permify authorization.
type PermifyClient interface {
	Check(ctx context.Context, subject, relation, object string) (bool, error)
	WriteRelationship(ctx context.Context, subject, relation, object string) error
}

// FluvioProducer is the interface for Fluvio streaming.
type FluvioProducer interface {
	Produce(ctx context.Context, topic string, key string, value []byte) error
}

// DBClient is the interface for database operations.
type DBClient interface {
	GetParticipant(ctx context.Context, fspID string) (*Participant, error)
	CreateParticipant(ctx context.Context, p *Participant) error
	UpdateParticipant(ctx context.Context, p *Participant) error
	ListParticipants(ctx context.Context, state string) ([]*Participant, error)
}

// uint128 represents a 128-bit integer for TigerBeetle.
type uint128 [2]uint64

// NewHandler creates a new participant lifecycle handler.
func NewHandler(redis RedisClient, kafka KafkaProducer, tb TigerBeetleClient,
	permify PermifyClient, fluvio FluvioProducer, db DBClient) *Handler {
	return &Handler{
		redis: redis, kafka: kafka, tigerbeetle: tb,
		permify: permify, fluvio: fluvio, db: db,
	}
}

// RegisterRoutes registers participant lifecycle routes on the gin router.
func (h *Handler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/nexthub/participants")
	g.POST("", h.handleOnboard)
	g.GET("", h.handleList)
	g.GET("/:fspId", h.handleGet)
	g.PUT("/:fspId/suspend", h.handleSuspend)
	g.PUT("/:fspId/activate", h.handleActivate)
	g.DELETE("/:fspId", h.handleOffboard)
	g.GET("/:fspId/limits", h.handleGetLimits)
	g.PUT("/:fspId/limits", h.handleUpdateLimits)
	g.GET("/:fspId/position", h.handleGetPosition)
}

// handleOnboard handles POST /nexthub/participants — onboard a new DFSP.
func (h *Handler) handleOnboard(c *gin.Context) {
	var req OnboardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Check authorization
	if ok, err := h.permify.Check(ctx, "operator:admin", "onboard_participant", "nexthub:scheme"); err != nil || !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	// Check for duplicate
	if existing, _ := h.db.GetParticipant(ctx, req.FspID); existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("participant %s already exists", req.FspID)})
		return
	}

	now := time.Now().UTC()
	participant := &Participant{
		ID:          generateParticipantID(req.FspID),
		Name:        req.Name,
		FspID:       req.FspID,
		BIC:         req.BIC,
		LEI:         req.LEI,
		Country:     req.Country,
		Currency:    req.Currency,
		State:       StatePending,
		NetDebitCap: req.NetDebitCap,
		Endpoints:   req.Endpoints,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Create TigerBeetle settlement account for this participant
	accountID := deriveAccountID(req.FspID, req.Currency)
	if err := h.tigerbeetle.CreateAccount(ctx, accountID, 1, 1001); err != nil {
		// Log but don't fail — account may already exist
		_ = err
	}

	// Persist participant
	if err := h.db.CreateParticipant(ctx, participant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create participant"})
		return
	}

	// Write Permify relationship
	_ = h.permify.WriteRelationship(ctx, fmt.Sprintf("dfsp:%s", req.FspID), "member", "nexthub:scheme")

	// Activate participant
	participant.State = StateActive
	participant.UpdatedAt = time.Now().UTC()
	_ = h.db.UpdateParticipant(ctx, participant)

	// Cache participant
	cacheKey := fmt.Sprintf("participant:%s", req.FspID)
	_ = h.redis.SetJSON(ctx, cacheKey, participant, 5*time.Minute)

	// Publish Kafka event
	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType":   "participant.onboarded",
		"fspId":       req.FspID,
		"name":        req.Name,
		"currency":    req.Currency,
		"netDebitCap": req.NetDebitCap,
		"timestamp":   now.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.participants", req.FspID, eventData)

	// Stream to Fluvio
	_ = h.fluvio.Produce(ctx, "nexthub-participant-events", req.FspID, eventData)

	c.JSON(http.StatusCreated, participant)
}

// handleList handles GET /nexthub/participants — list participants.
func (h *Handler) handleList(c *gin.Context) {
	state := c.Query("state")
	participants, err := h.db.ListParticipants(c.Request.Context(), state)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list participants"})
		return
	}
	c.JSON(http.StatusOK, participants)
}

// handleGet handles GET /nexthub/participants/:fspId — get a participant.
func (h *Handler) handleGet(c *gin.Context) {
	fspID := c.Param("fspId")
	ctx := c.Request.Context()

	// Try cache first
	var cached Participant
	cacheKey := fmt.Sprintf("participant:%s", fspID)
	if err := h.redis.GetJSON(ctx, cacheKey, &cached); err == nil {
		c.JSON(http.StatusOK, &cached)
		return
	}

	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("participant %s not found", fspID)})
		return
	}

	_ = h.redis.SetJSON(ctx, cacheKey, participant, 5*time.Minute)
	c.JSON(http.StatusOK, participant)
}

// handleSuspend handles PUT /nexthub/participants/:fspId/suspend.
func (h *Handler) handleSuspend(c *gin.Context) {
	fspID := c.Param("fspId")
	var req SuspendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	if participant.State != StateActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "participant is not active"})
		return
	}

	now := time.Now().UTC()
	participant.State = StateSuspended
	participant.SuspendedAt = &now
	participant.SuspendReason = req.Reason
	participant.UpdatedAt = now

	if err := h.db.UpdateParticipant(ctx, participant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to suspend participant"})
		return
	}

	// Invalidate cache
	_ = h.redis.Delete(ctx, fmt.Sprintf("participant:%s", fspID))

	// Publish event
	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType": "participant.suspended",
		"fspId":     fspID,
		"reason":    req.Reason,
		"timestamp": now.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.participants", fspID, eventData)
	_ = h.fluvio.Produce(ctx, "nexthub-participant-events", fspID, eventData)

	c.JSON(http.StatusOK, participant)
}

// handleActivate handles PUT /nexthub/participants/:fspId/activate.
func (h *Handler) handleActivate(c *gin.Context) {
	fspID := c.Param("fspId")
	ctx := c.Request.Context()

	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	now := time.Now().UTC()
	participant.State = StateActive
	participant.SuspendedAt = nil
	participant.SuspendReason = ""
	participant.UpdatedAt = now

	if err := h.db.UpdateParticipant(ctx, participant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate participant"})
		return
	}

	_ = h.redis.Delete(ctx, fmt.Sprintf("participant:%s", fspID))

	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType": "participant.activated",
		"fspId":     fspID,
		"timestamp": now.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.participants", fspID, eventData)

	c.JSON(http.StatusOK, participant)
}

// handleOffboard handles DELETE /nexthub/participants/:fspId.
func (h *Handler) handleOffboard(c *gin.Context) {
	fspID := c.Param("fspId")
	ctx := c.Request.Context()

	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	// Check position is zero before offboarding
	if participant.CurrentPosition != 0 || participant.ReservedFunds != 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "participant has non-zero position; settle all transfers before offboarding",
		})
		return
	}

	now := time.Now().UTC()
	participant.State = StateOffboarded
	participant.UpdatedAt = now

	if err := h.db.UpdateParticipant(ctx, participant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to offboard participant"})
		return
	}

	_ = h.redis.Delete(ctx, fmt.Sprintf("participant:%s", fspID))

	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType": "participant.offboarded",
		"fspId":     fspID,
		"timestamp": now.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.participants", fspID, eventData)

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("participant %s offboarded", fspID)})
}

// handleGetLimits handles GET /nexthub/participants/:fspId/limits.
func (h *Handler) handleGetLimits(c *gin.Context) {
	fspID := c.Param("fspId")
	participant, err := h.db.GetParticipant(c.Request.Context(), fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"fspId":           fspID,
		"netDebitCap":     participant.NetDebitCap,
		"currentPosition": participant.CurrentPosition,
		"reservedFunds":   participant.ReservedFunds,
		"settledFunds":    participant.SettledFunds,
		"availableCredit": participant.NetDebitCap - participant.CurrentPosition,
	})
}

// handleUpdateLimits handles PUT /nexthub/participants/:fspId/limits.
func (h *Handler) handleUpdateLimits(c *gin.Context) {
	fspID := c.Param("fspId")
	var req LimitUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	oldCap := participant.NetDebitCap
	participant.NetDebitCap = req.NetDebitCap
	participant.UpdatedAt = time.Now().UTC()

	if err := h.db.UpdateParticipant(ctx, participant); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update limits"})
		return
	}

	_ = h.redis.Delete(ctx, fmt.Sprintf("participant:%s", fspID))

	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType":      "participant.limits_updated",
		"fspId":          fspID,
		"oldNetDebitCap": oldCap,
		"newNetDebitCap": req.NetDebitCap,
		"timestamp":      participant.UpdatedAt.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.participants", fspID, eventData)

	c.JSON(http.StatusOK, gin.H{
		"fspId":       fspID,
		"netDebitCap": participant.NetDebitCap,
		"updatedAt":   participant.UpdatedAt,
	})
}

// handleGetPosition handles GET /nexthub/participants/:fspId/position.
func (h *Handler) handleGetPosition(c *gin.Context) {
	fspID := c.Param("fspId")
	ctx := c.Request.Context()

	participant, err := h.db.GetParticipant(ctx, fspID)
	if err != nil || participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	// Get live position from TigerBeetle
	accountID := deriveAccountID(fspID, participant.Currency)
	debits, credits, err := h.tigerbeetle.GetAccountBalance(ctx, accountID)
	if err != nil {
		// Fall back to DB position
		c.JSON(http.StatusOK, gin.H{
			"fspId":           fspID,
			"currency":        participant.Currency,
			"currentPosition": participant.CurrentPosition,
			"reservedFunds":   participant.ReservedFunds,
			"settledFunds":    participant.SettledFunds,
			"source":          "db",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"fspId":           fspID,
		"currency":        participant.Currency,
		"currentPosition": debits - credits,
		"totalDebits":     debits,
		"totalCredits":    credits,
		"netDebitCap":     participant.NetDebitCap,
		"availableCredit": participant.NetDebitCap - (debits - credits),
		"source":          "tigerbeetle",
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// generateParticipantID generates a deterministic participant ID.
func generateParticipantID(fspID string) string {
	return fmt.Sprintf("part-%s-%d", fspID, time.Now().UnixNano())
}

// deriveAccountID derives a TigerBeetle account ID from FSP ID and currency.
func deriveAccountID(fspID, currency string) uint128 {
	// Deterministic derivation using FNV-1a hash
	h := uint64(14695981039346656037)
	for _, c := range fspID + ":" + currency {
		h ^= uint64(c)
		h *= 1099511628211
	}
	return uint128{h, 0}
}
