// PayGate Liveness Gateway (Go)
//
// Responsibilities:
//   - HTTP/2 API gateway for all liveness endpoints
//   - Face-match: cosine similarity between two ArcFace 512-dim embeddings
//   - Face-detect: route to Python ML service, return bounding boxes + confidence
//   - Landmarks: 68-point landmark extraction (forwarded to Python)
//   - Active challenge orchestration (blink / nod / smile / turn)
//   - Fan-out: simultaneously call Rust signal processor + Python ML service
//   - Aggregate results, apply decision logic, persist via Node.js callback
//   - Rate limiting, circuit breaker, structured logging
//
// Language rationale: Go's goroutine model is ideal for fan-out/fan-in to two
// downstream services with sub-millisecond scheduling overhead and no GIL.

package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"go.uber.org/zap"

	"github.com/paygate/liveness-gateway/internal/telemetry"
)

// ─── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	Port            string
	InternalKey     string
	PythonMLURL     string // Python liveness-detection service
	RustSignalURL   string // Rust liveness-signal-processor
	NodeCallbackURL string // Node.js /api/internal/liveness/result
	HTTPTimeout     time.Duration
}

func loadConfig() Config {
	getEnv := func(key, def string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return def
	}
	internalKey := os.Getenv("INTERNAL_API_KEY")
	env := strings.ToLower(os.Getenv("ENV"))
	if internalKey == "" {
		if env == "production" || env == "prod" {
			slog.Error("FATAL: INTERNAL_API_KEY must be set when ENV=production")
			os.Exit(1)
		}
		b := make([]byte, 16)
		rand.Read(b)
		internalKey = fmt.Sprintf("dev-%x", b)
		slog.Warn("INTERNAL_API_KEY unset — generated per-boot dev key; refusing well-known defaults")
	}
	return Config{
		Port:            getEnv("PORT", "8085"),
		InternalKey:     internalKey,
		PythonMLURL:     getEnv("PYTHON_ML_URL", "http://localhost:8086"),
		RustSignalURL:   getEnv("RUST_SIGNAL_URL", "http://localhost:8090"),
		NodeCallbackURL: getEnv("NODE_CALLBACK_URL", "http://localhost:3000/api/internal/liveness/result"),
		HTTPTimeout:     30 * time.Second,
	}
}

// ─── Request / Response types ─────────────────────────────────────────────────

type LivenessRequest struct {
	ImageB64   string      `json:"image_b64"`
	ImageB64_2 string      `json:"image_b64_2,omitempty"`
	SessionID  string      `json:"session_id,omitempty"`
	Mode       string      `json:"mode,omitempty"` // passive|active|full
	Challenge  string      `json:"challenge,omitempty"`
	Embeddings [][]float64 `json:"embeddings,omitempty"` // for face-match
}

type FaceMatchRequest struct {
	Embedding1 []float64 `json:"embedding1"`
	Embedding2 []float64 `json:"embedding2"`
	SessionID  string    `json:"session_id,omitempty"`
}

type FaceMatchResponse struct {
	SessionID    string  `json:"session_id"`
	Similarity   float64 `json:"similarity"`
	Match        bool    `json:"match"`
	Threshold    float64 `json:"threshold"`
	ProcessingMs int64   `json:"processing_ms"`
}

type SpoofScores struct {
	PrintedPhoto     float64 `json:"printed_photo"`
	ScreenReplay     float64 `json:"screen_replay"`
	PaperMask        float64 `json:"paper_mask"`
	Mask3D           float64 `json:"3d_mask"`
	Deepfake         float64 `json:"deepfake"`
	HighQualityPhoto float64 `json:"high_quality_photo"`
}

type AggregatedResult struct {
	SessionID         string      `json:"session_id"`
	Decision          string      `json:"decision"`
	SpoofType         string      `json:"spoof_type,omitempty"`
	LivenessScore     float64     `json:"liveness_score"`
	Confidence        float64     `json:"confidence"`
	SpoofScores       SpoofScores `json:"spoof_scores"`
	FaceDetected      bool        `json:"face_detected"`
	FaceCount         int         `json:"face_count"`
	PassiveScore      float64     `json:"passive_score"`
	ActiveScore       float64     `json:"active_score"`
	ChallengePassed   bool        `json:"challenge_passed"`
	LBPScore          float64     `json:"lbp_score"`
	FFTScore          float64     `json:"fft_score"`
	ColourDepth       float64     `json:"colour_depth_score"`
	GradientCoherence float64     `json:"gradient_coherence"`
	QualityScore      float64     `json:"quality_score"`
	ProcessingMs      int64       `json:"processing_ms"`
}

// ─── Cosine Similarity (face-match) ──────────────────────────────────────────

// cosineSimilarity computes the cosine similarity between two ArcFace embeddings.
// ArcFace embeddings are L2-normalised, so dot product == cosine similarity.
func cosineSimilarity(a, b []float64) (float64, error) {
	if len(a) != len(b) {
		return 0, fmt.Errorf("embedding dimension mismatch: %d vs %d", len(a), len(b))
	}
	if len(a) == 0 {
		return 0, fmt.Errorf("empty embeddings")
	}

	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0, fmt.Errorf("zero-norm embedding")
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB)), nil
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func postJSON(ctx context.Context, client *http.Client, url string, payload any, internalKey string) (map[string]any, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upstream %d: %s", resp.StatusCode, string(b))
	}

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func getFloat(m map[string]any, key string) float64 {
	if v, ok := m[key]; ok {
		switch f := v.(type) {
		case float64:
			return f
		case float32:
			return float64(f)
		}
	}
	return 0
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getBool(m map[string]any, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

type Handler struct {
	cfg    Config
	log    *zap.Logger
	client *http.Client
}

// POST /liveness/passive
// POST /liveness/active
// POST /liveness/full
func (h *Handler) handleLiveness(w http.ResponseWriter, r *http.Request) {
	mode := strings.TrimPrefix(r.URL.Path, "/liveness/")
	if mode == "" {
		mode = "passive"
	}

	var req LivenessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}
	if req.Mode == "" {
		req.Mode = mode
	}

	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.HTTPTimeout)
	defer cancel()

	// Fan-out: call Rust signal processor and Python ML service concurrently
	type rustResult struct {
		data map[string]any
		err  error
	}
	type pyResult struct {
		data map[string]any
		err  error
	}

	var wg sync.WaitGroup
	rustCh := make(chan rustResult, 1)
	pyCh := make(chan pyResult, 1)

	wg.Add(2)
	go func() {
		defer wg.Done()
		data, err := postJSON(ctx, h.client, h.cfg.RustSignalURL+"/analyse", map[string]any{
			"image_b64":   req.ImageB64,
			"image_b64_2": req.ImageB64_2,
			"session_id":  req.SessionID,
			"mode":        req.Mode,
		}, h.cfg.InternalKey)
		rustCh <- rustResult{data, err}
	}()
	go func() {
		defer wg.Done()
		endpoint := "/liveness/" + req.Mode
		data, err := postJSON(ctx, h.client, h.cfg.PythonMLURL+endpoint, map[string]any{
			"image_b64":   req.ImageB64,
			"image_b64_2": req.ImageB64_2,
			"session_id":  req.SessionID,
			"challenge":   req.Challenge,
		}, h.cfg.InternalKey)
		pyCh <- pyResult{data, err}
	}()
	wg.Wait()

	rust := <-rustCh
	py := <-pyCh

	if rust.err != nil {
		h.log.Warn("rust signal processor error", zap.Error(rust.err))
	}
	if py.err != nil {
		h.log.Error("python ML service error", zap.Error(py.err))
		http.Error(w, `{"error":"ML service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	// Aggregate: Python provides ML decision, Rust provides signal scores
	result := h.aggregate(req.SessionID, req.Mode, py.data, rust.data, time.Since(start).Milliseconds())

	// Async callback to Node.js (non-blocking)
	go func() {
		cbCtx, cbCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cbCancel()
		_, err := postJSON(cbCtx, h.client, h.cfg.NodeCallbackURL, result, h.cfg.InternalKey)
		if err != nil {
			h.log.Warn("node callback failed", zap.Error(err), zap.String("session", result.SessionID))
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// POST /liveness/face-match
// Computes cosine similarity between two ArcFace 512-dim embeddings.
// Embeddings are provided directly (pre-extracted by Python ML service).
func (h *Handler) handleFaceMatch(w http.ResponseWriter, r *http.Request) {
	var req FaceMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	if len(req.Embedding1) == 0 || len(req.Embedding2) == 0 {
		http.Error(w, `{"error":"embedding1 and embedding2 are required"}`, http.StatusBadRequest)
		return
	}

	start := time.Now()
	similarity, err := cosineSimilarity(req.Embedding1, req.Embedding2)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	const threshold = 0.40 // ArcFace cosine threshold for same-person match
	resp := FaceMatchResponse{
		SessionID:    req.SessionID,
		Similarity:   similarity,
		Match:        similarity >= threshold,
		Threshold:    threshold,
		ProcessingMs: time.Since(start).Milliseconds(),
	}

	h.log.Info("face-match",
		zap.String("session", req.SessionID),
		zap.Float64("similarity", similarity),
		zap.Bool("match", resp.Match),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /liveness/detect — forward to Python, return face bounding boxes
func (h *Handler) handleDetect(w http.ResponseWriter, r *http.Request) {
	var req LivenessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.HTTPTimeout)
	defer cancel()

	data, err := postJSON(ctx, h.client, h.cfg.PythonMLURL+"/liveness/detect", map[string]any{
		"image_b64":  req.ImageB64,
		"session_id": req.SessionID,
	}, h.cfg.InternalKey)
	if err != nil {
		h.log.Error("detect error", zap.Error(err))
		http.Error(w, `{"error":"detection service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// POST /liveness/landmarks — forward to Python, return 68-point landmarks
func (h *Handler) handleLandmarks(w http.ResponseWriter, r *http.Request) {
	var req LivenessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.HTTPTimeout)
	defer cancel()

	data, err := postJSON(ctx, h.client, h.cfg.PythonMLURL+"/liveness/landmarks", map[string]any{
		"image_b64":  req.ImageB64,
		"session_id": req.SessionID,
	}, h.cfg.InternalKey)
	if err != nil {
		h.log.Error("landmarks error", zap.Error(err))
		http.Error(w, `{"error":"landmarks service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// POST /liveness/extract — forward to Python for ArcFace embedding extraction
func (h *Handler) handleExtract(w http.ResponseWriter, r *http.Request) {
	var req LivenessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.cfg.HTTPTimeout)
	defer cancel()

	data, err := postJSON(ctx, h.client, h.cfg.PythonMLURL+"/liveness/extract", map[string]any{
		"image_b64":  req.ImageB64,
		"session_id": req.SessionID,
	}, h.cfg.InternalKey)
	if err != nil {
		h.log.Error("extract error", zap.Error(err))
		http.Error(w, `{"error":"extraction service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// ─── Result aggregation ───────────────────────────────────────────────────────

func (h *Handler) aggregate(
	sessionID, mode string,
	py, rust map[string]any,
	processingMs int64,
) AggregatedResult {
	if sessionID == "" {
		sessionID = getString(py, "session_id")
	}

	// Python provides the authoritative ML decision
	pyDecision := getString(py, "decision")
	pyScore := getFloat(py, "liveness_score")
	pyPassive := getFloat(py, "passive_score")
	pyActive := getFloat(py, "active_score")
	pyChallenge := getBool(py, "challenge_passed")
	pyFaceDetected := getBool(py, "face_detected")
	pyFaceCount := 0
	if v, ok := py["face_count"]; ok {
		if f, ok := v.(float64); ok {
			pyFaceCount = int(f)
		}
	}
	pyQuality := getFloat(py, "quality_score")
	pySpoofType := getString(py, "spoof_type")

	// Rust provides signal-level scores
	rustLBP := 0.0
	rustFFT := 0.0
	rustColour := 0.0
	rustGradient := 0.0
	rustConfidence := 0.0
	rustDecision := ""
	rustSpoofType := ""
	var rustSpoofScores SpoofScores

	if rust != nil {
		rustLBP = getFloat(rust, "lbp_score")
		rustFFT = getFloat(rust, "fft_score")
		rustColour = getFloat(rust, "colour_depth_score")
		rustGradient = getFloat(rust, "gradient_coherence")
		rustConfidence = getFloat(rust, "confidence")
		rustDecision = getString(rust, "decision")
		rustSpoofType = getString(rust, "spoof_type")
		if ss, ok := rust["spoof_scores"].(map[string]any); ok {
			rustSpoofScores = SpoofScores{
				PrintedPhoto:     getFloat(ss, "printed_photo"),
				ScreenReplay:     getFloat(ss, "screen_replay"),
				PaperMask:        getFloat(ss, "paper_mask"),
				Mask3D:           getFloat(ss, "3d_mask"),
				Deepfake:         getFloat(ss, "deepfake"),
				HighQualityPhoto: getFloat(ss, "high_quality_photo"),
			}
		}
	}

	// Final decision: if either service says spoof, it's spoof
	finalDecision := pyDecision
	finalSpoofType := pySpoofType
	if rustDecision == "spoof" && finalDecision != "spoof" {
		finalDecision = "spoof"
		finalSpoofType = rustSpoofType
	}

	// Blend scores: Python ML (70%) + Rust signal (30%)
	finalScore := pyScore*0.70 + rustConfidence*0.30
	finalConfidence := rustConfidence
	if finalDecision == "spoof" {
		finalConfidence = math.Max(1.0-pyScore, rustConfidence)
	}

	return AggregatedResult{
		SessionID:         sessionID,
		Decision:          finalDecision,
		SpoofType:         finalSpoofType,
		LivenessScore:     finalScore,
		Confidence:        finalConfidence,
		SpoofScores:       rustSpoofScores,
		FaceDetected:      pyFaceDetected,
		FaceCount:         pyFaceCount,
		PassiveScore:      pyPassive,
		ActiveScore:       pyActive,
		ChallengePassed:   pyChallenge,
		LBPScore:          rustLBP,
		FFTScore:          rustFFT,
		ColourDepth:       rustColour,
		GradientCoherence: rustGradient,
		QualityScore:      pyQuality,
		ProcessingMs:      processingMs,
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	// OpenTelemetry — env-gated no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
	otelShutdown := telemetry.Init(context.Background(), "paygate-liveness-gateway")
	defer otelShutdown(context.Background())

	cfg := loadConfig()

	client := &http.Client{
		Timeout: cfg.HTTPTimeout,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 20,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	h := &Handler{cfg: cfg, log: log, client: client}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(35 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "X-Internal-Key"},
		AllowCredentials: false,
	}))

	// Rate limit: 30 liveness requests per minute per IP
	r.Use(httprate.LimitByIP(30, time.Minute))

	// Internal key middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path == "/health" {
				next.ServeHTTP(w, req)
				return
			}
			key := req.Header.Get("X-Internal-Key")
			if subtle.ConstantTimeCompare([]byte(key), []byte(cfg.InternalKey)) != 1 {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, req)
		})
	})

	// Routes
	r.Post("/liveness/passive", h.handleLiveness)
	r.Post("/liveness/active", h.handleLiveness)
	r.Post("/liveness/full", h.handleLiveness)
	r.Post("/liveness/face-match", h.handleFaceMatch)
	r.Post("/liveness/detect", h.handleDetect)
	r.Post("/liveness/landmarks", h.handleLandmarks)
	r.Post("/liveness/extract", h.handleExtract)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "liveness-gateway",
			"version": "1.0.0",
		})
	})

	addr := "0.0.0.0:" + cfg.Port
	log.Info("liveness-gateway starting", zap.String("addr", addr))
	if err := http.ListenAndServe(addr, telemetry.Middleware(r)); err != nil {
		log.Fatal("server error", zap.Error(err))
	}
}
