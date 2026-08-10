package pgdb

import (
	"context"
	"database/sql"
	"fmt"
)

// DCCTransactionRecord holds a DCC (Dynamic Currency Conversion) transaction.
type DCCTransactionRecord struct {
	DCCTXID          string
	QuoteID          string
	MerchantID       string
	CustomerID       string
	FromCurrency     string
	ToCurrency       string
	MidRate          float64
	CustomerRate     float64
	MarginPct        float64
	SourceAmountKobo uint64
	TargetAmountKobo uint64
	Reference        string
	TransferID       string
}

// DCCMarginConfig holds a merchant's DCC margin configuration.
type DCCMarginConfig struct {
	MerchantID  string
	CurrencyPair string
	MarginPct   float64
}

// FXRateRow holds an FX rate record.
type FXRateRow struct {
	FromCurrency string
	ToCurrency   string
	MidRate      float64
	BidRate      float64
	AskRate      float64
}

// GetLatestFXRate fetches the most recent FX rate for a currency pair.
func GetLatestFXRate(ctx context.Context, fromCurrency, toCurrency string) (*FXRateRow, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT from_currency, to_currency, mid_rate, bid_rate, ask_rate
		   FROM fx_rates WHERE from_currency = ? AND to_currency = ?
		   ORDER BY created_at DESC LIMIT 1`,
		fromCurrency, toCurrency,
	)
	var r FXRateRow
	if err := row.Scan(&r.FromCurrency, &r.ToCurrency, &r.MidRate, &r.BidRate, &r.AskRate); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no FX rate for %s/%s", fromCurrency, toCurrency)
		}
		return nil, fmt.Errorf("GetLatestFXRate: %w", err)
	}
	return &r, nil
}

// GetDCCMarginConfig fetches a merchant's DCC margin config for a currency pair.
func GetDCCMarginConfig(ctx context.Context, merchantID, currencyPair string) (*DCCMarginConfig, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT merchant_id, currency_pair, margin_pct
		   FROM dcc_margin_configs WHERE merchant_id = ? AND currency_pair = ? LIMIT 1`,
		merchantID, currencyPair,
	)
	var c DCCMarginConfig
	if err := row.Scan(&c.MerchantID, &c.CurrencyPair, &c.MarginPct); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no DCC margin config for %s/%s", merchantID, currencyPair)
		}
		return nil, fmt.Errorf("GetDCCMarginConfig: %w", err)
	}
	return &c, nil
}

// GetAllDCCMarginConfigs fetches all DCC margin configs for a merchant.
func GetAllDCCMarginConfigs(ctx context.Context, merchantID string) ([]DCCMarginConfig, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	rows, err := db.db.QueryContext(ctx,
		`SELECT merchant_id, currency_pair, margin_pct
		   FROM dcc_margin_configs WHERE merchant_id = ?`,
		merchantID,
	)
	if err != nil {
		return nil, fmt.Errorf("GetAllDCCMarginConfigs: %w", err)
	}
	defer rows.Close()
	var configs []DCCMarginConfig
	for rows.Next() {
		var c DCCMarginConfig
		if err := rows.Scan(&c.MerchantID, &c.CurrencyPair, &c.MarginPct); err != nil {
			return nil, fmt.Errorf("GetAllDCCMarginConfigs scan: %w", err)
		}
		configs = append(configs, c)
	}
	return configs, nil
}

// UpsertDCCMarginConfig creates or updates a DCC margin config.
func UpsertDCCMarginConfig(ctx context.Context, merchantID, currencyPair string, marginPct float64) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO dcc_margin_configs (merchant_id, currency_pair, margin_pct, created_at, updated_at)
		   VALUES (?, ?, ?, NOW(), NOW())
		   ON DUPLICATE KEY UPDATE margin_pct = ?, updated_at = NOW()`,
		merchantID, currencyPair, marginPct, marginPct,
	)
	if err != nil {
		return fmt.Errorf("UpsertDCCMarginConfig: %w", err)
	}
	return nil
}

// RecordDCCTransaction inserts a DCC transaction record.
func RecordDCCTransaction(ctx context.Context, rec DCCTransactionRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO dcc_transactions
		   (dcc_tx_id, quote_id, merchant_id, customer_id, from_currency, to_currency,
		    mid_rate, customer_rate, margin_pct, source_amount_kobo, target_amount_kobo,
		    reference, transfer_id, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.DCCTXID, rec.QuoteID, rec.MerchantID, rec.CustomerID,
		rec.FromCurrency, rec.ToCurrency, rec.MidRate, rec.CustomerRate,
		rec.MarginPct, rec.SourceAmountKobo, rec.TargetAmountKobo,
		rec.Reference, rec.TransferID,
	)
	if err != nil {
		return fmt.Errorf("RecordDCCTransaction: %w", err)
	}
	return nil
}
