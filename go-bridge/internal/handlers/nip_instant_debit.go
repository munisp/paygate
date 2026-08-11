// nip_instant_debit.go — NIP 3.0 Instant Debit handler (Wave 131 / Gap 7)
//
// Implements the dual-message MTI 0200 authorisation flow for NIP instant debits.
// Simulation mode requires explicit opt-in via PAYGATE_SIMULATION_MODE=true;
// otherwise an unconfigured NIBSS gateway fails loudly with 503.
//
// Route: POST /v1/nip/instant-debit

package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"
)

// NIPInstantDebitRequest is the body for POST /v1/nip/instant-debit.
type NIPInstantDebitRequest struct {
	DebitAccountNumber  string  `json:"debit_account_number"`
	CreditAccountNumber string  `json:"credit_account_number"`
	CreditBankCode      string  `json:"credit_bank_code"`
	Amount              float64 `json:"amount_kobo"` // amount in kobo (1 NGN = 100 kobo)
	Narration           string  `json:"narration"`
	STAN                string  `json:"stan"` // System Trace Audit Number (unique per txn)
	MerchantID          string  `json:"merchant_id"`
}

// NIPInstantDebitResponse is the response from POST /v1/nip/instant-debit.
type NIPInstantDebitResponse struct {
	Status          string `json:"status"`
	ResponseCode    string `json:"response_code"`
	ResponseMessage string `json:"response_message"`
	SessionID       string `json:"session_id,omitempty"`
	STAN            string `json:"stan"`
	Timestamp       string `json:"timestamp"`
	Simulation      bool   `json:"simulation,omitempty"`
}

// maxNIPAmountKobo is the per-transaction limit: ₦1,000,000 = 100,000,000 kobo.
const maxNIPAmountKobo = 100_000_000.0

// NIPInstantDebit handles POST /v1/nip/instant-debit.
func NIPInstantDebit(w http.ResponseWriter, r *http.Request) {
	var req NIPInstantDebitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.DebitAccountNumber == "" || req.CreditAccountNumber == "" || req.CreditBankCode == "" {
		http.Error(w, `{"error":"debit_account_number, credit_account_number, credit_bank_code are required"}`, http.StatusBadRequest)
		return
	}
	if req.STAN == "" {
		http.Error(w, `{"error":"stan is required"}`, http.StatusBadRequest)
		return
	}
	if !validNUBAN(req.DebitAccountNumber) || !validNUBAN(req.CreditAccountNumber) {
		http.Error(w, `{"error":"account numbers must be 10-digit NUBAN"}`, http.StatusBadRequest)
		return
	}
	if req.Amount <= 0 || req.Amount > maxNIPAmountKobo {
		http.Error(w, fmt.Sprintf(`{"error":"amount_kobo must be between 1 and %.0f"}`, maxNIPAmountKobo), http.StatusUnprocessableEntity)
		return
	}

	gatewayURL := os.Getenv("NIBSS_GATEWAY_URL")
	if gatewayURL == "" {
		// Never report a debit as "Approved" that was never executed.
		// Simulation requires explicit opt-in; otherwise fail loudly.
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			slog.Error("[nip] NIBSS_GATEWAY_URL not configured and PAYGATE_SIMULATION_MODE != true — refusing instant debit", "stan", req.STAN)
			http.Error(w, `{"error":"NIBSS gateway not configured; instant debit unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		slog.Warn("[nip] SIMULATION MODE — no real debit executed", "stan", req.STAN, "amount_kobo", req.Amount)
		writeJSON(w, http.StatusOK, NIPInstantDebitResponse{
			Status:          "simulated",
			ResponseCode:    "SIM",
			ResponseMessage: "Simulated debit — no money moved (PAYGATE_SIMULATION_MODE=true)",
			SessionID:       "SIMULATION-" + req.STAN,
			STAN:            req.STAN,
			Timestamp:       time.Now().UTC().Format(time.RFC3339),
			Simulation:      true,
		})
		return
	}

	// Production: forward to NIBSS gateway
	payload, _ := json.Marshal(map[string]any{
		"debitAccountNumber":  req.DebitAccountNumber,
		"creditAccountNumber": req.CreditAccountNumber,
		"creditBankCode":      req.CreditBankCode,
		"amount":              req.Amount,
		"narration":           req.Narration,
		"stan":                req.STAN,
		"merchantId":          req.MerchantID,
	})

	nibssReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		gatewayURL+"/api/v2/nip/instant-debit", bytes.NewReader(payload))
	if err != nil {
		http.Error(w, `{"error":"failed to build NIBSS request"}`, http.StatusInternalServerError)
		return
	}
	nibssReq.Header.Set("Content-Type", "application/json")
	nibssReq.Header.Set("Authorization", "Bearer "+os.Getenv("NIBSS_SECRET_KEY"))
	nibssReq.Header.Set("X-Institution-Code", os.Getenv("NIBSS_INSTITUTION_CODE"))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(nibssReq)
	if err != nil {
		slog.Error("[nip] NIBSS gateway error", "error", err)
		http.Error(w, `{"error":"NIBSS gateway unreachable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	// Map ISO 8583 response codes to human-readable messages
	var nibssResp map[string]any
	if err := json.Unmarshal(raw, &nibssResp); err != nil {
		http.Error(w, `{"error":"invalid NIBSS response"}`, http.StatusBadGateway)
		return
	}

	responseCode, _ := nibssResp["responseCode"].(string)
	message := mapISO8583Code(responseCode)
	status := "success"
	if responseCode != "00" {
		status = "failed"
	}

	writeJSON(w, http.StatusOK, NIPInstantDebitResponse{
		Status:          status,
		ResponseCode:    responseCode,
		ResponseMessage: message,
		SessionID:       fmt.Sprintf("%v", nibssResp["sessionId"]),
		STAN:            req.STAN,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
	})
}

// validNUBAN checks a 10-digit Nigerian Uniform Bank Account Number.
func validNUBAN(acct string) bool {
	if len(acct) != 10 {
		return false
	}
	for _, c := range acct {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// mapISO8583Code maps common ISO 8583 response codes to human-readable messages.
func mapISO8583Code(code string) string {
	codes := map[string]string{
		"00": "Approved",
		"01": "Refer to card issuer",
		"05": "Do not honour",
		"12": "Invalid transaction",
		"13": "Invalid amount",
		"14": "Invalid account number",
		"51": "Insufficient funds",
		"54": "Expired card",
		"57": "Transaction not permitted to cardholder",
		"61": "Exceeds withdrawal amount limit",
		"65": "Exceeds withdrawal frequency limit",
		"91": "Issuer or switch inoperative",
		"96": "System malfunction",
	}
	if msg, ok := codes[code]; ok {
		return msg
	}
	return "Unknown response code: " + code
}
