// tier1to5_recon_invoice_chargeback.go — Tier 2 routes proxied from
// server/tier1to5Router.ts: /reconciliation/*, /invoices/*, /chargebacks/*.
package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// ─── Reconciliation ───────────────────────────────────────────────────────────

// T5RunReconciliation handles POST /reconciliation/run. Aggregates completed
// transactions vs completed settlements over the period, persists the report
// (reconciliation_runs) and opens reconciliation_alerts rows for any delta.
func T5RunReconciliation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID  string   `json:"merchant_id"`
		PeriodStart string   `json:"period_start"`
		PeriodEnd   string   `json:"period_end"`
		Sources     []string `json:"sources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.PeriodStart == "" || req.PeriodEnd == "" {
		respondError(w, http.StatusBadRequest, "merchant_id, period_start and period_end are required")
		return
	}
	if _, err := time.Parse("2006-01-02", req.PeriodStart); err != nil {
		respondError(w, http.StatusBadRequest, "period_start must be YYYY-MM-DD")
		return
	}
	if _, err := time.Parse("2006-01-02", req.PeriodEnd); err != nil {
		respondError(w, http.StatusBadRequest, "period_end must be YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	reportID := uuid.New().String()

	sums, err := db.T5ReconSums(ctx, req.MerchantID, req.PeriodStart, req.PeriodEnd)
	if err != nil {
		slog.Error("t5 recon: aggregation failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to aggregate reconciliation data")
		return
	}
	txTotal, _ := parseInt64Loose(sums["tx_total_kobo"])
	stTotal, _ := parseInt64Loose(sums["settlement_total_kobo"])
	txCount, _ := parseInt64Loose(sums["tx_count"])
	stCount, _ := parseInt64Loose(sums["settlement_count"])
	delta := txTotal - stTotal

	summary := map[string]interface{}{
		"tx_count":              txCount,
		"tx_total_kobo":         txTotal,
		"settlement_count":      stCount,
		"settlement_total_kobo": stTotal,
		"delta_kobo":            delta,
	}
	if err := db.T5CreateReconRun(ctx, reportID, req.MerchantID, req.PeriodStart, req.PeriodEnd, req.Sources, "completed", summary); err != nil {
		slog.Error("t5 recon: persist run failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist reconciliation report")
		return
	}

	discrepanciesOpened := 0
	if delta != 0 {
		notes := fmt.Sprintf("recon run %s: transactions total %d kobo vs settlements total %d kobo", reportID, txTotal, stTotal)
		if err := db.T5CreateReconAlert(ctx, req.MerchantID, "NGN", txTotal, stTotal, delta, notes); err != nil {
			slog.Error("t5 recon: persist alert failed", "err", err)
			respondError(w, http.StatusInternalServerError, "failed to persist reconciliation discrepancy")
			return
		}
		discrepanciesOpened = 1
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.reconciliation",
		Key:   reportID,
		Value: map[string]interface{}{
			"event_type":  "reconciliation.run_completed",
			"report_id":   reportID,
			"merchant_id": req.MerchantID,
			"delta_kobo":  delta,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"report_id":            reportID,
		"merchant_id":          req.MerchantID,
		"period_start":         req.PeriodStart,
		"period_end":           req.PeriodEnd,
		"status":               "completed",
		"summary":              summary,
		"discrepancies_opened": discrepanciesOpened,
	})
}

// T5GetReconReport handles GET /reconciliation/report?report_id=&merchant_id=
func T5GetReconReport(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	reportID, merchantID := q.Get("report_id"), q.Get("merchant_id")
	if reportID == "" || merchantID == "" {
		respondError(w, http.StatusBadRequest, "report_id and merchant_id are required")
		return
	}
	report, err := pgdb.Get().T5GetReconRun(r.Context(), reportID, merchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "report not found")
		return
	}
	if err != nil {
		slog.Error("t5 recon: fetch report failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch report")
		return
	}
	report["summary"] = jsonString(report["summary"])
	report["sources"] = jsonString(report["sources"])
	respondJSON(w, http.StatusOK, map[string]interface{}{"report": report})
}

// T5GetDiscrepancies handles GET /reconciliation/discrepancies?merchant_id=&status=&limit=
func T5GetDiscrepancies(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	merchantID := q.Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	limit := parseIntQuery(r, "limit", 50)
	rows, err := pgdb.Get().T5ListReconDiscrepancies(r.Context(), merchantID, q.Get("status"), limit)
	if err != nil {
		slog.Error("t5 recon: list discrepancies failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list discrepancies")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"discrepancies": rows})
}

// T5ResolveDiscrepancy handles POST /reconciliation/resolve.
func T5ResolveDiscrepancy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DiscrepancyID string `json:"discrepancy_id"`
		MerchantID    string `json:"merchant_id"`
		Resolution    string `json:"resolution"`
		Notes         string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DiscrepancyID == "" || req.MerchantID == "" || req.Resolution == "" {
		respondError(w, http.StatusBadRequest, "discrepancy_id, merchant_id and resolution are required")
		return
	}
	n, err := pgdb.Get().T5ResolveReconDiscrepancy(r.Context(), req.MerchantID, req.DiscrepancyID, req.Resolution, req.Notes)
	if err != nil {
		slog.Error("t5 recon: resolve failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to resolve discrepancy")
		return
	}
	if n == 0 {
		respondError(w, http.StatusNotFound, "discrepancy not found or already resolved")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.reconciliation",
		Key:   req.DiscrepancyID,
		Value: map[string]interface{}{
			"event_type":     "reconciliation.discrepancy_resolved",
			"discrepancy_id": req.DiscrepancyID,
			"merchant_id":    req.MerchantID,
			"resolution":     req.Resolution,
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"discrepancy_id": req.DiscrepancyID,
		"status":         "resolved",
		"resolved_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

type t5InvoiceLineItem struct {
	Description   string  `json:"description"`
	Quantity      float64 `json:"quantity"`
	UnitPriceKobo int64   `json:"unitPriceKobo"`
	TaxPct        float64 `json:"taxPct"`
	DiscountPct   float64 `json:"discountPct"`
}

// T5CreateInvoice handles POST /invoices/create.
func T5CreateInvoice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID     string              `json:"merchant_id"`
		CustomerID     string              `json:"customer_id"`
		CustomerEmail  string              `json:"customer_email"`
		CustomerName   string              `json:"customer_name"`
		LineItems      []t5InvoiceLineItem `json:"line_items"`
		Currency       string              `json:"currency"`
		DueDays        int                 `json:"due_days"`
		Notes          string              `json:"notes"`
		PaymentMethods []string            `json:"payment_methods"`
		AutoRemind     bool                `json:"auto_remind"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.CustomerEmail == "" || len(req.LineItems) == 0 {
		respondError(w, http.StatusBadRequest, "merchant_id, customer_email and line_items are required")
		return
	}
	if req.DueDays < 1 {
		req.DueDays = 30
	}
	currency := firstNonEmpty(req.Currency, "NGN")

	var subtotal, tax int64
	for _, li := range req.LineItems {
		if li.Quantity <= 0 || li.UnitPriceKobo <= 0 {
			respondError(w, http.StatusBadRequest, "line items require quantity>0 and unitPriceKobo>0")
			return
		}
		line := int64(li.Quantity * float64(li.UnitPriceKobo))
		line -= int64(float64(line) * li.DiscountPct / 100.0)
		subtotal += line
		tax += int64(float64(line) * li.TaxPct / 100.0)
	}
	total := subtotal + tax

	invoiceID := uuid.New().String()
	dueDate := time.Now().UTC().AddDate(0, 0, req.DueDays).Format("2006-01-02")
	if err := pgdb.Get().T5CreateInvoice(r.Context(), invoiceID, req.MerchantID, req.CustomerID,
		req.CustomerEmail, req.CustomerName, req.LineItems, subtotal, tax, total, currency, dueDate, req.Notes); err != nil {
		slog.Error("t5 invoices: create failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to create invoice")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.invoices",
		Key:   invoiceID,
		Value: map[string]interface{}{
			"event_type":  "invoice.created",
			"invoice_id":  invoiceID,
			"merchant_id": req.MerchantID,
			"total_kobo":  total,
			"currency":    currency,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"invoice_id":    invoiceID,
		"merchant_id":   req.MerchantID,
		"status":        "draft",
		"subtotal_kobo": subtotal,
		"tax_kobo":      tax,
		"total_kobo":    total,
		"currency":      currency,
		"due_date":      dueDate,
		"auto_remind":   req.AutoRemind,
		"created_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// T5SendInvoice handles POST /invoices/send.
func T5SendInvoice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InvoiceID  string `json:"invoice_id"`
		MerchantID string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.InvoiceID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "invoice_id and merchant_id are required")
		return
	}
	payLink := fmt.Sprintf("https://pay.paygate.local/i/%s", req.InvoiceID)
	n, err := pgdb.Get().T5UpdateInvoiceStatus(r.Context(), req.InvoiceID, req.MerchantID, "draft", "sent", payLink)
	if err != nil {
		slog.Error("t5 invoices: send failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to send invoice")
		return
	}
	if n == 0 {
		respondError(w, http.StatusConflict, "invoice not found in draft state for this merchant")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.invoices",
		Key:   req.InvoiceID,
		Value: map[string]interface{}{
			"event_type":       "invoice.sent",
			"invoice_id":       req.InvoiceID,
			"merchant_id":      req.MerchantID,
			"payment_link_url": payLink,
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"invoice_id":       req.InvoiceID,
		"status":           "sent",
		"payment_link_url": payLink,
		"sent_at":          time.Now().UTC().Format(time.RFC3339),
	})
}

// T5ListInvoices handles GET /invoices/list?merchant_id=&status=&limit=
func T5ListInvoices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	merchantID := q.Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	limit := parseIntQuery(r, "limit", 50)
	invoices, err := pgdb.Get().T5ListInvoices(r.Context(), merchantID, q.Get("status"), limit)
	if err != nil {
		slog.Error("t5 invoices: list failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list invoices")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"invoices": invoices})
}

// T5GetInvoice handles GET /invoices/get?invoice_id=&merchant_id=
func T5GetInvoice(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	invoiceID, merchantID := q.Get("invoice_id"), q.Get("merchant_id")
	if invoiceID == "" || merchantID == "" {
		respondError(w, http.StatusBadRequest, "invoice_id and merchant_id are required")
		return
	}
	inv, err := pgdb.Get().T5GetInvoice(r.Context(), invoiceID, merchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "invoice not found")
		return
	}
	if err != nil {
		slog.Error("t5 invoices: get failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch invoice")
		return
	}
	inv["line_items"] = jsonString(inv["line_items"])
	respondJSON(w, http.StatusOK, map[string]interface{}{"invoice": inv})
}

// T5CancelInvoice handles POST /invoices/cancel.
func T5CancelInvoice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InvoiceID  string `json:"invoice_id"`
		MerchantID string `json:"merchant_id"`
		Reason     string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.InvoiceID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "invoice_id and merchant_id are required")
		return
	}
	// Cancellable from draft or sent.
	n, err := pgdb.Get().T5UpdateInvoiceStatus(r.Context(), req.InvoiceID, req.MerchantID, "draft", "cancelled", "")
	if err == nil && n == 0 {
		n, err = pgdb.Get().T5UpdateInvoiceStatus(r.Context(), req.InvoiceID, req.MerchantID, "sent", "cancelled", "")
	}
	if err != nil {
		slog.Error("t5 invoices: cancel failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to cancel invoice")
		return
	}
	if n == 0 {
		respondError(w, http.StatusConflict, "invoice not found in a cancellable state")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.invoices",
		Key:   req.InvoiceID,
		Value: map[string]interface{}{
			"event_type":  "invoice.cancelled",
			"invoice_id":  req.InvoiceID,
			"merchant_id": req.MerchantID,
			"reason":      req.Reason,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"invoice_id":   req.InvoiceID,
		"status":       "cancelled",
		"cancelled_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Chargebacks ──────────────────────────────────────────────────────────────

// T5ListChargebacks handles GET /chargebacks/list?merchant_id=&status=
func T5ListChargebacks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	merchantID := q.Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	rows, err := pgdb.Get().T5ListChargebacks(r.Context(), merchantID, q.Get("status"))
	if err != nil {
		slog.Error("t5 chargebacks: list failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list chargebacks")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"chargebacks": rows})
}

// T5SubmitChargebackEvidence handles POST /chargebacks/evidence.
func T5SubmitChargebackEvidence(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChargebackID string `json:"chargeback_id"`
		MerchantID   string `json:"merchant_id"`
		EvidenceType string `json:"evidence_type"`
		EvidenceURL  string `json:"evidence_url"`
		Description  string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ChargebackID == "" || req.MerchantID == "" || req.EvidenceURL == "" {
		respondError(w, http.StatusBadRequest, "chargeback_id, merchant_id and evidence_url are required")
		return
	}
	evidence := toJSONString(map[string]interface{}{
		"type":         req.EvidenceType,
		"url":          req.EvidenceURL,
		"description":  req.Description,
		"submitted_at": time.Now().UTC().Format(time.RFC3339),
	})
	n, err := pgdb.Get().T5SubmitChargebackEvidence(r.Context(), req.ChargebackID, req.MerchantID, evidence, req.EvidenceURL)
	if err != nil {
		slog.Error("t5 chargebacks: evidence failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to submit evidence")
		return
	}
	if n == 0 {
		respondError(w, http.StatusNotFound, "chargeback not found or not in an open state")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.chargebacks",
		Key:   req.ChargebackID,
		Value: map[string]interface{}{
			"event_type":    "chargeback.evidence_submitted",
			"chargeback_id": req.ChargebackID,
			"merchant_id":   req.MerchantID,
			"evidence_type": req.EvidenceType,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"chargeback_id": req.ChargebackID,
		"status":        "evidence_submitted",
		"submitted_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// T5AutoCollectEvidence handles POST /chargebacks/auto-evidence. Compiles an
// evidence package from persisted chargeback + transaction data and submits it.
func T5AutoCollectEvidence(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChargebackID string `json:"chargeback_id"`
		MerchantID   string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ChargebackID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "chargeback_id and merchant_id are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	cb, err := db.T5GetChargeback(ctx, req.ChargebackID, req.MerchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "chargeback not found")
		return
	}
	if err != nil {
		slog.Error("t5 chargebacks: fetch failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch chargeback")
		return
	}

	// Compile evidence from the persisted chargeback record.
	evidencePkg := map[string]interface{}{
		"type":           "auto_compiled",
		"chargeback_id":  req.ChargebackID,
		"transaction_id": cb["transaction_id"],
		"amount_kobo":    cb["amount_kobo"],
		"currency":       cb["currency"],
		"reason":         cb["reason"],
		"compiled_at":    time.Now().UTC().Format(time.RFC3339),
	}
	evidence := toJSONString(evidencePkg)
	evidenceURL := fmt.Sprintf("paygate://evidence/%s/auto", req.ChargebackID)

	n, err := db.T5SubmitChargebackEvidence(ctx, req.ChargebackID, req.MerchantID, evidence, evidenceURL)
	if err != nil {
		slog.Error("t5 chargebacks: auto-evidence persist failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist auto-collected evidence")
		return
	}
	if n == 0 {
		respondError(w, http.StatusConflict, "chargeback not in an open state")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.chargebacks",
		Key:   req.ChargebackID,
		Value: map[string]interface{}{
			"event_type":    "chargeback.auto_evidence_submitted",
			"chargeback_id": req.ChargebackID,
			"merchant_id":   req.MerchantID,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"chargeback_id": req.ChargebackID,
		"status":        "evidence_submitted",
		"evidence":      evidencePkg,
		"evidence_url":  evidenceURL,
	})
}

func toJSONString(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
