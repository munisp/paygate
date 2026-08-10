// Package models defines the data structures for Mojaloop FSPIOP API interactions.
package models

import "time"

// ─── Party ────────────────────────────────────────────────────────────────────

type PartyLookupRequest struct {
	MerchantID      string `json:"merchantId"`
	PartyIDType     string `json:"partyIdType"`     // MSISDN, ACCOUNT_ID, IBAN, ALIAS
	PartyIdentifier string `json:"partyIdentifier"` // e.g. phone number, account number
	PartySubIDOrType string `json:"partySubIdOrType,omitempty"`
}

type FSPIOPParty struct {
	PartyIdInfo struct {
		PartyIDType      string `json:"partyIdType"`
		PartyIdentifier  string `json:"partyIdentifier"`
		PartySubIdOrType string `json:"partySubIdOrType,omitempty"`
		FspId            string `json:"fspId"`
	} `json:"partyIdInfo"`
	Name              string `json:"name,omitempty"`
	PersonalInfo      *PersonalInfo `json:"personalInfo,omitempty"`
	MerchantClassCode string `json:"merchantClassificationCode,omitempty"`
}

type PersonalInfo struct {
	ComplexName *ComplexName `json:"complexName,omitempty"`
	DateOfBirth string       `json:"dateOfBirth,omitempty"`
}

type ComplexName struct {
	FirstName  string `json:"firstName,omitempty"`
	MiddleName string `json:"middleName,omitempty"`
	LastName   string `json:"lastName,omitempty"`
}

type PartyFoundEvent struct {
	EventType       string      `json:"eventType"`
	MerchantID      string      `json:"merchantId"`
	PartyIDType     string      `json:"partyIdType"`
	PartyIdentifier string      `json:"partyIdentifier"`
	FspID           string      `json:"fspId"`
	Party           FSPIOPParty `json:"party"`
	Timestamp       time.Time   `json:"timestamp"`
}

// ─── Quote ────────────────────────────────────────────────────────────────────

type QuoteRequest struct {
	MerchantID      string  `json:"merchantId"`
	QuoteID         string  `json:"quoteId"`
	TransactionID   string  `json:"transactionId"`
	PayerFspID      string  `json:"payerFspId"`
	PayeeFspID      string  `json:"payeeFspId"`
	AmountCurrency  string  `json:"amountCurrency"`
	Amount          float64 `json:"amount"`
	TransactionType string  `json:"transactionType"` // TRANSFER, PAYMENT
	Note            string  `json:"note,omitempty"`
}

func (q *QuoteRequest) ToFSPIOP(sourceFSP string) map[string]any {
	return map[string]any{
		"quoteId":       q.QuoteID,
		"transactionId": q.TransactionID,
		"payee": map[string]any{
			"partyIdInfo": map[string]string{"fspId": q.PayeeFspID},
		},
		"payer": map[string]any{
			"partyIdInfo": map[string]string{"fspId": q.PayerFspID},
		},
		"amountType": "SEND",
		"amount": map[string]any{
			"currency": q.AmountCurrency,
			"amount":   fmt.Sprintf("%.2f", q.Amount),
		},
		"transactionType": map[string]string{
			"scenario":    q.TransactionType,
			"initiator":   "PAYER",
			"initiatorType": "CONSUMER",
		},
		"note": q.Note,
	}
}

type FSPIOPQuoteResponse struct {
	TransferAmount   Money  `json:"transferAmount"`
	PayeeReceiveAmount Money `json:"payeeReceiveAmount,omitempty"`
	PayeeFspFee      Money  `json:"payeeFspFee,omitempty"`
	PayeeFspCommission Money `json:"payeeFspCommission,omitempty"`
	Expiration       string `json:"expiration"`
	IlpPacket        string `json:"ilpPacket"`
	Condition        string `json:"condition"`
}

type Money struct {
	Currency string `json:"currency"`
	Amount   string `json:"amount"`
}

type QuoteAcceptedEvent struct {
	EventType  string              `json:"eventType"`
	MerchantID string              `json:"merchantId"`
	QuoteID    string              `json:"quoteId"`
	Quote      FSPIOPQuoteResponse `json:"quote"`
	Timestamp  time.Time           `json:"timestamp"`
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

type TransferRequest struct {
	MerchantID     string `json:"merchantId"`
	TransferID     string `json:"transferId"`
	QuoteID        string `json:"quoteId"`
	PayerFspID     string `json:"payerFspId"`
	PayeeFspID     string `json:"payeeFspId"`
	AmountCurrency string `json:"amountCurrency"`
	Amount         string `json:"amount"`
	IlpPacket      string `json:"ilpPacket"`
	Condition      string `json:"condition"`
	Expiration     string `json:"expiration"`
}

func (t *TransferRequest) ToFSPIOP() map[string]any {
	return map[string]any{
		"transferId": t.TransferID,
		"payerFsp":   t.PayerFspID,
		"payeeFsp":   t.PayeeFspID,
		"amount": map[string]string{
			"currency": t.AmountCurrency,
			"amount":   t.Amount,
		},
		"ilpPacket":  t.IlpPacket,
		"condition":  t.Condition,
		"expiration": t.Expiration,
	}
}

type FSPIOPTransferResponse struct {
	FulfilmentState string `json:"fulfilment,omitempty"`
	CompletedTimestamp string `json:"completedTimestamp,omitempty"`
	TransferState   string `json:"transferState"` // RECEIVED|RESERVED|COMMITTED|ABORTED
}

// Alias for backward compat
func (r *FSPIOPTransferResponse) GetFulfilment() string { return r.FulfilmentState }
func (r *FSPIOPTransferResponse) GetFulfilmentAlias() string { return r.FulfilmentState }
func (r *FSPIOPTransferResponse) Fulfilment() string { return r.FulfilmentState }

type TransferCompletedEvent struct {
	EventType     string    `json:"eventType"`
	MerchantID    string    `json:"merchantId"`
	TransferID    string    `json:"transferId"`
	QuoteID       string    `json:"quoteId"`
	TransferState string    `json:"transferState"`
	Fulfilment    string    `json:"fulfilment,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

type TransferFailedEvent struct {
	EventType        string    `json:"eventType"`
	MerchantID       string    `json:"merchantId"`
	TransferID       string    `json:"transferId"`
	QuoteID          string    `json:"quoteId"`
	ErrorCode        string    `json:"errorCode"`
	ErrorDescription string    `json:"errorDescription"`
	Timestamp        time.Time `json:"timestamp"`
}

// ─── Error ────────────────────────────────────────────────────────────────────

type FSPIOPErrorResponse struct {
	ErrorInformation struct {
		ErrorCode        string `json:"errorCode"`
		ErrorDescription string `json:"errorDescription"`
		ExtensionList    *struct {
			Extension []struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			} `json:"extension"`
		} `json:"extensionList,omitempty"`
	} `json:"errorInformation"`
}
