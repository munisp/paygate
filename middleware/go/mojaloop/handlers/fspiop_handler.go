// Package handlers implements the Mojaloop FSPIOP API bridge for PayGate.
// It translates inbound FSPIOP HTTP callbacks from the Mojaloop Hub into
// internal PayGate events, persists state to Redis, publishes to Kafka/Fluvio,
// and enforces access control via Permify.
//
// FSPIOP flow:
//   1. PayGate initiates party lookup → PUT /parties/{type}/{id}
//   2. Hub responds via callback      → PUT /parties/{type}/{id} (async)
//   3. PayGate requests quote         → POST /quotes
//   4. Hub responds via callback      → PUT /quotes/{id}
//   5. PayGate initiates transfer     → POST /transfers
//   6. Hub responds via callback      → PUT /transfers/{id}
//   7. PayGate fulfils or aborts      → PUT /transfers/{id}/error
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/munisp/paygate/middleware/go/mojaloop/kafka"
	"github.com/munisp/paygate/middleware/go/mojaloop/models"
	"github.com/munisp/paygate/middleware/go/mojaloop/redis"
	"github.com/munisp/paygate/middleware/go/mojaloop/permify"
)

const (
	mojaloopAPIVersion = "1.1"
	defaultTimeout     = 30 * time.Second
)

// FSPIOPHandler handles all Mojaloop FSPIOP HTTP callbacks and outbound requests.
type FSPIOPHandler struct {
	logger     *slog.Logger
	httpClient *http.Client
	hubURL     string // Mojaloop Hub base URL
	fspID      string // PayGate's own FSP ID registered with the Hub
	redis      *redis.MojaloopCache
	kafka      *kafka.MojaloopProducer
	permify    *permify.MojaloopAuthz
}

// NewFSPIOPHandler creates a new handler from environment variables.
func NewFSPIOPHandler() *FSPIOPHandler {
	return &FSPIOPHandler{
		logger:     slog.New(slog.NewJSONHandler(os.Stdout, nil)),
		httpClient: &http.Client{Timeout: defaultTimeout},
		hubURL:     getEnv("MOJALOOP_URL", "http://ml-api-adapter.local"),
		fspID:      getEnv("MOJALOOP_FSP_ID", "paygate"),
		redis:      redis.NewMojaloopCache(),
		kafka:      kafka.NewMojaloopProducer(),
		permify:    permify.NewMojaloopAuthz(),
	}
}

// ─── Outbound: Party Lookup ───────────────────────────────────────────────────

// LookupParty sends a GET /parties/{type}/{id} to the Mojaloop Hub.
// The Hub responds asynchronously via PUT /parties/{type}/{id} callback.
func (h *FSPIOPHandler) LookupParty(ctx context.Context, req models.PartyLookupRequest) error {
	url := fmt.Sprintf("%s/parties/%s/%s", h.hubURL, req.PartyIDType, req.PartyIdentifier)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("mojaloop: build party lookup request: %w", err)
	}
	h.setFSPIOPHeaders(httpReq, req.MerchantID)

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("mojaloop: party lookup HTTP: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("mojaloop: party lookup unexpected status %d", resp.StatusCode)
	}

	// Cache pending lookup state in Redis (TTL 60s)
	h.redis.SetPartyLookupPending(ctx, req.PartyIDType, req.PartyIdentifier, req.MerchantID)
	h.logger.Info("mojaloop party lookup initiated",
		"partyIdType", req.PartyIDType,
		"partyIdentifier", req.PartyIdentifier,
		"merchantId", req.MerchantID,
	)
	return nil
}

// ─── Inbound Callback: Party Lookup Result ────────────────────────────────────

// HandlePartyCallback processes the async PUT /parties/{type}/{id} callback from the Hub.
func (h *FSPIOPHandler) HandlePartyCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	partyIDType := r.PathValue("type")
	partyIdentifier := r.PathValue("id")

	var party models.FSPIOPParty
	if err := json.NewDecoder(r.Body).Decode(&party); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Invalid party callback body")
		return
	}

	// Validate FSPIOP-Source header
	sourceFSP := r.Header.Get("FSPIOP-Source")
	if sourceFSP == "" {
		h.writeError(w, http.StatusBadRequest, "3100", "Missing FSPIOP-Source header")
		return
	}

	// Retrieve pending lookup from Redis
	merchantID, err := h.redis.GetPartyLookupPending(ctx, partyIDType, partyIdentifier)
	if err != nil {
		h.logger.Warn("mojaloop: no pending party lookup found", "partyIdType", partyIDType, "partyIdentifier", partyIdentifier)
		w.WriteHeader(http.StatusOK)
		return
	}

	// Check Permify: merchant must have mojaloop:transfer:initiate permission
	if !h.permify.CanInitiateTransfer(ctx, merchantID) {
		h.writeError(w, http.StatusForbidden, "3200", "Merchant not authorised for Mojaloop transfers")
		return
	}

	// Publish party.found event to Kafka
	event := models.PartyFoundEvent{
		EventType:       "mojaloop.party.found",
		MerchantID:      merchantID,
		PartyIDType:     partyIDType,
		PartyIdentifier: partyIdentifier,
		FspID:           sourceFSP,
		Party:           party,
		Timestamp:       time.Now().UTC(),
	}
	if err := h.kafka.PublishPartyFound(ctx, event); err != nil {
		h.logger.Error("mojaloop: failed to publish party.found", "error", err)
	}

	h.logger.Info("mojaloop party callback received",
		"partyIdType", partyIDType,
		"partyIdentifier", partyIdentifier,
		"fspId", sourceFSP,
		"merchantId", merchantID,
	)
	w.WriteHeader(http.StatusOK)
}

// ─── Outbound: Quote Request ──────────────────────────────────────────────────

// RequestQuote sends a POST /quotes to the Mojaloop Hub.
func (h *FSPIOPHandler) RequestQuote(ctx context.Context, req models.QuoteRequest) error {
	body, err := json.Marshal(req.ToFSPIOP(h.fspID))
	if err != nil {
		return fmt.Errorf("mojaloop: marshal quote request: %w", err)
	}

	url := fmt.Sprintf("%s/quotes", h.hubURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
		bytesReader(body))
	if err != nil {
		return fmt.Errorf("mojaloop: build quote request: %w", err)
	}
	h.setFSPIOPHeaders(httpReq, req.MerchantID)
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.quotes+json;version="+mojaloopAPIVersion)

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("mojaloop: quote request HTTP: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("mojaloop: quote unexpected status %d", resp.StatusCode)
	}

	// Cache pending quote in Redis
	h.redis.SetQuotePending(ctx, req.QuoteID, req.MerchantID)
	h.logger.Info("mojaloop quote requested", "quoteId", req.QuoteID, "merchantId", req.MerchantID)
	return nil
}

// ─── Inbound Callback: Quote Result ──────────────────────────────────────────

// HandleQuoteCallback processes the async PUT /quotes/{id} callback from the Hub.
func (h *FSPIOPHandler) HandleQuoteCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	quoteID := r.PathValue("id")

	var quoteResp models.FSPIOPQuoteResponse
	if err := json.NewDecoder(r.Body).Decode(&quoteResp); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Invalid quote callback body")
		return
	}

	merchantID, err := h.redis.GetQuotePending(ctx, quoteID)
	if err != nil {
		h.logger.Warn("mojaloop: no pending quote found", "quoteId", quoteID)
		w.WriteHeader(http.StatusOK)
		return
	}

	event := models.QuoteAcceptedEvent{
		EventType:  "mojaloop.quote.accepted",
		MerchantID: merchantID,
		QuoteID:    quoteID,
		Quote:      quoteResp,
		Timestamp:  time.Now().UTC(),
	}
	if err := h.kafka.PublishQuoteAccepted(ctx, event); err != nil {
		h.logger.Error("mojaloop: failed to publish quote.accepted", "error", err)
	}

	h.logger.Info("mojaloop quote callback received", "quoteId", quoteID, "merchantId", merchantID)
	w.WriteHeader(http.StatusOK)
}

// ─── Outbound: Transfer ───────────────────────────────────────────────────────

// InitiateTransfer sends a POST /transfers to the Mojaloop Hub.
func (h *FSPIOPHandler) InitiateTransfer(ctx context.Context, req models.TransferRequest) error {
	body, err := json.Marshal(req.ToFSPIOP())
	if err != nil {
		return fmt.Errorf("mojaloop: marshal transfer request: %w", err)
	}

	url := fmt.Sprintf("%s/transfers", h.hubURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytesReader(body))
	if err != nil {
		return fmt.Errorf("mojaloop: build transfer request: %w", err)
	}
	h.setFSPIOPHeaders(httpReq, req.MerchantID)
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version="+mojaloopAPIVersion)

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("mojaloop: transfer HTTP: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("mojaloop: transfer unexpected status %d", resp.StatusCode)
	}

	// Cache pending transfer in Redis (TTL 120s)
	h.redis.SetTransferPending(ctx, req.TransferID, req.MerchantID, req.QuoteID)
	h.logger.Info("mojaloop transfer initiated", "transferId", req.TransferID, "merchantId", req.MerchantID)
	return nil
}

// ─── Inbound Callback: Transfer Result ───────────────────────────────────────

// HandleTransferCallback processes the async PUT /transfers/{id} callback from the Hub.
func (h *FSPIOPHandler) HandleTransferCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	transferID := r.PathValue("id")

	var transferResp models.FSPIOPTransferResponse
	if err := json.NewDecoder(r.Body).Decode(&transferResp); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Invalid transfer callback body")
		return
	}

	merchantID, quoteID, err := h.redis.GetTransferPending(ctx, transferID)
	if err != nil {
		h.logger.Warn("mojaloop: no pending transfer found", "transferId", transferID)
		w.WriteHeader(http.StatusOK)
		return
	}

	event := models.TransferCompletedEvent{
		EventType:     "mojaloop.transfer.completed",
		MerchantID:    merchantID,
		TransferID:    transferID,
		QuoteID:       quoteID,
		TransferState: transferResp.TransferState,
		Fulfilment:    transferResp.Fulfilment,
		Timestamp:     time.Now().UTC(),
	}
	if err := h.kafka.PublishTransferCompleted(ctx, event); err != nil {
		h.logger.Error("mojaloop: failed to publish transfer.completed", "error", err)
	}

	// Clear Redis pending state
	h.redis.DeleteTransferPending(ctx, transferID)

	h.logger.Info("mojaloop transfer callback received",
		"transferId", transferID,
		"state", transferResp.TransferState,
		"merchantId", merchantID,
	)
	w.WriteHeader(http.StatusOK)
}

// ─── Inbound Callback: Transfer Error ────────────────────────────────────────

// HandleTransferError processes PUT /transfers/{id}/error callbacks from the Hub.
func (h *FSPIOPHandler) HandleTransferError(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	transferID := r.PathValue("id")

	var errResp models.FSPIOPErrorResponse
	if err := json.NewDecoder(r.Body).Decode(&errResp); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Invalid error callback body")
		return
	}

	merchantID, quoteID, _ := h.redis.GetTransferPending(ctx, transferID)

	event := models.TransferFailedEvent{
		EventType:        "mojaloop.transfer.failed",
		MerchantID:       merchantID,
		TransferID:       transferID,
		QuoteID:          quoteID,
		ErrorCode:        errResp.ErrorInformation.ErrorCode,
		ErrorDescription: errResp.ErrorInformation.ErrorDescription,
		Timestamp:        time.Now().UTC(),
	}
	if err := h.kafka.PublishTransferFailed(ctx, event); err != nil {
		h.logger.Error("mojaloop: failed to publish transfer.failed", "error", err)
	}

	h.redis.DeleteTransferPending(ctx, transferID)
	h.logger.Error("mojaloop transfer error callback",
		"transferId", transferID,
		"errorCode", errResp.ErrorInformation.ErrorCode,
		"errorDescription", errResp.ErrorInformation.ErrorDescription,
	)
	w.WriteHeader(http.StatusOK)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (h *FSPIOPHandler) setFSPIOPHeaders(r *http.Request, merchantID string) {
	r.Header.Set("Accept", "application/vnd.interoperability.transfers+json;version="+mojaloopAPIVersion)
	r.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version="+mojaloopAPIVersion)
	r.Header.Set("FSPIOP-Source", h.fspID)
	r.Header.Set("FSPIOP-Destination", "switch")
	r.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))
	r.Header.Set("X-Merchant-ID", merchantID)
}

func (h *FSPIOPHandler) writeError(w http.ResponseWriter, status int, code, desc string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"errorInformation": map[string]string{
			"errorCode":        code,
			"errorDescription": desc,
		},
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func bytesReader(b []byte) *bytesReaderImpl {
	return &bytesReaderImpl{data: b, pos: 0}
}

type bytesReaderImpl struct {
	data []byte
	pos  int
}

func (r *bytesReaderImpl) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, fmt.Errorf("EOF")
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}
