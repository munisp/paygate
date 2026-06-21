package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// IssueVirtualCard handles POST /v1/virtual-cards/issue
//
// Flow:
//  1. Permify authorisation check (merchant:issue_virtual_card)
//  2. Idempotency check (Redis)
//  3. EnsureAccount for card spending limit account in TigerBeetle
//  4. Reserve spending limit: merchant → card escrow
//  5. Generate masked PAN (deterministic from card ID)
//  6. Publish Kafka card.issued event
func IssueVirtualCard(w http.ResponseWriter, r *http.Request) {
	var req types.IssueVirtualCardRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.CardID == "" || req.MerchantID == "" || req.SpendingLimit == 0 ||
		req.Currency == "" || req.IssuerID == "" {
		writeError(w, http.StatusBadRequest,
			"card_id, merchant_id, spending_limit, currency, and issuer_id are required")
		return
	}

	ctx := r.Context()

	// Permify authorisation
	perm := permify.Get()
	allowed, err := perm.CheckPermission(ctx, permify.CheckRequest{
		Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
		Permission: "issue_virtual_card",
		Subject:    fmt.Sprintf("user:%s", req.IssuerID),
	})
	if err != nil {
		slog.Warn("[virtualcards] permify check error", "err", err)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "not authorised to issue virtual cards")
		return
	}

	rdb := redis.Get()
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "card.issue", req.CardID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.IssueVirtualCardResponse{
			CardID:        req.CardID,
			WorkflowID:    "idempotent",
			ReservationID: "idempotent",
			MaskedPAN:     "****-****-****-****",
			Status:        "already_issued",
		})
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}

	// Card spending limit account (unique per card)
	cardAccountID, err := tb.UUIDToID(req.CardID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid card_id: %v", err))
		return
	}

	// Ensure accounts
	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(cardAccountID, ledger, tb.CodeEscrow); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure card account")
		return
	}

	// Reserve spending limit: merchant → card account
	reserveRef := "card-reserve-" + req.CardID
	reserveID := tb.ReferenceToID(reserveRef)
	if err := client.Transfer(reserveID, merchantID, cardAccountID, req.SpendingLimit, ledger, tb.CodeEscrow); err != nil {
		slog.Error("[virtualcards] spending limit reservation failed", "err", err, "card_id", req.CardID)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("spending limit reservation failed: %v", err))
		return
	}

	reservationID := reserveID.String()
	workflowID := "wf-card-" + req.CardID

	// Generate deterministic masked PAN from card ID (last 8 chars of UUID)
	shortID := req.CardID
	if len(shortID) > 8 {
		shortID = shortID[len(shortID)-8:]
	}
	maskedPAN := fmt.Sprintf("4000-****-****-%s", shortID[:4])

	// Store card state in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("card:state:%s", req.CardID), map[string]any{
		"card_id":        req.CardID,
		"merchant_id":    req.MerchantID,
		"currency":       req.Currency,
		"spending_limit": req.SpendingLimit,
		"status":         "active",
		"masked_pan":     maskedPAN,
		"issued_at":      time.Now().UTC(),
	}, 5*365*24*time.Hour)

	// Publish Kafka card.issued
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.card.issued",
			req.MerchantID, map[string]any{
				"event_id":       uuid.NewString(),
				"card_id":        req.CardID,
				"merchant_id":    req.MerchantID,
				"spending_limit": req.SpendingLimit,
				"currency":       req.Currency,
				"reservation_id": reservationID,
				"issuer_id":      req.IssuerID,
				"occurred_at":    time.Now().UTC(),
			})
	}()

	slog.Info("[virtualcards] issued",
		"card_id", req.CardID,
		"merchant_id", req.MerchantID,
		"spending_limit", req.SpendingLimit,
		"reservation_id", reservationID,
	)

	writeJSON(w, http.StatusOK, types.IssueVirtualCardResponse{
		CardID:        req.CardID,
		WorkflowID:    workflowID,
		ReservationID: reservationID,
		MaskedPAN:     maskedPAN,
		Status:        "active",
	})
}

// FreezeVirtualCard handles POST /v1/virtual-cards/{id}/freeze
func FreezeVirtualCard(w http.ResponseWriter, r *http.Request) {
	cardID := extractPathSegment(r.URL.Path, 3)
	if cardID == "" {
		writeError(w, http.StatusBadRequest, "card_id required in path")
		return
	}

	var req types.VirtualCardActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Update card state in Redis
	var cardState map[string]any
	if found, _ := rdb.GetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), &cardState); found {
		cardState["status"] = "frozen"
		cardState["frozen_at"] = time.Now().UTC()
		_ = rdb.SetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), cardState, 5*365*24*time.Hour)
	}

	// Publish Kafka card.frozen
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.card.frozen",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"card_id":     cardID,
				"merchant_id": req.MerchantID,
				"actor_id":    req.ActorID,
				"reason":      req.Reason,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[virtualcards] frozen", "card_id", cardID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "status": "frozen"})
}

// UnfreezeVirtualCard handles POST /v1/virtual-cards/{id}/unfreeze
func UnfreezeVirtualCard(w http.ResponseWriter, r *http.Request) {
	cardID := extractPathSegment(r.URL.Path, 3)
	if cardID == "" {
		writeError(w, http.StatusBadRequest, "card_id required in path")
		return
	}

	var req types.VirtualCardActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	var cardState map[string]any
	if found, _ := rdb.GetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), &cardState); found {
		cardState["status"] = "active"
		delete(cardState, "frozen_at")
		_ = rdb.SetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), cardState, 5*365*24*time.Hour)
	}

	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.card.unfrozen",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"card_id":     cardID,
				"merchant_id": req.MerchantID,
				"actor_id":    req.ActorID,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[virtualcards] unfrozen", "card_id", cardID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "status": "active"})
}

// TerminateVirtualCard handles POST /v1/virtual-cards/{id}/terminate
//
// Releases the reserved spending limit back to the merchant wallet.
func TerminateVirtualCard(w http.ResponseWriter, r *http.Request) {
	cardID := extractPathSegment(r.URL.Path, 3)
	if cardID == "" {
		writeError(w, http.StatusBadRequest, "card_id required in path")
		return
	}

	var req types.VirtualCardActionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Retrieve card state to get currency and spending limit
	var cardState map[string]any
	currency := "NGN"
	var spendingLimit uint64
	if found, _ := rdb.GetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), &cardState); found {
		if c, ok := cardState["currency"].(string); ok {
			currency = c
		}
		if sl, ok := cardState["spending_limit"].(float64); ok {
			spendingLimit = uint64(sl)
		}
	}

	// Release remaining balance: card account → merchant
	if spendingLimit > 0 && req.MerchantID != "" {
		client := tb.GetActive()
		ledger := tb.CurrencyToLedger(currency)

		merchantID, err := tb.UUIDToID(req.MerchantID)
		if err == nil {
			cardAccountID, err2 := tb.UUIDToID(cardID)
			if err2 == nil {
				if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err == nil {
					if err := client.EnsureAccount(cardAccountID, ledger, tb.CodeEscrow); err == nil {
						balance, _ := client.GetBalance(cardAccountID)
						if balance > 0 {
							releaseRef := "card-terminate-" + cardID
							releaseID := tb.ReferenceToID(releaseRef)
							_ = client.Transfer(releaseID, cardAccountID, merchantID, balance, ledger, tb.CodeWallet)
						}
					}
				}
			}
		}
	}

	// Update card state
	if cardState != nil {
		cardState["status"] = "terminated"
		cardState["terminated_at"] = time.Now().UTC()
		_ = rdb.SetJSON(ctx, fmt.Sprintf("card:state:%s", cardID), cardState, 90*24*time.Hour)
	}

	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.card.terminated",
			req.MerchantID, map[string]any{
				"event_id":    uuid.NewString(),
				"card_id":     cardID,
				"merchant_id": req.MerchantID,
				"actor_id":    req.ActorID,
				"reason":      req.Reason,
				"occurred_at": time.Now().UTC(),
			})
	}()

	slog.Info("[virtualcards] terminated", "card_id", cardID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "status": "terminated"})
}

// extractPathSegment returns the nth segment (0-indexed) from a URL path.
// e.g. "/v1/virtual-cards/abc/freeze" → segment 3 = "abc"
func extractPathSegment(path string, n int) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if n < len(parts) {
		return parts[n]
	}
	return ""
}
