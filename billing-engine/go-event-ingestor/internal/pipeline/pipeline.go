// Package pipeline implements the real-time billing event pipeline.
// Flow: Kafka/Dapr → fee computation (Rust billing-core) → PostgreSQL billing_events → TigerBeetle ledger
package pipeline

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// PaymentCompletedEvent is the canonical event published to Kafka when a payment succeeds.
type PaymentCompletedEvent struct {
	EventID        uuid.UUID  `json:"event_id"`
	TenantID       uuid.UUID  `json:"tenant_id"`
	MerchantID     uuid.UUID  `json:"merchant_id"`
	ResellerID     *uuid.UUID `json:"reseller_id,omitempty"`
	TransactionID  uuid.UUID  `json:"transaction_id"`
	AmountKobo     int64      `json:"amount_kobo"`
	Currency       string     `json:"currency"`
	Channel        string     `json:"channel"`
	Status         string     `json:"status"`
	OccurredAt     time.Time  `json:"occurred_at"`
	IdempotencyKey string     `json:"idempotency_key"`
}

// BillingComputeRequest is sent to the Rust billing-core service.
type BillingComputeRequest struct {
	TenantID            string  `json:"tenant_id"`
	TransactionID       string  `json:"transaction_id"`
	TransactionAmountKobo int64 `json:"transaction_amount_kobo"`
	FeeRate             float64 `json:"fee_rate"`
	FeeCapKobo          int64   `json:"fee_cap_kobo"`
	FeeFloorKobo        int64   `json:"fee_floor_kobo"`
	PlatformShare       float64 `json:"platform_share"`
	ResellerShare       float64 `json:"reseller_share"`
	InterchangeCostKobo int64   `json:"interchange_cost_kobo"`
	PricingModel        string  `json:"pricing_model"`
}

// BillingComputeResult is returned by the Rust billing-core service.
type BillingComputeResult struct {
	FeeKobo              int64   `json:"fee_kobo"`
	PlatformRevenueKobo  int64   `json:"platform_revenue_kobo"`
	ResellerRevenueKobo  int64   `json:"reseller_revenue_kobo"`
	InterchangeCostKobo  int64   `json:"interchange_cost_kobo"`
	NetPlatformKobo      int64   `json:"net_platform_kobo"`
	FeeRateApplied       float64 `json:"fee_rate_applied"`
	CapApplied           bool    `json:"cap_applied"`
	FloorApplied         bool    `json:"floor_applied"`
}

// BillingConfig is the active billing configuration for a tenant.
type BillingConfig struct {
	ID                  string
	TenantID            string
	PricingModel        string
	FeeRate             float64
	FeeCapKobo          int64
	FeeFloorKobo        int64
	PlatformShare       float64
	ResellerShare       float64
	InterchangeCostKobo int64
}

// Pipeline orchestrates the full billing event processing flow.
type Pipeline struct {
	db             *sql.DB
	billingCoreURL string
	tbAddress      string // TigerBeetle address
	log            *zap.Logger
	httpClient     *http.Client
}

// NewPipeline creates a new billing event pipeline.
func NewPipeline(dbURL, billingCoreURL, tbAddress string, log *zap.Logger) (*Pipeline, error) {
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Warn("PostgreSQL not reachable at startup — will retry on first event", zap.Error(err))
	}

	return &Pipeline{
		db:             db,
		billingCoreURL: billingCoreURL,
		tbAddress:      tbAddress,
		log:            log,
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// Process is the main entry point — called for each Kafka/Dapr event.
func (p *Pipeline) Process(ctx context.Context, payload []byte) error {
	var event PaymentCompletedEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return fmt.Errorf("deserialize payment event: %w", err)
	}

	p.log.Info("Pipeline: processing payment event",
		zap.String("event_id", event.EventID.String()),
		zap.String("tenant_id", event.TenantID.String()),
		zap.Int64("amount_kobo", event.AmountKobo),
	)

	// 1. Idempotency check — skip if already processed
	if exists, err := p.eventExists(ctx, event.EventID.String()); err != nil {
		p.log.Warn("Idempotency check failed", zap.Error(err))
	} else if exists {
		p.log.Info("Skipping duplicate event", zap.String("event_id", event.EventID.String()))
		return nil
	}

	// 2. Fetch active billing config for tenant
	cfg, err := p.fetchBillingConfig(ctx, event.TenantID.String())
	if err != nil {
		return fmt.Errorf("fetch billing config for tenant %s: %w", event.TenantID, err)
	}

	// 3. Compute fee via Rust billing-core
	result, err := p.computeFee(ctx, event, cfg)
	if err != nil {
		return fmt.Errorf("compute fee: %w", err)
	}

	// 4. Persist billing event to PostgreSQL
	billingEventID := uuid.New().String()
	if err := p.persistBillingEvent(ctx, billingEventID, event, cfg, result); err != nil {
		return fmt.Errorf("persist billing event: %w", err)
	}

	// 5. Post double-entry ledger entries to TigerBeetle (best-effort)
	if err := p.postToTigerBeetle(ctx, billingEventID, event, cfg, result); err != nil {
		p.log.Warn("TigerBeetle ledger post failed (non-fatal)",
			zap.String("billing_event_id", billingEventID),
			zap.Error(err),
		)
		// Mark event as settled even if TB fails — TB is eventually consistent
	}

	// 6. Update billing event status to settled
	if err := p.markSettled(ctx, billingEventID); err != nil {
		p.log.Warn("Failed to mark billing event as settled", zap.Error(err))
	}

	p.log.Info("Pipeline: billing event processed",
		zap.String("billing_event_id", billingEventID),
		zap.Int64("fee_kobo", result.FeeKobo),
		zap.Int64("platform_revenue_kobo", result.PlatformRevenueKobo),
		zap.Int64("reseller_revenue_kobo", result.ResellerRevenueKobo),
	)

	return nil
}

// ── Step 1: Idempotency ───────────────────────────────────────────────────────

func (p *Pipeline) eventExists(ctx context.Context, transactionID string) (bool, error) {
	var count int
	err := p.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM billing_events WHERE transaction_id = $1`,
		transactionID,
	).Scan(&count)
	return count > 0, err
}

// ── Step 2: Fetch billing config ──────────────────────────────────────────────

func (p *Pipeline) fetchBillingConfig(ctx context.Context, tenantID string) (*BillingConfig, error) {
	row := p.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, pricing_model, fee_rate, fee_cap_kobo, fee_floor_kobo,
		       platform_share, reseller_share, interchange_cost_kobo
		FROM billing_configs
		WHERE tenant_id = $1 AND active = true AND status = 'active'
		LIMIT 1
	`, tenantID)

	var cfg BillingConfig
	if err := row.Scan(
		&cfg.ID, &cfg.TenantID, &cfg.PricingModel,
		&cfg.FeeRate, &cfg.FeeCapKobo, &cfg.FeeFloorKobo,
		&cfg.PlatformShare, &cfg.ResellerShare, &cfg.InterchangeCostKobo,
	); err != nil {
		return nil, fmt.Errorf("no active billing config for tenant %s: %w", tenantID, err)
	}
	return &cfg, nil
}

// ── Step 3: Compute fee via Rust billing-core ─────────────────────────────────

func (p *Pipeline) computeFee(ctx context.Context, event PaymentCompletedEvent, cfg *BillingConfig) (*BillingComputeResult, error) {
	reqBody := BillingComputeRequest{
		TenantID:              event.TenantID.String(),
		TransactionID:         event.TransactionID.String(),
		TransactionAmountKobo: event.AmountKobo,
		FeeRate:               cfg.FeeRate,
		FeeCapKobo:            cfg.FeeCapKobo,
		FeeFloorKobo:          cfg.FeeFloorKobo,
		PlatformShare:         cfg.PlatformShare,
		ResellerShare:         cfg.ResellerShare,
		InterchangeCostKobo:   cfg.InterchangeCostKobo,
		PricingModel:          cfg.PricingModel,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/compute-fee", p.billingCoreURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		// Fallback: compute locally if billing-core is unavailable
		p.log.Warn("Billing-core unreachable, using local fallback computation", zap.Error(err))
		return p.computeFeeFallback(event.AmountKobo, cfg), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("billing-core returned %d", resp.StatusCode)
	}

	var result BillingComputeResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode billing-core response: %w", err)
	}
	return &result, nil
}

// computeFeeFallback performs local fee computation when billing-core is unavailable.
func (p *Pipeline) computeFeeFallback(amountKobo int64, cfg *BillingConfig) *BillingComputeResult {
	fee := int64(float64(amountKobo) * cfg.FeeRate)
	capApplied := false
	floorApplied := false

	if cfg.FeeCapKobo > 0 && fee > cfg.FeeCapKobo {
		fee = cfg.FeeCapKobo
		capApplied = true
	}
	if cfg.FeeFloorKobo > 0 && fee < cfg.FeeFloorKobo {
		fee = cfg.FeeFloorKobo
		floorApplied = true
	}

	platformRevenue := int64(float64(fee) * cfg.PlatformShare)
	resellerRevenue := fee - platformRevenue
	netPlatform := platformRevenue - cfg.InterchangeCostKobo

	return &BillingComputeResult{
		FeeKobo:             fee,
		PlatformRevenueKobo: platformRevenue,
		ResellerRevenueKobo: resellerRevenue,
		InterchangeCostKobo: cfg.InterchangeCostKobo,
		NetPlatformKobo:     netPlatform,
		FeeRateApplied:      cfg.FeeRate,
		CapApplied:          capApplied,
		FloorApplied:        floorApplied,
	}
}

// ── Step 4: Persist billing event to PostgreSQL ───────────────────────────────

func (p *Pipeline) persistBillingEvent(
	ctx context.Context,
	billingEventID string,
	event PaymentCompletedEvent,
	cfg *BillingConfig,
	result *BillingComputeResult,
) error {
	// Align with Drizzle schema column names in billing_events table
	_, err := p.db.ExecContext(ctx, `
		INSERT INTO billing_events (
			id, tenant_id, merchant_id, transaction_id,
			amount_kobo, gross_fee_kobo,
			platform_revenue_kobo, reseller_revenue_kobo,
			interchange_cost_kobo, net_platform_revenue_kobo,
			pricing_model, channel, currency,
			occurred_at, created_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6,
			$7, $8,
			$9, $10,
			$11, $12, $13,
			$14, NOW()
		)
		ON CONFLICT (transaction_id) DO NOTHING
	`,
		billingEventID,
		event.TenantID.String(),
		event.MerchantID.String(),
		event.TransactionID.String(),
		event.AmountKobo,
		result.FeeKobo,
		result.PlatformRevenueKobo,
		result.ResellerRevenueKobo,
		result.InterchangeCostKobo,
		result.NetPlatformKobo,
		cfg.PricingModel,
		event.Channel,
		event.Currency,
		event.OccurredAt,
	)
	return err
}

// ── Step 5: Post to TigerBeetle ───────────────────────────────────────────────

// TigerBeetle account ID conventions (deterministic from tenant/event IDs):
//   Platform revenue account:  hash(tenant_id + ":platform")  → account type 1
//   Reseller payable account:  hash(tenant_id + ":reseller")  → account type 2
//   Interchange cost account:  hash(tenant_id + ":interchange") → account type 3
//   Merchant payable account:  hash(merchant_id + ":payable")  → account type 4

type TigerBeetleTransfer struct {
	ID              string `json:"id"`
	DebitAccountID  string `json:"debit_account_id"`
	CreditAccountID string `json:"credit_account_id"`
	Amount          int64  `json:"amount"`
	Ledger          uint32 `json:"ledger"`
	Code            uint16 `json:"code"`
	Flags           uint16 `json:"flags"`
	UserData        string `json:"user_data,omitempty"`
}

func (p *Pipeline) postToTigerBeetle(
	ctx context.Context,
	billingEventID string,
	event PaymentCompletedEvent,
	cfg *BillingConfig,
	result *BillingComputeResult,
) error {
	if p.tbAddress == "" {
		return nil // TigerBeetle not configured — skip
	}

	// Build deterministic account IDs from tenant/merchant UUIDs
	tenantID := event.TenantID.String()
	merchantID := event.MerchantID.String()

	transfers := []TigerBeetleTransfer{
		// 1. Platform revenue: debit merchant payable → credit platform revenue
		{
			ID:              uuid.New().String(),
			DebitAccountID:  deterministicAccountID(merchantID, "payable"),
			CreditAccountID: deterministicAccountID(tenantID, "platform"),
			Amount:          result.PlatformRevenueKobo,
			Ledger:          1,
			Code:            100, // platform_revenue
			UserData:        billingEventID,
		},
		// 2. Reseller payable: debit merchant payable → credit reseller payable
		{
			ID:              uuid.New().String(),
			DebitAccountID:  deterministicAccountID(merchantID, "payable"),
			CreditAccountID: deterministicAccountID(tenantID, "reseller"),
			Amount:          result.ResellerRevenueKobo,
			Ledger:          1,
			Code:            101, // reseller_payable
			UserData:        billingEventID,
		},
	}

	// 3. Interchange cost (if any): debit platform revenue → credit interchange
	if result.InterchangeCostKobo > 0 {
		transfers = append(transfers, TigerBeetleTransfer{
			ID:              uuid.New().String(),
			DebitAccountID:  deterministicAccountID(tenantID, "platform"),
			CreditAccountID: deterministicAccountID(tenantID, "interchange"),
			Amount:          result.InterchangeCostKobo,
			Ledger:          1,
			Code:            102, // interchange_cost
			UserData:        billingEventID,
		})
	}

	// Post to TigerBeetle HTTP API (or gRPC bridge)
	tbURL := fmt.Sprintf("http://%s/transfers", p.tbAddress)
	body, _ := json.Marshal(transfers)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tbURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("tigerbeetle post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("tigerbeetle returned %d", resp.StatusCode)
	}

	p.log.Info("TigerBeetle: ledger entries posted",
		zap.String("billing_event_id", billingEventID),
		zap.Int("transfer_count", len(transfers)),
	)
	return nil
}

// deterministicAccountID generates a stable UUID-like account ID from entity + role.
func deterministicAccountID(entityID, role string) string {
	// Use UUID v5 (SHA-1 namespace) for deterministic account IDs
	ns := uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8") // UUID namespace DNS
	return uuid.NewSHA1(ns, []byte(entityID+":"+role)).String()
}

// ── Step 6: Mark settled ──────────────────────────────────────────────────────

func (p *Pipeline) markSettled(ctx context.Context, billingEventID string) error {
	_, err := p.db.ExecContext(ctx,
		`UPDATE billing_events SET status = 'settled', processed_at = NOW() WHERE id = $1`,
		billingEventID,
	)
	return err
}

// ── Metrics ───────────────────────────────────────────────────────────────────

// GetMetrics returns pipeline health metrics for the health endpoint.
func (p *Pipeline) GetMetrics(ctx context.Context) map[string]interface{} {
	metrics := map[string]interface{}{
		"billing_core_url": p.billingCoreURL,
		"tb_address":       p.tbAddress,
	}

	// Count billing events in last 24h
	var count24h int64
	if err := p.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM billing_events WHERE created_at > NOW() - INTERVAL '24 hours'`,
	).Scan(&count24h); err == nil {
		metrics["events_24h"] = count24h
	}

	// Sum platform revenue in last 24h
	var revenue24h int64
	if err := p.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(platform_revenue_kobo), 0) FROM billing_events WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'settled'`,
	).Scan(&revenue24h); err == nil {
		metrics["platform_revenue_kobo_24h"] = revenue24h
	}

	return metrics
}

// Close releases database resources.
func (p *Pipeline) Close() error {
	return p.db.Close()
}
