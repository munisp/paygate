// PBAC Engine — Policy-Based Access Control microservice for PayGate.
// Exposes a REST API for permission checks, backed by Permify with local
// role-permission matrix fallback.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/paygate/pbac-engine/internal/permify"
	"github.com/paygate/pbac-engine/internal/policy"
	"go.uber.org/zap"
)

// Server holds all server dependencies.
type Server struct {
	router        *chi.Mux
	permifyClient *permify.Client
	logger        *zap.Logger
}

// CheckRequest is the inbound permission check payload.
type CheckRequest struct {
	UserID     string            `json:"user_id"`
	UserRole   string            `json:"user_role"`
	TenantID   string            `json:"tenant_id"`
	Resource   string            `json:"resource"`
	Action     string            `json:"action"`
	ResourceID string            `json:"resource_id"`
	Attributes map[string]string `json:"attributes"`
}

// CheckResponse is the outbound permission check result.
type CheckResponse struct {
	Allowed bool   `json:"allowed"`
	Source  string `json:"source"`
	Reason  string `json:"reason"`
}

// BulkCheckRequest allows checking multiple permissions in one call.
type BulkCheckRequest struct {
	Checks []CheckRequest `json:"checks"`
}

// BulkCheckResponse returns results for each check.
type BulkCheckResponse struct {
	Results []CheckResponse `json:"results"`
}

func newServer(logger *zap.Logger) *Server {
	permifyURL := getEnv("PERMIFY_URL", "http://localhost:3476")
	permifyKey := getEnv("PERMIFY_API_KEY", "")
	tenantID := getEnv("PERMIFY_TENANT_ID", "t1")

	pc := permify.NewClient(permifyURL, permifyKey, tenantID, logger)

	s := &Server{
		permifyClient: pc,
		logger:        logger,
	}
	s.router = s.buildRouter()
	return s
}

func (s *Server) buildRouter() *chi.Mux {
	r := chi.NewRouter()

	// Middleware stack
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(10 * time.Second))

	// CORS — only allow internal services
	allowedOrigins := strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:3000"), ",")
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Rate limiting — 1000 req/min per IP (internal service, generous limit)
	r.Use(httprate.LimitByIP(1000, time.Minute))

	// Internal API key guard
	internalKey := getEnv("INTERNAL_API_KEY", "")
	if internalKey != "" {
		r.Use(s.internalKeyMiddleware(internalKey))
	}

	// Routes
	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)

	r.Route("/v1", func(r chi.Router) {
		r.Post("/check", s.handleCheck)
		r.Post("/check/bulk", s.handleBulkCheck)
		r.Get("/policy/matrix", s.handlePolicyMatrix)
		r.Get("/policy/roles", s.handleRoles)
		r.Get("/policy/resources", s.handleResources)
	})

	return r
}

// handleHealth returns 200 OK for liveness probes.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "pbac-engine",
		"version": "1.0.0",
	})
}

// handleReady checks Permify connectivity for readiness probes.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	permifyOK := true
	if err := s.permifyClient.Ping(ctx); err != nil {
		permifyOK = false
		s.logger.Warn("Permify not reachable in readiness check", zap.Error(err))
	}

	w.Header().Set("Content-Type", "application/json")
	if !permifyOK {
		// Degraded but still ready — local matrix fallback is active
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":         "degraded",
			"permify":        "unreachable",
			"fallback":       "local_matrix",
			"service":        "pbac-engine",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ready",
		"permify": "ok",
		"service": "pbac-engine",
	})
}

// handleCheck evaluates a single permission check.
func (s *Server) handleCheck(w http.ResponseWriter, r *http.Request) {
	var req CheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	result := s.evaluate(r.Context(), req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleBulkCheck evaluates multiple permission checks in one request.
func (s *Server) handleBulkCheck(w http.ResponseWriter, r *http.Request) {
	var req BulkCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if len(req.Checks) > 100 {
		http.Error(w, `{"error":"max 100 checks per bulk request"}`, http.StatusBadRequest)
		return
	}

	results := make([]CheckResponse, len(req.Checks))
	for i, check := range req.Checks {
		results[i] = s.evaluate(r.Context(), check)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(BulkCheckResponse{Results: results})
}

// handlePolicyMatrix returns the full role-permission matrix for documentation.
func (s *Server) handlePolicyMatrix(w http.ResponseWriter, r *http.Request) {
	matrix := map[string]interface{}{}
	for _, role := range policy.AllRoles() {
		resources := map[string]interface{}{}
		for _, res := range policy.AllResources() {
			result := policy.CheckLocal(policy.CheckRequest{
				UserRole: role,
				Resource: res,
				Action:   "view",
			})
			_ = result
			// Build the full action list for this role+resource
			actions := []string{}
			for _, action := range []policy.Action{"view", "initiate", "create", "update", "delete",
				"approve", "reject", "cancel", "export", "generate", "archive",
				"freeze", "unfreeze", "terminate", "trigger", "toggle",
				"invite", "remove", "update_role", "rotate", "revoke", "test",
				"deactivate", "release", "dispute", "escalate", "close",
				"submit", "override", "purchase", "retire", "transfer",
				"award_points", "configure", "export_data", "impersonate", "respond"} {
				r := policy.CheckLocal(policy.CheckRequest{
					UserRole: role,
					Resource: res,
					Action:   action,
				})
				if r.Allowed {
					actions = append(actions, string(action))
				}
			}
			resources[string(res)] = actions
		}
		matrix[role] = resources
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(matrix)
}

// handleRoles returns all defined roles.
func (s *Server) handleRoles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(policy.AllRoles())
}

// handleResources returns all defined resource types.
func (s *Server) handleResources(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(policy.AllResources())
}

// evaluate runs the permission check against Permify first, falling back to local matrix.
func (s *Server) evaluate(ctx context.Context, req CheckRequest) CheckResponse {
	// 1. Try Permify (authoritative)
	allowed, err := s.permifyClient.Check(
		ctx,
		req.Resource,
		req.ResourceID,
		req.Action,
		req.UserID,
		req.Attributes,
	)
	if err == nil {
		source := "permify"
		reason := "permify authorization service"
		if !allowed {
			reason = "permify denied: " + req.UserRole + " lacks " + req.Action + " on " + req.Resource
		}
		return CheckResponse{Allowed: allowed, Source: source, Reason: reason}
	}

	// 2. Permify unreachable — fall back to local role-permission matrix
	s.logger.Warn("Permify unavailable, using local matrix fallback",
		zap.String("user_id", req.UserID),
		zap.String("resource", req.Resource),
		zap.String("action", req.Action),
		zap.Error(err),
	)

	localResult := policy.CheckLocal(policy.CheckRequest{
		UserID:     req.UserID,
		UserRole:   req.UserRole,
		TenantID:   req.TenantID,
		Resource:   policy.ResourceType(req.Resource),
		Action:     policy.Action(req.Action),
		ResourceID: req.ResourceID,
		Attributes: req.Attributes,
	})

	return CheckResponse{
		Allowed: localResult.Allowed,
		Source:  localResult.Source,
		Reason:  localResult.Reason,
	}
}

// internalKeyMiddleware enforces the INTERNAL_API_KEY header for service-to-service auth.
func (s *Server) internalKeyMiddleware(key string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip health checks
			if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
				next.ServeHTTP(w, r)
				return
			}
			auth := r.Header.Get("Authorization")
			if auth != "Bearer "+key {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	s := newServer(logger)

	port := getEnv("PBAC_ENGINE_PORT", "8090")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      s.router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("PBAC Engine starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	<-quit
	logger.Info("Shutting down PBAC Engine...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Forced shutdown", zap.Error(err))
	}

	logger.Info("PBAC Engine stopped")
}
