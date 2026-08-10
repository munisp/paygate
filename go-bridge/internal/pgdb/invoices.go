package pgdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// InvoiceLineItem holds a single line item in an invoice.
type InvoiceLineItem struct {
	Description   string  `json:"description"`
	Quantity      float64 `json:"quantity"`
	UnitPriceKobo uint64  `json:"unit_price_kobo"`
	TaxPct        float64 `json:"tax_pct"`
	DiscountPct   float64 `json:"discount_pct"`
}

// InvoiceRecord holds an invoice record.
type InvoiceRecord struct {
	InvoiceID      string
	InvoiceNumber  string
	MerchantID     string
	CustomerID     string
	CustomerEmail  string
	CustomerName   string
	LineItems      []InvoiceLineItem
	SubtotalKobo   uint64
	TaxKobo        uint64
	DiscountKobo   uint64
	TotalKobo      uint64
	Currency       string
	Status         string
	DueDate        time.Time
	PaymentURL     string
	PaymentMethods []string
	Notes          string
	AutoRemind     bool
}

// ConsumerTransactionRow holds a consumer transaction record.
type ConsumerTransactionRow struct {
	TransactionID string
	Type          string
	AmountKobo    int64
	Currency      string
	Status        string
	Description   string
	CreatedAt     time.Time
}

// CreateInvoice inserts a new invoice record.
func CreateInvoice(ctx context.Context, rec InvoiceRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	lineItemsJSON, _ := json.Marshal(rec.LineItems)
	paymentMethodsJSON, _ := json.Marshal(rec.PaymentMethods)
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO invoices
		   (invoice_id, invoice_number, merchant_id, customer_id, customer_email, customer_name,
		    line_items, subtotal_kobo, tax_kobo, discount_kobo, total_kobo, currency, status,
		    due_date, payment_url, payment_methods, notes, auto_remind, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.InvoiceID, rec.InvoiceNumber, rec.MerchantID, rec.CustomerID,
		rec.CustomerEmail, rec.CustomerName, string(lineItemsJSON),
		rec.SubtotalKobo, rec.TaxKobo, rec.DiscountKobo, rec.TotalKobo,
		rec.Currency, rec.Status, rec.DueDate, rec.PaymentURL,
		string(paymentMethodsJSON), rec.Notes, rec.AutoRemind,
	)
	if err != nil {
		return fmt.Errorf("CreateInvoice: %w", err)
	}
	return nil
}

// UpdateInvoiceStatus updates the status of an invoice.
func UpdateInvoiceStatus(ctx context.Context, invoiceID, status string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE invoices SET status = ?, updated_at = NOW() WHERE invoice_id = ?`,
		status, invoiceID,
	)
	if err != nil {
		return fmt.Errorf("UpdateInvoiceStatus: %w", err)
	}
	return nil
}

// GetConsumerBalance returns the current balance of a consumer wallet.
func GetConsumerBalance(ctx context.Context, customerID string) (int64, error) {
	db := Get()
	if db == nil {
		return 0, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT COALESCE(balance_kobo, 0) FROM consumer_wallets WHERE customer_id = ? LIMIT 1`,
		customerID,
	)
	var balance int64
	if err := row.Scan(&balance); err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, fmt.Errorf("GetConsumerBalance: %w", err)
	}
	return balance, nil
}

// GetConsumerTransactionHistory returns recent transactions for a consumer.
func GetConsumerTransactionHistory(ctx context.Context, customerID, merchantID string, limit int) ([]ConsumerTransactionRow, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	rows, err := db.db.QueryContext(ctx,
		`SELECT transaction_id, type, amount_kobo, currency, status, description, created_at
		   FROM consumer_transactions
		   WHERE customer_id = ? AND merchant_id = ?
		   ORDER BY created_at DESC LIMIT ?`,
		customerID, merchantID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetConsumerTransactionHistory: %w", err)
	}
	defer rows.Close()
	var txns []ConsumerTransactionRow
	for rows.Next() {
		var t ConsumerTransactionRow
		if err := rows.Scan(&t.TransactionID, &t.Type, &t.AmountKobo, &t.Currency, &t.Status, &t.Description, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("GetConsumerTransactionHistory scan: %w", err)
		}
		txns = append(txns, t)
	}
	return txns, nil
}

// ComputeCreditScore computes a simple credit score for a consumer.
// In production, this would call a credit bureau or ML model.
func ComputeCreditScore(ctx context.Context, customerID string) (int, error) {
	db := Get()
	if db == nil {
		return 500, nil // Default score when DB not available
	}
	// Count successful transactions in last 90 days
	row := db.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM consumer_transactions
		   WHERE customer_id = ? AND status = 'completed'
		     AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
		customerID,
	)
	var txnCount int
	if err := row.Scan(&txnCount); err != nil {
		return 500, nil
	}
	// Simple scoring: base 400 + up to 300 from transaction history
	score := 400 + min(txnCount*3, 300)
	return score, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// GetInvoice fetches an invoice by ID.
func GetInvoice(ctx context.Context, invoiceID string) (*InvoiceRecord, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT invoice_id, invoice_number, merchant_id, customer_id, customer_email, customer_name,
		        subtotal_kobo, tax_kobo, discount_kobo, total_kobo, currency, status, due_date,
		        payment_url, notes, auto_remind
		   FROM invoices WHERE invoice_id = ? LIMIT 1`,
		invoiceID,
	)
	var rec InvoiceRecord
	if err := row.Scan(
		&rec.InvoiceID, &rec.InvoiceNumber, &rec.MerchantID, &rec.CustomerID,
		&rec.CustomerEmail, &rec.CustomerName,
		&rec.SubtotalKobo, &rec.TaxKobo, &rec.DiscountKobo, &rec.TotalKobo,
		&rec.Currency, &rec.Status, &rec.DueDate, &rec.PaymentURL, &rec.Notes, &rec.AutoRemind,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("invoice %s not found", invoiceID)
		}
		return nil, fmt.Errorf("GetInvoice: %w", err)
	}
	return &rec, nil
}

// ListMerchantInvoices returns paginated invoices for a merchant.
func ListMerchantInvoices(ctx context.Context, merchantID, status string, limit int) ([]InvoiceRecord, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	query := `SELECT invoice_id, invoice_number, merchant_id, customer_id, customer_email, customer_name,
		        subtotal_kobo, tax_kobo, discount_kobo, total_kobo, currency, status, due_date,
		        payment_url, notes, auto_remind
		   FROM invoices WHERE merchant_id = ?`
	args := []interface{}{merchantID}
	if status != "" {
		query += " AND status = ?"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)
	rows, err := db.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("ListMerchantInvoices: %w", err)
	}
	defer rows.Close()
	var invoices []InvoiceRecord
	for rows.Next() {
		var rec InvoiceRecord
		if err := rows.Scan(
			&rec.InvoiceID, &rec.InvoiceNumber, &rec.MerchantID, &rec.CustomerID,
			&rec.CustomerEmail, &rec.CustomerName,
			&rec.SubtotalKobo, &rec.TaxKobo, &rec.DiscountKobo, &rec.TotalKobo,
			&rec.Currency, &rec.Status, &rec.DueDate, &rec.PaymentURL, &rec.Notes, &rec.AutoRemind,
		); err != nil {
			return nil, fmt.Errorf("ListMerchantInvoices scan: %w", err)
		}
		invoices = append(invoices, rec)
	}
	return invoices, nil
}

// InvoicePaymentRecord holds a payment against an invoice.
type InvoicePaymentRecord struct {
	PaymentID     string
	InvoiceID     string
	AmountKobo    uint64
	PayerID       string
	Reference     string
	PaymentMethod string
	TransferID    string
}

// RecordInvoicePaymentRecord inserts an invoice payment record.
func RecordInvoicePaymentRecord(ctx context.Context, rec InvoicePaymentRecord) {
	db := Get()
	if db == nil {
		return
	}
	_, _ = db.db.ExecContext(ctx,
		`INSERT INTO invoice_payments
		   (payment_id, invoice_id, amount_kobo, payer_id, reference, payment_method, transfer_id, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.PaymentID, rec.InvoiceID, rec.AmountKobo, rec.PayerID,
		rec.Reference, rec.PaymentMethod, rec.TransferID,
	)
}
