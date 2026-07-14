// Package handlers — Agent Banking v3
// Manages agent registration, float top-ups, cash deposits, withdrawals,
// commission tracking, and network analytics.
package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
	"github.com/paygate/go-bridge/internal/tigerbeetle"
)

// AgentBankingHandler manages agent network operations
type AgentBankingHandler struct {
	db     *pgdb.DB
	redis  *redis.Client
	kafka  *kafka.Producer
	tb     *tigerbeetle.Client
	fluvio *fluvio.Producer
}

// NewAgentBankingHandler creates a new AgentBankingHandler.
func NewAgentBankingHandler(db *pgdb.DB, r *redis.Client, k *kafka.Producer, tb *tigerbeetle.Client) *AgentBankingHandler {
	return &AgentBankingHandler{db: db, redis: r, kafka: k, tb: tb, fluvio: fluvio.Get()}
}

// RegisterAgent POST /agent/register
func (h *AgentBankingHandler) RegisterAgent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID  string  `json:"merchant_id"`
		AgentName   string  `json:"agent_name"`
		PhoneNumber string  `json:"phone_number"`
		BVN         string  `json:"bvn"`
		Location    string  `json:"location"`
		InitFloat   float64 `json:"initial_float"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	agentID := uuid.New().String()
	agent := pgdb.AgentRecord{
		ID:          agentID,
		MerchantID:  req.MerchantID,
		AgentName:   req.AgentName,
		PhoneNumber: req.PhoneNumber,
		BVN:         req.BVN,
		Location:    req.Location,
		FloatBalance: req.InitFloat,
		Status:      "active",
		CreatedAt:   time.Now().UTC(),
	}
	if err := h.db.InsertAgentRecord(r.Context(), agent); err != nil {
		jsonError(w, "failed to register agent", http.StatusInternalServerError)
		return
	}
	// Provision TigerBeetle float account
	_ = h.tb.CreateAccount(r.Context(), agentID, "agent_float", req.MerchantID)
	_ = h.kafka.Publish(r.Context(), "agent.registered", agentID, map[string]interface{}{
		"agent_id":    agentID,
		"merchant_id": req.MerchantID,
		"name":        req.AgentName,
	})
	jsonOK(w, map[string]interface{}{
		"agent_id": agentID,
		"status":   "registered",
		"message":  "Agent registered successfully",
	}, http.StatusCreated)
}

// TopUpFloat POST /agent/{agentId}/float/topup
func (h *AgentBankingHandler) TopUpFloat(w http.ResponseWriter, r *http.Request) {
	agentID := pathParam(r, "agentId")
	var req struct {
		Amount     float64 `json:"amount"`
		Reference  string  `json:"reference"`
		MerchantID string  `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Reference == "" {
		req.Reference = "FLOAT-" + uuid.New().String()[:12]
	}
	amountKobo := uint64(req.Amount * 100)
	tbTransferID, _ := tigerbeetle.UUIDToID(uuid.New().String())
	debitID := tigerbeetle.MerchantAccountID(req.MerchantID)
	creditID := tigerbeetle.AgentFloatAccountID(agentID)
	if err := h.tb.Transfer(tbTransferID, debitID, creditID, amountKobo, 1, tigerbeetle.TransferCodeFloatTopUp); err != nil {
		jsonError(w, "float transfer failed", http.StatusInternalServerError)
		return
	}
	if err := h.db.UpdateAgentFloat(r.Context(), agentID, req.Amount, "credit"); err != nil {
		jsonError(w, "failed to update float record", http.StatusInternalServerError)
		return
	}
	_ = h.kafka.Publish(r.Context(), "agent.float.topup", agentID, map[string]interface{}{
		"agent_id":  agentID,
		"amount":    req.Amount,
		"reference": req.Reference,
	})
	// Stream to Fluvio (non-blocking)
	go func() {
		_ = h.fluvio.ProduceAgentBankingEvent(r.Context(), fluvio.AgentBankingFundFlowEvent{
			EventID:    uuid.NewString(),
			AgentID:    agentID,
			EventType:  "float_top_up",
			AmountKobo: int64(req.Amount * 100),
			Reference:  req.Reference,
			OccurredAt: time.Now().UTC(),
		})
	}()

	jsonOK(w, map[string]interface{}{
		"agent_id":  agentID,
		"amount":    req.Amount,
		"reference": req.Reference,
		"status":    "success",
	}, http.StatusOK)
}

// ProcessAgentDeposit POST /agent/{agentId}/deposit
func (h *AgentBankingHandler) ProcessAgentDeposit(w http.ResponseWriter, r *http.Request) {
	agentID := pathParam(r, "agentId")
	var req struct {
		CustomerPhone string  `json:"customer_phone"`
		Amount        float64 `json:"amount"`
		Reference     string  `json:"reference"`
		Channel       string  `json:"channel"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	txID := uuid.New().String()
	commission := req.Amount * 0.005 // 0.5% commission
	tx := pgdb.AgentTransactionRecord{
		ID:            txID,
		AgentID:       agentID,
		CustomerPhone: req.CustomerPhone,
		Amount:        req.Amount,
		Commission:    commission,
		Type:          "deposit",
		Reference:     req.Reference,
		Channel:       req.Channel,
		Status:        "completed",
		CreatedAt:     time.Now().UTC(),
	}
	if err := h.db.InsertAgentTxRecord(r.Context(), tx); err != nil {
		jsonError(w, "failed to record transaction", http.StatusInternalServerError)
		return
	}
	_ = h.db.UpdateAgentFloat(r.Context(), agentID, req.Amount, "debit")
	_ = h.db.CreditAgentCommission(r.Context(), agentID, commission)
	_ = h.kafka.Publish(r.Context(), "agent.deposit", agentID, map[string]interface{}{
		"tx_id": txID, "amount": req.Amount, "commission": commission,
	})
	// Stream to Fluvio (non-blocking)
	go func() {
		_ = h.fluvio.ProduceAgentBankingEvent(r.Context(), fluvio.AgentBankingFundFlowEvent{
			EventID:    uuid.NewString(),
			AgentID:    agentID,
			EventType:  "deposit",
			AmountKobo: int64(req.Amount * 100),
			Reference:  req.Reference,
			OccurredAt: time.Now().UTC(),
		})
	}()

	jsonOK(w, map[string]interface{}{
		"transaction_id": txID,
		"amount":         req.Amount,
		"commission":     commission,
		"status":         "completed",
	}, http.StatusOK)
}

// ProcessAgentWithdrawal POST /agent/{agentId}/withdrawal
func (h *AgentBankingHandler) ProcessAgentWithdrawal(w http.ResponseWriter, r *http.Request) {
	agentID := pathParam(r, "agentId")
	var req struct {
		CustomerPhone string  `json:"customer_phone"`
		Amount        float64 `json:"amount"`
		Reference     string  `json:"reference"`
		Channel       string  `json:"channel"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	txID := uuid.New().String()
	commission := req.Amount * 0.003 // 0.3% commission
	tx := pgdb.AgentTransactionRecord{
		ID:            txID,
		AgentID:       agentID,
		CustomerPhone: req.CustomerPhone,
		Amount:        req.Amount,
		Commission:    commission,
		Type:          "withdrawal",
		Reference:     req.Reference,
		Channel:       req.Channel,
		Status:        "completed",
		CreatedAt:     time.Now().UTC(),
	}
	if err := h.db.InsertAgentTxRecord(r.Context(), tx); err != nil {
		jsonError(w, "failed to record transaction", http.StatusInternalServerError)
		return
	}
	_ = h.db.UpdateAgentFloat(r.Context(), agentID, req.Amount, "credit") // Float increases on withdrawal
	_ = h.db.CreditAgentCommission(r.Context(), agentID, commission)
	jsonOK(w, map[string]interface{}{
		"transaction_id": txID,
		"amount":         req.Amount,
		"commission":     commission,
		"status":         "completed",
	}, http.StatusOK)
}

// RecordAgentCommission POST /agent/{agentId}/commission
func (h *AgentBankingHandler) RecordAgentCommission(w http.ResponseWriter, r *http.Request) {
	agentID := pathParam(r, "agentId")
	var req struct {
		Amount    float64 `json:"amount"`
		Source    string  `json:"source"`
		Reference string  `json:"reference"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.db.CreditAgentCommission(r.Context(), agentID, req.Amount); err != nil {
		jsonError(w, "failed to record commission", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]interface{}{
		"agent_id":  agentID,
		"amount":    req.Amount,
		"source":    req.Source,
		"reference": req.Reference,
		"status":    "credited",
	}, http.StatusOK)
}

// GetAgentNetwork GET /agent/network
func (h *AgentBankingHandler) GetAgentNetwork(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	agents, err := h.db.GetAgentNetwork(r.Context(), merchantID)
	if err != nil {
		jsonError(w, "failed to fetch agent network", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]interface{}{
		"agents": agents,
		"total":  len(agents),
	}, http.StatusOK)
}

// GetFloatBalance GET /agent/{agentId}/float
func (h *AgentBankingHandler) GetFloatBalance(w http.ResponseWriter, r *http.Request) {
	agentID := pathParam(r, "agentId")
	balance, err := h.db.GetAgentFloatBalance(r.Context(), agentID)
	if err != nil {
		jsonError(w, "failed to fetch float balance", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]interface{}{
		"agent_id": agentID,
		"balance":  balance,
		"currency": "NGN",
	}, http.StatusOK)
}

// pathParam extracts a path parameter from the URL using Go 1.22+ pattern matching.
func pathParam(r *http.Request, name string) string {
	// Go 1.22 net/http supports r.PathValue(name)
	if v := r.PathValue(name); v != "" {
		return v
	}
	// Fallback: extract from URL path
	parts := strings.Split(r.URL.Path, "/")
	for i, p := range parts {
		if p == "{"+name+"}" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func jsonOK(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
