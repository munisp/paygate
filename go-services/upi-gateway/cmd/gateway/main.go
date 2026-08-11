// UPI Gateway — India Unified Payments Interface Cross-Border Rail
// Implements UPI VPA validation, collect flow, and NPCI compliance
// Supports: VPA lookup, collect request, payment status, refund
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
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
	Port              string
	UPIURL            string
	NPCIParticipantID string
	UPISecretKey      string
	InternalAPIKey    string
	RBIPurposeCodes   map[string]string
}

func loadConfig() Config {
	cfg := Config{
		Port:              getEnv("PORT", "8099"),
		UPIURL:            os.Getenv("UPI_URL"),
		NPCIParticipantID: os.Getenv("NPCI_PARTICIPANT_ID"),
		UPISecretKey:      os.Getenv("UPI_SECRET_KEY"), // no default — verifies callbacks
		InternalAPIKey:    os.Getenv("INTERNAL_API_KEY"),
		RBIPurposeCodes: map[string]string{
			"P0001": "Family Maintenance",
			"P0002": "Personal Gifts",
			"P0003": "Medical Treatment",
			"P0004": "Education",
			"P0005": "Travel",
			"P0006": "Business Services",
			"P0007": "Trade Settlement",
			"P0008": "Investment",
		},
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
	if cfg.upstreamEnabled() && (cfg.UPIURL == "" || cfg.NPCIParticipantID == "") {
		slog.Error("FATAL: UPI_UPSTREAM_ENABLED=true requires UPI_URL and NPCI_PARTICIPANT_ID")
		os.Exit(1)
	}
	return cfg
}

// upstreamEnabled reports whether real NPCI submission is configured.
// Without UPI_UPSTREAM_ENABLED=true the gateway FAILS LOUD (503) instead of
// fabricating NPCI references.
func (c Config) upstreamEnabled() bool {
	return os.Getenv("UPI_UPSTREAM_ENABLED") == "true"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── UPI Data Structures ──────────────────────────────────────────────────────

// VPA (Virtual Payment Address) patterns
var vpaRegex = regexp.MustCompile(`^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$`)

// Known UPI handles (PSP handles)
var upiHandles = map[string]string{
	"@okaxis":     "Axis Bank",
	"@okhdfcbank": "HDFC Bank",
	"@okicici":    "ICICI Bank",
	"@oksbi":      "State Bank of India",
	"@paytm":      "Paytm Payments Bank",
	"@ybl":        "PhonePe (Yes Bank)",
	"@ibl":        "PhonePe (ICICI Bank)",
	"@axl":        "PhonePe (Axis Bank)",
	"@upi":        "Generic UPI",
	"@apl":        "Amazon Pay",
	"@gpay":       "Google Pay",
	"@freecharge": "FreeCharge",
	"@kotak":      "Kotak Mahindra Bank",
	"@indus":      "IndusInd Bank",
	"@pnb":        "Punjab National Bank",
	"@boi":        "Bank of India",
	"@cnrb":       "Canara Bank",
	"@mahb":       "Bank of Maharashtra",
	"@rbl":        "RBL Bank",
	"@idbi":       "IDBI Bank",
}

type UPICollectRequest struct {
	TransferID      string `json:"transfer_id"`
	PaygateRef      string `json:"paygate_ref"`
	SenderName      string `json:"sender_name"`
	ReceiverVPA     string `json:"receiver_vpa"`
	Amount          string `json:"amount"`
	SourceCurrency  string `json:"source_currency"`
	TargetCurrency  string `json:"target_currency"`
	Corridor        string `json:"corridor"`
	TransactionType string `json:"transaction_type"` // COLLECT, PAY
	PurposeCode     string `json:"purpose_code"`     // RBI purpose code
	Remarks         string `json:"remarks"`
	CreatedAt       string `json:"created_at"`
}

type UPICollectResponse struct {
	Success       bool   `json:"success"`
	TransferID    string `json:"transfer_id"`
	UPITransferID string `json:"upi_transfer_id"`
	UPIRef        string `json:"upi_ref"`
	Status        string `json:"status"`
	VPA           string `json:"vpa"`
	PSPName       string `json:"psp_name"`
	ExchangeRate  string `json:"exchange_rate"`
	Fee           string `json:"fee"`
	EstimatedTime string `json:"estimated_time"`
	Message       string `json:"message"`
}

type VPALookupResponse struct {
	VPA         string `json:"vpa"`
	Valid       bool   `json:"valid"`
	Name        string `json:"name,omitempty"`
	PSPName     string `json:"psp_name,omitempty"`
	BankName    string `json:"bank_name,omitempty"`
	AccountType string `json:"account_type,omitempty"`
}

// ─── UPI Validation ───────────────────────────────────────────────────────────

func validateVPA(vpa string) bool {
	return vpaRegex.MatchString(vpa)
}

func lookupPSPFromVPA(vpa string) (string, string) {
	lower := strings.ToLower(vpa)
	for handle, psp := range upiHandles {
		if strings.HasSuffix(lower, handle) {
			return psp, handle
		}
	}
	return "Unknown PSP", "@upi"
}

func normalizeVPA(input string) string {
	// If it's a phone number, convert to VPA
	if regexp.MustCompile(`^\+?[0-9]{10,13}$`).MatchString(input) {
		// Strip country code for India
		phone := strings.TrimPrefix(input, "+91")
		phone = strings.TrimPrefix(phone, "91")
		if len(phone) == 10 {
			return phone + "@upi"
		}
	}
	return input
}

// ─── UPI Transaction Reference ────────────────────────────────────────────────

func generateUPIRef() string {
	// UPI transaction reference: 12 digits
	return fmt.Sprintf("%012d", time.Now().UnixMilli()%1000000000000)
}

func generateNPCITransactionID() string {
	return fmt.Sprintf("PAYGATE%s%06d",
		time.Now().UTC().Format("20060102"),
		time.Now().UnixMilli()%1000000,
	)
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

type Server struct {
	cfg    Config
	client *http.Client
	mu     sync.RWMutex
	txns   map[string]npciTxnRecord
}

func NewServer(cfg Config) *Server {
	return &Server{
		cfg:    cfg,
		client: &http.Client{Timeout: 30 * time.Second},
		txns:   make(map[string]npciTxnRecord),
	}
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /v1/collect", s.authMiddleware(s.handleCollect))
	mux.HandleFunc("POST /v1/pay", s.authMiddleware(s.handlePay))
	mux.HandleFunc("GET /v1/status/{id}", s.authMiddleware(s.handleStatus))
	mux.HandleFunc("POST /v1/vpa/lookup", s.authMiddleware(s.handleVPALookup))
	mux.HandleFunc("POST /v1/vpa/validate", s.handleVPAValidate)
	mux.HandleFunc("GET /v1/purpose-codes", s.handlePurposeCodes)
	mux.HandleFunc("POST /v1/callback", s.handleCallback)
	mux.HandleFunc("GET /v1/handles", s.handleListHandles)
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-Internal-Key")
		if key == "" {
			key = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		}
		if key != s.cfg.InternalAPIKey {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// npciTxnRecord tracks a real submitted transaction.
type npciTxnRecord struct {
	TransferID string
	NPCITxnID  string
	UPIRef     string
	Status     string
	Raw        map[string]interface{}
	UpdatedAt  time.Time
}

// callNPCI posts a signed request to the NPCI UPI API. Returns (body, error).
func (s *Server) callNPCI(r *http.Request, path string, payload map[string]interface{}) (map[string]interface{}, error) {
	payload["participant_id"] = s.cfg.NPCIParticipantID
	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.cfg.UPIURL+path, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if s.cfg.UPISecretKey != "" {
		mac := hmac.New(sha256.New, []byte(s.cfg.UPISecretKey))
		mac.Write(body)
		httpReq.Header.Set("X-UPI-Signature", hex.EncodeToString(mac.Sum(nil)))
	}
	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode >= 400 {
		return out, fmt.Errorf("NPCI returned HTTP %d", resp.StatusCode)
	}
	return out, nil
}

func (s *Server) storeTxn(rec npciTxnRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.txns[rec.NPCITxnID] = rec
	if rec.TransferID != "" {
		s.txns[rec.TransferID] = rec
	}
}

func (s *Server) lookupTxn(id string) (npciTxnRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.txns[id]
	return rec, ok
}

// upstreamRequired responds 503 when the NPCI upstream is not wired.
func (s *Server) upstreamRequired(w http.ResponseWriter) bool {
	if s.cfg.upstreamEnabled() {
		return false
	}
	slog.Error("UPI upstream not enabled — refusing to fabricate NPCI references (set UPI_UPSTREAM_ENABLED=true with UPI_URL/NPCI_PARTICIPANT_ID)")
	http.Error(w, `{"error":"upi_upstream_not_configured","message":"NPCI upstream is not configured; no transaction was executed"}`, http.StatusServiceUnavailable)
	return true
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":               "healthy",
		"service":              "upi-gateway",
		"version":              "1.0.0",
		"participant_id":       s.cfg.NPCIParticipantID,
		"supported_currencies": []string{"INR"},
		"transaction_types":    []string{"COLLECT", "PAY"},
		"ts":                   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleCollect(w http.ResponseWriter, r *http.Request) {
	var req UPICollectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Normalize VPA
	req.ReceiverVPA = normalizeVPA(req.ReceiverVPA)

	// Validate VPA
	if !validateVPA(req.ReceiverVPA) {
		http.Error(w, fmt.Sprintf(`{"error":"invalid VPA format: %s"}`, req.ReceiverVPA), http.StatusBadRequest)
		return
	}

	// Set defaults
	if req.PurposeCode == "" {
		req.PurposeCode = "P0001" // Family Maintenance (most common for remittance)
	}
	if req.TargetCurrency == "" {
		req.TargetCurrency = "INR"
	}

	if s.upstreamRequired(w) {
		return
	}
	pspName, _ := lookupPSPFromVPA(req.ReceiverVPA)

	upstream, err := s.callNPCI(r, "/collect", map[string]interface{}{
		"transfer_id":  req.TransferID,
		"payee_vpa":    req.ReceiverVPA,
		"amount":       req.Amount,
		"currency":     req.TargetCurrency,
		"purpose_code": req.PurposeCode,
		"remarks":      req.Remarks,
	})
	if err != nil {
		slog.Error("NPCI collect failed", "transfer_id", req.TransferID, "error", err)
		http.Error(w, `{"error":"npci_submission_failed","message":"UPI collect submission failed; no request was sent"}`, http.StatusBadGateway)
		return
	}
	npciTxnID, _ := upstream["txn_id"].(string)
	upiRef, _ := upstream["upi_ref"].(string)
	status, _ := upstream["status"].(string)
	if status == "" {
		status = "pending" // UPI collect is async — user must approve on their device
	}

	s.storeTxn(npciTxnRecord{
		TransferID: req.TransferID,
		NPCITxnID:  npciTxnID,
		UPIRef:     upiRef,
		Status:     status,
		Raw:        upstream,
		UpdatedAt:  time.Now().UTC(),
	})

	slog.Info("UPI collect request submitted to NPCI",
		"transfer_id", req.TransferID,
		"vpa", req.ReceiverVPA,
		"amount", req.Amount,
		"purpose_code", req.PurposeCode,
		"psp", pspName,
		"npci_status", status,
	)

	resp := UPICollectResponse{
		Success:       true,
		TransferID:    req.TransferID,
		UPITransferID: npciTxnID,
		UPIRef:        upiRef,
		Status:        status,
		VPA:           req.ReceiverVPA,
		PSPName:       pspName,
		// FX rate / fee come from the upstream response only.
		ExchangeRate: stringFromMap(upstream, "exchange_rate"),
		Fee:          stringFromMap(upstream, "fee"),
		Message:      fmt.Sprintf("UPI collect request submitted to %s (%s). Awaiting approval.", req.ReceiverVPA, pspName),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(resp)
}

// stringFromMap extracts a string field ("" if absent).
func stringFromMap(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func (s *Server) handlePay(w http.ResponseWriter, r *http.Request) {
	var req UPICollectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.ReceiverVPA = normalizeVPA(req.ReceiverVPA)
	if !validateVPA(req.ReceiverVPA) {
		http.Error(w, `{"error":"invalid VPA"}`, http.StatusBadRequest)
		return
	}

	if s.upstreamRequired(w) {
		return
	}
	pspName, _ := lookupPSPFromVPA(req.ReceiverVPA)

	upstream, err := s.callNPCI(r, "/pay", map[string]interface{}{
		"transfer_id":  req.TransferID,
		"payee_vpa":    req.ReceiverVPA,
		"amount":       req.Amount,
		"currency":     req.TargetCurrency,
		"purpose_code": req.PurposeCode,
		"remarks":      req.Remarks,
	})
	if err != nil {
		slog.Error("NPCI pay failed", "transfer_id", req.TransferID, "error", err)
		http.Error(w, `{"error":"npci_submission_failed","message":"UPI pay submission failed; no payment was executed"}`, http.StatusBadGateway)
		return
	}
	npciTxnID, _ := upstream["txn_id"].(string)
	upiRef, _ := upstream["upi_ref"].(string)
	status, _ := upstream["status"].(string)
	if status == "" {
		status = "submitted"
	}

	s.storeTxn(npciTxnRecord{
		TransferID: req.TransferID,
		NPCITxnID:  npciTxnID,
		UPIRef:     upiRef,
		Status:     status,
		Raw:        upstream,
		UpdatedAt:  time.Now().UTC(),
	})

	resp := UPICollectResponse{
		Success:       true,
		TransferID:    req.TransferID,
		UPITransferID: npciTxnID,
		UPIRef:        upiRef,
		Status:        status,
		VPA:           req.ReceiverVPA,
		PSPName:       pspName,
		ExchangeRate:  stringFromMap(upstream, "exchange_rate"),
		Fee:           stringFromMap(upstream, "fee"),
		Message:       fmt.Sprintf("UPI pay submitted to %s (%s)", req.ReceiverVPA, pspName),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, ok := s.lookupTxn(id)
	if !ok {
		http.Error(w, `{"error":"transaction_not_found"}`, http.StatusNotFound)
		return
	}
	// Best-effort live refresh from NPCI.
	if s.cfg.upstreamEnabled() && rec.NPCITxnID != "" {
		if upstream, err := s.callNPCI(r, "/status", map[string]interface{}{"txn_id": rec.NPCITxnID}); err == nil {
			if st, _ := upstream["status"].(string); st != "" {
				rec.Status = st
				rec.Raw = upstream
				rec.UpdatedAt = time.Now().UTC()
				s.storeTxn(rec)
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transfer_id": rec.TransferID,
		"npci_txn_id": rec.NPCITxnID,
		"upi_ref":     rec.UPIRef,
		"status":      rec.Status,
		"updated_at":  rec.UpdatedAt.Format(time.RFC3339),
		"upstream":    rec.Raw,
	})
}

func (s *Server) handleVPALookup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VPA string `json:"vpa"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	vpa := normalizeVPA(req.VPA)
	valid := validateVPA(vpa)
	if !valid {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VPALookupResponse{VPA: vpa, Valid: false})
		return
	}

	// Payee identity comes from NPCI only — never fabricate a name.
	if s.upstreamRequired(w) {
		return
	}
	upstream, err := s.callNPCI(r, "/vpa/lookup", map[string]interface{}{"vpa": vpa})
	if err != nil {
		slog.Error("NPCI VPA lookup failed", "vpa", vpa, "error", err)
		http.Error(w, `{"error":"npci_lookup_failed"}`, http.StatusBadGateway)
		return
	}
	pspName, _ := lookupPSPFromVPA(vpa)
	resp := VPALookupResponse{
		VPA:         vpa,
		Valid:       true,
		Name:        stringFromMap(upstream, "name"),
		PSPName:     pspName,
		AccountType: stringFromMap(upstream, "account_type"),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleVPAValidate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		VPA string `json:"vpa"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	vpa := normalizeVPA(req.VPA)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"vpa":   vpa,
		"valid": validateVPA(vpa),
	})
}

func (s *Server) handlePurposeCodes(w http.ResponseWriter, r *http.Request) {
	codes := make([]map[string]string, 0)
	for code, desc := range s.cfg.RBIPurposeCodes {
		codes = append(codes, map[string]string{"code": code, "description": desc})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"purpose_codes": codes})
}

func (s *Server) handleListHandles(w http.ResponseWriter, r *http.Request) {
	handles := make([]map[string]string, 0, len(upiHandles))
	for handle, psp := range upiHandles {
		handles = append(handles, map[string]string{"handle": handle, "psp": psp})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"handles": handles, "count": len(handles)})
}

func (s *Server) handleCallback(w http.ResponseWriter, r *http.Request) {
	// Settlement callbacks mutate transaction state — require HMAC-SHA256 over
	// the raw body keyed by UPI_SECRET_KEY (header X-UPI-Signature, hex encoded).
	if s.cfg.UPISecretKey == "" {
		slog.Error("UPI callback rejected: UPI_SECRET_KEY not configured")
		http.Error(w, `{"error":"callback_not_configured"}`, http.StatusServiceUnavailable)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sig := r.Header.Get("X-UPI-Signature")
	mac := hmac.New(sha256.New, []byte(s.cfg.UPISecretKey))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if sig == "" || !hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected)) {
		slog.Warn("UPI callback rejected: invalid or missing signature")
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return
	}
	slog.Info("UPI callback accepted (signature verified)")
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

	slog.Info("UPI Gateway starting", "port", cfg.Port, "npci_id", cfg.NPCIParticipantID)

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
	slog.Info("UPI Gateway stopped")
}
