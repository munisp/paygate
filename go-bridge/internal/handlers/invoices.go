// Package handlers — Smart Invoice & Payment Request Builder
// Full invoice lifecycle: create, send, track, remind, and settle.
// Uses Dapr pub/sub for event broadcasting and TigerBeetle for settlement.
package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/dapr"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceLineItem struct {
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	UnitPriceKobo uint64 `json:"unit_price_kobo"`
	TaxPct      float64 `json:"tax_pct"`
	DiscountPct float64 `json:"discount_pct"`
}

type CreateInvoiceRequest struct {
	MerchantID    string            `json:"merchant_id"`
	CustomerID    string            `json:"customer_id"`
	CustomerEmail string            `json:"customer_email"`
	CustomerName  string            `json:"customer_name"`
	LineItems     []InvoiceLineItem `json:"line_items"`
	Currency      string            `json:"currency"`
	DueDays       int               `json:"due_days"` // days until due (default 30)
	Notes         string            `json:"notes"`
	PaymentMethods []string         `json:"payment_methods"` // ["card","bank_transfer","ussd","wallet"]
	AutoRemind    bool              `json:"auto_remind"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

type InvoiceResponse struct {
	InvoiceID     string            `json:"invoice_id"`
	InvoiceNumber string            `json:"invoice_number"`
	MerchantID    string            `json:"merchant_id"`
	CustomerID    string            `json:"customer_id"`
	CustomerEmail string            `json:"customer_email"`
	CustomerName  string            `json:"customer_name"`
	LineItems     []InvoiceLineItem `json:"line_items"`
	SubtotalKobo  uint64            `json:"subtotal_kobo"`
	TaxKobo       uint64            `json:"tax_kobo"`
	DiscountKobo  uint64            `json:"discount_kobo"`
	TotalKobo     uint64            `json:"total_kobo"`
	Currency      string            `json:"currency"`
	Status        string            `json:"status"`
	DueDate       string            `json:"due_date"`
	PaymentURL    string            `json:"payment_url"`
	CreatedAt     string            `json:"created_at"`
}

type RecordInvoicePaymentRequest struct {
	InvoiceID   string `json:"invoice_id"`
	AmountKobo  uint64 `json:"amount_kobo"`
	PayerID     string `json:"payer_id"`
	Reference   string `json:"reference"`
	PaymentMethod string `json:"payment_method"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// CreateInvoice creates a new invoice and publishes it via Dapr.
func CreateInvoice(w http.ResponseWriter, r *http.Request) {
	var req CreateInvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if len(req.LineItems) == 0 {
		http.Error(w, `{"error":"at least one line item is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Calculate totals
	var subtotal, taxTotal, discountTotal uint64
	for _, item := range req.LineItems {
		lineTotal := uint64(float64(item.UnitPriceKobo) * item.Quantity)
		discount := uint64(float64(lineTotal) * item.DiscountPct / 100.0)
		taxable := lineTotal - discount
		tax := uint64(float64(taxable) * item.TaxPct / 100.0)
		subtotal += lineTotal
		discountTotal += discount
		taxTotal += tax
	}
	totalKobo := subtotal - discountTotal + taxTotal

	dueDays := req.DueDays
	if dueDays <= 0 {
		dueDays = 30
	}

	invoiceID := uuid.New().String()
	invoiceNumber := generateInvoiceNumber()
	dueDate := time.Now().UTC().AddDate(0, 0, dueDays)
	paymentURL := fmt.Sprintf("%s/pay/invoice/%s", getPortalBaseURL(), invoiceID)

	if len(req.Currency) == 0 {
		req.Currency = "NGN"
	}

	record := pgdb.InvoiceRecord{
		InvoiceID:      invoiceID,
		InvoiceNumber:  invoiceNumber,
		MerchantID:     req.MerchantID,
		CustomerID:     req.CustomerID,
		CustomerEmail:  req.CustomerEmail,
		CustomerName:   req.CustomerName,
		LineItems:      func() []pgdb.InvoiceLineItem {
			items := make([]pgdb.InvoiceLineItem, len(req.LineItems))
			for i, li := range req.LineItems {
				items[i] = pgdb.InvoiceLineItem{
					Description:   li.Description,
					Quantity:      li.Quantity,
					UnitPriceKobo: li.UnitPriceKobo,
					TaxPct:        li.TaxPct,
					DiscountPct:   li.DiscountPct,
				}
			}
			return items
		}(),
		SubtotalKobo:   subtotal,
		TaxKobo:        taxTotal,
		DiscountKobo:   discountTotal,
		TotalKobo:      totalKobo,
		Currency:       req.Currency,
		Status:         "draft",
		DueDate:        dueDate,
		PaymentURL:     paymentURL,
		PaymentMethods: req.PaymentMethods,
		Notes:          req.Notes,
		AutoRemind:     req.AutoRemind,
	}

	if err := pgdb.CreateInvoice(ctx, record); err != nil {
		slog.Error("failed to create invoice", "err", err)
		http.Error(w, `{"error":"failed to create invoice"}`, http.StatusInternalServerError)
		return
	}

	// Publish via Dapr pub/sub
	dapr.Publish("paygate-pubsub", "invoices", map[string]interface{}{
		"event_type":     "invoice.created",
		"invoice_id":     invoiceID,
		"invoice_number": invoiceNumber,
		"merchant_id":    req.MerchantID,
		"customer_id":    req.CustomerID,
		"customer_email": req.CustomerEmail,
		"total_kobo":     totalKobo,
		"currency":       req.Currency,
		"due_date":       dueDate.Format(time.RFC3339),
		"payment_url":    paymentURL,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})

	// Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.invoices",
		Key:   invoiceID,
		Value: map[string]interface{}{
			"event_type":  "invoice.created",
			"invoice_id":  invoiceID,
			"merchant_id": req.MerchantID,
			"total_kobo":  totalKobo,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("invoice created",
		"invoice_id", invoiceID,
		"merchant_id", req.MerchantID,
		"total_kobo", totalKobo,
	)

	resp := InvoiceResponse{
		InvoiceID:     invoiceID,
		InvoiceNumber: invoiceNumber,
		MerchantID:    req.MerchantID,
		CustomerID:    req.CustomerID,
		CustomerEmail: req.CustomerEmail,
		CustomerName:  req.CustomerName,
		LineItems:     req.LineItems,
		SubtotalKobo:  subtotal,
		TaxKobo:       taxTotal,
		DiscountKobo:  discountTotal,
		TotalKobo:     totalKobo,
		Currency:      req.Currency,
		Status:        "draft",
		DueDate:       dueDate.Format(time.RFC3339),
		PaymentURL:    paymentURL,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// SendInvoice transitions an invoice from draft to sent and notifies the customer.
func SendInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceID := r.URL.Query().Get("invoice_id")
	if invoiceID == "" {
		http.Error(w, `{"error":"invoice_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if err := pgdb.UpdateInvoiceStatus(ctx, invoiceID, "sent"); err != nil {
		http.Error(w, `{"error":"failed to send invoice"}`, http.StatusInternalServerError)
		return
	}

	invoice, _ := pgdb.GetInvoice(ctx, invoiceID)

	// Publish send event via Dapr
	dapr.Publish("paygate-pubsub", "invoices", map[string]interface{}{
		"event_type":     "invoice.sent",
		"invoice_id":     invoiceID,
		"customer_email": invoice.CustomerEmail,
		"payment_url":    invoice.PaymentURL,
		"total_kobo":     invoice.TotalKobo,
		"due_date":       invoice.DueDate.Format(time.RFC3339),
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"invoice_id": invoiceID,
		"status":     "sent",
		"sent_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// RecordInvoicePayment records a payment against an invoice and settles via TigerBeetle.
func RecordInvoicePayment(w http.ResponseWriter, r *http.Request) {
	var req RecordInvoicePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	invoice, err := pgdb.GetInvoice(ctx, req.InvoiceID)
	if err != nil {
		http.Error(w, `{"error":"invoice not found"}`, http.StatusNotFound)
		return
	}
	if invoice.Status == "paid" {
		http.Error(w, `{"error":"invoice already paid"}`, http.StatusConflict)
		return
	}

	// TigerBeetle settlement
	payerAccountID := tb.CustomerAccountID(req.PayerID)
	merchantAccountID := tb.MerchantAccountID(invoice.MerchantID)
	paymentID := uuid.New()
	tbPaymentID, _ := tb.UUIDToUint128(paymentID.String())

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbPaymentID,
		DebitAccountID:  payerAccountID,
		CreditAccountID: merchantAccountID,
		Amount:          req.AmountKobo,
		Code:            uint16(70), // CodeInvoicePayment
		Ledger:          1,
		UserData128:     tbPaymentID,
	}); err != nil {
		slog.Error("invoice payment TigerBeetle transfer failed", "invoice_id", req.InvoiceID, "err", err)
		http.Error(w, `{"error":"payment execution failed"}`, http.StatusInternalServerError)
		return
	}

	// Determine new status
	newStatus := "partially_paid"
	if req.AmountKobo >= invoice.TotalKobo {
		newStatus = "paid"
	}

	pgdb.UpdateInvoiceStatus(ctx, req.InvoiceID, newStatus)
	pgdb.RecordInvoicePaymentRecord(ctx, pgdb.InvoicePaymentRecord{
		PaymentID:     paymentID.String(),
		InvoiceID:     req.InvoiceID,
		AmountKobo:    req.AmountKobo,
		PayerID:       req.PayerID,
		Reference:     req.Reference,
		PaymentMethod: req.PaymentMethod,
		TransferID:    paymentID.String(),
	})

	// Publish payment event
	dapr.Publish("paygate-pubsub", "invoices", map[string]interface{}{
		"event_type":  "invoice.payment.received",
		"invoice_id":  req.InvoiceID,
		"amount_kobo": req.AmountKobo,
		"status":      newStatus,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"invoice_id":  req.InvoiceID,
		"payment_id":  paymentID.String(),
		"amount_kobo": req.AmountKobo,
		"status":      newStatus,
		"paid_at":     time.Now().UTC().Format(time.RFC3339),
	})
}

// GetInvoice returns a single invoice by ID.
func GetInvoice(w http.ResponseWriter, r *http.Request) {
	invoiceID := r.URL.Query().Get("invoice_id")
	if invoiceID == "" {
		http.Error(w, `{"error":"invoice_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	invoice, err := pgdb.GetInvoice(ctx, invoiceID)
	if err != nil {
		http.Error(w, `{"error":"invoice not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invoice)
}

// ListMerchantInvoices returns paginated invoices for a merchant.
func ListMerchantInvoices(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	status := r.URL.Query().Get("status")
	if merchantID == "" {
		http.Error(w, `{"error":"merchant_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	invoices, err := pgdb.ListMerchantInvoices(ctx, merchantID, status, 50)
	if err != nil {
		http.Error(w, `{"error":"failed to list invoices"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"merchant_id": merchantID,
		"invoices":    invoices,
		"count":       len(invoices),
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

var invoiceCounter int64 = 100000

func generateInvoiceNumber() string {
	invoiceCounter++
	return fmt.Sprintf("INV-%d-%06d", time.Now().Year(), invoiceCounter)
}

func getPortalBaseURL() string {
	url := os.Getenv("MERCHANT_PORTAL_URL")
	if url == "" {
		return "https://merchant.paygate.ng"
	}
	return url
}
