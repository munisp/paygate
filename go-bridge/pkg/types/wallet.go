// Package types defines the shared request/response types for the PayGate
// Go bridge HTTP API.
package types

// ─── Wallet operations ────────────────────────────────────────────────────────

// DebitRequest is the JSON body for POST /v1/wallets/debit
type DebitRequest struct {
	WalletID       string `json:"wallet_id"`
	Amount         uint64 `json:"amount"`          // smallest currency unit
	Currency       string `json:"currency"`         // ISO 4217
	Reference      string `json:"reference"`        // idempotency key
	Description    string `json:"description,omitempty"`
	FloatAccountID string `json:"float_account_id,omitempty"`
}

// DebitResponse is the JSON body returned by POST /v1/wallets/debit
type DebitResponse struct {
	WalletID      string `json:"wallet_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	NewBalance    uint64 `json:"new_balance"`
	Status        string `json:"status"`
}

// CreditRequest is the JSON body for POST /v1/wallets/credit
type CreditRequest struct {
	WalletID       string `json:"wallet_id"`
	Amount         uint64 `json:"amount"`
	Currency       string `json:"currency"`
	Reference      string `json:"reference"`
	Description    string `json:"description,omitempty"`
	FloatAccountID string `json:"float_account_id,omitempty"`
}

// CreditResponse is the JSON body returned by POST /v1/wallets/credit
type CreditResponse struct {
	WalletID      string `json:"wallet_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	NewBalance    uint64 `json:"new_balance"`
	Status        string `json:"status"`
}

// BalanceRequest is the JSON body for POST /v1/wallets/balance
type BalanceRequest struct {
	WalletID string `json:"wallet_id"`
	Currency string `json:"currency"`
}

// BalanceResponse is the JSON body returned by POST /v1/wallets/balance
type BalanceResponse struct {
	WalletID string `json:"wallet_id"`
	Balance  uint64 `json:"balance"`
	Currency string `json:"currency"`
}

// P2PRequest is the JSON body for POST /v1/wallets/p2p-transfer
type P2PRequest struct {
	SenderWalletID   string `json:"sender_wallet_id"`
	ReceiverWalletID string `json:"receiver_wallet_id"`
	Amount           uint64 `json:"amount"`
	Currency         string `json:"currency"`
	Reference        string `json:"reference"`
}

// P2PResponse is the JSON body returned by POST /v1/wallets/p2p-transfer
type P2PResponse struct {
	TransferID          string `json:"transfer_id"`
	SenderNewBalance    uint64 `json:"sender_new_balance"`
	ReceiverNewBalance  uint64 `json:"receiver_new_balance"`
	Status              string `json:"status"`
}

// ─── Settlement operations ────────────────────────────────────────────────────

// SettlementTriggerRequest is the JSON body for POST /v1/settlements/trigger
type SettlementTriggerRequest struct {
	SettlementID string `json:"settlement_id"`
	MerchantID   string `json:"merchant_id"`
	Amount       uint64 `json:"amount"`
	Currency     string `json:"currency"`
	BankCode     string `json:"bank_code"`
	AccountNo    string `json:"account_no"`
	Reference    string `json:"reference"`
}

// SettlementTriggerResponse is returned by POST /v1/settlements/trigger
type SettlementTriggerResponse struct {
	SettlementID  string `json:"settlement_id"`
	LedgerEntryID string `json:"ledger_entry_id"`
	Status        string `json:"status"`
	Message       string `json:"message,omitempty"`
}

// ErrorResponse is the standard error envelope.
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    int    `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}
