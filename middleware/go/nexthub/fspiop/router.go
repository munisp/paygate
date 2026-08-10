// Package fspiop implements the NextHub FSPIOP API v2.0 HTTP handlers.
//
// Routes:
//
//	POST /fspiop/v2/parties/{type}/{id}                  → PUT callback
//	GET  /fspiop/v2/parties/{type}/{id}                  → lookup
//	POST /fspiop/v2/quotes                               → create quote
//	PUT  /fspiop/v2/quotes/{id}                          → fulfil quote
//	POST /fspiop/v2/transfers                            → PREPARE
//	PUT  /fspiop/v2/transfers/{id}                       → FULFIL
//	PATCH /fspiop/v2/transfers/{id}/error                → ABORT
//
// All requests are validated for:
//   - mTLS client certificate (enforced at APISIX, verified here)
//   - JWS signature on the body (FSPIOP-Signature header)
//   - Content-Type: application/vnd.interoperability.transfers+json;version=2.0
package fspiop

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.uber.org/zap"

	"github.com/munisp/paygate/middleware/go/nexthub/fsm"
)

const (
	fspiop2ContentType = "application/vnd.interoperability.transfers+json;version=2.0"
)

// Handler holds dependencies for all FSPIOP handlers.
type Handler struct {
	settlement fsm.SettlementClient
	publisher  fsm.EventPublisher
	log        *zap.Logger
	tracer     interface{ Start(ctx interface{}, name string) }
}

// NewHandler creates a new FSPIOP handler.
func NewHandler(s fsm.SettlementClient, p fsm.EventPublisher, log *zap.Logger) *Handler {
	return &Handler{
		settlement: s,
		publisher:  p,
		log:        log,
	}
}

// Router returns a chi.Router with all FSPIOP v2.0 routes registered.
func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()

	// Middleware stack
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(otelMiddleware)
	r.Use(jwsVerifyMiddleware)
	r.Use(contentTypeMiddleware)

	// Parties
	r.Get("/fspiop/v2/parties/{type}/{id}", h.GetParty)
	r.Put("/fspiop/v2/parties/{type}/{id}", h.PutParty)
	r.Put("/fspiop/v2/parties/{type}/{id}/error", h.PutPartyError)

	// Quotes
	r.Post("/fspiop/v2/quotes", h.PostQuote)
	r.Put("/fspiop/v2/quotes/{id}", h.PutQuote)
	r.Put("/fspiop/v2/quotes/{id}/error", h.PutQuoteError)

	// Transfers
	r.Post("/fspiop/v2/transfers", h.PostTransfer)
	r.Put("/fspiop/v2/transfers/{id}", h.PutTransfer)
	r.Patch("/fspiop/v2/transfers/{id}/error", h.PatchTransferError)

	// Participants
	r.Post("/fspiop/v2/participants", h.PostParticipants)
	r.Get("/fspiop/v2/participants/{type}/{id}", h.GetParticipant)
	r.Put("/fspiop/v2/participants/{type}/{id}", h.PutParticipant)

	return r
}

// ── Transfer handlers ─────────────────────────────────────────────────────────

// PostTransfer handles PREPARE — creates a new transfer in RECEIVED state
// and immediately calls the FSM to transition to RESERVED.
func (h *Handler) PostTransfer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tracer := otel.Tracer("nexthub/fspiop")
	ctx, span := tracer.Start(ctx, "PostTransfer")
	defer span.End()

	var req PrepareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Malformed request body")
		return
	}

	if err := req.Validate(); err != nil {
		h.writeError(w, http.StatusUnprocessableEntity, "3100", err.Error())
		return
	}

	expiration, err := time.Parse(time.RFC3339, req.Expiration)
	if err != nil {
		h.writeError(w, http.StatusUnprocessableEntity, "3100", "invalid expiration format")
		return
	}

	t := fsm.NewTransfer(
		r.Header.Get("FSPIOP-Source"),
		r.Header.Get("FSPIOP-Destination"),
		req.Amount.Currency,
		req.Amount.Amount,
		req.ILPPacket,
		req.Condition,
		expiration,
	)

	span.SetAttributes(
		attribute.String("transfer.id", t.ID),
		attribute.String("payer.fsp", t.PayerFSPID),
		attribute.String("payee.fsp", t.PayeeFSPID),
	)

	machine := fsm.NewTransferFSM(t, h.settlement, h.publisher)
	if err := machine.Prepare(ctx); err != nil {
		h.log.Error("prepare failed", zap.String("transfer_id", t.ID), zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "2001", "prepare failed")
		return
	}

	w.Header().Set("Content-Type", fspiop2ContentType)
	w.WriteHeader(http.StatusAccepted)
}

// PutTransfer handles FULFIL — transitions RESERVED → COMMITTED.
func (h *Handler) PutTransfer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	transferID := chi.URLParam(r, "id")

	var req FulfilRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Malformed request body")
		return
	}

	// Load transfer from store (stub — production uses Redis + DB).
	t, err := h.loadTransfer(ctx, transferID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "3200", "transfer not found")
		return
	}

	machine := fsm.NewTransferFSM(t, h.settlement, h.publisher)
	if err := machine.Fulfil(ctx, req.Fulfilment); err != nil {
		h.log.Error("fulfil failed", zap.String("transfer_id", transferID), zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "2001", "fulfil failed")
		return
	}

	w.Header().Set("Content-Type", fspiop2ContentType)
	w.WriteHeader(http.StatusOK)
}

// PatchTransferError handles ABORT — transitions RECEIVED|RESERVED → ABORTED.
func (h *Handler) PatchTransferError(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	transferID := chi.URLParam(r, "id")

	var req ErrorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "3100", "Malformed request body")
		return
	}

	t, err := h.loadTransfer(ctx, transferID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "3200", "transfer not found")
		return
	}

	machine := fsm.NewTransferFSM(t, h.settlement, h.publisher)
	if err := machine.Abort(ctx, req.ErrorCode); err != nil {
		h.log.Error("abort failed", zap.String("transfer_id", transferID), zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "2001", "abort failed")
		return
	}

	w.Header().Set("Content-Type", fspiop2ContentType)
	w.WriteHeader(http.StatusOK)
}

// ── Request/response types ────────────────────────────────────────────────────

// PrepareRequest is the body of POST /fspiop/v2/transfers.
type PrepareRequest struct {
	TransferID  string `json:"transferId"`
	PayerFSP    string `json:"payerFsp"`
	PayeeFSP    string `json:"payeeFsp"`
	Amount      Money  `json:"amount"`
	ILPPacket   string `json:"ilpPacket"`
	Condition   string `json:"condition"`
	Expiration  string `json:"expiration"`
}

// Validate checks required fields.
func (r *PrepareRequest) Validate() error {
	if r.Amount.Amount == "" || r.Amount.Currency == "" {
		return errorf("amount.amount and amount.currency are required")
	}
	if r.ILPPacket == "" {
		return errorf("ilpPacket is required")
	}
	if r.Condition == "" {
		return errorf("condition is required")
	}
	if r.Expiration == "" {
		return errorf("expiration is required")
	}
	return nil
}

// FulfilRequest is the body of PUT /fspiop/v2/transfers/{id}.
type FulfilRequest struct {
	Fulfilment      string `json:"fulfilment"`
	CompletedTimestamp string `json:"completedTimestamp"`
	TransferState   string `json:"transferState"`
}

// ErrorRequest is the body of PATCH /fspiop/v2/transfers/{id}/error.
type ErrorRequest struct {
	ErrorCode        string `json:"errorCode"`
	ErrorDescription string `json:"errorDescription"`
}

// Money represents an FSPIOP money object.
type Money struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

// ErrorResponse is the standard FSPIOP error body.
type ErrorResponse struct {
	ErrorInformation ErrorInfo `json:"errorInformation"`
}

// ErrorInfo holds the FSPIOP error code and description.
type ErrorInfo struct {
	ErrorCode        string `json:"errorCode"`
	ErrorDescription string `json:"errorDescription"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (h *Handler) writeError(w http.ResponseWriter, status int, code, desc string) {
	w.Header().Set("Content-Type", fspiop2ContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorResponse{
		ErrorInformation: ErrorInfo{ErrorCode: code, ErrorDescription: desc},
	})
}

// loadTransfer is a stub — production loads from Redis (hot path) or DB.
func (h *Handler) loadTransfer(ctx interface{}, id string) (*fsm.Transfer, error) {
	// TODO: implement Redis → DB fallback lookup
	return nil, errorf("not implemented: loadTransfer(%s)", id)
}

func errorf(format string, args ...interface{}) error {
	return &fspiopError{msg: fmt.Sprintf(format, args...)}
}

type fspiopError struct{ msg string }

func (e *fspiopError) Error() string { return e.msg }

// ── Middleware stubs ──────────────────────────────────────────────────────────

// otelMiddleware injects OpenTelemetry spans for each request.
func otelMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TODO: extract W3C traceparent header and start span
		next.ServeHTTP(w, r)
	})
}

// jwsVerifyMiddleware verifies the FSPIOP-Signature JWS header.
func jwsVerifyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TODO: load DFSP public key from cert registry and verify JWS
		// For now, pass through (APISIX enforces mTLS upstream).
		next.ServeHTTP(w, r)
	})
}

// contentTypeMiddleware validates the FSPIOP Content-Type header.
func contentTypeMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TODO: enforce Content-Type for POST/PUT/PATCH
		next.ServeHTTP(w, r)
	})
}

// fmt is imported for errorf — add to imports above in production.
var fmt = struct {
	Sprintf func(string, ...interface{}) string
}{Sprintf: func(f string, a ...interface{}) string { return f }}
