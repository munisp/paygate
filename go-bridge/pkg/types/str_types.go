package types

import (
	"fmt"
	"time"
)

// ─── STR Request/Response Types ──────────────────────────────────────────────

// CreateSTRRequest is the payload for POST /v1/cbn/str
type CreateSTRRequest struct {
	MerchantID      string   `json:"merchant_id"`
	TransactionID   string   `json:"transaction_id"`
	CustomerID      string   `json:"customer_id"`
	AmountKobo      int64    `json:"amount_kobo"`
	Currency        string   `json:"currency"`
	SuspicionReason string   `json:"suspicion_reason"`
	SuspicionType   string   `json:"suspicion_type"` // e.g. "structuring", "layering", "terrorist_financing"
	NarrativeText   string   `json:"narrative_text"`
	AnalystID       string   `json:"analyst_id"`
	FraudSignals    []string `json:"fraud_signals"`
	RelatedAccounts []string `json:"related_accounts"`
	RiskScore       int      `json:"risk_score"`
}

// Validate checks required fields on CreateSTRRequest.
func (r *CreateSTRRequest) Validate() error {
	if r.MerchantID == "" {
		return fmt.Errorf("merchant_id is required")
	}
	if r.TransactionID == "" {
		return fmt.Errorf("transaction_id is required")
	}
	if r.SuspicionReason == "" {
		return fmt.Errorf("suspicion_reason is required")
	}
	if r.NarrativeText == "" {
		return fmt.Errorf("narrative_text is required")
	}
	if r.AnalystID == "" {
		return fmt.Errorf("analyst_id is required")
	}
	if r.AmountKobo <= 0 {
		return fmt.Errorf("amount_kobo must be positive")
	}
	validTypes := map[string]bool{
		"structuring": true, "layering": true, "terrorist_financing": true,
		"fraud": true, "money_laundering": true, "identity_theft": true,
		"synthetic_identity": true, "account_takeover": true, "other": true,
	}
	if !validTypes[r.SuspicionType] {
		return fmt.Errorf("invalid suspicion_type: %s", r.SuspicionType)
	}
	return nil
}

// CreateSTRResponse is the response for POST /v1/cbn/str
type CreateSTRResponse struct {
	STRID    string    `json:"str_id"`
	Status   string    `json:"status"`
	Deadline time.Time `json:"deadline"`
}

// SubmitSTRRequest is the payload for POST /v1/cbn/str/{id}/submit
type SubmitSTRRequest struct {
	AnalystID              string   `json:"analyst_id"`
	ReportingEntityName    string   `json:"reporting_entity_name"`
	CBNLicenceNo           string   `json:"cbn_licence_no"`
	RCNumber               string   `json:"rc_number"`
	ContactOfficer         string   `json:"contact_officer"`
	ContactEmail           string   `json:"contact_email"`
	ContactPhone           string   `json:"contact_phone"`
	CustomerID             string   `json:"customer_id"`
	CustomerName           string   `json:"customer_name"`
	CustomerBVN            string   `json:"customer_bvn"`
	AccountNumber          string   `json:"account_number"`
	BankCode               string   `json:"bank_code"`
	TransactionID          string   `json:"transaction_id"`
	AmountKobo             int64    `json:"amount_kobo"`
	Currency               string   `json:"currency"`
	TransactionDate        string   `json:"transaction_date"`
	Channel                string   `json:"channel"`
	TransactionDescription string   `json:"transaction_description"`
	SuspicionType          string   `json:"suspicion_type"`
	SuspicionReason        string   `json:"suspicion_reason"`
	NarrativeText          string   `json:"narrative_text"`
	RiskScore              int      `json:"risk_score"`
	FraudSignals           []string `json:"fraud_signals"`
}

// SubmitSTRResponse is the response for POST /v1/cbn/str/{id}/submit
type SubmitSTRResponse struct {
	STRID          string    `json:"str_id"`
	SubmissionRef  string    `json:"submission_ref"`
	Status         string    `json:"status"`
	SubmittedAt    time.Time `json:"submitted_at"`
	LateSubmission bool      `json:"late_submission"`
}

// STRRecord is the full STR record stored in Lakehouse and returned by GET /v1/cbn/str/{id}
type STRRecord struct {
	ID              string    `json:"id"`
	MerchantID      string    `json:"merchant_id"`
	TransactionID   string    `json:"transaction_id"`
	CustomerID      string    `json:"customer_id"`
	AmountKobo      int64     `json:"amount_kobo"`
	Currency        string    `json:"currency"`
	SuspicionReason string    `json:"suspicion_reason"`
	SuspicionType   string    `json:"suspicion_type"`
	NarrativeText   string    `json:"narrative_text"`
	AnalystID       string    `json:"analyst_id"`
	Status          string    `json:"status"`
	Deadline        time.Time `json:"deadline"`
	SubmissionRef   string    `json:"submission_ref,omitempty"`
	SubmittedAt     *time.Time `json:"submitted_at,omitempty"`
	AcknowledgedAt  *time.Time `json:"acknowledged_at,omitempty"`
	FraudSignals    []string  `json:"fraud_signals"`
	RelatedAccounts []string  `json:"related_accounts"`
	RiskScore       int       `json:"risk_score"`
	LateSubmission  bool      `json:"late_submission"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
