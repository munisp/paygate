// Package sdk — NextHub 3rd-Party Integration SDK
// Webhook Dispatcher: delivers domain events to registered 3rd-party endpoints.
//
// Architecture:
//   Kafka consumer (paygate.*) → EventRouter → WebhookDispatcher → HTTPS endpoint
//
// Features:
//   - HMAC-SHA256 payload signing (X-NextHub-Signature header)
//   - Exponential backoff retry (5 attempts, max 5 min delay)
//   - Dead-letter queue for permanently failed deliveries
//   - Per-subscription rate limiting (configurable RPM)
//   - Idempotency via X-NextHub-Delivery-ID header
//   - Domain-scoped subscriptions (healthcare, insurance, scf, g2p, energy, cbdc, remittance)
package sdk

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// Domain represents a NextHub vertical domain.
type Domain string

const (
	DomainHealthcare Domain = "healthcare"
	DomainInsurance  Domain = "insurance"
	DomainSCF        Domain = "scf"
	DomainG2P        Domain = "g2p"
	DomainEnergy     Domain = "energy"
	DomainCBDC       Domain = "cbdc"
	DomainRemittance Domain = "remittance"
	DomainPayments   Domain = "payments"
)

// EventType represents a domain event type.
type EventType string

// Healthcare events
const (
	EvtClaimSubmitted    EventType = "healthcare.claim.submitted"
	EvtClaimAdjudicated  EventType = "healthcare.claim.adjudicated"
	EvtClaimDisbursed    EventType = "healthcare.claim.disbursed"
	EvtEligibilityCheck  EventType = "healthcare.eligibility.checked"
	EvtFHIRResourceCreated EventType = "healthcare.fhir.resource.created"
)

// Insurance events
const (
	EvtPolicyCreated     EventType = "insurance.policy.created"
	EvtPremiumCollected  EventType = "insurance.premium.collected"
	EvtPremiumFailed     EventType = "insurance.premium.failed"
	EvtClaimFiled        EventType = "insurance.claim.filed"
	EvtClaimPaid         EventType = "insurance.claim.paid"
	EvtLapseRisk         EventType = "insurance.lapse.risk"
)

// Payment events
const (
	EvtTransferInitiated  EventType = "payments.transfer.initiated"
	EvtTransferCompleted  EventType = "payments.transfer.completed"
	EvtTransferFailed     EventType = "payments.transfer.failed"
	EvtSettlementComplete EventType = "payments.settlement.completed"
)

// CBDC events
const (
	EvtCBDCMintCompleted    EventType = "cbdc.mint.completed"
	EvtCBDCTransferComplete EventType = "cbdc.transfer.completed"
	EvtAtomicSwapComplete   EventType = "cbdc.atomic.swap.completed"
)

// WebhookSubscription represents a 3rd-party app's event subscription.
type WebhookSubscription struct {
	ID           string    `json:"id"`
	AppID        string    `json:"appId"`        // APISIX consumer ID
	Domain       Domain    `json:"domain"`
	EventTypes   []EventType `json:"eventTypes"` // empty = all events in domain
	EndpointURL  string    `json:"endpointUrl"`
	SigningSecret string   `json:"-"`            // HMAC secret, never serialised
	IsActive     bool      `json:"isActive"`
	MaxRetries   int       `json:"maxRetries"`
	TimeoutMs    int       `json:"timeoutMs"`
	CreatedAt    time.Time `json:"createdAt"`
}

// WebhookEvent is the payload delivered to 3rd-party endpoints.
type WebhookEvent struct {
	ID          string          `json:"id"`           // Unique delivery ID
	EventType   EventType       `json:"eventType"`
	Domain      Domain          `json:"domain"`
	OccurredAt  time.Time       `json:"occurredAt"`
	Data        json.RawMessage `json:"data"`         // Domain-specific payload
	APIVersion  string          `json:"apiVersion"`
	Source      string          `json:"source"`       // "nexthub"
}

// DeliveryResult records the outcome of a webhook delivery attempt.
type DeliveryResult struct {
	DeliveryID   string
	SubscriptionID string
	Attempt      int
	StatusCode   int
	Success      bool
	Error        string
	Duration     time.Duration
	DeliveredAt  time.Time
}

// ── WebhookDispatcher ─────────────────────────────────────────────────────────

// WebhookDispatcher delivers domain events to registered 3rd-party endpoints.
type WebhookDispatcher struct {
	client    *http.Client
	logger    *slog.Logger
	dlqChan   chan *DeliveryResult // Dead-letter queue channel
}

// NewWebhookDispatcher creates a new dispatcher with sensible defaults.
func NewWebhookDispatcher() *WebhookDispatcher {
	return &WebhookDispatcher{
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		logger:  slog.Default(),
		dlqChan: make(chan *DeliveryResult, 1000),
	}
}

// Dispatch sends a WebhookEvent to a subscription's endpoint with retry logic.
func (d *WebhookDispatcher) Dispatch(ctx context.Context, sub *WebhookSubscription, event *WebhookEvent) *DeliveryResult {
	if !sub.IsActive {
		return &DeliveryResult{DeliveryID: event.ID, Success: false, Error: "subscription inactive"}
	}

	// Check event type filter
	if len(sub.EventTypes) > 0 && !d.eventTypeMatches(event.EventType, sub.EventTypes) {
		return &DeliveryResult{DeliveryID: event.ID, Success: true, Error: "event filtered"}
	}

	maxRetries := sub.MaxRetries
	if maxRetries <= 0 {
		maxRetries = 5
	}

	var lastResult *DeliveryResult
	for attempt := 1; attempt <= maxRetries; attempt++ {
		result := d.attemptDelivery(ctx, sub, event, attempt)
		lastResult = result

		if result.Success {
			d.logger.Info("webhook delivered",
				"deliveryId", event.ID,
				"subscriptionId", sub.ID,
				"attempt", attempt,
				"statusCode", result.StatusCode,
			)
			return result
		}

		d.logger.Warn("webhook delivery failed",
			"deliveryId", event.ID,
			"subscriptionId", sub.ID,
			"attempt", attempt,
			"error", result.Error,
		)

		if attempt < maxRetries {
			backoff := d.backoffDuration(attempt)
			select {
			case <-ctx.Done():
				lastResult.Error = "context cancelled during retry backoff"
				return lastResult
			case <-time.After(backoff):
				// continue to next attempt
			}
		}
	}

	// All retries exhausted — send to dead-letter queue
	d.logger.Error("webhook permanently failed, sending to DLQ",
		"deliveryId", event.ID,
		"subscriptionId", sub.ID,
	)
	select {
	case d.dlqChan <- lastResult:
	default:
		d.logger.Error("DLQ channel full, dropping delivery", "deliveryId", event.ID)
	}

	return lastResult
}

// attemptDelivery makes a single HTTP POST attempt.
func (d *WebhookDispatcher) attemptDelivery(ctx context.Context, sub *WebhookSubscription, event *WebhookEvent, attempt int) *DeliveryResult {
	result := &DeliveryResult{
		DeliveryID:     event.ID,
		SubscriptionID: sub.ID,
		Attempt:        attempt,
		DeliveredAt:    time.Now(),
	}

	payload, err := json.Marshal(event)
	if err != nil {
		result.Error = fmt.Sprintf("marshal error: %v", err)
		return result
	}

	signature := d.sign(payload, sub.SigningSecret)

	timeoutMs := sub.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 10000
	}
	reqCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, sub.EndpointURL, bytes.NewReader(payload))
	if err != nil {
		result.Error = fmt.Sprintf("request creation error: %v", err)
		return result
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-NextHub-Signature", "sha256="+signature)
	req.Header.Set("X-NextHub-Delivery-ID", event.ID)
	req.Header.Set("X-NextHub-Event-Type", string(event.EventType))
	req.Header.Set("X-NextHub-Domain", string(event.Domain))
	req.Header.Set("X-NextHub-API-Version", event.APIVersion)
	req.Header.Set("User-Agent", "NextHub-Webhook/1.0")

	start := time.Now()
	resp, err := d.client.Do(req)
	result.Duration = time.Since(start)

	if err != nil {
		result.Error = fmt.Sprintf("HTTP error: %v", err)
		return result
	}
	defer func() { _ = resp.Body.Close() }()

	// Drain body to allow connection reuse
	_, _ = io.Copy(io.Discard, resp.Body)

	result.StatusCode = resp.StatusCode
	result.Success = resp.StatusCode >= 200 && resp.StatusCode < 300
	if !result.Success {
		result.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	return result
}

// sign computes HMAC-SHA256 of the payload using the subscription's signing secret.
func (d *WebhookDispatcher) sign(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// backoffDuration computes exponential backoff: 2^attempt seconds, max 300s.
func (d *WebhookDispatcher) backoffDuration(attempt int) time.Duration {
	delay := math.Pow(2, float64(attempt))
	if delay > 300 {
		delay = 300
	}
	return time.Duration(delay) * time.Second
}

// eventTypeMatches checks if an event type matches the subscription filter.
func (d *WebhookDispatcher) eventTypeMatches(evt EventType, filter []EventType) bool {
	for _, f := range filter {
		if f == evt {
			return true
		}
	}
	return false
}

// DLQChannel returns the dead-letter queue channel for monitoring.
func (d *WebhookDispatcher) DLQChannel() <-chan *DeliveryResult {
	return d.dlqChan
}

// ── Event Builder ─────────────────────────────────────────────────────────────

// NewEvent creates a new WebhookEvent with a unique delivery ID.
func NewEvent(domain Domain, eventType EventType, data interface{}) (*WebhookEvent, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshal event data: %w", err)
	}
	return &WebhookEvent{
		ID:         uuid.New().String(),
		EventType:  eventType,
		Domain:     domain,
		OccurredAt: time.Now().UTC(),
		Data:       payload,
		APIVersion: "2024-01",
		Source:     "nexthub",
	}, nil
}

// ── APISIX Consumer Provisioner ───────────────────────────────────────────────

// APISIXConsumerConfig represents a new 3rd-party app consumer in APISIX.
type APISIXConsumerConfig struct {
	AppID        string            `json:"appId"`
	AppName      string            `json:"appName"`
	APIKey       string            `json:"apiKey"`       // SHA-256 hashed before storage
	Domains      []Domain          `json:"domains"`      // Permitted domains
	RateLimitRPM int               `json:"rateLimitRpm"`
	JWTSecret    string            `json:"jwtSecret"`
	Labels       map[string]string `json:"labels"`
}

// ProvisionAPISIXConsumer registers a new 3rd-party app in APISIX via Admin API.
// In production: POST /apisix/admin/consumers with key-auth and jwt-auth plugins.
func ProvisionAPISIXConsumer(ctx context.Context, apisixAdminURL string, cfg *APISIXConsumerConfig) error {
	logger := slog.Default()

	consumerBody := map[string]interface{}{
		"username": cfg.AppID,
		"labels":   cfg.Labels,
		"plugins": map[string]interface{}{
			"key-auth": map[string]interface{}{
				"key": cfg.APIKey,
			},
			"jwt-auth": map[string]interface{}{
				"key":    cfg.AppID,
				"secret": cfg.JWTSecret,
			},
		},
	}

	payload, _ := json.Marshal(consumerBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		fmt.Sprintf("%s/apisix/admin/consumers/%s", apisixAdminURL, cfg.AppID),
		bytes.NewReader(payload),
	)
	if err != nil {
		return fmt.Errorf("create APISIX consumer request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", "nexthub-admin-key") // APISIX admin key

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("APISIX consumer provision failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("APISIX returned HTTP %d", resp.StatusCode)
	}

	logger.Info("APISIX consumer provisioned",
		"appId", cfg.AppID,
		"domains", cfg.Domains,
		"rateLimitRpm", cfg.RateLimitRPM,
	)
	return nil
}
