package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ─── NIPInstantDebit tests ─────────────────────────────────────────────────────

func TestNIPInstantDebit_SandboxMode(t *testing.T) {
	// Simulation mode requires explicit opt-in; returns a clearly marked
	// simulated response (never response_code "00").
	t.Setenv("NIBSS_GATEWAY_URL", "")
	t.Setenv("PAYGATE_SIMULATION_MODE", "true")

	body := map[string]interface{}{
		"debit_account_number":  "0123456789",
		"debit_bank_code":       "058",
		"debit_account_name":    "TEST DEBIT ACCOUNT",
		"credit_account_number": "9876543210",
		"credit_bank_code":      "033",
		"credit_account_name":   "TEST CREDIT ACCOUNT",
		"amount_kobo":           500000,
		"stan":                  "123456789012",
		"rrn":                   "202406241234",
		"narration":             "Test payment",
		"merchant_id":           "MER001",
		"transaction_ref":       "TXN-TEST-001",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/v1/nip/instant-debit", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	NIPInstantDebit(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if result["response_code"] != "SIM" {
		t.Errorf("expected response_code 'SIM', got %v", result["response_code"])
	}
	if result["simulation"] != true {
		t.Errorf("expected simulation marker, got %v", result["simulation"])
	}
	if result["stan"] != "123456789012" {
		t.Errorf("expected stan '123456789012', got %v", result["stan"])
	}
}

func TestNIPInstantDebit_FailsClosedWithoutGateway(t *testing.T) {
	// Without NIBSS_GATEWAY_URL and without PAYGATE_SIMULATION_MODE the debit
	// must be REFUSED (503) — never reported as approved.
	t.Setenv("NIBSS_GATEWAY_URL", "")
	t.Setenv("PAYGATE_SIMULATION_MODE", "")

	body := map[string]interface{}{
		"debit_account_number":  "0123456789",
		"credit_account_number": "9876543210",
		"credit_bank_code":      "033",
		"amount_kobo":           500000,
		"stan":                  "123456789012",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/v1/nip/instant-debit", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	NIPInstantDebit(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestNIPInstantDebit_InvalidDebitAccount(t *testing.T) {
	body := map[string]interface{}{
		"debit_account_number":  "123", // too short
		"credit_account_number": "9876543210",
		"debit_bank_code":       "058",
		"credit_bank_code":      "033",
		"amount_kobo":           500000,
		"stan":                  "123456789012",
		"rrn":                   "202406241234",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/v1/nip/instant-debit", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	NIPInstantDebit(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestNIPInstantDebit_AmountLimitExceeded(t *testing.T) {
	body := map[string]interface{}{
		"debit_account_number":  "0123456789",
		"credit_account_number": "9876543210",
		"debit_bank_code":       "058",
		"credit_bank_code":      "033",
		"amount_kobo":           200_000_000_00, // ₦2,000,000 — exceeds ₦1M limit
		"stan":                  "123456789012",
		"rrn":                   "202406241234",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/v1/nip/instant-debit", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	NIPInstantDebit(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", w.Code)
	}
}

func TestNIPInstantDebit_MissingSTAN(t *testing.T) {
	body := map[string]interface{}{
		"debit_account_number":  "0123456789",
		"credit_account_number": "9876543210",
		"debit_bank_code":       "058",
		"credit_bank_code":      "033",
		"amount_kobo":           500000,
		// stan and rrn are missing
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/v1/nip/instant-debit", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	NIPInstantDebit(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ─── ISO 20022 validator tests ─────────────────────────────────────────────────

const validPain001XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>PAYGATE-TEST-001</MsgId>
      <CreDtTm>2026-06-24T10:00:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>1000.00</CtrlSum>
      <InitgPty>
        <Nm>PayGate Technologies</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>E2E-001</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="NGN">1000.00</InstdAmt>
        </Amt>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>0123456789</Id>
            </Othr>
          </Id>
        </CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`

func TestValidateISO20022_ValidPain001(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate",
		bytes.NewReader([]byte(validPain001XML)))
	req.Header.Set("Content-Type", "application/xml")
	w := httptest.NewRecorder()

	ValidateISO20022(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result ISO20022ValidationResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if !result.Valid {
		t.Errorf("expected valid=true, got false. Errors: %+v", result.Errors)
	}
	if result.MessageType != string(Pain001) {
		t.Errorf("expected message type %s, got %s", Pain001, result.MessageType)
	}
	if result.MessageID != "PAYGATE-TEST-001" {
		t.Errorf("expected message ID 'PAYGATE-TEST-001', got %s", result.MessageID)
	}
}

func TestValidateISO20022_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate",
		bytes.NewReader([]byte{}))
	w := httptest.NewRecorder()

	ValidateISO20022(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestValidateISO20022_UnknownNamespace(t *testing.T) {
	unknownXML := `<?xml version="1.0"?>
<Document xmlns="urn:unknown:namespace">
  <SomeElement>value</SomeElement>
</Document>`

	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate",
		bytes.NewReader([]byte(unknownXML)))
	w := httptest.NewRecorder()

	ValidateISO20022(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var result ISO20022ValidationResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if result.Valid {
		t.Error("expected valid=false for unknown namespace")
	}
}

func TestValidateISO20022_MissingRequiredElements(t *testing.T) {
	// pain.001 without required NbOfTxs and CtrlSum
	incompleteXML := `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>TEST-002</MsgId>
      <CreDtTm>2026-06-24T10:00:00</CreDtTm>
    </GrpHdr>
  </CstmrCdtTrfInitn>
</Document>`

	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate",
		bytes.NewReader([]byte(incompleteXML)))
	w := httptest.NewRecorder()

	ValidateISO20022(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", w.Code)
	}

	var result ISO20022ValidationResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if result.Valid {
		t.Error("expected valid=false for missing required elements")
	}
	if len(result.Errors) == 0 {
		t.Error("expected at least one error")
	}
}

func TestValidateISO20022Batch_ValidMessages(t *testing.T) {
	batchReq := map[string]interface{}{
		"messages": []string{validPain001XML},
	}
	bodyBytes, _ := json.Marshal(batchReq)

	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate/batch",
		bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	ValidateISO20022Batch(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if result["count"].(float64) != 1 {
		t.Errorf("expected count=1, got %v", result["count"])
	}
}

func TestValidateISO20022Batch_TooManyMessages(t *testing.T) {
	messages := make([]string, 101)
	for i := range messages {
		messages[i] = validPain001XML
	}
	batchReq := map[string]interface{}{"messages": messages}
	bodyBytes, _ := json.Marshal(batchReq)

	req := httptest.NewRequest(http.MethodPost, "/v1/iso20022/validate/batch",
		bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	ValidateISO20022Batch(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
