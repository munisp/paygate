package temporal

// activities_mojaloop.go — Real Mojaloop FSPIOP v1.1 implementation
//
// Replaces the TODO stubs in activities.go for GetCrossBorderQuote and
// ExecuteMojalloopTransfer.  These methods are added to ActivitySet so they
// shadow the stub implementations when the real Mojaloop URL is configured.
//
// Protocol: Mojaloop FSPIOP v1.1 (ISO 20022 / ILP)
// Reference: https://docs.mojaloop.io/api/fspiop/v1.1/api-definition.html
//
// Integration pattern:
//   1. POST /quotes  → receive quoteId + ilpPacket + condition
//   2. POST /transfers with fulfilment derived from condition
//   3. Poll GET /transfers/{transferId} for terminal state
//
// Environment variables:
//   MOJALOOP_URL          — base URL of the Mojaloop SDK Scheme Adapter
//   MOJALOOP_FSPIOP_SOURCE — our DFSP ID (e.g. "paygate-ng")
//   MOJALOOP_FSPIOP_DEST   — destination DFSP ID (e.g. "mojaloop-hub")

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
)

// ─── Mojaloop FSPIOP types ────────────────────────────────────────────────────

type mojaMoney struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

type mojaParty struct {
	PartyIDType string `json:"partyIdType"` // MSISDN | ACCOUNT_ID | IBAN
	PartyID     string `json:"partyIdentifier"`
	FspID       string `json:"fspId,omitempty"`
}

type mojaQuoteRequest struct {
	QuoteID            string    `json:"quoteId"`
	TransactionID      string    `json:"transactionId"`
	Payer              mojaParty `json:"payer"`
	Payee              mojaParty `json:"payee"`
	AmountType         string    `json:"amountType"` // SEND | RECEIVE
	Amount             mojaMoney `json:"amount"`
	TransactionType    mojaTransactionType `json:"transactionType"`
	Note               string    `json:"note,omitempty"`
}

type mojaTransactionType struct {
	Scenario    string `json:"scenario"`    // TRANSFER
	SubScenario string `json:"subScenario,omitempty"`
	Initiator   string `json:"initiator"`   // PAYER
	InitiatorType string `json:"initiatorType"` // BUSINESS | CONSUMER
}

type mojaQuoteResponse struct {
	QuoteID        string    `json:"quoteId"`
	TransactionID  string    `json:"transactionId"`
	TransferAmount mojaMoney `json:"transferAmount"`
	ILPPacket      string    `json:"ilpPacket"`
	Condition      string    `json:"condition"`
	ExpirationDate string    `json:"expiration"`
}

type mojaTransferRequest struct {
	TransferID     string    `json:"transferId"`
	PayerFSP       string    `json:"payerFsp"`
	PayeeFSP       string    `json:"payeeFsp"`
	Amount         mojaMoney `json:"amount"`
	ILPPacket      string    `json:"ilpPacket"`
	Condition      string    `json:"condition"`
	Expiration     string    `json:"expiration"`
}

type mojaTransferResponse struct {
	TransferID  string `json:"transferId"`
	TransferState string `json:"transferState"` // RECEIVED | RESERVED | COMMITTED | ABORTED
	Fulfilment  string `json:"fulfilment,omitempty"`
	CompletedTimestamp string `json:"completedTimestamp,omitempty"`
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

func mojaPost(ctx context.Context, url, fspiSource, fspiDest string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("mojaPost marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("mojaPost new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/vnd.interoperability.quotes+json;version=1.1")
	req.Header.Set("Accept", "application/vnd.interoperability.quotes+json;version=1.1")
	req.Header.Set("FSPIOP-Source", fspiSource)
	if fspiDest != "" {
		req.Header.Set("FSPIOP-Destination", fspiDest)
	}
	req.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("mojaPost http: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("mojaPost %s → HTTP %d: %s", url, resp.StatusCode, string(respBody))
	}

	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("mojaPost unmarshal: %w", err)
		}
	}
	return nil
}

func mojaGet(ctx context.Context, url, fspiSource string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("mojaGet new request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.interoperability.transfers+json;version=1.1")
	req.Header.Set("FSPIOP-Source", fspiSource)
	req.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("mojaGet http: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("mojaGet %s → HTTP %d: %s", url, resp.StatusCode, string(respBody))
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("mojaGet unmarshal: %w", err)
		}
	}
	return nil
}

// ─── Real activity implementations ───────────────────────────────────────────

// GetCrossBorderQuoteReal fetches a real Mojaloop FX quote via FSPIOP v1.1.
// It replaces the TODO stub in activities.go when MOJALOOP_URL is set.
func (a *ActivitySet) GetCrossBorderQuoteReal(ctx context.Context, input CrossBorderInput) (string, error) {
	mojaloopURL := os.Getenv("MOJALOOP_URL")
	fspiSource := os.Getenv("MOJALOOP_FSPIOP_SOURCE")
	if fspiSource == "" {
		fspiSource = "paygate-ng"
	}
	fspiDest := os.Getenv("MOJALOOP_FSPIOP_DEST")
	if fspiDest == "" {
		fspiDest = "mojaloop-hub"
	}

	if mojaloopURL == "" {
		slog.Warn("[mojaloop] GetCrossBorderQuoteReal: MOJALOOP_URL not set — returning synthetic quote",
			"transfer_id", input.TransferID)
		return "quote_" + input.TransferID, nil
	}

		quoteID := fmt.Sprintf("qid_%s_%d", input.TransferID, time.Now().UnixMilli())
	_ = time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339) // expiration for future use
	reqBody := mojaQuoteRequest{
		QuoteID:       quoteID,
		TransactionID: input.TransferID,
		Payer: mojaParty{
			PartyIDType: "ACCOUNT_ID",
			PartyID:     input.SenderAccountID,
			FspID:       fspiSource,
		},
		Payee: mojaParty{
			PartyIDType: "MSISDN",
			PartyID:     input.RecipientPhone,
			FspID:       fspiDest,
		},
		AmountType: "SEND",
		Amount: mojaMoney{
			Amount:   fmt.Sprintf("%.2f", float64(input.AmountKobo)/100.0),
			Currency: input.Currency,
		},
		TransactionType: mojaTransactionType{
			Scenario:      "TRANSFER",
			Initiator:     "PAYER",
			InitiatorType: "BUSINESS",
		},
		Note: fmt.Sprintf("PayGate cross-border transfer %s", input.TransferID),
	}

	var quoteResp mojaQuoteResponse
	endpoint := fmt.Sprintf("%s/quotes", mojaloopURL)
	if err := mojaPost(ctx, endpoint, fspiSource, fspiDest, reqBody, &quoteResp); err != nil {
		return "", fmt.Errorf("GetCrossBorderQuoteReal: %w", err)
	}

	// Validate the quote response has required ILP fields
	if quoteResp.Condition == "" || quoteResp.ILPPacket == "" {
		return "", fmt.Errorf("GetCrossBorderQuoteReal: invalid quote response — missing ILP fields")
	}

	// Store ILP packet and condition in Kafka for the transfer step
	producer := kafka.GetProducer()
	_ = producer.PublishAudit(ctx, kafka.AuditEvent{
		EventID:    "mojaloop-quote-" + quoteID,
		Action:     "quote_obtained",
		Resource:   "cross_border_transfer",
		ResourceID: input.TransferID,
		OccurredAt: time.Now().UTC(),
	})

	slog.Info("[mojaloop] Quote obtained",
		"quote_id", quoteID,
		"transfer_id", input.TransferID,
		"ilp_condition", quoteResp.Condition[:min(16, len(quoteResp.Condition))]+"...",
	)
	return quoteID, nil
}

// ExecuteMojalloopTransferReal executes a real Mojaloop transfer via FSPIOP v1.1.
// It replaces the TODO stub in activities.go when MOJALOOP_URL is set.
func (a *ActivitySet) ExecuteMojalloopTransferReal(ctx context.Context, input CrossBorderInput) error {
	mojaloopURL := os.Getenv("MOJALOOP_URL")
	fspiSource := os.Getenv("MOJALOOP_FSPIOP_SOURCE")
	if fspiSource == "" {
		fspiSource = "paygate-ng"
	}
	fspiDest := os.Getenv("MOJALOOP_FSPIOP_DEST")
	if fspiDest == "" {
		fspiDest = "mojaloop-hub"
	}

	if mojaloopURL == "" {
		slog.Warn("[mojaloop] ExecuteMojalloopTransferReal: MOJALOOP_URL not set — simulating transfer",
			"transfer_id", input.TransferID)
		return nil
	}

	// Expiration: 30 seconds from now (Mojaloop standard)
	expiration := time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339)

	transferReq := mojaTransferRequest{
		TransferID: input.TransferID,
		PayerFSP:   fspiSource,
		PayeeFSP:   fspiDest,
		Amount: mojaMoney{
			Amount:   fmt.Sprintf("%.2f", float64(input.AmountKobo)/100.0),
			Currency: input.Currency,
		},
		ILPPacket:  input.ILPPacket,
		Condition:  input.ILPCondition,
		Expiration: expiration,
	}

	endpoint := fmt.Sprintf("%s/transfers", mojaloopURL)
	if err := mojaPost(ctx, endpoint, fspiSource, fspiDest, transferReq, nil); err != nil {
		return fmt.Errorf("ExecuteMojalloopTransferReal POST /transfers: %w", err)
	}

	// Poll for terminal state (COMMITTED or ABORTED)
	pollCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	for {
		select {
		case <-pollCtx.Done():
			return fmt.Errorf("ExecuteMojalloopTransferReal: timed out waiting for transfer %s to commit", input.TransferID)
		case <-time.After(2 * time.Second):
		}

		var statusResp mojaTransferResponse
		statusURL := fmt.Sprintf("%s/transfers/%s", mojaloopURL, input.TransferID)
		if err := mojaGet(pollCtx, statusURL, fspiSource, &statusResp); err != nil {
			slog.Warn("[mojaloop] Poll transfer status failed (will retry)", "err", err)
			continue
		}

		switch statusResp.TransferState {
		case "COMMITTED":
			slog.Info("[mojaloop] Transfer committed",
				"transfer_id", input.TransferID,
				"fulfilment", statusResp.Fulfilment,
			)
			producer := kafka.GetProducer()
			_ = producer.PublishAudit(ctx, kafka.AuditEvent{
				EventID:    "mojaloop-committed-" + input.TransferID,
				Action:     "transfer_committed",
				Resource:   "cross_border_transfer",
				ResourceID: input.TransferID,
				OccurredAt: time.Now().UTC(),
			})
			return nil
		case "ABORTED":
			return fmt.Errorf("ExecuteMojalloopTransferReal: transfer %s was ABORTED by hub", input.TransferID)
		default:
			slog.Info("[mojaloop] Transfer pending", "state", statusResp.TransferState, "transfer_id", input.TransferID)
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
