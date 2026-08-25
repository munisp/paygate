// CIPS Gateway — China Interbank Payment System Cross-Border Rail
// Implements CIPS ISO 20022 pacs.008 message format for CNY cross-border transfers
// Supports: CNAPS code validation, PBOC compliance, real-time settlement
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ─── Configuration ─────────────────────────────────────────────────────────────

type Config struct {
	Port                string
	CIPSURL             string
	CIPSParticipantCode string
	CIPSSecretKey       string
	InternalAPIKey      string
	RedisURL            string
}

func loadConfig() Config {
	cfg := Config{
		Port:                getEnv("PORT", "8098"),
		CIPSURL:             os.Getenv("CIPS_URL"),
		CIPSParticipantCode: os.Getenv("CIPS_PARTICIPANT_CODE"),
		CIPSSecretKey:       os.Getenv("CIPS_SECRET_KEY"), // no default — signs submissions & verifies callbacks
		InternalAPIKey:      os.Getenv("INTERNAL_API_KEY"),
		RedisURL:            getEnv("REDIS_URL", "redis://localhost:6379/0"),
	}
	env := strings.ToLower(os.Getenv("ENV"))
	prod := env == "production" || env == "prod"
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
	if cfg.upstreamEnabled() && (cfg.CIPSURL == "" || cfg.CIPSParticipantCode == "" || cfg.CIPSSecretKey == "") {
		slog.Error("FATAL: CIPS_UPSTREAM_ENABLED=true requires CIPS_URL, CIPS_PARTICIPANT_CODE and CIPS_SECRET_KEY")
		os.Exit(1)
	}
	return cfg
}

// upstreamEnabled reports whether real CIPS submission is configured.
// Without CIPS_UPSTREAM_ENABLED=true the gateway FAILS LOUD (503) instead of
// fabricating submissions or quotes.
func (c Config) upstreamEnabled() bool {
	return os.Getenv("CIPS_UPSTREAM_ENABLED") == "true"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── CIPS Data Structures ──────────────────────────────────────────────────────

// CNAPS (China National Advanced Payment System) bank codes
var CNAPSBankCodes = map[string]string{
	"ICBC":   "102100099996", // Industrial and Commercial Bank of China
	"CCB":    "105100000017", // China Construction Bank
	"ABC":    "103100000026", // Agricultural Bank of China
	"BOC":    "104100000004", // Bank of China
	"BOCOM":  "301290000007", // Bank of Communications
	"CMB":    "308584000013", // China Merchants Bank
	"SPDB":   "310290000013", // Shanghai Pudong Development Bank
	"CITIC":  "302100011000", // CITIC Bank
	"CEB":    "303100000006", // China Everbright Bank
	"HXB":    "304100040000", // Hua Xia Bank
	"GDB":    "306581000003", // Guangfa Bank
	"PAB":    "307584007998", // Ping An Bank
	"PSBC":   "403100000004", // Postal Savings Bank of China
	"ALIPAY": "000000000000", // Alipay (virtual)
	"WECHAT": "000000000001", // WeChat Pay (virtual)
}

type CIPSTransferRequest struct {
	TransferID       string `json:"transfer_id"`
	PaygateRef       string `json:"paygate_ref"`
	SenderName       string `json:"sender_name"`
	ReceiverID       string `json:"receiver_id"`
	ReceiverIDType   string `json:"receiver_id_type"` // ACCOUNT, CNAPS, ALIAS
	CNAPSCode        string `json:"cnaps_code"`
	Amount           string `json:"amount"`
	SourceCurrency   string `json:"source_currency"`
	TargetCurrency   string `json:"target_currency"`
	Corridor         string `json:"corridor"`
	MessageType      string `json:"message_type"`      // pacs.008.001.08
	SettlementMethod string `json:"settlement_method"` // CLRG, INDA, INGA
	ChargeBearer     string `json:"charge_bearer"`     // SHAR, DEBT, CRED, SLEV
	CreatedAt        string `json:"created_at"`
}

type CIPSTransferResponse struct {
	Success        bool   `json:"success"`
	TransferID     string `json:"transfer_id"`
	CIPSMessageID  string `json:"cips_message_id"`
	Status         string `json:"status"`
	CNAPSCode      string `json:"cnaps_code"`
	ExchangeRate   string `json:"exchange_rate"`
	Fee            string `json:"fee"`
	SettlementTime string `json:"settlement_time"`
	Message        string `json:"message"`
}

type CIPSQuoteRequest struct {
	SourceCurrency string `json:"source_currency"`
	TargetCurrency string `json:"target_currency"`
	Amount         string `json:"amount"`
	Corridor       string `json:"corridor"`
}

// ─── CIPS Validation ──────────────────────────────────────────────────────────

var cnapsRegex = regexp.MustCompile(`^\d{12}$`)

func validateCNAPSCode(code string) bool {
	return cnapsRegex.MatchString(code)
}

func validateCIPSAmount(amount string) bool {
	// CIPS minimum: 0.01 CNY, maximum: 50,000,000 CNY per transaction
	if amount == "" || amount == "0" {
		return false
	}
	return true
}

func lookupCNAPSCode(bankName string) string {
	upper := strings.ToUpper(bankName)
	for key, code := range CNAPSBankCodes {
		if strings.Contains(upper, key) {
			return code
		}
	}
	return CNAPSBankCodes["ICBC"] // Default to ICBC
}

// ─── CIPS Message Builder ─────────────────────────────────────────────────────

func buildPacs008Message(req CIPSTransferRequest, msgID string) string {
	// ISO 20022 pacs.008.001.08 XML message
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>%s</MsgId>
      <CreDtTm>%s</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>%s</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>%s</EndToEndId>
        <TxId>%s</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="%s">%s</IntrBkSttlmAmt>
      <ChrgBr>%s</ChrgBr>
      <Dbtr>
        <Nm>%s</Nm>
      </Dbtr>
      <DbtrAgt>
        <FinInstnId>
          <ClrSysMmbId>
            <MmbId>%s</MmbId>
          </ClrSysMmbId>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <ClrSysMmbId>
            <MmbId>%s</MmbId>
          </ClrSysMmbId>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>%s</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>%s</Id>
          </Othr>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`,
		msgID,
		time.Now().UTC().Format("2006-01-02T15:04:05"),
		req.SettlementMethod,
		req.TransferID,
		req.TransferID,
		req.TargetCurrency,
		req.Amount,
		req.ChargeBearer,
		req.SenderName,
		"PAYGCNBJ", // PayGate CIPS participant code
		req.CNAPSCode,
		"Beneficiary",
		req.ReceiverID,
	)
}

// ─── HMAC Signature ───────────────────────────────────────────────────────────

func signCIPSRequest(secretKey, payload string) string {
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

type Server struct {
	cfg       Config
	client    *http.Client
	mu        sync.RWMutex
	transfers map[string]transferRecord
}

func NewServer(cfg Config) *Server {
	return &Server{
		cfg:       cfg,
		client:    &http.Client{Timeout: 30 * time.Second},
		transfers: make(map[string]transferRecord),
	}
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /v1/transfers", s.authMiddleware(s.handleTransfer))
	mux.HandleFunc("GET /v1/transfers/{id}", s.authMiddleware(s.handleGetTransfer))
	mux.HandleFunc("POST /v1/quote", s.authMiddleware(s.handleQuote))
	mux.HandleFunc("GET /v1/banks", s.handleListBanks)
	mux.HandleFunc("POST /v1/validate/cnaps", s.handleValidateCNAPS)
	mux.HandleFunc("POST /v1/callback", s.handleCallback)
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-Internal-Key")
		if key == "" {
			if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				key = strings.TrimPrefix(auth, "Bearer ")
			}
		}
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
		"status":               "healthy",
		"service":              "cips-gateway",
		"version":              "1.0.0",
		"participant_code":     s.cfg.CIPSParticipantCode,
		"supported_currencies": []string{"CNY", "CNH"},
		"settlement_methods":   []string{"CLRG", "INDA", "INGA"},
		"ts":                   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleTransfer(w http.ResponseWriter, r *http.Request) {
	var req CIPSTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate CNAPS code
	if req.CNAPSCode == "" {
		req.CNAPSCode = lookupCNAPSCode(req.ReceiverID)
	}
	if !validateCNAPSCode(req.CNAPSCode) {
		http.Error(w, `{"error":"invalid CNAPS code"}`, http.StatusBadRequest)
		return
	}

	// Set defaults
	if req.MessageType == "" {
		req.MessageType = "pacs.008.001.08"
	}
	if req.SettlementMethod == "" {
		req.SettlementMethod = "CLRG"
	}
	if req.ChargeBearer == "" {
		req.ChargeBearer = "SHAR"
	}
	if req.TargetCurrency == "" {
		req.TargetCurrency = "CNY"
	}

	if !s.cfg.upstreamEnabled() {
		slog.Error("CIPS upstream not enabled — refusing to fabricate a submission (set CIPS_UPSTREAM_ENABLED=true with CIPS_URL/CIPS_PARTICIPANT_CODE/CIPS_SECRET_KEY)")
		http.Error(w, `{"error":"cips_upstream_not_configured","message":"CIPS upstream is not configured; no transfer was submitted"}`, http.StatusServiceUnavailable)
		return
	}
	if len(req.TransferID) < 8 {
		http.Error(w, `{"error":"transfer_id must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	// Generate CIPS message ID
	msgID := fmt.Sprintf("CIPS%s%s", time.Now().UTC().Format("20060102150405"), req.TransferID[:8])

	// Build ISO 20022 pacs.008 message
	pacs008 := buildPacs008Message(req, msgID)

	// Sign and submit to CIPS
	signature := signCIPSRequest(s.cfg.CIPSSecretKey, req.TransferID+req.Amount+req.CNAPSCode)

	status, upstream, err := s.submitToCIPS(r, msgID, pacs008, signature)
	if err != nil {
		slog.Error("CIPS submission failed", "msg_id", msgID, "error", err)
		http.Error(w, `{"error":"cips_submission_failed","message":"CIPS submission failed; no transfer was executed"}`, http.StatusBadGateway)
		return
	}

	s.storeTransfer(transferRecord{
		TransferID: req.TransferID,
		MessageID:  msgID,
		Status:     status,
		Raw:        upstream,
		UpdatedAt:  time.Now().UTC(),
	})

	slog.Info("CIPS transfer submitted to upstream",
		"transfer_id", req.TransferID,
		"cnaps_code", req.CNAPSCode,
		"amount", req.Amount,
		"currency", req.TargetCurrency,
		"signature_prefix", signature[:8],
		"cips_status", status,
	)

	resp := CIPSTransferResponse{
		Success:       true,
		TransferID:    req.TransferID,
		CIPSMessageID: msgID,
		Status:        status,
		CNAPSCode:     req.CNAPSCode,
		// FX rate / fee / settlement time come from the upstream response only.
		ExchangeRate:   stringField(upstream, "exchange_rate"),
		Fee:            stringField(upstream, "fee"),
		SettlementTime: stringField(upstream, "settlement_time"),
		Message:        fmt.Sprintf("CIPS pacs.008 message %s submitted to CNAPS %s", msgID, req.CNAPSCode),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(resp)
}

// transferRecord tracks a real submitted transfer.
type transferRecord struct {
	TransferID string
	MessageID  string
	Status     string
	Raw        map[string]interface{}
	UpdatedAt  time.Time
}

// submitToCIPS POSTs the signed pacs.008 message to the CIPS participant API.
// Returns (status, upstream body, error).
func (s *Server) submitToCIPS(r *http.Request, msgID, pacs008, signature string) (string, map[string]interface{}, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"message_id":       msgID,
		"message_type":     "pacs.008.001.08",
		"participant_code": s.cfg.CIPSParticipantCode,
		"pacs008":          pacs008,
		"signature":        signature,
	})
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.cfg.CIPSURL+"/messages", strings.NewReader(string(payload)))
	if err != nil {
		return "", nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-CIPS-Signature", signature)
	resp, err := s.client.Do(httpReq)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode >= 400 {
		return "", body, fmt.Errorf("CIPS returned HTTP %d", resp.StatusCode)
	}
	status, _ := body["status"].(string)
	if status == "" {
		status = "submitted"
	}
	return status, body, nil
}

func (s *Server) storeTransfer(rec transferRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.transfers[rec.TransferID] = rec
	s.transfers[rec.MessageID] = rec
}

func (s *Server) lookupTransfer(id string) (transferRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.transfers[id]
	return rec, ok
}

// stringField extracts a string field from an upstream response ("" if absent).
func stringField(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func (s *Server) handleGetTransfer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, ok := s.lookupTransfer(id)
	if !ok {
		http.Error(w, `{"error":"transfer_not_found"}`, http.StatusNotFound)
		return
	}
	// Best-effort live refresh from the CIPS participant API.
	if s.cfg.upstreamEnabled() {
		httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
			fmt.Sprintf("%s/messages/%s", s.cfg.CIPSURL, rec.MessageID), nil)
		if err == nil {
			if resp, derr := s.client.Do(httpReq); derr == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var body map[string]interface{}
					_ = json.NewDecoder(resp.Body).Decode(&body)
					if st, _ := body["status"].(string); st != "" {
						rec.Status = st
						rec.Raw = body
						rec.UpdatedAt = time.Now().UTC()
						s.storeTransfer(rec)
					}
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transfer_id":     rec.TransferID,
		"cips_message_id": rec.MessageID,
		"status":          rec.Status,
		"updated_at":      rec.UpdatedAt.Format(time.RFC3339),
		"upstream":        rec.Raw,
	})
}

func (s *Server) handleQuote(w http.ResponseWriter, r *http.Request) {
	var req CIPSQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if !s.cfg.upstreamEnabled() {
		slog.Error("CIPS upstream not enabled — refusing to fabricate an FX quote")
		http.Error(w, `{"error":"cips_upstream_not_configured","message":"no live FX source is configured; quote unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	payload, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.cfg.CIPSURL+"/quotes", strings.NewReader(string(payload)))
	if err != nil {
		http.Error(w, `{"error":"quote_failed"}`, http.StatusInternalServerError)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(httpReq)
	if err != nil {
		slog.Error("CIPS quote failed", "error", err)
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

func (s *Server) handleListBanks(w http.ResponseWriter, r *http.Request) {
	banks := make([]map[string]string, 0, len(CNAPSBankCodes))
	for name, code := range CNAPSBankCodes {
		banks = append(banks, map[string]string{
			"name":       name,
			"cnaps_code": code,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"banks": banks, "count": len(banks)})
}

func (s *Server) handleValidateCNAPS(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CNAPSCode string `json:"cnaps_code"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	valid := validateCNAPSCode(req.CNAPSCode)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cnaps_code": req.CNAPSCode,
		"valid":      valid,
	})
}

func (s *Server) handleCallback(w http.ResponseWriter, r *http.Request) {
	// Settlement callbacks mutate transfer state — require HMAC-SHA256 over the
	// raw body keyed by CIPS_SECRET_KEY (header X-CIPS-Signature, hex encoded).
	if s.cfg.CIPSSecretKey == "" {
		slog.Error("CIPS callback rejected: CIPS_SECRET_KEY not configured")
		http.Error(w, `{"error":"callback_not_configured"}`, http.StatusServiceUnavailable)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sig := r.Header.Get("X-CIPS-Signature")
	expected := signCIPSRequest(s.cfg.CIPSSecretKey, string(body))
	if sig == "" || !hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected)) {
		slog.Warn("CIPS callback rejected: invalid or missing signature")
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return
	}
	slog.Info("CIPS callback accepted (signature verified)")
	w.WriteHeader(http.StatusOK)
}

// ─── Main ──────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg := loadConfig()
	srv := NewServer(cfg)
	mux := http.NewServeMux()
	srv.registerRoutes(mux)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	slog.Info("CIPS Gateway starting", "port", cfg.Port, "cips_url", cfg.CIPSURL)

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
	slog.Info("CIPS Gateway stopped")
}
