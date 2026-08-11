// Package fspiop implements FSPIOP v1.1 HTTP handlers for NextHub.
// bulkTransfers.go — POST /bulkTransfers, PUT /bulkTransfers/{ID}, GET /bulkTransfers/{ID}
package fspiop

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
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

// bulkTransferRecord is the last known state of a bulk transfer as observed
// by this process from POST /bulkTransfers (prepare) and PUT /bulkTransfers/{ID}
// (fulfilment callback) requests.
type bulkTransferRecord struct {
	State              BulkTransferState
	CompletedTimestamp *string
	UpdatedAt          time.Time
}

// bulkTransferStore is the read model backing GET /bulkTransfers/{ID}.
// It records only states that were actually observed by the POST/PUT handlers;
// IDs never seen fail closed with FSPIOP error 3200 rather than a fabricated
// state. Durable cross-process state lives in the Temporal BulkTransferWorkflow
// (fed by the nexthub.bulk-transfers Fluvio topic); a shared Redis/DB read
// model is the follow-up for multi-replica deployments.
var bulkTransferStore sync.Map // key: bulkTransferID, value: bulkTransferRecord

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

	bulkTransferStore.Store(req.BulkTransferID, bulkTransferRecord{
		State:     BulkTransferReceived,
		UpdatedAt: time.Now().UTC(),
	})

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

	// Record the observed fulfilment state; fall back to PROCESSING when the
	// callback omits a state rather than inventing one.
	observedState := fulfilment.BulkTransferState
	if observedState == "" {
		observedState = BulkTransferProcessing
	}
	var completedTs *string
	if fulfilment.CompletedTimestamp != "" {
		ts := fulfilment.CompletedTimestamp
		completedTs = &ts
	}
	bulkTransferStore.Store(bulkTransferID, bulkTransferRecord{
		State:              observedState,
		CompletedTimestamp: completedTs,
		UpdatedAt:          time.Now().UTC(),
	})

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

	// Look up the observed state; unknown IDs fail closed with FSPIOP 3200.
	status, err := lookupBulkTransferStatus(bulkTransferID)
	if err != nil {
		writeFSPIOPError(w, http.StatusNotFound, "3200", fmt.Sprintf("Generic ID not found — bulk transfer %s is unknown", bulkTransferID))
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.bulkTransfers+json;version=1.1")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(status)
}

// --- helpers ---

func lookupBulkTransferStatus(id string) (map[string]interface{}, error) {
	v, ok := bulkTransferStore.Load(id)
	if !ok {
		return nil, errors.New("unknown bulk transfer ID")
	}
	rec := v.(bulkTransferRecord)
	return map[string]interface{}{
		"bulkTransferId":     id,
		"bulkTransferState":  rec.State,
		"completedTimestamp": rec.CompletedTimestamp,
	}, nil
}
