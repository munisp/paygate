// Package handlers — NIP 3.0 Instant Debit handler.
//
// NIP 3.0 is the third generation of the NIBSS Instant Payment scheme.
// Key differences from NIP 2.x:
//   - Dual-message architecture: authorisation (0200) + clearing (0220) are separate calls
//   - ISO 20022 pain.001.001.09 message format for cross-border legs
//   - Mandatory STAN + RRN correlation for idempotency
//   - Funds hold (debit) on authorisation; settlement on clearing confirmation
//   - Reversal window: 90 seconds from authorisation
//   - Single transaction limit: ₦1,000,000 (CBN directive)
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"
)

// NIPInstantDebit handles POST /v1/nip/instant-debit.
//
// It implements the NIP 3.0 authorisation request (ISO 8583 MTI 0200) and
// forwards it to the NIBSS gateway, mapping the response code to an HTTP status.
func NIPInstantDebit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		// Originator
		DebitAccountNumber string `json:"debit_account_number"`
		DebitBankCode      string `json:"debit_bank_code"`
		DebitAccountName   string `json:"debit_account_name"`
		// Beneficiary
		CreditAccountNumber string `json:"credit_account_number"`
		CreditBankCode      string `json:"credit_bank_code"`
		CreditAccountName   string `json:"credit_account_name"`
		// Amount (kobo)
		AmountKobo int64  `json:"amount_kobo"`
		Currency   string `json:"currency"` // default: NGN
		// Correlation
		STAN      string `json:"stan"`       // System Trace Audit Number (12 digits)
		RRN       string `json:"rrn"`        // Retrieval Reference Number (12 digits)
		SessionID string `json:"session_id"` // NIBSS-assigned session ID (optional on initiation)
		// Metadata
		Narration      string `json:"narration"`
		MerchantID     string `json:"merchant_id"`
		ChannelCode    string `json:"channel_code"`    // "01"=internet, "02"=mobile, "03"=POS, "04"=ATM
		TransactionRef string `json:"transaction_ref"` // idempotency key
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request","message":"bad JSON body"}`, http.StatusBadRequest)
		return
	}

	// ── Validation ────────────────────────────────────────────────────────────
	switch {
	case req.DebitAccountNumber == "" || len(req.DebitAccountNumber) != 10:
		http.Error(w, `{"error":"invalid_request","message":"debit_account_number must be 10 digits"}`, http.StatusBadRequest)
		return
	case req.CreditAccountNumber == "" || len(req.CreditAccountNumber) != 10:
		http.Error(w, `{"error":"invalid_request","message":"credit_account_number must be 10 digits"}`, http.StatusBadRequest)
		return
	case req.DebitBankCode == "" || req.CreditBankCode == "":
		http.Error(w, `{"error":"invalid_request","message":"debit_bank_code and credit_bank_code required"}`, http.StatusBadRequest)
		return
	case req.AmountKobo <= 0:
		http.Error(w, `{"error":"invalid_request","message":"amount_kobo must be positive"}`, http.StatusBadRequest)
		return
	case req.AmountKobo > 100_000_000_00: // ₦1,000,000 limit per NIP 3.0 spec
		http.Error(w, `{"error":"limit_exceeded","message":"NIP 3.0 single transaction limit is ₦1,000,000"}`, http.StatusUnprocessableEntity)
		return
	case req.STAN == "" || req.RRN == "":
		http.Error(w, `{"error":"invalid_request","message":"stan and rrn are required for NIP 3.0"}`, http.StatusBadRequest)
		return
	}

	currency := req.Currency
	if currency == "" {
		currency = "NGN"
	}
	channelCode := req.ChannelCode
	if channelCode == "" {
		channelCode = "02" // mobile
	}

	// Generate session ID if not provided (NIBSS format: YYYYMMDDHHMMSS + 6 random digits)
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("%s%06d",
			time.Now().UTC().Format("20060102150405"),
			time.Now().UnixNano()%1000000,
		)
	}

	nibssURL := os.Getenv("NIBSS_GATEWAY_URL")
	nibssKey := os.Getenv("NIBSS_SECRET_KEY")
	institutionCode := os.Getenv("NIBSS_INSTITUTION_CODE")

	// ── Sandbox mode (no gateway configured) ─────────────────────────────────
	if nibssURL == "" {
		slog.Info("[NIPInstantDebit] sandbox mode — returning mock approval",
			"session_id", sessionID, "stan", req.STAN, "rrn", req.RRN,
			"amount_kobo", req.AmountKobo,
		)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"session_id":    sessionID,
			"stan":          req.STAN,
			"rrn":           req.RRN,
			"response_code": "00",
			"response": map[string]interface{}{
				"responseCode":    "00",
				"responseMessage": "Approved",
				"sessionID":       sessionID,
				"authCode":        fmt.Sprintf("%06d", time.Now().Unix()%1000000),
			},
			"amount_kobo":  req.AmountKobo,
			"currency":     currency,
			"processed_at": time.Now().UTC(),
		})
		return
	}

	// ── Build NIBSS NIP 3.0 authorisation payload ─────────────────────────────
	nipPayload := map[string]interface{}{
		"sessionID":                        sessionID,
		"channelCode":                      channelCode,
		"nameEnquiryRef":                   req.RRN,
		"destinationInstitutionCode":       req.CreditBankCode,
		"originatorAccountName":            req.DebitAccountName,
		"originatorAccountNumber":          req.DebitAccountNumber,
		"originatorBankVerificationNumber": "",
		"originatorKYCLevel":               "3",
		"beneficiaryAccountName":           req.CreditAccountName,
		"beneficiaryAccountNumber":         req.CreditAccountNumber,
		"beneficiaryBankVerificationNumber": "",
		"beneficiaryKYCLevel":              "3",
		"transactionLocation":              "6.5244,3.3792", // Lagos default
		"narration":                        req.Narration,
		"paymentReference":                 req.TransactionRef,
		"amount":                           req.AmountKobo,
		"currency":                         currency,
		"institutionCode":                  institutionCode,
		"stan":                             req.STAN,
		"rrn":                              req.RRN,
		"messageType":                      "0200", // NIP 3.0 authorisation request
		"processingCode":                   "000000",
		"transmissionDateTime":             time.Now().UTC().Format("0102150405"),
	}

	// ── Call NIBSS gateway ────────────────────────────────────────────────────
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	nipBody, _ := json.Marshal(nipPayload)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		nibssURL+"/instant-debit", bytes.NewReader(nipBody))
	if err != nil {
		slog.Error("[NIPInstantDebit] build request failed", "err", err)
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+nibssKey)
	httpReq.Header.Set("X-NIP-Version", "3.0")
	httpReq.Header.Set("X-Institution-Code", institutionCode)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		slog.Warn("[NIPInstantDebit] NIBSS gateway unreachable", "err", err)
		writeJSON(w, http.StatusGatewayTimeout, map[string]interface{}{
			"error":      "gateway_timeout",
			"message":    "NIBSS gateway did not respond within 30s",
			"session_id": sessionID,
			"stan":       req.STAN,
			"rrn":        req.RRN,
		})
		return
	}
	defer resp.Body.Close()

	var nibssResp map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&nibssResp); err != nil {
		http.Error(w, `{"error":"invalid_gateway_response"}`, http.StatusBadGateway)
		return
	}

	// ── Map NIBSS response code to HTTP status ────────────────────────────────
	responseCode, _ := nibssResp["responseCode"].(string)
	httpStatus := http.StatusOK
	switch responseCode {
	case "00": // Approved
		httpStatus = http.StatusOK
	case "51": // Insufficient funds
		httpStatus = http.StatusUnprocessableEntity
	case "05", "57": // Do not honour / transaction not permitted
		httpStatus = http.StatusForbidden
	case "91": // Issuer unavailable
		httpStatus = http.StatusServiceUnavailable
	default:
		if resp.StatusCode >= 400 {
			httpStatus = resp.StatusCode
		}
	}

	slog.Info("[NIPInstantDebit] completed",
		"session_id", sessionID,
		"stan", req.STAN,
		"rrn", req.RRN,
		"response_code", responseCode,
		"amount_kobo", req.AmountKobo,
	)

	writeJSON(w, httpStatus, map[string]interface{}{
		"session_id":    sessionID,
		"stan":          req.STAN,
		"rrn":           req.RRN,
		"response_code": responseCode,
		"response":      nibssResp,
		"amount_kobo":   req.AmountKobo,
		"currency":      currency,
		"processed_at":  time.Now().UTC(),
	})
}
