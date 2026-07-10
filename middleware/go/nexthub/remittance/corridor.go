// Package remittance implements the NextHub remittance corridor engine.
// It provides FX corridor management, rate locking, multi-hop routing,
// and FATF Travel Rule enforcement for cross-border transfers.
package remittance

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// Corridor represents a remittance corridor between two countries/currencies.
type Corridor struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	SourceCountry  string    `json:"sourceCountry"`
	TargetCountry  string    `json:"targetCountry"`
	SourceCurrency string    `json:"sourceCurrency"`
	TargetCurrency string    `json:"targetCurrency"`
	ProviderFSP    string    `json:"providerFsp"`
	FeePercent     float64   `json:"feePercent"`
	FeeFixed       float64   `json:"feeFixed"`
	MinAmount      float64   `json:"minAmount"`
	MaxAmount      float64   `json:"maxAmount"`
	EstimatedTTL   int       `json:"estimatedTtlSeconds"`
	IsActive       bool      `json:"isActive"`
	CreatedAt      time.Time `json:"createdAt"`
}

// LockedRate represents a locked FX rate for a specific transfer.
type LockedRate struct {
	LockID         string    `json:"lockId"`
	CorridorID     string    `json:"corridorId"`
	SourceCurrency string    `json:"sourceCurrency"`
	TargetCurrency string    `json:"targetCurrency"`
	Rate           float64   `json:"rate"`
	SourceAmount   float64   `json:"sourceAmount"`
	TargetAmount   float64   `json:"targetAmount"`
	Fee            float64   `json:"fee"`
	ExpiresAt      time.Time `json:"expiresAt"`
	LockedAt       time.Time `json:"lockedAt"`
}

// RemittanceTransfer represents a remittance transfer.
type RemittanceTransfer struct {
	ID             string    `json:"id"`
	CorridorID     string    `json:"corridorId"`
	LockID         string    `json:"lockId"`
	SenderFSP      string    `json:"senderFsp"`
	ReceiverFSP    string    `json:"receiverFsp"`
	SourceAmount   float64   `json:"sourceAmount"`
	SourceCurrency string    `json:"sourceCurrency"`
	TargetAmount   float64   `json:"targetAmount"`
	TargetCurrency string    `json:"targetCurrency"`
	Rate           float64   `json:"rate"`
	Fee            float64   `json:"fee"`
	State          string    `json:"state"` // INITIATED, LOCKED, PROCESSING, COMPLETED, FAILED
	TravelRuleData *TravelRuleData `json:"travelRuleData,omitempty"`
	FSPIOPTransferID string  `json:"fspiopTransferId,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty"`
}

// TravelRuleData holds FATF Travel Rule information.
type TravelRuleData struct {
	OriginatorName    string `json:"originatorName"`
	OriginatorAccount string `json:"originatorAccount"`
	OriginatorAddress string `json:"originatorAddress,omitempty"`
	OriginatorDOB     string `json:"originatorDob,omitempty"`
	OriginatorID      string `json:"originatorId,omitempty"`
	BeneficiaryName   string `json:"beneficiaryName"`
	BeneficiaryAccount string `json:"beneficiaryAccount"`
	BeneficiaryAddress string `json:"beneficiaryAddress,omitempty"`
	OriginatorVASP    string `json:"originatorVasp"`
	BeneficiaryVASP   string `json:"beneficiaryVasp"`
	TransactionRef    string `json:"transactionRef"`
}

// QuoteRequest is the request body for a remittance quote.
type QuoteRequest struct {
	CorridorID     string  `json:"corridorId" binding:"required"`
	SourceAmount   float64 `json:"sourceAmount" binding:"required"`
	SourceCurrency string  `json:"sourceCurrency" binding:"required"`
	TargetCurrency string  `json:"targetCurrency" binding:"required"`
}

// InitiateRequest is the request body for initiating a remittance transfer.
type InitiateRequest struct {
	LockID         string          `json:"lockId" binding:"required"`
	SenderFSP      string          `json:"senderFsp" binding:"required"`
	ReceiverFSP    string          `json:"receiverFsp" binding:"required"`
	TravelRuleData *TravelRuleData `json:"travelRuleData,omitempty"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// Handler handles remittance corridor operations.
type Handler struct {
	redis   RedisClient
	kafka   KafkaProducer
	fluvio  FluvioProducer
	db      DBClient
	fxFeed  FXRateFeed
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

// FluvioProducer is the interface for Fluvio streaming.
type FluvioProducer interface {
	Produce(ctx context.Context, topic string, key string, value []byte) error
}

// DBClient is the interface for database operations.
type DBClient interface {
	GetCorridor(ctx context.Context, id string) (*Corridor, error)
	ListCorridors(ctx context.Context, srcCcy, tgtCcy string) ([]*Corridor, error)
	CreateTransfer(ctx context.Context, t *RemittanceTransfer) error
	UpdateTransfer(ctx context.Context, t *RemittanceTransfer) error
	GetTransfer(ctx context.Context, id string) (*RemittanceTransfer, error)
}

// FXRateFeed provides live FX rates.
type FXRateFeed interface {
	GetRate(ctx context.Context, srcCcy, tgtCcy string) (float64, error)
}

// NewHandler creates a new remittance handler.
func NewHandler(redis RedisClient, kafka KafkaProducer, fluvio FluvioProducer,
	db DBClient, fxFeed FXRateFeed) *Handler {
	return &Handler{redis: redis, kafka: kafka, fluvio: fluvio, db: db, fxFeed: fxFeed}
}

// RegisterRoutes registers remittance routes on the gin router.
func (h *Handler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/nexthub/remittance")
	g.GET("/corridors", h.handleListCorridors)
	g.POST("/quote", h.handleQuote)
	g.POST("/initiate", h.handleInitiate)
	g.GET("/transfers/:id", h.handleGetTransfer)
	g.GET("/transfers/:id/status", h.handleGetStatus)
}

// handleListCorridors handles GET /nexthub/remittance/corridors.
func (h *Handler) handleListCorridors(c *gin.Context) {
	srcCcy := c.Query("sourceCurrency")
	tgtCcy := c.Query("targetCurrency")

	corridors, err := h.db.ListCorridors(c.Request.Context(), srcCcy, tgtCcy)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list corridors"})
		return
	}
	c.JSON(http.StatusOK, corridors)
}

// handleQuote handles POST /nexthub/remittance/quote — get a locked FX rate.
func (h *Handler) handleQuote(c *gin.Context) {
	var req QuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Get corridor
	corridor, err := h.db.GetCorridor(ctx, req.CorridorID)
	if err != nil || corridor == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "corridor not found"})
		return
	}

	if !corridor.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "corridor is not active"})
		return
	}

	// Validate amount
	if req.SourceAmount < corridor.MinAmount || req.SourceAmount > corridor.MaxAmount {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("amount must be between %.2f and %.2f %s",
				corridor.MinAmount, corridor.MaxAmount, req.SourceCurrency),
		})
		return
	}

	// Get live FX rate
	rate, err := h.fxFeed.GetRate(ctx, req.SourceCurrency, req.TargetCurrency)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "FX rate unavailable"})
		return
	}

	// Calculate fee
	feePercent := corridor.FeePercent / 100.0
	fee := math.Round((req.SourceAmount*feePercent+corridor.FeeFixed)*100) / 100
	netAmount := req.SourceAmount - fee
	targetAmount := math.Round(netAmount*rate*100) / 100

	// Lock rate for 5 minutes
	lockID := fmt.Sprintf("lock-%d", time.Now().UnixNano())
	locked := &LockedRate{
		LockID:         lockID,
		CorridorID:     req.CorridorID,
		SourceCurrency: req.SourceCurrency,
		TargetCurrency: req.TargetCurrency,
		Rate:           rate,
		SourceAmount:   req.SourceAmount,
		TargetAmount:   targetAmount,
		Fee:            fee,
		ExpiresAt:      time.Now().UTC().Add(5 * time.Minute),
		LockedAt:       time.Now().UTC(),
	}

	// Cache locked rate
	cacheKey := fmt.Sprintf("rate_lock:%s", lockID)
	if err := h.redis.SetJSON(ctx, cacheKey, locked, 5*time.Minute); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lock rate"})
		return
	}

	c.JSON(http.StatusOK, locked)
}

// handleInitiate handles POST /nexthub/remittance/initiate — initiate a remittance.
func (h *Handler) handleInitiate(c *gin.Context) {
	var req InitiateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Retrieve locked rate
	var locked LockedRate
	cacheKey := fmt.Sprintf("rate_lock:%s", req.LockID)
	if err := h.redis.GetJSON(ctx, cacheKey, &locked); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rate lock expired or not found"})
		return
	}

	// Check lock expiry
	if time.Now().UTC().After(locked.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rate lock has expired"})
		return
	}

	// Enforce Travel Rule for transfers >= $1000 equivalent
	if locked.SourceAmount >= 1000 && req.TravelRuleData == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Travel Rule data required for transfers >= 1000 " + locked.SourceCurrency,
		})
		return
	}

	now := time.Now().UTC()
	transfer := &RemittanceTransfer{
		ID:             fmt.Sprintf("rem-%d", now.UnixNano()),
		CorridorID:     locked.CorridorID,
		LockID:         req.LockID,
		SenderFSP:      req.SenderFSP,
		ReceiverFSP:    req.ReceiverFSP,
		SourceAmount:   locked.SourceAmount,
		SourceCurrency: locked.SourceCurrency,
		TargetAmount:   locked.TargetAmount,
		TargetCurrency: locked.TargetCurrency,
		Rate:           locked.Rate,
		Fee:            locked.Fee,
		State:          "INITIATED",
		TravelRuleData: req.TravelRuleData,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := h.db.CreateTransfer(ctx, transfer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create transfer"})
		return
	}

	// Invalidate lock
	_ = h.redis.Delete(ctx, cacheKey)

	// Publish Kafka event
	eventData, _ := json.Marshal(map[string]interface{}{
		"eventType":      "remittance.initiated",
		"transferId":     transfer.ID,
		"corridorId":     transfer.CorridorID,
		"sourceAmount":   transfer.SourceAmount,
		"sourceCurrency": transfer.SourceCurrency,
		"targetAmount":   transfer.TargetAmount,
		"targetCurrency": transfer.TargetCurrency,
		"rate":           transfer.Rate,
		"fee":            transfer.Fee,
		"senderFsp":      transfer.SenderFSP,
		"receiverFsp":    transfer.ReceiverFSP,
		"travelRule":     req.TravelRuleData != nil,
		"timestamp":      now.Format(time.RFC3339),
	})
	_ = h.kafka.Produce(ctx, "paygate.nexthub.remittance", transfer.ID, eventData)
	_ = h.fluvio.Produce(ctx, "nexthub-remittance-events", transfer.ID, eventData)

	c.JSON(http.StatusCreated, transfer)
}

// handleGetTransfer handles GET /nexthub/remittance/transfers/:id.
func (h *Handler) handleGetTransfer(c *gin.Context) {
	id := c.Param("id")
	transfer, err := h.db.GetTransfer(c.Request.Context(), id)
	if err != nil || transfer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "transfer not found"})
		return
	}
	c.JSON(http.StatusOK, transfer)
}

// handleGetStatus handles GET /nexthub/remittance/transfers/:id/status.
func (h *Handler) handleGetStatus(c *gin.Context) {
	id := c.Param("id")
	transfer, err := h.db.GetTransfer(c.Request.Context(), id)
	if err != nil || transfer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "transfer not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"transferId":    transfer.ID,
		"state":         transfer.State,
		"sourceAmount":  strconv.FormatFloat(transfer.SourceAmount, 'f', 2, 64),
		"targetAmount":  strconv.FormatFloat(transfer.TargetAmount, 'f', 2, 64),
		"rate":          transfer.Rate,
		"fee":           transfer.Fee,
		"createdAt":     transfer.CreatedAt,
		"updatedAt":     transfer.UpdatedAt,
		"completedAt":   transfer.CompletedAt,
	})
}
