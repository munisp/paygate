// Mojaloop FSPIOP Adapter — PayGate Cross-Border Rail
// Implements the Mojaloop FSPIOP API v1.1 for ISO 20022 message routing
// Supports: Party Lookup, Quote, Transfer, Callback Correlation
// Integrates with CIPS (China), UPI (India), PIX (Brazil) via rail routing
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/paygate/mojaloop-fspiop-adapter/internal/telemetry"
)

// ─── Configuration ─────────────────────────────────────────────────────────────

type Config struct {
	Port              string
	MojaloopURL       string
	MojaloopAPIKey    string
	CIPSGatewayURL    string
	UPIGatewayURL     string
	PIXGatewayURL     string
	RedisURL          string
	KafkaBrokers      string
	FSPIOPSourceFSP   string
	FSPIOPDestFSP     string
	JWSPrivateKeyPath string
	InternalAPIKey    string
}

func loadConfig() Config {
	cfg := Config{
		Port:              getEnv("PORT", "8097"),
		MojaloopURL:       getEnv("MOJALOOP_URL", "https://sandbox.mojaloop.io/v1"),
		MojaloopAPIKey:    os.Getenv("MOJALOOP_API_KEY"), // no default — hardcoded sandbox credentials removed (spec #16/#19)
		CIPSGatewayURL:    getEnv("CIPS_GATEWAY_URL", "http://cips-gateway:8098"),
		UPIGatewayURL:     getEnv("UPI_GATEWAY_URL", "http://upi-gateway:8099"),
		PIXGatewayURL:     getEnv("PIX_GATEWAY_URL", "http://pix-gateway:8100"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379/0"),
		KafkaBrokers:      getEnv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
		FSPIOPSourceFSP:   getEnv("FSPIOP_SOURCE_FSP", "paygate"),
		FSPIOPDestFSP:     getEnv("FSPIOP_DEST_FSP", "mojaloop-hub"),
		JWSPrivateKeyPath: getEnv("JWS_PRIVATE_KEY_PATH", "/etc/paygate/jws-private.pem"),
		InternalAPIKey:    os.Getenv("INTERNAL_API_KEY"),
	}
	env := strings.ToLower(os.Getenv("ENV"))
	appEnv := strings.ToLower(os.Getenv("APP_ENV"))
	prod := env == "production" || env == "prod" || appEnv == "production" || appEnv == "prod"
	if cfg.MojaloopAPIKey == "" {
		if prod {
			slog.Error("FATAL: MOJALOOP_API_KEY must be set when ENV=production — refusing to start with fabricated credentials")
			os.Exit(1)
		}
		b := make([]byte, 16)
		rand.Read(b)
		cfg.MojaloopAPIKey = fmt.Sprintf("dev-%x", b)
		slog.Warn("MOJALOOP_API_KEY unset — generated per-boot dev key; Mojaloop hub calls will fail upstream auth (dev only)")
	}
	if cfg.InternalAPIKey == "" {
		if prod {
			slog.Error("FATAL: INTERNAL_API_KEY must be set when ENV=production")
			os.Exit(1)
		}
		b := make([]byte, 16)
		rand.Read(b)
		cfg.InternalAPIKey = fmt.Sprintf("dev-%x", b)
		slog.Warn("INTERNAL_API_KEY unset — generated per-boot dev key; refusing well-known defaults")
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── FSPIOP Message Types ──────────────────────────────────────────────────────

type FSPIOPParty struct {
	PartyIDType string `json:"partyIdType"` // MSISDN, ACCOUNT_ID, EMAIL, PERSONAL_ID, BUSINESS, DEVICE, IBAN, ALIAS
	PartyID     string `json:"partyIdentifier"`
	FSPID       string `json:"fspId,omitempty"`
	Name        string `json:"name,omitempty"`
}

type FSPIOPMoney struct {
	Currency string `json:"currency"`
	Amount   string `json:"amount"`
}

type FSPIOPQuoteRequest struct {
	QuoteID              string      `json:"quoteId"`
	TransactionID        string      `json:"transactionId"`
	TransactionRequestID string      `json:"transactionRequestId,omitempty"`
	Payee                FSPIOPParty `json:"payee"`
	Payer                FSPIOPParty `json:"payer"`
	AmountType           string      `json:"amountType"` // SEND or RECEIVE
	Amount               FSPIOPMoney `json:"amount"`
	TransactionType      struct {
		Scenario      string `json:"scenario"` // TRANSFER, DEPOSIT, WITHDRAWAL, PAYMENT, REFUND
		SubScenario   string `json:"subScenario,omitempty"`
		Initiator     string `json:"initiator"`     // PAYER or PAYEE
		InitiatorType string `json:"initiatorType"` // CONSUMER, AGENT, BUSINESS, DEVICE
	} `json:"transactionType"`
	Note string `json:"note,omitempty"`
}

type FSPIOPTransferRequest struct {
	TransferID    string      `json:"transferId"`
	PayerFSP      string      `json:"payerFsp"`
	PayeeFSP      string      `json:"payeeFsp"`
	Amount        FSPIOPMoney `json:"amount"`
	ILPPacket     string      `json:"ilpPacket"`
	Condition     string      `json:"condition"`
	Expiration    string      `json:"expiration"`
	ExtensionList *ExtList    `json:"extensionList,omitempty"`
}

type ExtList struct {
	Extension []struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	} `json:"extension"`
}

type CrossBorderTransferRequest struct {
	TransferID     string `json:"transfer_id"`
	MerchantID     string `json:"merchant_id"`
	ReceiverID     string `json:"receiver_id"`
	ReceiverIDType string `json:"receiver_id_type"`
	Corridor       string `json:"corridor"`
	SourceCurrency string `json:"source_currency"`
	TargetCurrency string `json:"target_currency"`
	Amount         string `json:"amount"`
	Rail           string `json:"rail"` // mojaloop, cips, upi, pix, brics_pay, swift
	QuoteID        string `json:"quote_id,omitempty"`
	SenderName     string `json:"sender_name,omitempty"`
}

type CrossBorderTransferResponse struct {
	Success            bool   `json:"success"`
	TransferID         string `json:"transfer_id"`
	MojaloopTransferID string `json:"mojaloop_transfer_id,omitempty"`
	CIPSTransferID     string `json:"cips_transfer_id,omitempty"`
	UPITransferID      string `json:"upi_transfer_id,omitempty"`
	PIXTransferID      string `json:"pix_transfer_id,omitempty"`
	Status             string `json:"status"`
	ExchangeRate       string `json:"exchange_rate,omitempty"`
	Fee                string `json:"fee,omitempty"`
	EstimatedArrival   string `json:"estimated_arrival,omitempty"`
	Message            string `json:"message,omitempty"`
}

// ─── Rail Router ───────────────────────────────────────────────────────────────

type RailRouter struct {
	cfg    Config
	client *http.Client
	mu     sync.RWMutex
	// In-memory transfer state (production: use Redis)
	transfers map[string]*CrossBorderTransferResponse
}

func NewRailRouter(cfg Config) *RailRouter {
	return &RailRouter{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		transfers: make(map[string]*CrossBorderTransferResponse),
	}
}

// RouteTransfer routes a cross-border transfer to the appropriate rail
func (r *RailRouter) RouteTransfer(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	slog.Info("routing cross-border transfer",
		"transfer_id", req.TransferID,
		"rail", req.Rail,
		"corridor", req.Corridor,
		"source_currency", req.SourceCurrency,
		"target_currency", req.TargetCurrency,
	)

	switch strings.ToLower(req.Rail) {
	case "mojaloop":
		return r.routeMojaloop(req)
	case "cips":
		return r.routeCIPS(req)
	case "upi":
		return r.routeUPI(req)
	case "pix":
		return r.routePIX(req)
	case "brics_pay":
		return r.routeBRICSPay(req)
	case "swift":
		return r.routeSWIFT(req)
	default:
		// Auto-detect rail from corridor
		return r.autoRouteByCorridorCurrency(req)
	}
}

// autoRouteByCorridorCurrency selects the optimal rail based on currency pair
func (r *RailRouter) autoRouteByCorridorCurrency(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	rail := detectOptimalRail(req.SourceCurrency, req.TargetCurrency, req.Corridor)
	req.Rail = rail
	return r.RouteTransfer(req)
}

// detectOptimalRail selects the best rail for a currency pair
func detectOptimalRail(sourceCurrency, targetCurrency, corridor string) string {
	// China-related corridors → CIPS
	if strings.Contains(strings.ToUpper(corridor), "CN") ||
		targetCurrency == "CNY" || targetCurrency == "CNH" ||
		sourceCurrency == "CNY" || sourceCurrency == "CNH" {
		return "cips"
	}
	// India-related corridors → UPI
	if strings.Contains(strings.ToUpper(corridor), "IN") ||
		targetCurrency == "INR" || sourceCurrency == "INR" {
		return "upi"
	}
	// Brazil-related corridors → PIX
	if strings.Contains(strings.ToUpper(corridor), "BR") ||
		targetCurrency == "BRL" || sourceCurrency == "BRL" {
		return "pix"
	}
	// BRICS currencies → BRICS Pay
	bricsCurrencies := map[string]bool{"RUB": true, "ZAR": true, "EGP": true, "AED": true, "ETB": true, "IRR": true, "SAR": true}
	if bricsCurrencies[targetCurrency] || bricsCurrencies[sourceCurrency] {
		return "brics_pay"
	}
	// Default to Mojaloop for African corridors
	return "mojaloop"
}

// ─── Mojaloop FSPIOP Rail ──────────────────────────────────────────────────────

func (r *RailRouter) routeMojaloop(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	// Generate FSPIOP transfer ID
	transferID := generateUUID()
	quoteID := generateUUID()
	if req.QuoteID != "" {
		quoteID = req.QuoteID
	}

	// Build FSPIOP transfer request
	expiration := time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339)
	ilpPacket, condition := generateILPPacketAndCondition(req.Amount, req.TargetCurrency)

	fspiop := FSPIOPTransferRequest{
		TransferID: transferID,
		PayerFSP:   r.cfg.FSPIOPSourceFSP,
		PayeeFSP:   r.cfg.FSPIOPDestFSP,
		Amount: FSPIOPMoney{
			Currency: req.TargetCurrency,
			Amount:   req.Amount,
		},
		ILPPacket:  ilpPacket,
		Condition:  condition,
		Expiration: expiration,
		ExtensionList: &ExtList{
			Extension: []struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}{
				{Key: "paygate_transfer_id", Value: req.TransferID},
				{Key: "quote_id", Value: quoteID},
				{Key: "corridor", Value: req.Corridor},
			},
		},
	}

	// POST to Mojaloop Hub
	body, _ := json.Marshal(fspiop)
	httpReq, err := http.NewRequest("POST", r.cfg.MojaloopURL+"/transfers", strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("mojaloop request build: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version=1.1")
	httpReq.Header.Set("FSPIOP-Source", r.cfg.FSPIOPSourceFSP)
	httpReq.Header.Set("FSPIOP-Destination", r.cfg.FSPIOPDestFSP)
	httpReq.Header.Set("Authorization", "Bearer "+r.cfg.MojaloopAPIKey)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))
	httpReq.Header.Set("X-Forwarded-For", "paygate-fspiop-adapter")

	resp, err := r.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mojaloop hub unreachable: %w", err)
	}
	defer resp.Body.Close()
	status := "submitted"
	if resp.StatusCode != 202 && resp.StatusCode != 200 {
		return nil, fmt.Errorf("mojaloop hub returned HTTP %d", resp.StatusCode)
	}

	result := &CrossBorderTransferResponse{
		Success:            true,
		TransferID:         req.TransferID,
		MojaloopTransferID: transferID,
		Status:             status,
		ExchangeRate:       "1.0",
		Fee:                "0.50",
		EstimatedArrival:   time.Now().Add(2 * time.Minute).UTC().Format(time.RFC3339),
		Message:            fmt.Sprintf("Mojaloop FSPIOP transfer %s initiated via %s→%s", transferID, r.cfg.FSPIOPSourceFSP, r.cfg.FSPIOPDestFSP),
	}

	r.mu.Lock()
	r.transfers[req.TransferID] = result
	r.mu.Unlock()

	return result, nil
}

// ─── CIPS (China Interbank Payment System) Rail ────────────────────────────────

func (r *RailRouter) routeCIPS(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	cipsTransferID := fmt.Sprintf("CIPS-%d-%s", time.Now().UnixMilli(), generateShortID())

	// CIPS uses ISO 20022 pacs.008 format
	// Validate CNAPS code (China National Advanced Payment System)
	cnapsCode := extractCNAPSCode(req.ReceiverID)
	if cnapsCode == "" {
		cnapsCode = "102100099996" // Default ICBC Beijing CNAPS
	}

	payload := map[string]interface{}{
		"transfer_id":       cipsTransferID,
		"paygate_ref":       req.TransferID,
		"sender_name":       req.SenderName,
		"receiver_id":       req.ReceiverID,
		"receiver_id_type":  req.ReceiverIDType,
		"cnaps_code":        cnapsCode,
		"amount":            req.Amount,
		"source_currency":   req.SourceCurrency,
		"target_currency":   req.TargetCurrency,
		"corridor":          req.Corridor,
		"message_type":      "pacs.008.001.08",
		"settlement_method": "CLRG", // Clearing
		"charge_bearer":     "SHAR", // Shared charges
		"created_at":        time.Now().UTC().Format(time.RFC3339),
	}

	// Forward to CIPS gateway
	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", r.cfg.CIPSGatewayURL+"/v1/transfers", strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("cips request build: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-CIPS-Source", "PAYGATE")
	httpReq.Header.Set("X-Internal-Key", r.cfg.InternalAPIKey)

	gw, err := r.callRailGateway(httpReq, "cips")
	if err != nil {
		return nil, err
	}
	status := mapStr(gw, "status")
	if status == "" {
		status = "submitted"
	}

	result := &CrossBorderTransferResponse{
		Success:        true,
		TransferID:     req.TransferID,
		CIPSTransferID: cipsTransferID,
		Status:         status,
		// FX rate / fee / arrival come from the gateway response only.
		ExchangeRate:     mapStr(gw, "exchange_rate"),
		Fee:              mapStr(gw, "fee"),
		EstimatedArrival: mapStr(gw, "settlement_time"),
		Message:          fmt.Sprintf("CIPS transfer %s submitted via CNAPS %s", cipsTransferID, cnapsCode),
	}

	r.mu.Lock()
	r.transfers[req.TransferID] = result
	r.mu.Unlock()

	return result, nil
}

// ─── UPI (Unified Payments Interface) Rail ─────────────────────────────────────

func (r *RailRouter) routeUPI(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	upiTransferID := fmt.Sprintf("UPI-%d-%s", time.Now().UnixMilli(), generateShortID())

	// UPI VPA validation: format is user@bank or user@upi
	vpa := req.ReceiverID
	if !strings.Contains(vpa, "@") {
		// Construct VPA from phone number
		vpa = fmt.Sprintf("%s@upi", req.ReceiverID)
	}

	payload := map[string]interface{}{
		"transfer_id":      upiTransferID,
		"paygate_ref":      req.TransferID,
		"sender_name":      req.SenderName,
		"receiver_vpa":     vpa,
		"amount":           req.Amount,
		"source_currency":  req.SourceCurrency,
		"target_currency":  "INR",
		"corridor":         req.Corridor,
		"transaction_type": "COLLECT", // UPI collect flow
		"purpose_code":     "P0001",   // Family maintenance (RBI purpose code)
		"remarks":          fmt.Sprintf("PayGate cross-border transfer %s", req.TransferID),
		"created_at":       time.Now().UTC().Format(time.RFC3339),
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", r.cfg.UPIGatewayURL+"/v1/collect", strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("upi request build: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-UPI-Source", "PAYGATE")
	httpReq.Header.Set("X-Internal-Key", r.cfg.InternalAPIKey)

	gw, err := r.callRailGateway(httpReq, "upi")
	if err != nil {
		return nil, err
	}
	status := mapStr(gw, "status")
	if status == "" {
		status = "pending"
	}

	result := &CrossBorderTransferResponse{
		Success:       true,
		TransferID:    req.TransferID,
		UPITransferID: upiTransferID,
		Status:        status,
		ExchangeRate:  mapStr(gw, "exchange_rate"),
		Fee:           mapStr(gw, "fee"),
		Message:       fmt.Sprintf("UPI collect request %s sent to VPA %s", upiTransferID, vpa),
	}

	r.mu.Lock()
	r.transfers[req.TransferID] = result
	r.mu.Unlock()

	return result, nil
}

// ─── PIX (Brazil Instant Payment System) Rail ──────────────────────────────────

func (r *RailRouter) routePIX(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	pixTransferID := fmt.Sprintf("PIX-%d-%s", time.Now().UnixMilli(), generateShortID())

	// PIX key types: CPF, CNPJ, phone, email, EVP (random key)
	pixKeyType := detectPIXKeyType(req.ReceiverID)

	payload := map[string]interface{}{
		"transfer_id":     pixTransferID,
		"paygate_ref":     req.TransferID,
		"sender_name":     req.SenderName,
		"pix_key":         req.ReceiverID,
		"pix_key_type":    pixKeyType,
		"amount":          req.Amount,
		"source_currency": req.SourceCurrency,
		"target_currency": "BRL",
		"corridor":        req.Corridor,
		"end_to_end_id":   generateE2EID(),
		"description":     fmt.Sprintf("PayGate transfer %s", req.TransferID),
		"created_at":      time.Now().UTC().Format(time.RFC3339),
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", r.cfg.PIXGatewayURL+"/v1/payments", strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("pix request build: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-PIX-Source", "PAYGATE")
	httpReq.Header.Set("X-Internal-Key", r.cfg.InternalAPIKey)

	gw, err := r.callRailGateway(httpReq, "pix")
	if err != nil {
		return nil, err
	}
	status := mapStr(gw, "status")
	if status == "" {
		status = "submitted"
	}

	result := &CrossBorderTransferResponse{
		Success:       true,
		TransferID:    req.TransferID,
		PIXTransferID: pixTransferID,
		Status:        status,
		ExchangeRate:  mapStr(gw, "exchange_rate"),
		Fee:           mapStr(gw, "fee"),
		Message:       fmt.Sprintf("PIX payment %s initiated via key type %s", pixTransferID, pixKeyType),
	}

	r.mu.Lock()
	r.transfers[req.TransferID] = result
	r.mu.Unlock()

	return result, nil
}

// callRailGateway executes a request against a rail gateway and decodes its
// JSON response. Any transport error or >=400 status is a hard error — the
// caller MUST NOT fabricate success.
func (r *RailRouter) callRailGateway(httpReq *http.Request, rail string) (map[string]interface{}, error) {
	resp, err := r.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s gateway unreachable: %w", rail, err)
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode >= 400 {
		return body, fmt.Errorf("%s gateway returned HTTP %d", rail, resp.StatusCode)
	}
	return body, nil
}

func mapStr(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

// errNotImplemented marks rails with no upstream integration (mapped to 501).
func errNotImplemented(rail string) error {
	return fmt.Errorf("NOT_IMPLEMENTED: %s rail has no upstream integration; refusing to fabricate a submission", rail)
}

// ─── BRICS Pay Rail ────────────────────────────────────────────────────────────

func (r *RailRouter) routeBRICSPay(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	// No BRICS Pay upstream integration exists — fail loud, never fabricate.
	slog.Error("BRICS Pay transfer requested but rail is not implemented", "transfer_id", req.TransferID)
	return nil, errNotImplemented("brics_pay")
}

// ─── SWIFT Rail ────────────────────────────────────────────────────────────────

func (r *RailRouter) routeSWIFT(req CrossBorderTransferRequest) (*CrossBorderTransferResponse, error) {
	// No SWIFT correspondent-bank integration exists — fail loud, never fabricate.
	slog.Error("SWIFT transfer requested but rail is not implemented", "transfer_id", req.TransferID)
	return nil, errNotImplemented("swift")
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

type Server struct {
	cfg    Config
	router *RailRouter
	mux    *http.ServeMux
}

func NewServer(cfg Config) *Server {
	s := &Server{
		cfg:    cfg,
		router: NewRailRouter(cfg),
		mux:    http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /v1/cross-border/transfer", s.authMiddleware(s.handleTransfer))
	s.mux.HandleFunc("POST /v1/cross-border/quote", s.authMiddleware(s.handleQuote))
	s.mux.HandleFunc("GET /v1/cross-border/transfer/{id}", s.authMiddleware(s.handleGetTransfer))
	s.mux.HandleFunc("GET /v1/cross-border/rails/health", s.authMiddleware(s.handleRailHealth))
	// Mojaloop FSPIOP callbacks
	s.mux.HandleFunc("PUT /v1/transfers/{id}", s.handleFSPIOPCallback)
	s.mux.HandleFunc("PUT /v1/transfers/{id}/error", s.handleFSPIOPError)
	// CIPS callbacks
	s.mux.HandleFunc("POST /v1/cips/callback", s.handleCIPSCallback)
	// UPI callbacks
	s.mux.HandleFunc("POST /v1/upi/callback", s.handleUPICallback)
	// PIX callbacks
	s.mux.HandleFunc("POST /v1/pix/webhook", s.handlePIXWebhook)
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-Internal-Key")
		if key == "" {
			if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				key = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		// Only the internal service key authenticates inbound calls — the
		// outbound Mojaloop hub credential is NOT a valid inbound credential.
		// Constant-time comparison to resist timing attacks.
		if subtle.ConstantTimeCompare([]byte(key), []byte(s.cfg.InternalAPIKey)) != 1 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": "mojaloop-fspiop-adapter",
		"version": "1.0.0",
		"rails":   []string{"mojaloop", "cips", "upi", "pix", "brics_pay", "swift"},
		"ts":      time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleTransfer(w http.ResponseWriter, r *http.Request) {
	var req CrossBorderTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.TransferID == "" {
		req.TransferID = generateUUID()
	}

	result, err := s.router.RouteTransfer(req)
	if err != nil {
		slog.Error("transfer routing failed", "error", err, "transfer_id", req.TransferID)
		if strings.HasPrefix(err.Error(), "NOT_IMPLEMENTED") {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusNotImplemented)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	var req CrossBorderTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	rail := detectOptimalRail(req.SourceCurrency, req.TargetCurrency, req.Corridor)
	if req.Rail != "" {
		rail = req.Rail
	}

	// Live quotes come from the rail gateway only — never static rate tables.
	var gwURL, gwPath string
	switch rail {
	case "cips":
		gwURL, gwPath = s.cfg.CIPSGatewayURL, "/v1/quote"
	case "mojaloop":
		gwURL, gwPath = s.cfg.MojaloopURL, "/quotes"
	default:
		slog.Error("quote requested for rail without a live quote source", "rail", rail)
		http.Error(w, fmt.Sprintf(`{"error":"no_live_quote_source","rail":"%s","message":"no live FX source is wired for this rail; refusing to fabricate a rate"}`, rail), http.StatusServiceUnavailable)
		return
	}
	payload, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, gwURL+gwPath, strings.NewReader(string(payload)))
	if err != nil {
		http.Error(w, `{"error":"quote_request_failed"}`, http.StatusInternalServerError)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Internal-Key", s.cfg.InternalAPIKey)
	resp, err := s.router.client.Do(httpReq)
	if err != nil {
		slog.Error("quote upstream unreachable", "rail", rail, "error", err)
		http.Error(w, `{"error":"quote_upstream_unreachable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	json.NewEncoder(w).Encode(body)
}

func (s *Server) handleGetTransfer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.router.mu.RLock()
	transfer, ok := s.router.transfers[id]
	s.router.mu.RUnlock()

	if !ok {
		http.Error(w, `{"error":"transfer not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transfer)
}

func (s *Server) handleRailHealth(w http.ResponseWriter, r *http.Request) {
	probe := func(rail, baseURL string) map[string]interface{} {
		entry := map[string]interface{}{"rail": rail}
		start := time.Now()
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL+"/health", nil)
		if err != nil {
			entry["status"] = "unconfigured"
			return entry
		}
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		entry["latency_ms"] = time.Since(start).Milliseconds()
		if err != nil {
			entry["status"] = "unreachable"
			return entry
		}
		defer resp.Body.Close()
		if resp.StatusCode < 500 {
			entry["status"] = "operational"
		} else {
			entry["status"] = "unhealthy"
		}
		return entry
	}
	rails := []map[string]interface{}{
		probe("mojaloop", s.cfg.MojaloopURL),
		probe("cips", s.cfg.CIPSGatewayURL),
		probe("upi", s.cfg.UPIGatewayURL),
		probe("pix", s.cfg.PIXGatewayURL),
		{"rail": "brics_pay", "status": "not_implemented"},
		{"rail": "swift", "status": "not_implemented"},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"rails": rails,
		"ts":    time.Now().UTC().Format(time.RFC3339),
	})
}

// verifyCallbackHMAC enforces HMAC-SHA256 over the raw body keyed by the
// given shared secret (header: X-Signature, hex encoded). Returns false and
// writes the error response when verification cannot pass.
func verifyCallbackHMAC(w http.ResponseWriter, r *http.Request, secret, label string) bool {
	if secret == "" {
		slog.Error(label + " callback rejected: shared secret not configured")
		http.Error(w, `{"error":"callback_not_configured"}`, http.StatusServiceUnavailable)
		return false
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return false
	}
	sig := r.Header.Get("X-Signature")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if sig == "" || !hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected)) {
		slog.Warn(label + " callback rejected: invalid or missing signature")
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return false
	}
	return true
}

func (s *Server) handleFSPIOPCallback(w http.ResponseWriter, r *http.Request) {
	if !verifyCallbackHMAC(w, r, os.Getenv("MOJALOOP_CALLBACK_SECRET"), "FSPIOP") {
		return
	}
	id := r.PathValue("id")
	slog.Info("FSPIOP transfer callback accepted (signature verified)", "transfer_id", id)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleFSPIOPError(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	slog.Error("FSPIOP transfer error callback", "transfer_id", id)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleCIPSCallback(w http.ResponseWriter, r *http.Request) {
	if !verifyCallbackHMAC(w, r, os.Getenv("CIPS_SECRET_KEY"), "CIPS") {
		return
	}
	slog.Info("CIPS callback accepted (signature verified)")
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleUPICallback(w http.ResponseWriter, r *http.Request) {
	if !verifyCallbackHMAC(w, r, os.Getenv("UPI_SECRET_KEY"), "UPI") {
		return
	}
	slog.Info("UPI callback accepted (signature verified)")
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handlePIXWebhook(w http.ResponseWriter, r *http.Request) {
	if !verifyCallbackHMAC(w, r, os.Getenv("PIX_SECRET_KEY"), "PIX") {
		return
	}
	slog.Info("PIX webhook accepted (signature verified)")
	w.WriteHeader(http.StatusOK)
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func generateShortID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func generateE2EID() string {
	// PIX E2E ID: E + 8-digit ISPB + 14-digit datetime + 11 alphanumeric
	return fmt.Sprintf("E%s%s%s",
		"12345678",
		time.Now().UTC().Format("20060102150405"),
		generateShortID()+"PAYG",
	)
}

func extractCNAPSCode(receiverID string) string {
	// CNAPS codes are 12 digits
	if len(receiverID) == 12 {
		allDigits := true
		for _, c := range receiverID {
			if c < '0' || c > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			return receiverID
		}
	}
	return ""
}

func detectPIXKeyType(pixKey string) string {
	if strings.Contains(pixKey, "@") {
		return "EMAIL"
	}
	// CPF: 11 digits
	if len(pixKey) == 11 {
		return "CPF"
	}
	// CNPJ: 14 digits
	if len(pixKey) == 14 {
		return "CNPJ"
	}
	// Phone: starts with +55
	if strings.HasPrefix(pixKey, "+55") {
		return "PHONE"
	}
	// EVP: UUID format
	if len(pixKey) == 36 && strings.Count(pixKey, "-") == 4 {
		return "EVP"
	}
	return "PHONE"
}

func generateILPPacketAndCondition(amount, currency string) (string, string) {
	// Simplified ILP packet generation (production: use proper ILP library)
	data := fmt.Sprintf("ILP:%s:%s:%d", amount, currency, time.Now().UnixMilli())
	hash := sha256.Sum256([]byte(data))
	condition := base64.URLEncoding.EncodeToString(hash[:])
	packet := base64.URLEncoding.EncodeToString([]byte(data))
	return packet, condition
}

// Static FX rate / fee tables were removed: quotes must come from live rail
// gateways (handleQuote) and are never fabricated.

// generateJWSSignature generates a JWS signature for FSPIOP messages
func generateJWSSignature(privateKeyPEM []byte, payload []byte) (string, error) {
	block, _ := pem.Decode(privateKeyPEM)
	if block == nil {
		// Generate ephemeral key for demo
		key, _ := rsa.GenerateKey(rand.Reader, 2048)
		der, _ := x509.MarshalPKCS8PrivateKey(key)
		block = &pem.Block{Type: "PRIVATE KEY", Bytes: der}
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", err
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return "", fmt.Errorf("not an RSA key")
	}
	hash := sha256.Sum256(payload)
	sig, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, 0, hash[:])
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(sig), nil
}

// ─── Main ──────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// OpenTelemetry — env-gated no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
	otelShutdown := telemetry.Init(context.Background(), "paygate-mojaloop-fspiop-adapter")
	defer otelShutdown(context.Background())

	cfg := loadConfig()
	srv := NewServer(cfg)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      telemetry.Middleware(srv.mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("Mojaloop FSPIOP Adapter starting",
		"port", cfg.Port,
		"mojaloop_url", cfg.MojaloopURL,
		"rails", "mojaloop,cips,upi,pix,brics_pay,swift",
	)

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpServer.Shutdown(ctx)
	slog.Info("Mojaloop FSPIOP Adapter stopped")
}
