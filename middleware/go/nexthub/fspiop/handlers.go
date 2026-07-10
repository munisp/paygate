// handlers.go — FSPIOP v1.1 handlers: transactionRequests, authorizations,
// oracles, participants, PISP consents, FX conversion.
// All handlers follow the same pattern: validate → publish to Fluvio → return 202.
package fspiop

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ============================================================
// SHARED TYPES
// ============================================================

// Money represents a currency amount.
type Money struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

// Party represents a payer or payee.
type Party struct {
	PartyIDInfo PartyIDInfo `json:"partyIdInfo"`
	Name        string      `json:"name,omitempty"`
}

// PartyIDInfo identifies a party by type and value.
type PartyIDInfo struct {
	PartyIDType     string `json:"partyIdType"`
	PartyIdentifier string `json:"partyIdentifier"`
	PartySubIDOrType string `json:"partySubIdOrType,omitempty"`
	FSPID           string `json:"fspId,omitempty"`
}

// TransactionType describes the purpose of a transfer.
type TransactionType struct {
	Scenario    string `json:"scenario"`
	SubScenario string `json:"subScenario,omitempty"`
	Initiator   string `json:"initiator"`
	InitiatorType string `json:"initiatorType"`
}

// ============================================================
// TRANSACTION REQUESTS — POST /transactionRequests
// ============================================================

// TransactionRequest is the FSPIOP POST /transactionRequests body.
type TransactionRequest struct {
	TransactionRequestID string          `json:"transactionRequestId"`
	Payee                Party           `json:"payee"`
	Payer                PartyIDInfo     `json:"payer"`
	Amount               Money           `json:"amount"`
	TransactionType      TransactionType `json:"transactionType"`
	Note                 string          `json:"note,omitempty"`
	GeoCode              *GeoCode        `json:"geoCode,omitempty"`
	Expiration           string          `json:"expiration,omitempty"`
	Extensions           json.RawMessage `json:"extensionList,omitempty"`
}

// TransactionRequestsHandler handles POST /transactionRequests (payee-initiated flow).
func TransactionRequestsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source")
	destination := r.Header.Get("FSPIOP-Destination")
	if source == "" || destination == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing FSPIOP-Source or FSPIOP-Destination")
		return
	}

	var req TransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid body: %v", err))
		return
	}

	if req.TransactionRequestID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "transactionRequestId is required")
		return
	}

	event := map[string]interface{}{
		"type":                 "TRANSACTION_REQUEST",
		"transactionRequestId": req.TransactionRequestID,
		"payeeFsp":             source,
		"payerFsp":             destination,
		"amount":               req.Amount,
		"timestamp":            time.Now().UTC().Format(time.RFC3339Nano),
		"payload":              req,
	}

	if err := publishToFluvio("nexthub.transaction-requests", req.TransactionRequestID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to enqueue transaction request")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.transactionRequests+json;version=1.1")
	w.WriteHeader(http.StatusAccepted)
}

// TransactionRequestCallbackHandler handles PUT /transactionRequests/{ID}.
func TransactionRequestCallbackHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	txReqID := extractPathParam(r.URL.Path, "/transactionRequests/")
	if txReqID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing transactionRequestId in path")
		return
	}

	var callback map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&callback); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid callback body")
		return
	}

	event := map[string]interface{}{
		"type":                 "TRANSACTION_REQUEST_CALLBACK",
		"transactionRequestId": txReqID,
		"timestamp":            time.Now().UTC().Format(time.RFC3339Nano),
		"payload":              callback,
	}

	if err := publishToFluvio("nexthub.transaction-requests", txReqID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to process callback")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// ============================================================
// AUTHORIZATIONS — POST /authorizations, PUT /authorizations/{ID}
// ============================================================

// AuthorizationRequest is the FSPIOP POST /authorizations body.
type AuthorizationRequest struct {
	AuthorizationRequestID string          `json:"authorizationRequestId"`
	TransactionRequestID   string          `json:"transactionRequestId"`
	Amount                 Money           `json:"amount"`
	TransactionType        TransactionType `json:"transactionType"`
	Expiration             string          `json:"expiration,omitempty"`
	AuthenticationType     string          `json:"authenticationType"` // OTP, QRCODE, U2F
	RetriesLeft            int             `json:"retriesLeft,omitempty"`
	Extensions             json.RawMessage `json:"extensionList,omitempty"`
}

// AuthorizationsHandler handles POST /authorizations (OTP/PIN challenge).
func AuthorizationsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source")
	destination := r.Header.Get("FSPIOP-Destination")
	if source == "" || destination == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing FSPIOP headers")
		return
	}

	var req AuthorizationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid body: %v", err))
		return
	}

	validAuthTypes := map[string]bool{"OTP": true, "QRCODE": true, "U2F": true, "BIOMETRIC": true}
	if !validAuthTypes[req.AuthenticationType] {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid authenticationType: %s", req.AuthenticationType))
		return
	}

	event := map[string]interface{}{
		"type":                   "AUTHORIZATION_REQUEST",
		"authorizationRequestId": req.AuthorizationRequestID,
		"transactionRequestId":   req.TransactionRequestID,
		"authenticationType":     req.AuthenticationType,
		"source":                 source,
		"destination":            destination,
		"timestamp":              time.Now().UTC().Format(time.RFC3339Nano),
		"payload":                req,
	}

	if err := publishToFluvio("nexthub.authorizations", req.AuthorizationRequestID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to enqueue authorization request")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.authorizations+json;version=1.1")
	w.WriteHeader(http.StatusAccepted)
}

// AuthorizationCallbackHandler handles PUT /authorizations/{ID} (OTP response).
func AuthorizationCallbackHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	authID := extractPathParam(r.URL.Path, "/authorizations/")
	if authID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing authorizationRequestId in path")
		return
	}

	var callback map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&callback); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid callback body")
		return
	}

	event := map[string]interface{}{
		"type":                   "AUTHORIZATION_CALLBACK",
		"authorizationRequestId": authID,
		"timestamp":              time.Now().UTC().Format(time.RFC3339Nano),
		"payload":                callback,
	}

	if err := publishToFluvio("nexthub.authorizations", authID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to process authorization callback")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// ============================================================
// ORACLES — GET/POST/PUT/DELETE /oracles
// ============================================================

// OracleRequest is the FSPIOP POST /oracles body.
type OracleRequest struct {
	OracleID    string `json:"oracleId,omitempty"`
	OracleType  string `json:"oracleType"`  // ALS (Account Lookup Service)
	Endpoint    Endpoint `json:"endpoint"`
	Currency    string `json:"currency,omitempty"`
	IsDefault   bool   `json:"isDefault"`
}

// Endpoint represents an oracle endpoint.
type Endpoint struct {
	Value string `json:"value"`
	EndpointType string `json:"endpointType"` // URL
}

// OraclesHandler handles GET/POST /oracles.
func OraclesHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Return list of registered oracles from PostgreSQL nexthub_oracles table
		oracles := getRegisteredOracles()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(oracles)

	case http.MethodPost:
		var req OracleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid body: %v", err))
			return
		}
		if req.OracleType == "" || req.Endpoint.Value == "" {
			writeFSPIOPError(w, http.StatusBadRequest, "3100", "oracleType and endpoint.value are required")
			return
		}

		event := map[string]interface{}{
			"type":      "ORACLE_REGISTER",
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
			"payload":   req,
		}
		if err := publishToFluvio("nexthub.oracles", req.OracleID, event); err != nil {
			writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to register oracle")
			return
		}
		w.WriteHeader(http.StatusCreated)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// OracleByIDHandler handles PUT/DELETE /oracles/{ID}.
func OracleByIDHandler(w http.ResponseWriter, r *http.Request) {
	oracleID := extractPathParam(r.URL.Path, "/oracles/")
	if oracleID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing oracleId in path")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req OracleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid body")
			return
		}
		event := map[string]interface{}{
			"type":      "ORACLE_UPDATE",
			"oracleId":  oracleID,
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
			"payload":   req,
		}
		publishToFluvio("nexthub.oracles", oracleID, event)
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		event := map[string]interface{}{
			"type":      "ORACLE_DEREGISTER",
			"oracleId":  oracleID,
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		}
		publishToFluvio("nexthub.oracles", oracleID, event)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// ============================================================
// PARTICIPANTS — POST/GET/DELETE /participants/{Type}/{ID}
// ============================================================

// ParticipantLookupResult is returned by GET /participants/{Type}/{ID}.
type ParticipantLookupResult struct {
	PartyList []ParticipantEntry `json:"partyList"`
}

// ParticipantEntry is a single entry in the ALS.
type ParticipantEntry struct {
	PartyIDType     string `json:"partyIdType"`
	PartyIdentifier string `json:"partyIdentifier"`
	FSPID           string `json:"fspId"`
	Currency        string `json:"currency,omitempty"`
}

// ParticipantsHandler handles POST/GET/DELETE /participants/{Type}/{ID}.
func ParticipantsHandler(w http.ResponseWriter, r *http.Request) {
	// Extract partyIdType and partyIdentifier from path
	// Path format: /participants/{Type}/{ID} or /participants/{Type}/{ID}/{Currency}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/participants/"), "/")
	if len(parts) < 2 {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid path: expected /participants/{Type}/{ID}")
		return
	}
	partyIDType := parts[0]
	partyIdentifier := parts[1]
	currency := ""
	if len(parts) >= 3 {
		currency = parts[2]
	}

	source := r.Header.Get("FSPIOP-Source")

	switch r.Method {
	case http.MethodPost:
		// Register participant in the ALS
		var req struct {
			FSPID    string `json:"fspId"`
			Currency string `json:"currency,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid body")
			return
		}
		if req.FSPID == "" {
			req.FSPID = source
		}
		event := map[string]interface{}{
			"type":            "PARTICIPANT_REGISTER",
			"partyIdType":     partyIDType,
			"partyIdentifier": partyIdentifier,
			"fspId":           req.FSPID,
			"currency":        currency,
			"timestamp":       time.Now().UTC().Format(time.RFC3339Nano),
		}
		publishToFluvio("nexthub.participants", partyIdentifier, event)
		w.WriteHeader(http.StatusCreated)

	case http.MethodGet:
		// Lookup participant in the ALS (Redis cache → PostgreSQL → oracle)
		result := lookupParticipant(partyIDType, partyIdentifier, currency)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	case http.MethodDelete:
		// Deregister participant from the ALS
		event := map[string]interface{}{
			"type":            "PARTICIPANT_DEREGISTER",
			"partyIdType":     partyIDType,
			"partyIdentifier": partyIdentifier,
			"fspId":           source,
			"currency":        currency,
			"timestamp":       time.Now().UTC().Format(time.RFC3339Nano),
		}
		publishToFluvio("nexthub.participants", partyIdentifier, event)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// ============================================================
// PISP / 3PPI — POST /consents, PUT /consents/{ID}, DELETE /consents/{ID}
// ============================================================

// ConsentRequest is the FSPIOP POST /consents body (PISP flow).
type ConsentRequest struct {
	ConsentID       string          `json:"consentId,omitempty"`
	ConsentRequestID string         `json:"consentRequestId"`
	Scopes          []ConsentScope  `json:"scopes"`
	AuthChannels    []string        `json:"authChannels"` // WEB, OTP
	CallbackURI     string          `json:"callbackUri,omitempty"`
	Extensions      json.RawMessage `json:"extensionList,omitempty"`
}

// ConsentScope defines what a PISP is allowed to do.
type ConsentScope struct {
	AccountID string `json:"accountId"`
	Actions   []string `json:"actions"` // accounts.getBalance, accounts.transfer
}

// ConsentsHandler handles POST /consents (PISP consent initiation).
func ConsentsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source") // PISP ID
	destination := r.Header.Get("FSPIOP-Destination") // DFSP ID

	var req ConsentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid body: %v", err))
		return
	}

	if len(req.Scopes) == 0 {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "scopes must not be empty")
		return
	}

	event := map[string]interface{}{
		"type":             "PISP_CONSENT_REQUEST",
		"consentRequestId": req.ConsentRequestID,
		"pispId":           source,
		"dfspId":           destination,
		"scopeCount":       len(req.Scopes),
		"timestamp":        time.Now().UTC().Format(time.RFC3339Nano),
		"payload":          req,
	}

	if err := publishToFluvio("nexthub.pisp-consents", req.ConsentRequestID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to initiate consent")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.consents+json;version=1.0")
	w.WriteHeader(http.StatusAccepted)
}

// ConsentByIDHandler handles PUT/DELETE /consents/{ID}.
func ConsentByIDHandler(w http.ResponseWriter, r *http.Request) {
	consentID := extractPathParam(r.URL.Path, "/consents/")
	if consentID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing consentId in path")
		return
	}

	switch r.Method {
	case http.MethodPut:
		// Consent granted — store FIDO2 credential
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid body")
			return
		}
		event := map[string]interface{}{
			"type":      "PISP_CONSENT_GRANTED",
			"consentId": consentID,
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
			"payload":   body,
		}
		publishToFluvio("nexthub.pisp-consents", consentID, event)
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		// Consent revoked
		event := map[string]interface{}{
			"type":      "PISP_CONSENT_REVOKED",
			"consentId": consentID,
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		}
		publishToFluvio("nexthub.pisp-consents", consentID, event)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// ============================================================
// FX CONVERSION — POST /fxQuotes, PUT /fxQuotes/{ID}, POST /fxTransfers
// ============================================================

// FXQuoteRequest is the FSPIOP POST /fxQuotes body.
type FXQuoteRequest struct {
	ConversionRequestID string `json:"conversionRequestId"`
	ConversionTerms     FXConversionTerms `json:"conversionTerms"`
}

// FXConversionTerms describes the FX conversion parameters.
type FXConversionTerms struct {
	ConversionID    string `json:"conversionId,omitempty"`
	DeterminingTransferID string `json:"determiningTransferId,omitempty"`
	InitiatingFSP   string `json:"initiatingFsp"`
	CounterPartyFSP string `json:"counterPartyFsp"`
	AmountType      string `json:"amountType"` // SEND or RECEIVE
	SourceAmount    Money  `json:"sourceAmount"`
	TargetAmount    *Money `json:"targetAmount,omitempty"`
	Expiration      string `json:"expiration,omitempty"`
}

// FXQuotesHandler handles POST /fxQuotes (FX conversion rate request).
func FXQuotesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	source := r.Header.Get("FSPIOP-Source")
	destination := r.Header.Get("FSPIOP-Destination")

	var req FXQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", fmt.Sprintf("Invalid body: %v", err))
		return
	}

	if req.ConversionRequestID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "conversionRequestId is required")
		return
	}

	event := map[string]interface{}{
		"type":                "FX_QUOTE_REQUEST",
		"conversionRequestId": req.ConversionRequestID,
		"initiatingFsp":       source,
		"counterPartyFsp":     destination,
		"sourceCurrency":      req.ConversionTerms.SourceAmount.Currency,
		"targetCurrency":      func() string {
			if req.ConversionTerms.TargetAmount != nil {
				return req.ConversionTerms.TargetAmount.Currency
			}
			return ""
		}(),
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"payload":   req,
	}

	if err := publishToFluvio("nexthub.fx-quotes", req.ConversionRequestID, event); err != nil {
		writeFSPIOPError(w, http.StatusInternalServerError, "2001", "Failed to enqueue FX quote request")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.interoperability.fxQuotes+json;version=2.0")
	w.WriteHeader(http.StatusAccepted)
}

// FXQuoteCallbackHandler handles PUT /fxQuotes/{ID}.
func FXQuoteCallbackHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	conversionRequestID := extractPathParam(r.URL.Path, "/fxQuotes/")
	if conversionRequestID == "" {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Missing conversionRequestId in path")
		return
	}

	var callback map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&callback); err != nil {
		writeFSPIOPError(w, http.StatusBadRequest, "3100", "Invalid callback body")
		return
	}

	event := map[string]interface{}{
		"type":                "FX_QUOTE_RESPONSE",
		"conversionRequestId": conversionRequestID,
		"timestamp":           time.Now().UTC().Format(time.RFC3339Nano),
		"payload":             callback,
	}

	publishToFluvio("nexthub.fx-quotes", conversionRequestID, event)
	w.WriteHeader(http.StatusOK)
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

// writeFSPIOPError writes a standard FSPIOP error response.
func writeFSPIOPError(w http.ResponseWriter, statusCode int, errorCode, description string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"errorInformation": map[string]string{
			"errorCode":        errorCode,
			"errorDescription": description,
		},
	})
}

// extractPathParam extracts the last path segment after the given prefix.
func extractPathParam(path, prefix string) string {
	trimmed := strings.TrimPrefix(path, prefix)
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) == 0 {
		return ""
	}
	return parts[0]
}

// publishToFluvio publishes an event to a Fluvio topic.
// In production this uses the Fluvio Go client; here it logs and returns nil.
func publishToFluvio(topic, key string, event map[string]interface{}) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	// Production: fluvioClient.Produce(context.Background(), topic, key, payload)
	log.Printf("[fluvio] topic=%s key=%s payload_len=%d", topic, key, len(payload))
	_ = context.Background()
	return nil
}

// getRegisteredOracles returns the list of registered oracles.
// Production: query PostgreSQL nexthub_oracles table.
func getRegisteredOracles() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"oracleId":    "oracle-msisdn-ng",
			"oracleType":  "ALS",
			"partyIdType": "MSISDN",
			"currency":    "NGN",
			"endpoint":    map[string]string{"value": "http://als-oracle-msisdn:4003", "endpointType": "URL"},
			"isDefault":   true,
			"healthStatus": "HEALTHY",
		},
		{
			"oracleId":    "oracle-bvn-ng",
			"oracleType":  "ALS",
			"partyIdType": "BVN",
			"currency":    "NGN",
			"endpoint":    map[string]string{"value": "http://als-oracle-bvn:4004", "endpointType": "URL"},
			"isDefault":   false,
			"healthStatus": "HEALTHY",
		},
	}
}

// lookupParticipant looks up a participant in the ALS.
// Production: check Redis cache → PostgreSQL → oracle HTTP call.
func lookupParticipant(partyIDType, partyIdentifier, currency string) ParticipantLookupResult {
	return ParticipantLookupResult{
		PartyList: []ParticipantEntry{
			{
				PartyIDType:     partyIDType,
				PartyIdentifier: partyIdentifier,
				FSPID:           "dfsp-001",
				Currency:        currency,
			},
		},
	}
}
