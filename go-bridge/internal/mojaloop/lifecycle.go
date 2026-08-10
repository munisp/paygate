// Package mojaloop — full transfer lifecycle implementation.
//
// Implements the complete Mojaloop FSPIOP transfer flow:
//   1. Party Lookup  (GET /parties/{type}/{id})
//   2. Quote Request (POST /quotes)
//   3. Transfer Prepare (POST /transfers)
//   4. Transfer Fulfil  (PUT /transfers/{id})
//   5. Transfer Abort   (PUT /transfers/{id}/error)
//   6. Position Management (GET /participants/{fspId}/accounts)
//
// All callbacks are handled via Kafka topics (paygate.mojaloop.*).
package mojaloop

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is a Mojaloop FSPIOP API client.
type Client struct {
	baseURL    string
	fspID      string
	apiKey     string
	httpClient *http.Client
	enabled    bool
}

var globalClient *Client

// Init initialises the global Mojaloop client from environment variables.
func Init() {
	baseURL := os.Getenv("MOJALOOP_URL")
	if baseURL == "" {
		slog.Info("[mojaloop] MOJALOOP_URL not set — Mojaloop disabled (dev mode)")
		globalClient = &Client{enabled: false}
		return
	}
	globalClient = &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		fspID:      getenv("NIBSS_INSTITUTION_CODE", "paygate"),
		apiKey:     os.Getenv("MOJALOOP_API_KEY"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
		enabled:    true,
	}
	slog.Info("[mojaloop] client initialised", "base_url", globalClient.baseURL, "fsp_id", globalClient.fspID)
}

// Get returns the global Mojaloop client.
func Get() *Client { return globalClient }

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── FSPIOP Headers ───────────────────────────────────────────────────────────

func (c *Client) setHeaders(req *http.Request, fspiDest string) {
	req.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version=1.1")
	req.Header.Set("Accept", "application/vnd.interoperability.transfers+json;version=1.1")
	req.Header.Set("FSPIOP-Source", c.fspID)
	if fspiDest != "" {
		req.Header.Set("FSPIOP-Destination", fspiDest)
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	req.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))
}

func (c *Client) do(ctx context.Context, method, path string, body any, fspiDest string) ([]byte, int, error) {
	if !c.enabled {
		return []byte(`{"stub":true}`), 202, nil
	}
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("mojaloop: marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	c.setHeaders(req, fspiDest)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("mojaloop: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, nil
}

// ─── 1. Party Lookup ──────────────────────────────────────────────────────────

// PartyInfo is the result of a party lookup.
type PartyInfo struct {
	PartyIDType   string `json:"partyIdType"`
	PartyID       string `json:"partyIdentifier"`
	Name          string `json:"name"`
	FSPID         string `json:"fspId"`
	SupportedCurrencies []string `json:"supportedCurrencies,omitempty"`
}

// LookupParty performs GET /parties/{partyIdType}/{partyIdentifier}.
// partyIdType is typically "MSISDN", "ACCOUNT_ID", or "IBAN".
func (c *Client) LookupParty(ctx context.Context, partyIdType, partyID string) (*PartyInfo, error) {
	path := fmt.Sprintf("/parties/%s/%s", partyIdType, partyID)
	body, status, err := c.do(ctx, http.MethodGet, path, nil, "")
	if err != nil {
		return nil, err
	}
	if status == 202 {
		// Async — party info will arrive via PUT /parties callback on Kafka.
		slog.Info("[mojaloop] party lookup accepted (async)", "type", partyIdType, "id", partyID)
		return nil, nil
	}
	if status >= 400 {
		return nil, fmt.Errorf("mojaloop: party lookup %s/%s: HTTP %d: %s", partyIdType, partyID, status, body)
	}
	var result struct {
		Party PartyInfo `json:"party"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("mojaloop: parse party response: %w", err)
	}
	return &result.Party, nil
}

// ─── 2. Quote Request ─────────────────────────────────────────────────────────

// QuoteRequest is the Mojaloop POST /quotes request body.
type QuoteRequest struct {
	QuoteID         string      `json:"quoteId"`
	TransactionID   string      `json:"transactionId"`
	Payee           PartyRef    `json:"payee"`
	Payer           PartyRef    `json:"payer"`
	AmountType      string      `json:"amountType"` // "SEND" or "RECEIVE"
	Amount          MoneyAmount `json:"amount"`
	TransactionType TxType      `json:"transactionType"`
	Note            string      `json:"note,omitempty"`
}

// QuoteResponse is the Mojaloop PUT /quotes/{id} callback body.
type QuoteResponse struct {
	TransferAmount   MoneyAmount `json:"transferAmount"`
	PayeeReceiveAmount MoneyAmount `json:"payeeReceiveAmount"`
	PayeeFspFee      MoneyAmount `json:"payeeFspFee,omitempty"`
	PayeeFspCommission MoneyAmount `json:"payeeFspCommission,omitempty"`
	Expiration       time.Time   `json:"expiration"`
	IlpPacket        string      `json:"ilpPacket"`
	Condition        string      `json:"condition"`
}

// PartyRef identifies a party in a quote or transfer.
type PartyRef struct {
	PartyIDInfo struct {
		PartyIDType string `json:"partyIdType"`
		PartyID     string `json:"partyIdentifier"`
		FSPID       string `json:"fspId,omitempty"`
	} `json:"partyIdInfo"`
	Name string `json:"name,omitempty"`
}

// MoneyAmount is a Mojaloop money amount.
type MoneyAmount struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

// TxType describes the transaction type.
type TxType struct {
	Scenario    string `json:"scenario"`    // "TRANSFER", "DEPOSIT", "WITHDRAWAL"
	SubScenario string `json:"subScenario,omitempty"`
	Initiator   string `json:"initiator"`   // "PAYER" or "PAYEE"
	InitiatorType string `json:"initiatorType"` // "CONSUMER", "BUSINESS"
}

// RequestQuote sends POST /quotes to the Mojaloop switch.
// The response arrives asynchronously via PUT /quotes/{id} callback.
func (c *Client) RequestQuote(ctx context.Context, req QuoteRequest, payeeFSP string) error {
	body, status, err := c.do(ctx, http.MethodPost, "/quotes", req, payeeFSP)
	if err != nil {
		return err
	}
	if status != 202 {
		return fmt.Errorf("mojaloop: quote request: expected 202, got %d: %s", status, body)
	}
	slog.Info("[mojaloop] quote request accepted", "quote_id", req.QuoteID, "tx_id", req.TransactionID)
	return nil
}

// ─── 3. Transfer Prepare ──────────────────────────────────────────────────────

// TransferRequest is the Mojaloop POST /transfers request body.
type TransferRequest struct {
	TransferID        string      `json:"transferId"`
	PayerFSP          string      `json:"payerFsp"`
	PayeeFSP          string      `json:"payeeFsp"`
	Amount            MoneyAmount `json:"amount"`
	IlpPacket         string      `json:"ilpPacket"`
	Condition         string      `json:"condition"`
	Expiration        time.Time   `json:"expiration"`
}

// PrepareTransfer sends POST /transfers (prepare phase).
// The fulfil callback arrives via PUT /transfers/{id}.
func (c *Client) PrepareTransfer(ctx context.Context, req TransferRequest) error {
	body, status, err := c.do(ctx, http.MethodPost, "/transfers", req, req.PayeeFSP)
	if err != nil {
		return err
	}
	if status != 202 {
		return fmt.Errorf("mojaloop: prepare transfer: expected 202, got %d: %s", status, body)
	}
	slog.Info("[mojaloop] transfer prepared", "transfer_id", req.TransferID)
	return nil
}

// ─── 4. Transfer Fulfil ───────────────────────────────────────────────────────

// FulfilRequest is the Mojaloop PUT /transfers/{id} fulfil body.
type FulfilRequest struct {
	FulfilmentHash string    `json:"fulfilment"`
	CompletedAt    time.Time `json:"completedTimestamp"`
	TransferState  string    `json:"transferState"` // "COMMITTED"
}

// FulfilTransfer sends PUT /transfers/{transferId} to commit the transfer.
func (c *Client) FulfilTransfer(ctx context.Context, transferID string, req FulfilRequest, payeeFSP string) error {
	path := fmt.Sprintf("/transfers/%s", transferID)
	body, status, err := c.do(ctx, http.MethodPut, path, req, payeeFSP)
	if err != nil {
		return err
	}
	if status != 200 && status != 202 {
		return fmt.Errorf("mojaloop: fulfil transfer %s: HTTP %d: %s", transferID, status, body)
	}
	slog.Info("[mojaloop] transfer fulfilled", "transfer_id", transferID)
	return nil
}

// ─── 5. Transfer Abort ────────────────────────────────────────────────────────

// ErrorInformation is the Mojaloop error body for transfer abort.
type ErrorInformation struct {
	ErrorCode        string `json:"errorCode"`
	ErrorDescription string `json:"errorDescription"`
}

// AbortTransfer sends PUT /transfers/{transferId}/error to abort a transfer.
func (c *Client) AbortTransfer(ctx context.Context, transferID string, errInfo ErrorInformation, payeeFSP string) error {
	path := fmt.Sprintf("/transfers/%s/error", transferID)
	body, status, err := c.do(ctx, http.MethodPut, path, map[string]any{
		"errorInformation": errInfo,
	}, payeeFSP)
	if err != nil {
		return err
	}
	if status != 200 && status != 202 {
		return fmt.Errorf("mojaloop: abort transfer %s: HTTP %d: %s", transferID, status, body)
	}
	slog.Info("[mojaloop] transfer aborted", "transfer_id", transferID, "error_code", errInfo.ErrorCode)
	return nil
}

// ─── 6. Position Management ───────────────────────────────────────────────────

// ParticipantAccount represents a Mojaloop participant account.
type ParticipantAccount struct {
	ID       int    `json:"id"`
	Currency string `json:"currency"`
	LedgerAccountType string `json:"ledgerAccountType"`
	Value    string `json:"value"`
	IsActive int    `json:"isActive"`
}

// GetParticipantAccounts fetches the position accounts for an FSP.
func (c *Client) GetParticipantAccounts(ctx context.Context, fspID string) ([]ParticipantAccount, error) {
	path := fmt.Sprintf("/participants/%s/accounts", fspID)
	body, status, err := c.do(ctx, http.MethodGet, path, nil, "")
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("mojaloop: get accounts %s: HTTP %d: %s", fspID, status, body)
	}
	var accounts []ParticipantAccount
	if err := json.Unmarshal(body, &accounts); err != nil {
		return nil, fmt.Errorf("mojaloop: parse accounts: %w", err)
	}
	return accounts, nil
}

// AdjustPosition sends a position adjustment for an FSP account (used for
// settlement net position management).
func (c *Client) AdjustPosition(ctx context.Context, fspID, currency string, amount string) error {
	path := fmt.Sprintf("/participants/%s/accounts", fspID)
	payload := map[string]any{
		"currency": currency,
		"amount":   amount,
	}
	body, status, err := c.do(ctx, http.MethodPut, path, payload, "")
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("mojaloop: adjust position %s/%s: HTTP %d: %s", fspID, currency, status, body)
	}
	slog.Info("[mojaloop] position adjusted", "fsp", fspID, "currency", currency, "amount", amount)
	return nil
}

// ─── Health ───────────────────────────────────────────────────────────────────

// Health checks connectivity to the Mojaloop switch.
func (c *Client) Health(ctx context.Context) error {
	if !c.enabled {
		return nil
	}
	_, status, err := c.do(ctx, http.MethodGet, "/health", nil, "")
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("mojaloop: health check: HTTP %d", status)
	}
	return nil
}
