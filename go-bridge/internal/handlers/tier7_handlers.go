package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// ─── Escrow Service ─────────────────────────────────────────────────────────────

func CreateEscrow(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	escrowID := fmt.Sprintf("ESC-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"escrowId":        escrowID,
		"status":          "pending_funding",
		"amountKobo":      req["amountKobo"],
		"buyerId":         req["buyerId"],
		"sellerId":        req["sellerId"],
		"releaseTrigger":  req["releaseTrigger"],
		"expiryDate":      time.Now().AddDate(0, 0, 30).Format("2006-01-02"),
		"tigerBeetleAcct": fmt.Sprintf("TB-ESC-%s", escrowID),
		"kafkaEvent":      "escrow.created",
	})
}

func FundEscrow(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"escrowId":     req["escrowId"],
		"status":       "funded",
		"fundedAt":     time.Now().Format(time.RFC3339),
		"txReference":  fmt.Sprintf("FUND-%d", time.Now().UnixNano()%1000000),
	})
}

func ReleaseEscrow(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"escrowId":    req["escrowId"],
		"status":      "released",
		"releasedAt":  time.Now().Format(time.RFC3339),
		"payoutRef":   fmt.Sprintf("ESC-PAY-%d", time.Now().UnixNano()%1000000),
	})
}

func DisputeEscrow(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"escrowId":  req["escrowId"],
		"status":    "disputed",
		"disputeId": fmt.Sprintf("DISP-%d", time.Now().UnixNano()%1000000),
		"slaHours":  72,
	})
}

func ListEscrows(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	role := r.URL.Query().Get("role")
	_ = merchantID
	escrows := []map[string]interface{}{
		{"escrowId": "ESC-001", "amountKobo": 500000, "status": "funded", "role": role, "buyerId": "buyer_001", "sellerId": "seller_001", "expiryDate": "2026-05-01"},
		{"escrowId": "ESC-002", "amountKobo": 1200000, "status": "released", "role": role, "buyerId": "buyer_002", "sellerId": "seller_002", "expiryDate": "2026-04-15"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"escrows": escrows})
}

// ─── Bulk Payment Scheduler ─────────────────────────────────────────────────────

func CreateBulkSchedule(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	scheduleID := fmt.Sprintf("BULK-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"scheduleId":    scheduleID,
		"status":        "scheduled",
		"totalPayments": len(req["payments"].([]interface{})),
		"scheduledFor":  req["scheduledFor"],
		"kafkaEvent":    "bulk.payment.scheduled",
		"temporalRunID": fmt.Sprintf("wf-%s", scheduleID),
	})
}

func ListBulkSchedules(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	status := r.URL.Query().Get("status")
	_ = merchantID
	schedules := []map[string]interface{}{
		{"scheduleId": "BULK-001", "name": "Monthly Vendor Payments", "status": status, "totalPayments": 45, "totalAmountKobo": 4500000, "scheduledFor": "2026-04-30T09:00:00Z"},
		{"scheduleId": "BULK-002", "name": "Weekly Supplier Disbursements", "status": "completed", "totalPayments": 12, "totalAmountKobo": 1200000, "scheduledFor": "2026-04-07T08:00:00Z"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"schedules": schedules})
}

func GetBulkScheduleResults(w http.ResponseWriter, r *http.Request) {
	scheduleID := r.URL.Query().Get("scheduleId")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"scheduleId":      scheduleID,
		"totalPayments":   45,
		"successCount":    43,
		"failedCount":     2,
		"totalAmountKobo": 4300000,
		"completedAt":     time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
		"failures": []map[string]interface{}{
			{"reference": "PAY-001", "reason": "Invalid account number", "amountKobo": 50000},
			{"reference": "PAY-002", "reason": "Insufficient funds", "amountKobo": 100000},
		},
	})
}

func CancelBulkSchedule(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"scheduleId": req["scheduleId"],
		"status":     "cancelled",
		"cancelledAt": time.Now().Format(time.RFC3339),
	})
}

// ─── Tax Withholding Engine ─────────────────────────────────────────────────────

func CalculateTax(w http.ResponseWriter, r *http.Request) {
	amountStr := r.URL.Query().Get("amount")
	txType := r.URL.Query().Get("type")
	vendorType := r.URL.Query().Get("vendorType")
	amount, _ := strconv.ParseFloat(amountStr, 64)

	// WHT rates per FIRS Nigeria
	whtRates := map[string]float64{
		"individual":  5.0,
		"company":     10.0,
		"contractor":  5.0,
		"professional": 10.0,
	}
	vatRate := 7.5
	rate := whtRates[vendorType]
	if rate == 0 {
		rate = 10.0
	}

	whtKobo := amount * rate / 100
	vatKobo := amount * vatRate / 100

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"transactionAmountKobo": amount,
		"transactionType":       txType,
		"vendorType":            vendorType,
		"whtRatePct":            rate,
		"whtAmountKobo":         whtKobo,
		"vatRatePct":            vatRate,
		"vatAmountKobo":         vatKobo,
		"netPayableKobo":        amount - whtKobo,
		"firsCode":              "WHT-001",
	})
}

func GetTaxSummary(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	year := r.URL.Query().Get("year")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"year":                year,
		"totalWHTKobo":        1250000,
		"totalVATKobo":        875000,
		"totalRemittedKobo":   2000000,
		"pendingRemittanceKobo": 125000,
		"firsReference":       "FIRS-2026-001",
		"nextDueDate":         "2026-05-21",
	})
}

func RemitTax(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"remittanceId":  fmt.Sprintf("FIRS-REM-%d", time.Now().UnixNano()%1000000),
		"status":        "submitted",
		"firsReference": fmt.Sprintf("FIRS-2026-%d", time.Now().UnixNano()%100000),
		"submittedAt":   time.Now().Format(time.RFC3339),
	})
}

func GetTaxCertificate(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	certID := fmt.Sprintf("CERT-WHT-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"certificateId": certID,
		"pdfUrl":        fmt.Sprintf("https://tax.paygate.ng/certificates/%s.pdf", certID),
		"issuedAt":      time.Now().Format(time.RFC3339),
		"validUntil":    time.Now().AddDate(1, 0, 0).Format("2006-01-02"),
	})
}

// ─── Regulatory Sandbox Mode ─────────────────────────────────────────────────────

func GetRegulatoryScenarios(w http.ResponseWriter, r *http.Request) {
	scenarios := []map[string]interface{}{
		{"id": "scen_001", "name": "CBN Stress Test - High Volume", "description": "Simulate 10,000 TPS for 5 minutes", "category": "performance", "regulatorCode": "CBN-ST-001"},
		{"id": "scen_002", "name": "AML SAR Filing Drill", "description": "Trigger suspicious activity report workflow", "category": "compliance", "regulatorCode": "NFIU-AML-001"},
		{"id": "scen_003", "name": "PCI-DSS Card Data Breach Simulation", "description": "Test incident response procedures", "category": "security", "regulatorCode": "PCI-IR-001"},
		{"id": "scen_004", "name": "NDIC Resolution Weekend", "description": "Simulate bank resolution event", "category": "resilience", "regulatorCode": "NDIC-RES-001"},
		{"id": "scen_005", "name": "FIRS WHT Audit Trail", "description": "Generate complete WHT audit trail for FIRS review", "category": "tax", "regulatorCode": "FIRS-AUD-001"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"scenarios": scenarios})
}

func EnableRegulatorySandbox(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"sandboxId":      fmt.Sprintf("REGBOX-%d", time.Now().UnixNano()%1000000),
		"status":         "enabled",
		"environment":    "regulatory_sandbox",
		"expiresAt":      time.Now().AddDate(0, 0, 30).Format(time.RFC3339),
		"cbnApprovalRef": "CBN-SANDBOX-2026-001",
	})
}

func GetRegulatorySandboxStatus(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":        true,
		"sandboxId":      "REGBOX-001",
		"environment":    "regulatory_sandbox",
		"activeSince":    time.Now().Add(-7 * 24 * time.Hour).Format(time.RFC3339),
		"expiresAt":      time.Now().AddDate(0, 0, 23).Format(time.RFC3339),
		"scenariosRun":   3,
		"lastScenarioAt": time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
	})
}

func RunRegulatoryScenario(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	runID := fmt.Sprintf("RUN-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":      runID,
		"scenarioId": req["scenarioId"],
		"status":     "running",
		"startedAt":  time.Now().Format(time.RFC3339),
		"estimatedCompletionMins": 5,
	})
}

func SubmitRegulatoryReport(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"submissionId":   fmt.Sprintf("REG-SUB-%d", time.Now().UnixNano()%1000000),
		"status":         "submitted",
		"regulatorRef":   fmt.Sprintf("CBN-2026-%d", time.Now().UnixNano()%100000),
		"submittedAt":    time.Now().Format(time.RFC3339),
		"acknowledgmentExpectedHrs": 48,
	})
}

// ─── Multi-Currency Wallet v2 ─────────────────────────────────────────────────────

func GetMultiWalletBalances(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	balances := []map[string]interface{}{
		{"currency": "NGN", "balanceKobo": 5000000, "balanceDisplay": "₦50,000.00", "flagEmoji": "🇳🇬", "tigerBeetleAcct": "TB-NGN-001"},
		{"currency": "USD", "balanceKobo": 1000000, "balanceDisplay": "$606.06", "flagEmoji": "🇺🇸", "tigerBeetleAcct": "TB-USD-001"},
		{"currency": "GBP", "balanceKobo": 500000, "balanceDisplay": "£303.03", "flagEmoji": "🇬🇧", "tigerBeetleAcct": "TB-GBP-001"},
		{"currency": "EUR", "balanceKobo": 750000, "balanceDisplay": "€454.55", "flagEmoji": "🇪🇺", "tigerBeetleAcct": "TB-EUR-001"},
		{"currency": "GHS", "balanceKobo": 200000, "balanceDisplay": "GH₵121.21", "flagEmoji": "🇬🇭", "tigerBeetleAcct": "TB-GHS-001"},
		{"currency": "KES", "balanceKobo": 300000, "balanceDisplay": "KSh181.82", "flagEmoji": "🇰🇪", "tigerBeetleAcct": "TB-KES-001"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"wallets": balances, "totalUSDEquivalent": 1800.00})
}

func CreateMultiWallet(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	currency := req["currency"].(string)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"walletId":        fmt.Sprintf("WALLET-%s-%d", currency, time.Now().UnixNano()%1000000),
		"currency":        currency,
		"status":          "active",
		"tigerBeetleAcct": fmt.Sprintf("TB-%s-%d", currency, time.Now().UnixNano()%10000),
		"createdAt":       time.Now().Format(time.RFC3339),
	})
}

func ConvertMultiWallet(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	convID := fmt.Sprintf("CONV-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"conversionId":    convID,
		"fromCurrency":    req["fromCurrency"],
		"toCurrency":      req["toCurrency"],
		"fromAmountKobo":  req["amountKobo"],
		"toAmountKobo":    int64(req["amountKobo"].(float64) * 0.606),
		"exchangeRate":    0.606,
		"feesKobo":        int64(req["amountKobo"].(float64) * 0.005),
		"status":          "completed",
	})
}

func SweepMultiWallet(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"sweepId":         fmt.Sprintf("SWEEP-%d", time.Now().UnixNano()%1000000),
		"status":          "completed",
		"currenciesSwept": req["currencies"],
		"totalConvertedKobo": 1500000,
		"targetCurrency":  req["targetCurrency"],
	})
}

func GetMultiWalletHistory(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	currency := r.URL.Query().Get("currency")
	_ = merchantID
	txns := []map[string]interface{}{
		{"id": "CONV-001", "type": "conversion", "fromCurrency": "NGN", "toCurrency": "USD", "fromKobo": 1000000, "toKobo": 606060, "rate": 0.606, "createdAt": time.Now().Add(-24 * time.Hour).Format(time.RFC3339)},
		{"id": "CONV-002", "type": "conversion", "fromCurrency": currency, "toCurrency": "NGN", "fromKobo": 50000, "toKobo": 82500, "rate": 1.65, "createdAt": time.Now().Add(-48 * time.Hour).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"transactions": txns})
}
