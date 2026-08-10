// bulkQuotes.go — POST /bulkQuotes, PUT /bulkQuotes/{ID}
package fspiop

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// IndividualQuote is a single quote request within a bulk quotes request.
type IndividualQuote struct {
	QuoteID          string          `json:"quoteId"`
	TransactionID    string          `json:"transactionId"`
	Payee            Party           `json:"payee"`
	AmountType       string          `json:"amountType"` // SEND or RECEIVE
	Amount           Money           `json:"amount"`
	Fees             *Money          `json:"fees,omitempty"`
	TransactionType  TransactionType `json:"transactionType"`
	Note             string          `json:"note,omitempty"`
	Extensions       json.RawMessage `json:"extensionList,omitempty"`
}

// BulkQuoteRequest is the FSPIOP POST /bulkQuotes body.
type BulkQuoteRequest struct {
	BulkQuoteID      string            `json:"bulkQuoteId"`
	Payer            PartyInfo         `json:"payer"`
	GeoCode          *GeoCode          `json:"geoCode,omitempty"`
	Expiration       string            `json:"expiration,omitempty"`
	IndividualQuotes []IndividualQuote `json:"individualQuotes"`
	Extensions       json.RawMessage   `json:"extensionList,omitempty"`
}

// GeoCode represents a geographic coordinate pair.
type GeoCode struct {
	Latitude  string `json:"latitude"`
	Longitude string `json:"longitude"`
}

// PartyInfo represents a payer/payee party reference.
type PartyInfo struct {
	PartyIDInfo PartyIDInfo `json:"partyIdInfo"`
	Name        string      `json:"name,omitempty"`
	PersonalInfo *PersonalInfo `json:"personalInfo,omitempty"`
}

// PersonalInfo holds KYC information for a party.
type PersonalInfo struct {
	ComplexName *ComplexName `json:"complexName,omitempty"`
	DateOfBirth string       `json:"dateOfBirth,omitempty"`
}

// ComplexName is a structured name.
type ComplexName struct {
	FirstName  string `json:"firstName,omitempty"`
	MiddleName string `json:"middleName,omitempty"`
	LastName   string `json:"lastName,omitempty"`
}

// BulkQuotesHandler handles POST /bulkQuotes.
// Validates the request, assigns a bulkQuoteId if missing, publishes to
// Fluvio topic nexthub.bulk-quotes, and returns HTTP 202 Accepted.
func BulkQuotesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source")
	if source == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing FSPIOP-Source header")
		return
	}

	var req BulkQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid request body: %v", err))
		return
	}

	if req.BulkQuoteID == "" {
		req.BulkQuoteID = uuid.New().String()
	}
	if len(req.IndividualQuotes) == 0 {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "individualQuotes must not be empty")
		return
	}
	if len(req.IndividualQuotes) > 1000 {
		writeFSPIOPError(w, http.StatusBadRequest, "3106", "Bulk quote exceeds maximum of 1000 individual quotes")
		return
	}

	event := map[string]interface{}{
		"type":        "BULK_QUOTE_REQUEST",
		"bulkQuoteId": req.BulkQuoteID,
		"payerFsp":    source,
		"quoteCount":  len(req.IndividualQuotes),
		"timestamp":   time.Now().UTC().Format(time.RFC3339Nano),
		"payload":     req,
	}

	if err := publishToFluvio("nexthub.bulk-quotes", req.BulkQuoteID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to enqueue bulk quote")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.bulkQuotes+json;version=1.1")
	w.WriteHeader(http.StatusAccepted)
}

// BulkQuoteCallbackHandler handles PUT /bulkQuotes/{ID} — receives bulk quote response.
func BulkQuoteCallbackHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	bulkQuoteID := extractPathParam(r.URL.Path, "/bulkQuotes/")
	if bulkQuoteID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing bulkQuoteId in path")
		return
	}

	var callback map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&callback); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid callback body")
		return
	}

	event := map[string]interface{}{
		"type":        "BULK_QUOTE_RESPONSE",
		"bulkQuoteId": bulkQuoteID,
		"timestamp":   time.Now().UTC().Format(time.RFC3339Nano),
		"payload":     callback,
	}

	if err := publishToFluvio("nexthub.bulk-quotes", bulkQuoteID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to process bulk quote callback")
		return
	}

	w.WriteHeader(http.StatusOK)
}
