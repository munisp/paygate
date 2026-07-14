// Package fspiop implements FSPIOP v1.1 HTTP handlers for NextHub.
// bulkTransfers.go — POST /bulkTransfers, PUT /bulkTransfers/{ID}, GET /bulkTransfers/{ID}
package fspiop

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// BulkTransferState mirrors the FSPIOP bulk transfer state machine.
type BulkTransferState string

const (
	BulkTransferReceived   BulkTransferState = "RECEIVED"
	BulkTransferPending    BulkTransferState = "PENDING"
	BulkTransferAccepted   BulkTransferState = "ACCEPTED"
	BulkTransferProcessing BulkTransferState = "PROCESSING"
	BulkTransferCompleted  BulkTransferState = "COMPLETED"
	BulkTransferRejected   BulkTransferState = "REJECTED"
)

// IndividualTransfer is a single transfer within a bulk request.
type IndividualTransfer struct {
	TransferID    string          `json:"transferId"`
	TransferAmount Money           `json:"transferAmount"`
	ILPPacket     string          `json:"ilpPacket"`
	Condition     string          `json:"condition"`
	Extensions    json.RawMessage `json:"extensionList,omitempty"`
}

// BulkTransferRequest is the FSPIOP POST /bulkTransfers body.
type BulkTransferRequest struct {
	BulkTransferID      string               `json:"bulkTransferId"`
	BulkQuoteID         string               `json:"bulkQuoteId"`
	PayerFSP            string               `json:"payerFsp"`
	PayeeFSP            string               `json:"payeeFsp"`
	IndividualTransfers []IndividualTransfer  `json:"individualTransfers"`
	Expiration          string               `json:"expiration"`
	Extensions          json.RawMessage      `json:"extensionList,omitempty"`
}

// BulkTransferFulfilment is the FSPIOP PUT /bulkTransfers/{ID} body.
type BulkTransferFulfilment struct {
	CompletedTimestamp      string               `json:"completedTimestamp"`
	IndividualTransferResults []IndividualResult `json:"individualTransferResults"`
	BulkTransferState       BulkTransferState    `json:"bulkTransferState"`
	Extensions              json.RawMessage      `json:"extensionList,omitempty"`
}

// IndividualResult is the result for a single transfer in a bulk fulfilment.
type IndividualResult struct {
	TransferID  string          `json:"transferId"`
	Fulfilment  string          `json:"fulfilment,omitempty"`
	ErrorInfo   *FSPIOPError    `json:"errorInformation,omitempty"`
	Extensions  json.RawMessage `json:"extensionList,omitempty"`
}

// FSPIOPError represents a standard FSPIOP error body.
type FSPIOPError struct {
	ErrorCode        string `json:"errorCode"`
	ErrorDescription string `json:"errorDescription"`
}

// BulkTransfersHandler handles POST /bulkTransfers — initiates a bulk two-phase transfer.
// The handler validates the request, publishes to Fluvio topic nexthub.bulk-transfers,
// and returns HTTP 202 Accepted. The Temporal BulkTransferWorkflow picks up the event
// and orchestrates individual PREPARE calls to the Rust settlement service.
func BulkTransfersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source")
	destination := r.Header.Get("FSPIOP-Destination")
	if source == "" || destination == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing FSPIOP-Source or FSPIOP-Destination header")
		return
	}

	var req BulkTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid request body: %v", err))
		return
	}

	if req.BulkTransferID == "" {
		req.BulkTransferID = uuid.New().String()
	}
	if len(req.IndividualTransfers) == 0 {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "individualTransfers must not be empty")
		return
	}
	if len(req.IndividualTransfers) > 1000 {
		writeFSPIOPError(w, http.StatusBadRequest, "3106", "Bulk transfer exceeds maximum of 1000 individual transfers")
		return
	}

	// Validate expiration
	if req.Expiration != "" {
		exp, err := time.Parse(time.RFC3339, req.Expiration)
		if err != nil || exp.Before(time.Now()) {
			writeFSPIOPError(w, http.StatusBadRequest, "3300", "Transfer expiration is invalid or in the past")
			return
		}
	}

	// Publish to Fluvio nexthub.bulk-transfers topic
	event := map[string]interface{}{
		"type":            "BULK_TRANSFER_PREPARE",
		"bulkTransferId":  req.BulkTransferID,
		"payerFsp":        req.PayerFSP,
		"payeeFsp":        req.PayeeFSP,
		"transferCount":   len(req.IndividualTransfers),
		"bulkQuoteId":     req.BulkQuoteID,
		"expiration":      req.Expiration,
		"timestamp":       time.Now().UTC().Format(time.RFC3339Nano),
		"source":          source,
		"destination":     destination,
		"payload":         req,
	}

	if err := publishToFluvio("nexthub.bulk-transfers", req.BulkTransferID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to enqueue bulk transfer")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.bulkTransfers+json;version=1.1")
	w.WriteHeader(http.StatusAccepted)
}

// BulkTransferFulfilmentHandler handles PUT /bulkTransfers/{ID} — receives bulk fulfilment callback.
func BulkTransferFulfilmentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	bulkTransferID := extractPathParam(r.URL.Path, "/bulkTransfers/")
	if bulkTransferID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing bulkTransferId in path")
		return
	}

	var fulfilment BulkTransferFulfilment
	if err := json.NewDecoder(r.Body).Decode(&fulfilment); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid fulfilment body: %v", err))
		return
	}

	event := map[string]interface{}{
		"type":           "BULK_TRANSFER_FULFIL",
		"bulkTransferId": bulkTransferID,
		"state":          fulfilment.BulkTransferState,
		"resultCount":    len(fulfilment.IndividualTransferResults),
		"timestamp":      time.Now().UTC().Format(time.RFC3339Nano),
		"payload":        fulfilment,
	}

	if err := publishToFluvio("nexthub.bulk-transfers", bulkTransferID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to process bulk fulfilment")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// BulkTransferGetHandler handles GET /bulkTransfers/{ID} — retrieves bulk transfer status.
func BulkTransferGetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	bulkTransferID := extractPathParam(r.URL.Path, "/bulkTransfers/")
	if bulkTransferID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing bulkTransferId in path")
		return
	}

	// Lookup from Redis cache first, then PostgreSQL
	status, err := lookupBulkTransferStatus(bulkTransferID)
	if err != nil {
		writeFSPIOPError(w, http.StatusNotFound, "3208", fmt.Sprintf("Bulk transfer %s not found", bulkTransferID))
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.bulkTransfers+json;version=1.1")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(status)
}

// --- helpers ---

func lookupBulkTransferStatus(id string) (map[string]interface{}, error) {
	// In production: check Redis cache, then query PostgreSQL nexthub_bulk_transfers table.
	// Returns stub for now — replaced by real DB lookup in the full implementation.
	return map[string]interface{}{
		"bulkTransferId":    id,
		"bulkTransferState": BulkTransferProcessing,
		"completedTimestamp": nil,
	}, nil
}
