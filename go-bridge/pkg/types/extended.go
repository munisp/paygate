// Package types — extended request/response types for all PayGate bridge handlers.
// This file covers: transactions, disputes, fraud, KYC, BNPL, FX,
// virtual cards, payment links, webhooks, mobile money, auth, workflows,
// notifications, and NIP name enquiry.
package types

// ─── Transactions ─────────────────────────────────────────────────────────────

// RecordTransactionRequest is the JSON body for POST /v1/transactions/record
type RecordTransactionRequest struct {
	TransactionID string `json:"transaction_id"`
	MerchantID    string `json:"merchant_id"`
	CustomerID    string `json:"customer_id,omitempty"`
	Amount        uint64 `json:"amount"`
	Currency      string `json:"currency"`
	Type          string `json:"type"`    // "payment" | "transfer" | "withdrawal"
	Channel       string `json:"channel"` // "card" | "bank_transfer" | "ussd" | "qr"
	Reference     string `json:"reference"`
	Description   string `json:"description,omitempty"`
}

// RecordTransactionResponse is returned by POST /v1/transactions/record
type RecordTransactionResponse struct {
	TransactionID string `json:"transaction_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	WorkflowID    string `json:"workflow_id"`
	Status        string `json:"status"`
}

// RefundTransactionRequest is the JSON body for POST /v1/transactions/refund
type RefundTransactionRequest struct {
	TransactionID string `json:"transaction_id"`
	MerchantID    string `json:"merchant_id"`
	Amount        uint64 `json:"amount"`
	Reason        string `json:"reason"`
	InitiatorID   string `json:"initiator_id"`
}

// RefundTransactionResponse is returned by POST /v1/transactions/refund
type RefundTransactionResponse struct {
	RefundID      string `json:"refund_id"`
	TransactionID string `json:"transaction_id"`
	WorkflowID    string `json:"workflow_id"`
	Status        string `json:"status"`
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

// SubmitDisputeRequest is the JSON body for POST /v1/disputes/submit
type SubmitDisputeRequest struct {
	DisputeID     string `json:"dispute_id"`
	TransactionID string `json:"transaction_id"`
	MerchantID    string `json:"merchant_id"`
	CustomerID    string `json:"customer_id,omitempty"`
	Amount        uint64 `json:"amount"`
	Currency      string `json:"currency"`
	Reason        string `json:"reason"`
	EvidenceURL   string `json:"evidence_url,omitempty"`
	InitiatorID   string `json:"initiator_id"`
}

// SubmitDisputeResponse is returned by POST /v1/disputes/submit
type SubmitDisputeResponse struct {
	DisputeID     string `json:"dispute_id"`
	WorkflowID    string `json:"workflow_id"`
	ReservationID string `json:"reservation_id"`
	Status        string `json:"status"`
}

// ResolveDisputeRequest is the JSON body for POST /v1/disputes/{id}/resolve
type ResolveDisputeRequest struct {
	DisputeID  string `json:"dispute_id"`
	MerchantID string `json:"merchant_id"`
	Resolution string `json:"resolution"` // "won" | "lost" | "partial"
	Amount     uint64 `json:"amount,omitempty"`
	ReviewerID string `json:"reviewer_id"`
	Notes      string `json:"notes,omitempty"`
}

// ResolveDisputeResponse is returned by POST /v1/disputes/{id}/resolve
type ResolveDisputeResponse struct {
	DisputeID     string `json:"dispute_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	Status        string `json:"status"`
}

// ─── Fraud & Risk ─────────────────────────────────────────────────────────────

// FraudScoreRequest is the JSON body for POST /v1/fraud/score
type FraudScoreRequest struct {
	TransactionID     string `json:"transaction_id"`
	MerchantID        string `json:"merchant_id"`
	Amount            uint64 `json:"amount"`
	Currency          string `json:"currency"`
	Channel           string `json:"channel"`
	CustomerID        string `json:"customer_id,omitempty"`
	IPAddress         string `json:"ip_address,omitempty"`
	DeviceFingerprint string `json:"device_fingerprint,omitempty"`
}

// FraudScoreResponse is returned by POST /v1/fraud/score
type FraudScoreResponse struct {
	TransactionID string             `json:"transaction_id"`
	RiskScore     int                `json:"risk_score"`
	RiskLevel     string             `json:"risk_level"` // "low" | "medium" | "high" | "critical"
	Decision      string             `json:"decision"`   // "allow" | "review" | "block"
	ModelVersion  string             `json:"model_version"`
	Features      map[string]float64 `json:"features"`
}

// AcknowledgeFraudAlertRequest is the JSON body for POST /v1/fraud/alerts/{id}/acknowledge
type AcknowledgeFraudAlertRequest struct {
	MerchantID     string `json:"merchant_id"`
	AcknowledgerID string `json:"acknowledger_id"`
	Action         string `json:"action"` // "dismiss" | "block_customer" | "escalate"
	Notes          string `json:"notes,omitempty"`
}

// ─── KYC / Compliance ─────────────────────────────────────────────────────────

// StartKYCWorkflowRequest is the JSON body for POST /v1/kyc/start
type StartKYCWorkflowRequest struct {
	SubmissionID string `json:"submission_id"`
	MerchantID   string `json:"merchant_id"`
	DocumentType string `json:"document_type"`
	DocumentURL  string `json:"document_url"`
	InitiatorID  string `json:"initiator_id"`
}

// StartKYCWorkflowResponse is returned by POST /v1/kyc/start
type StartKYCWorkflowResponse struct {
	SubmissionID string `json:"submission_id"`
	WorkflowID   string `json:"workflow_id"`
	Status       string `json:"status"`
}

// UpdateKYCStatusRequest is the JSON body for POST /v1/kyc/{id}/update-status
type UpdateKYCStatusRequest struct {
	MerchantID      string `json:"merchant_id"`
	Status          string `json:"status"` // "approved" | "rejected" | "under_review"
	ReviewerID      string `json:"reviewer_id"`
	RejectionReason string `json:"rejection_reason,omitempty"`
}

// UpdateKYCStatusResponse is returned by POST /v1/kyc/{id}/update-status
type UpdateKYCStatusResponse struct {
	Success    bool   `json:"success"`
	WorkflowID string `json:"workflow_id,omitempty"`
}

// ─── BNPL ─────────────────────────────────────────────────────────────────────

// CreateBNPLLoanRequest is the JSON body for POST /v1/bnpl/loans/create
type CreateBNPLLoanRequest struct {
	LoanID            string  `json:"loan_id"`
	MerchantID        string  `json:"merchant_id"`
	CustomerID        string  `json:"customer_id,omitempty"`
	PrincipalAmount   uint64  `json:"principal_amount"`
	Currency          string  `json:"currency"`
	Installments      int     `json:"installments"`
	InstallmentAmount uint64  `json:"installment_amount"`
	InterestRate      float64 `json:"interest_rate"`
	TransactionID     string  `json:"transaction_id,omitempty"`
}

// CreateBNPLLoanResponse is returned by POST /v1/bnpl/loans/create
type CreateBNPLLoanResponse struct {
	LoanID        string `json:"loan_id"`
	WorkflowID    string `json:"workflow_id"`
	ReservationID string `json:"reservation_id"`
	Status        string `json:"status"`
}

// ProcessBNPLInstalmentRequest is the JSON body for POST /v1/bnpl/loans/{id}/instalment
type ProcessBNPLInstalmentRequest struct {
	MerchantID       string `json:"merchant_id"`
	InstalmentNumber int    `json:"instalment_number"`
	Amount           uint64 `json:"amount"`
	Currency         string `json:"currency"`
}

// ProcessBNPLInstalmentResponse is returned by POST /v1/bnpl/loans/{id}/instalment
type ProcessBNPLInstalmentResponse struct {
	Success       bool   `json:"success"`
	LedgerEntryID string `json:"ledger_entry_id,omitempty"`
}

// ─── FX ───────────────────────────────────────────────────────────────────────

// FXConversionRequest is the JSON body for POST /v1/fx/convert
type FXConversionRequest struct {
	ConversionID   string  `json:"conversion_id"`
	MerchantID     string  `json:"merchant_id"`
	SourceCurrency string  `json:"source_currency"`
	TargetCurrency string  `json:"target_currency"`
	SourceAmount   uint64  `json:"source_amount"`
	ExchangeRate   float64 `json:"exchange_rate"`
	Fee            uint64  `json:"fee"`
	TargetAmount   uint64  `json:"target_amount"`
}

// FXConversionResponse is returned by POST /v1/fx/convert
type FXConversionResponse struct {
	ConversionID  string `json:"conversion_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	Status        string `json:"status"`
}

// ─── Virtual Cards ────────────────────────────────────────────────────────────

// IssueVirtualCardRequest is the JSON body for POST /v1/virtual-cards/issue
type IssueVirtualCardRequest struct {
	CardID        string `json:"card_id"`
	MerchantID    string `json:"merchant_id"`
	SpendingLimit uint64 `json:"spending_limit"`
	Currency      string `json:"currency"`
	// SingleUse marks a single-use vendor card (terminated on first
	// authorisation / 30-day sweep). Optional — defaults to false.
	SingleUse bool `json:"single_use"`
	// VendorID locks the card to a single vendor (null/absent = unlocked).
	VendorID *string `json:"vendor_id"`
	Label    string  `json:"label"`
	IssuerID string  `json:"issuer_id"`
}

// IssueVirtualCardResponse is returned by POST /v1/virtual-cards/issue
type IssueVirtualCardResponse struct {
	CardID        string `json:"card_id"`
	WorkflowID    string `json:"workflow_id"`
	ReservationID string `json:"reservation_id"`
	MaskedPAN     string `json:"masked_pan"`
	Status        string `json:"status"`
}

// VirtualCardActionRequest is the JSON body for POST /v1/virtual-cards/{id}/{action}
type VirtualCardActionRequest struct {
	MerchantID string `json:"merchant_id"`
	ActorID    string `json:"actor_id"`
	Reason     string `json:"reason,omitempty"`
}

// ─── Payment Links ────────────────────────────────────────────────────────────

// CreatePaymentLinkRequest is the JSON body for POST /v1/payment-links/create
type CreatePaymentLinkRequest struct {
	LinkID      string `json:"link_id"`
	MerchantID  string `json:"merchant_id"`
	Amount      uint64 `json:"amount"`
	Currency    string `json:"currency"`
	Description string `json:"description"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	CreatorID   string `json:"creator_id"`
}

// CreatePaymentLinkResponse is returned by POST /v1/payment-links/create
type CreatePaymentLinkResponse struct {
	LinkID    string `json:"link_id"`
	URL       string `json:"url"`
	ShortCode string `json:"short_code"`
	Status    string `json:"status"`
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

// DeliverWebhookRequest is the JSON body for POST /v1/webhooks/deliver
type DeliverWebhookRequest struct {
	DeliveryID string                 `json:"delivery_id"`
	WebhookID  string                 `json:"webhook_id"`
	MerchantID string                 `json:"merchant_id"`
	EventType  string                 `json:"event_type"`
	Payload    map[string]interface{} `json:"payload"`
	TargetURL  string                 `json:"target_url"`
	Secret     string                 `json:"secret"`
}

// DeliverWebhookResponse is returned by POST /v1/webhooks/deliver
type DeliverWebhookResponse struct {
	DeliveryID  string `json:"delivery_id"`
	Status      string `json:"status"` // "delivered" | "failed"
	HTTPStatus  int    `json:"http_status,omitempty"`
	RetryCount  int    `json:"retry_count"`
	NextRetryAt string `json:"next_retry_at,omitempty"`
}

// RetryWebhookDeliveryRequest is the JSON body for POST /v1/webhooks/deliveries/{id}/retry
type RetryWebhookDeliveryRequest struct {
	MerchantID string `json:"merchant_id"`
}

// ─── Mobile Money ─────────────────────────────────────────────────────────────

// ReconcileMoMoRequest is the JSON body for POST /v1/mobile-money/reconcile
type ReconcileMoMoRequest struct {
	ReconID     string `json:"recon_id"`
	MerchantID  string `json:"merchant_id"`
	Provider    string `json:"provider"` // "MTN" | "Airtel" | "M-Pesa"
	ExternalRef string `json:"external_ref"`
	Amount      uint64 `json:"amount"`
	Currency    string `json:"currency"`
	Direction   string `json:"direction"` // "incoming" | "outgoing"
}

// ReconcileMoMoResponse is returned by POST /v1/mobile-money/reconcile
type ReconcileMoMoResponse struct {
	ReconID       string `json:"recon_id"`
	Status        string `json:"status"` // "matched" | "unmatched" | "pending"
	LedgerEntryID string `json:"ledger_entry_id,omitempty"`
}

// ─── Auth / Role Sync ─────────────────────────────────────────────────────────

// SyncRolesRequest is the JSON body for POST /v1/auth/sync-roles
type SyncRolesRequest struct {
	UserID          string   `json:"user_id"`
	MerchantID      string   `json:"merchant_id"`
	KeycloakSubject string   `json:"keycloak_subject"`
	Roles           []string `json:"roles"`
}

// SyncRolesResponse is returned by POST /v1/auth/sync-roles
type SyncRolesResponse struct {
	UserID               string   `json:"user_id"`
	SyncedRoles          []string `json:"synced_roles"`
	PermifyRelationships int      `json:"permify_relationships"`
	KeycloakUpdated      bool     `json:"keycloak_updated"`
}

// ─── Temporal Workflow Observability ─────────────────────────────────────────

// WorkflowStatusResponse is returned by GET /v1/workflows/{id}/status
type WorkflowStatusResponse struct {
	WorkflowID    string `json:"workflow_id"`
	Status        string `json:"status"`
	StartTime     string `json:"start_time"`
	CloseTime     string `json:"close_time,omitempty"`
	HistoryLength int    `json:"history_length"`
	TaskQueue     string `json:"task_queue"`
	Type          string `json:"type"`
}

// ActiveWorkflow is an element in the list returned by GET /v1/workflows/active
type ActiveWorkflow struct {
	WorkflowID     string `json:"workflow_id"`
	Type           string `json:"type"`
	Status         string `json:"status"`
	StartTime      string `json:"start_time"`
	ElapsedSeconds int64  `json:"elapsed_seconds"`
	EntityID       string `json:"entity_id"`
	EntityType     string `json:"entity_type"`
}

// TerminateWorkflowRequest is the JSON body for POST /v1/workflows/{id}/terminate
type TerminateWorkflowRequest struct {
	MerchantID string `json:"merchant_id"`
	Reason     string `json:"reason"`
	OperatorID string `json:"operator_id"`
}

// ─── Notifications ────────────────────────────────────────────────────────────

// SendApprovalEmailRequest is the JSON body for POST /v1/notifications/payout-approval-email
type SendApprovalEmailRequest struct {
	PayoutID        string   `json:"payout_id"`
	MerchantID      string   `json:"merchant_id"`
	Amount          uint64   `json:"amount"`
	Currency        string   `json:"currency"`
	RecipientEmails []string `json:"recipient_emails"`
	ApprovalURL     string   `json:"approval_url"`
	InitiatorName   string   `json:"initiator_name"`
}

// SendApprovalEmailResponse is returned by POST /v1/notifications/payout-approval-email
type SendApprovalEmailResponse struct {
	Sent int `json:"sent"`
}

// ─── NIP / NIBSS Name Enquiry ─────────────────────────────────────────────────

// NIPNameEnquiryRequest is the JSON body for POST /v1/nibss/name-enquiry
type NIPNameEnquiryRequest struct {
	AccountNumber string `json:"account_number"`
	BankCode      string `json:"bank_code"`
	MerchantID    string `json:"merchant_id"`
}

// NIPNameEnquiryResponse is returned by POST /v1/nibss/name-enquiry
type NIPNameEnquiryResponse struct {
	AccountName   string `json:"account_name"`
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	SessionID     string `json:"session_id"`
}
