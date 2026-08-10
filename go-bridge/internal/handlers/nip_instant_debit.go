// nip_instant_debit.go — NIP 3.0 Instant Debit handler (Wave 131 / Gap 7)
//
// Implements the dual-message MTI 0200 authorisation flow for NIP instant debits.
// Sandbox mock mode is active when NIBSS_GATEWAY_URL is not set.
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
}

// maxNIPAmountKobo is the per-transaction limit: ₦1,000,000 = 100,000,000 kobo.
const maxNIPAmountKobo = 100_000_000.0

// NIPInstantDebit handles POST /v1/nip/instant-debit.
func NIPInstantDebit(w http.ResponseWriter, r *http.Request) {
var req NIPInstantDebitRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
`{"error":"invalid request body"}`, http.StatusBadRequest)

}

// Validate required fields
if req.DebitAccountNumber == "" || req.CreditAccountNumber == "" || req.CreditBankCode == "" {
`{"error":"debit_account_number, credit_account_number, credit_bank_code are required"}`, http.StatusBadRequest)

}
if req.STAN == "" {
`{"error":"stan is required"}`, http.StatusBadRequest)

}
if req.Amount <= 0 || req.Amount > maxNIPAmountKobo {
fmt.Sprintf(`{"error":"amount_kobo must be between 1 and %.0f"}`, maxNIPAmountKobo), http.StatusBadRequest)

}

gatewayURL := os.Getenv("NIBSS_GATEWAY_URL")
if gatewayURL == "" {
Sandbox / simulation mode
fo("[nip] sandbox mode — simulating instant debit", "stan", req.STAN, "amount_kobo", req.Amount)
(w, http.StatusOK, NIPInstantDebitResponse{
         "success",
seCode:    "00",
seMessage: "Approved",
ID:       "SANDBOX-" + req.STAN,
:            req.STAN,
      time.Now().UTC().Format(time.RFC3339),

}

// Production: forward to NIBSS gateway
payload, _ := json.Marshal(map[string]any{
tNumber":  req.DebitAccountNumber,
tNumber": req.CreditAccountNumber,
kCode":      req.CreditBankCode,
t":              req.Amount,
arration":           req.Narration,
":                req.STAN,
tId":          req.MerchantID,
})

nibssReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
URL+"/api/v2/nip/instant-debit", bytes.NewReader(payload))
if err != nil {
`{"error":"failed to build NIBSS request"}`, http.StatusInternalServerError)

}
nibssReq.Header.Set("Content-Type", "application/json")
nibssReq.Header.Set("Authorization", "Bearer "+os.Getenv("NIBSS_SECRET_KEY"))
nibssReq.Header.Set("X-Institution-Code", os.Getenv("NIBSS_INSTITUTION_CODE"))

client := &http.Client{Timeout: 30 * time.Second}
resp, err := client.Do(nibssReq)
if err != nil {
ip] NIBSS gateway error", "error", err)
`{"error":"NIBSS gateway unreachable"}`, http.StatusBadGateway)

}
defer resp.Body.Close()
raw, _ := io.ReadAll(resp.Body)

// Map ISO 8583 response codes to human-readable messages
var nibssResp map[string]any
if err := json.Unmarshal(raw, &nibssResp); err != nil {
`{"error":"invalid NIBSS response"}`, http.StatusBadGateway)

}

responseCode, _ := nibssResp["responseCode"].(string)
message := mapISO8583Code(responseCode)
status := "success"
if responseCode != "00" {
= "failed"
}

writeJSON(w, http.StatusOK, NIPInstantDebitResponse{
         status,
seCode:    responseCode,
seMessage: message,
ID:       fmt.Sprintf("%v", nibssResp["sessionId"]),
:            req.STAN,
      time.Now().UTC().Format(time.RFC3339),
})
}

// mapISO8583Code maps common ISO 8583 response codes to human-readable messages.
func mapISO8583Code(code string) string {
codes := map[string]string{
"Approved",
"Refer to card issuer",
"Do not honour",
"Invalid transaction",
"Invalid amount",
"Invalid account number",
"Insufficient funds",
"Expired card",
"Transaction not permitted to cardholder",
"Exceeds withdrawal amount limit",
"Exceeds withdrawal frequency limit",
"Issuer or switch inoperative",
"System malfunction",
}
if msg, ok := codes[code]; ok {
 msg
}
return "Unknown response code: " + code
}
