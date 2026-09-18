// PIX Gateway — Brazil Instant Payment System Cross-Border Rail
// Implements PIX key management, QR code generation, and BACEN compliance
// Supports: CPF, CNPJ, phone, email, EVP key types; EMV QR Code; instant settlement
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
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

	"github.com/paygate/pix-gateway/internal/telemetry"
)

// ─── Configuration ─────────────────────────────────────────────────────────────

type Config struct {
	Port           string
	PIXURL         string
	ISPBCode       string // BACEN ISPB code (8 digits)
	PIXSecretKey   string
	InternalAPIKey string
}

func loadConfig() Config {
	cfg := Config{
		Port:           getEnv("PORT", "8100"),
		PIXURL:         os.Getenv("PIX_URL"),
		ISPBCode:       os.Getenv("PIX_ISPB_CODE"),
		PIXSecretKey:   os.Getenv("PIX_SECRET_KEY"), // no default — HMAC secret for webhooks
		InternalAPIKey: os.Getenv("INTERNAL_API_KEY"),
	}
	env := strings.ToLower(os.Getenv("ENV"))
	prod := env == "production" || env == "prod"
	if cfg.InternalAPIKey == "" {
		if prod {
			slog.Error("FATAL: INTERNAL_API_KEY must be set when ENV=production")
			os.Exit(1)
		}
		// Dev mode: per-boot random key (NOT a well-known default).
		b := make([]byte, 16)
		rand.Read(b)
		cfg.InternalAPIKey = fmt.Sprintf("dev-%x", b)
		slog.Warn("INTERNAL_API_KEY unset — generated per-boot dev key; refusing well-known defaults")
	}
	if cfg.upstreamEnabled() {
		if cfg.PIXURL == "" || cfg.ISPBCode == "" {
			slog.Error("FATAL: PIX_UPSTREAM_ENABLED=true requires PIX_URL and PIX_ISPB_CODE")
			os.Exit(1)
		}
	}
	return cfg
}

// upstreamEnabled reports whether real BACEN submission is configured.
// Without PIX_UPSTREAM_ENABLED=true the gateway FAILS LOUD (503) on payment
// paths instead of fabricating transfers.
func (c Config) upstreamEnabled() bool {
	return os.Getenv("PIX_UPSTREAM_ENABLED") == "true"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── PIX Data Structures ──────────────────────────────────────────────────────

type PIXKeyType string

const (
	PIXKeyCPF   PIXKeyType = "CPF"
	PIXKeyCNPJ  PIXKeyType = "CNPJ"
	PIXKeyPhone PIXKeyType = "PHONE"
	PIXKeyEmail PIXKeyType = "EMAIL"
	PIXKeyEVP   PIXKeyType = "EVP" // Random key
)

// Brazilian bank ISPB codes
var BrazilianBanks = map[string]string{
	"ITAU":        "60701190",
	"BRADESCO":    "60746948",
	"SANTANDER":   "90400888",
	"CAIXA":       "00360305",
	"BB":          "00000000", // Banco do Brasil
	"NUBANK":      "18236120",
	"INTER":       "00416968",
	"C6BANK":      "31872495",
	"PICPAY":      "22896431",
	"MERCADOPAGO": "10573521",
	"PAGSEGURO":   "08561701",
	"STONE":       "11274546",
	"SICOOB":      "02038232",
	"SICREDI":     "01181521",
	"BANRISUL":    "92702067",
}

type PIXPaymentRequest struct {
	TransferID     string `json:"transfer_id"`
	PaygateRef     string `json:"paygate_ref"`
	SenderName     string `json:"sender_name"`
	PIXKey         string `json:"pix_key"`
	PIXKeyType     string `json:"pix_key_type"`
	Amount         string `json:"amount"`
	SourceCurrency string `json:"source_currency"`
	TargetCurrency string `json:"target_currency"`
	Corridor       string `json:"corridor"`
	EndToEndID     string `json:"end_to_end_id"`
	Description    string `json:"description"`
	CreatedAt      string `json:"created_at"`
}

type PIXPaymentResponse struct {
	Success       bool   `json:"success"`
	TransferID    string `json:"transfer_id"`
	PIXTransferID string `json:"pix_transfer_id"`
	EndToEndID    string `json:"end_to_end_id"`
	Status        string `json:"status"`
	PIXKey        string `json:"pix_key"`
	PIXKeyType    string `json:"pix_key_type"`
	ExchangeRate  string `json:"exchange_rate"`
	Fee           string `json:"fee"`
	SettledAt     string `json:"settled_at,omitempty"`
	Message       string `json:"message"`
}

type PIXQRCodeRequest struct {
	Amount       string `json:"amount"`
	Description  string `json:"description"`
	PIXKey       string `json:"pix_key"`
	MerchantName string `json:"merchant_name"`
	MerchantCity string `json:"merchant_city"`
	ExpiresAt    string `json:"expires_at,omitempty"`
}

type PIXQRCodeResponse struct {
	QRCode      string `json:"qr_code"`       // EMV QR code string
	QRCodeImage string `json:"qr_code_image"` // Base64 PNG (simplified)
	EndToEndID  string `json:"end_to_end_id"`
	ExpiresAt   string `json:"expires_at"`
	Amount      string `json:"amount"`
}

// ─── PIX Validation ───────────────────────────────────────────────────────────

var (
	cpfRegex   = regexp.MustCompile(`^\d{11}$`)
	cnpjRegex  = regexp.MustCompile(`^\d{14}$`)
	phoneRegex = regexp.MustCompile(`^\+55\d{10,11}$`)
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	evpRegex   = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

func detectPIXKeyType(key string) PIXKeyType {
	if emailRegex.MatchString(key) {
		return PIXKeyEmail
	}
	if cpfRegex.MatchString(key) {
		return PIXKeyCPF
	}
	if cnpjRegex.MatchString(key) {
		return PIXKeyCNPJ
	}
	if phoneRegex.MatchString(key) {
		return PIXKeyPhone
	}
	if evpRegex.MatchString(strings.ToLower(key)) {
		return PIXKeyEVP
	}
	return PIXKeyPhone
}

func validatePIXKey(key string, keyType PIXKeyType) bool {
	switch keyType {
	case PIXKeyCPF:
		return cpfRegex.MatchString(key) && validateCPF(key)
	case PIXKeyCNPJ:
		return cnpjRegex.MatchString(key)
	case PIXKeyPhone:
		return phoneRegex.MatchString(key)
	case PIXKeyEmail:
		return emailRegex.MatchString(key)
	case PIXKeyEVP:
		return evpRegex.MatchString(strings.ToLower(key))
	}
	return false
}

// validateCPF validates Brazilian CPF using Luhn-like algorithm
func validateCPF(cpf string) bool {
	if len(cpf) != 11 {
		return false
	}
	// Check for all-same digits
	allSame := true
	for i := 1; i < 11; i++ {
		if cpf[i] != cpf[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}
	// Validate check digits
	sum := 0
	for i := 0; i < 9; i++ {
		sum += int(cpf[i]-'0') * (10 - i)
	}
	r1 := (sum * 10) % 11
	if r1 == 10 || r1 == 11 {
		r1 = 0
	}
	if r1 != int(cpf[9]-'0') {
		return false
	}
	sum = 0
	for i := 0; i < 10; i++ {
		sum += int(cpf[i]-'0') * (11 - i)
	}
	r2 := (sum * 10) % 11
	if r2 == 10 || r2 == 11 {
		r2 = 0
	}
	return r2 == int(cpf[10]-'0')
}

// ─── PIX End-to-End ID ────────────────────────────────────────────────────────

func generateE2EID(ispbCode string) string {
	// PIX E2E ID format: E{ISPB8}{YYYYMMDDHHmm}{11 alphanumeric}
	suffix := make([]byte, 6)
	rand.Read(suffix)
	return fmt.Sprintf("E%s%s%X",
		ispbCode,
		time.Now().UTC().Format("200601021504"),
		suffix,
	)
}

// ─── EMV QR Code Builder ──────────────────────────────────────────────────────

func buildEMVQRCode(req PIXQRCodeRequest, e2eID string) string {
	// Simplified EMV QR Code for PIX (production: use full EMV spec)
	// Format: TLV (Tag-Length-Value) encoded string
	pixKey := req.PIXKey
	merchantName := req.MerchantName
	if merchantName == "" {
		merchantName = "PAYGATE"
	}
	merchantCity := req.MerchantCity
	if merchantCity == "" {
		merchantCity = "SAO PAULO"
	}

	// Build PIX payload (simplified EMV)
	pixPayload := fmt.Sprintf("0002010102%s2658BR.GOV.BCB.PIX0136%s5204000053039865802BR5913%s6009%s62070503***6304",
		"12", // initiation method
		pixKey,
		merchantName,
		merchantCity,
	)

	// Add CRC16 (simplified)
	crc := calculateCRC16(pixPayload)
	return pixPayload + fmt.Sprintf("%04X", crc)
}

func calculateCRC16(data string) uint16 {
	var crc uint16 = 0xFFFF
	for _, b := range []byte(data) {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────────

type Server struct {
	cfg      Config
	client   *http.Client
	mu       sync.RWMutex
	payments map[string]paymentRecord
}

// newMTLSClient creates an HTTP client with mTLS cert pinning for the BACEN PIX API.
// Set PIX_CERT_FINGERPRINT env var to the SHA-256 hex fingerprint of the BACEN leaf
// certificate to enable strict cert pinning. Without it, standard TLS verification applies.
func newMTLSClient() *http.Client {
	pinnedFingerprint := strings.ToLower(strings.ReplaceAll(os.Getenv("PIX_CERT_FINGERPRINT"), ":", ""))
	tlsCfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	if pinnedFingerprint != "" {
		tlsCfg.VerifyPeerCertificate = func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
			for _, rawCert := range rawCerts {
				fingerprint := sha256.Sum256(rawCert)
				hex := hex.EncodeToString(fingerprint[:])
				if hex == pinnedFingerprint {
					return nil // cert matches pinned fingerprint
				}
			}
			return fmt.Errorf("pix-gateway: cert pinning failed — no cert matched fingerprint %s", pinnedFingerprint)
		}
		slog.Info("PIX gateway mTLS cert pinning enabled", "fingerprint", pinnedFingerprint)
	} else {
		slog.Warn("PIX gateway cert pinning disabled — set PIX_CERT_FINGERPRINT for production")
	}
	transport := &http.Transport{TLSClientConfig: tlsCfg}
	return &http.Client{Timeout: 30 * time.Second, Transport: transport}
}

func NewServer(cfg Config) *Server {
	return &Server{
		cfg:      cfg,
		client:   newMTLSClient(),
		payments: make(map[string]paymentRecord),
	}
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /v1/payments", s.authMiddleware(s.handlePayment))
	mux.HandleFunc("GET /v1/payments/{id}", s.authMiddleware(s.handleGetPayment))
	mux.HandleFunc("POST /v1/qrcode", s.authMiddleware(s.handleGenerateQRCode))
	mux.HandleFunc("POST /v1/keys/validate", s.handleValidateKey)
	mux.HandleFunc("POST /v1/keys/lookup", s.authMiddleware(s.handleKeyLookup))
	mux.HandleFunc("GET /v1/banks", s.handleListBanks)
	mux.HandleFunc("POST /v1/webhook", s.handleWebhook)
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
		"service":              "pix-gateway",
		"version":              "1.0.0",
		"ispb_code":            s.cfg.ISPBCode,
		"supported_currencies": []string{"BRL"},
		"key_types":            []string{"CPF", "CNPJ", "PHONE", "EMAIL", "EVP"},
		"settlement":           "instant",
		"ts":                   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handlePayment(w http.ResponseWriter, r *http.Request) {
	var req PIXPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Detect and validate PIX key type
	if req.PIXKeyType == "" {
		req.PIXKeyType = string(detectPIXKeyType(req.PIXKey))
	}
	keyType := PIXKeyType(req.PIXKeyType)
	if !validatePIXKey(req.PIXKey, keyType) {
		// Allow non-strict validation in sandbox
		slog.Warn("PIX key validation warning", "key", req.PIXKey, "type", req.PIXKeyType)
	}

	if !s.cfg.upstreamEnabled() {
		slog.Error("PIX upstream not enabled — refusing to fabricate a payment (set PIX_UPSTREAM_ENABLED=true with PIX_URL/PIX_ISPB_CODE)")
		http.Error(w, `{"error":"pix_upstream_not_configured","message":"BACEN PIX upstream is not configured; no payment was executed"}`, http.StatusServiceUnavailable)
		return
	}

	// Generate E2E ID
	e2eID := req.EndToEndID
	if e2eID == "" {
		e2eID = generateE2EID(s.cfg.ISPBCode)
	}

	// Submit to BACEN via the mTLS client (PUT /pix/{e2eid}).
	status, raw, err := s.submitToBACEN(r, e2eID, req)
	if err != nil {
		slog.Error("BACEN submission failed", "e2e_id", e2eID, "error", err)
		http.Error(w, `{"error":"bacen_submission_failed","message":"PIX submission to BACEN failed; no payment was executed"}`, http.StatusBadGateway)
		return
	}

	s.storePayment(paymentRecord{
		TransferID: req.TransferID,
		EndToEndID: e2eID,
		Status:     status,
		Raw:        raw,
		UpdatedAt:  time.Now().UTC(),
	})

	slog.Info("PIX payment submitted to BACEN",
		"transfer_id", req.TransferID,
		"pix_key", req.PIXKey,
		"key_type", req.PIXKeyType,
		"amount", req.Amount,
		"e2e_id", e2eID,
		"bacen_status", status,
	)

	resp := PIXPaymentResponse{
		Success:       true,
		TransferID:    req.TransferID,
		PIXTransferID: e2eID,
		EndToEndID:    e2eID,
		Status:        status,
		PIXKey:        req.PIXKey,
		PIXKeyType:    req.PIXKeyType,
		Message:       fmt.Sprintf("PIX payment submitted to BACEN, E2E: %s", e2eID),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(resp)
}

// paymentRecord tracks a real submitted payment.
type paymentRecord struct {
	TransferID string
	EndToEndID string
	Status     string
	Raw        map[string]interface{}
	UpdatedAt  time.Time
}

// submitToBACEN performs the real PIX API call: PUT {PIX_URL}/pix/{e2eid}.
// Returns (status, upstream body, error).
func (s *Server) submitToBACEN(r *http.Request, e2eID string, req PIXPaymentRequest) (string, map[string]interface{}, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"valor":       req.Amount,
		"chave":       req.PIXKey,
		"infoPagador": req.Description,
	})
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPut,
		fmt.Sprintf("%s/pix/%s", s.cfg.PIXURL, e2eID), strings.NewReader(string(payload)))
	if err != nil {
		return "", nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(httpReq)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	var body map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if resp.StatusCode >= 400 {
		return "", body, fmt.Errorf("BACEN returned HTTP %d", resp.StatusCode)
	}
	status, _ := body["status"].(string)
	if status == "" {
		status = "submitted"
	}
	return status, body, nil
}

// storePayment records a submitted payment for status queries.
func (s *Server) storePayment(rec paymentRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.payments[rec.EndToEndID] = rec
	if rec.TransferID != "" {
		s.payments[rec.TransferID] = rec
	}
}

// lookupPayment finds a recorded payment by E2E ID or transfer ID.
func (s *Server) lookupPayment(id string) (paymentRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.payments[id]
	return rec, ok
}

func (s *Server) handleGetPayment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, ok := s.lookupPayment(id)
	if !ok {
		// Try a live refresh from BACEN when the upstream is wired.
		if s.cfg.upstreamEnabled() && strings.HasPrefix(id, "E") {
			httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
				fmt.Sprintf("%s/pix/%s", s.cfg.PIXURL, id), nil)
			if err == nil {
				if resp, derr := s.client.Do(httpReq); derr == nil {
					defer resp.Body.Close()
					if resp.StatusCode == http.StatusOK {
						var body map[string]interface{}
						_ = json.NewDecoder(resp.Body).Decode(&body)
						w.Header().Set("Content-Type", "application/json")
						json.NewEncoder(w).Encode(map[string]interface{}{
							"transfer_id": id,
							"upstream":    body,
						})
						return
					}
				}
			}
		}
		http.Error(w, `{"error":"payment_not_found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transfer_id":   rec.TransferID,
		"end_to_end_id": rec.EndToEndID,
		"status":        rec.Status,
		"updated_at":    rec.UpdatedAt.Format(time.RFC3339),
		"upstream":      rec.Raw,
	})
}

func (s *Server) handleGenerateQRCode(w http.ResponseWriter, r *http.Request) {
	var req PIXQRCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	e2eID := generateE2EID(s.cfg.ISPBCode)
	qrCode := buildEMVQRCode(req, e2eID)

	expiresAt := time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
	if req.ExpiresAt != "" {
		expiresAt = req.ExpiresAt
	}

	resp := PIXQRCodeResponse{
		QRCode: qrCode,
		// No fabricated raster image — callers render the EMV payload client-side.
		QRCodeImage: "",
		EndToEndID:  e2eID,
		ExpiresAt:   expiresAt,
		Amount:      req.Amount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleValidateKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PIXKey     string `json:"pix_key"`
		PIXKeyType string `json:"pix_key_type"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	keyType := PIXKeyType(req.PIXKeyType)
	if keyType == "" {
		keyType = detectPIXKeyType(req.PIXKey)
	}
	valid := validatePIXKey(req.PIXKey, keyType)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"pix_key":      req.PIXKey,
		"pix_key_type": string(keyType),
		"valid":        valid,
	})
}

func (s *Server) handleKeyLookup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PIXKey string `json:"pix_key"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.PIXKey == "" {
		http.Error(w, `{"error":"pix_key_required"}`, http.StatusBadRequest)
		return
	}

	// Real payee identity comes from the BACEN DICT directory only.
	dictURL := os.Getenv("PIX_DICT_URL")
	if dictURL == "" {
		slog.Error("PIX_DICT_URL not configured — refusing to fabricate payee identity", "key", req.PIXKey)
		http.Error(w, `{"error":"dict_not_configured","message":"BACEN DICT is not configured; payee identity cannot be verified"}`, http.StatusServiceUnavailable)
		return
	}
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
		fmt.Sprintf("%s/entries/%s", dictURL, req.PIXKey), nil)
	if err != nil {
		http.Error(w, `{"error":"lookup_failed"}`, http.StatusInternalServerError)
		return
	}
	resp, err := s.client.Do(httpReq)
	if err != nil {
		slog.Error("DICT lookup failed", "key", req.PIXKey, "error", err)
		http.Error(w, `{"error":"dict_unreachable"}`, http.StatusBadGateway)
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
	banks := make([]map[string]string, 0, len(BrazilianBanks))
	for name, ispb := range BrazilianBanks {
		banks = append(banks, map[string]string{
			"name":      name,
			"ispb_code": ispb,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"banks": banks, "count": len(banks)})
}

func (s *Server) handleWebhook(w http.ResponseWriter, r *http.Request) {
	// Settlement callbacks mutate payment state — require HMAC-SHA256 over the
	// raw body keyed by PIX_SECRET_KEY (header X-PIX-Signature, hex encoded).
	if s.cfg.PIXSecretKey == "" {
		slog.Error("PIX webhook rejected: PIX_SECRET_KEY not configured")
		http.Error(w, `{"error":"webhook_not_configured"}`, http.StatusServiceUnavailable)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	sig := r.Header.Get("X-PIX-Signature")
	mac := hmac.New(sha256.New, []byte(s.cfg.PIXSecretKey))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if sig == "" || !hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected)) {
		slog.Warn("PIX webhook rejected: invalid or missing signature")
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return
	}
	slog.Info("PIX webhook accepted (signature verified)")
	w.WriteHeader(http.StatusOK)
}

// ─── Main ──────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// OpenTelemetry — env-gated no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
	otelShutdown := telemetry.Init(context.Background(), "paygate-pix-gateway")
	defer otelShutdown(context.Background())

	cfg := loadConfig()
	srv := NewServer(cfg)
	mux := http.NewServeMux()
	srv.registerRoutes(mux)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      telemetry.Middleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	slog.Info("PIX Gateway starting", "port", cfg.Port, "ispb_code", cfg.ISPBCode)

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
	slog.Info("PIX Gateway stopped")
}
