package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	"github.com/paygate/go-bridge/internal/temporal"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	gotemporal "go.temporal.io/sdk/client"
	"github.com/paygate/go-bridge/pkg/types"
)

// SubmitDispute handles POST /v1/disputes/submit
//
// Flow:
//  1. Permify authorisation check (merchant:submit_dispute)
//  2. Idempotency check (Redis)
//  3. EnsureAccount for merchant + escrow in TigerBeetle
//  4. Pending (reserve) transfer: merchant → escrow (locks disputed funds)
//  5. Publish Kafka dispute.submitted event
//  6. Return reservation ID and synthetic workflow ID
func SubmitDispute(w http.ResponseWriter, r *http.Request) {
	var req types.SubmitDisputeRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.DisputeID == "" || req.TransactionID == "" || req.MerchantID == "" ||
		req.Amount == 0 || req.Currency == "" {
		writeError(w, http.StatusBadRequest,
			"dispute_id, transaction_id, merchant_id, amount, and currency are required")
		return
	}

	ctx := r.Context()

	// Permify authorisation
	perm := permify.Get()
	allowed, err := perm.CheckPermission(ctx, permify.CheckRequest{
		Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
		Permission: "submit_dispute",
		Subject:    fmt.Sprintf("user:%s", req.InitiatorID),
	})
	if err != nil {
		slog.Warn("[disputes] permify check error", "err", err)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "not authorised to submit disputes")
		return
	}

	// Idempotency
	rdb := redis.Get()
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "dispute.submit", req.DisputeID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.SubmitDisputeResponse{
			DisputeID:     req.DisputeID,
			WorkflowID:    "idempotent",
			ReservationID: "idempotent",
			Status:        "already_submitted",
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

	// Escrow account derived from dispute ID
	escrowID, err := tb.UUIDToID(req.DisputeID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid dispute_id: %v", err))
		return
	}

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(escrowID, ledger, tb.CodeEscrow); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure escrow account")
		return
	}

	// Reserve: merchant → escrow (lock disputed amount)
	reserveRef := "dispute-reserve-" + req.DisputeID
	reserveID := tb.ReferenceToID(reserveRef)
	if err := client.Transfer(reserveID, merchantID, escrowID, req.Amount, ledger, tb.CodeEscrow); err != nil {
		slog.Error("[disputes] reserve transfer failed", "err", err, "dispute_id", req.DisputeID)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("dispute fund reservation failed: %v", err))
		return
	}

	reservationID := reserveID.String()

	// Store escrow reference in Redis for resolution lookup
	_ = rdb.SetEX(ctx,
		fmt.Sprintf("dispute:escrow:%s", req.DisputeID),
		fmt.Sprintf("%s:%s", req.MerchantID, req.Currency),
		7*24*time.Hour,
	)

	// Publish Kafka dispute.submitted
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.dispute.submitted",
			req.MerchantID, map[string]any{
				"event_id":       uuid.NewString(),
				"dispute_id":     req.DisputeID,
				"transaction_id": req.TransactionID,
				"merchant_id":    req.MerchantID,
				"amount":         req.Amount,
				"currency":       req.Currency,
				"reason":         req.Reason,
				"reservation_id": reservationID,
				"occurred_at":    time.Now().UTC(),
			})
	}()

	slog.Info("[disputes] submitted",
		"dispute_id", req.DisputeID,
		"merchant_id", req.MerchantID,
		"amount", req.Amount,
		"reservation_id", reservationID,
	)

	// Dispatch DisputeResolutionWorkflow via Temporal (non-blocking)
	wfID := fmt.Sprintf("dispute-%s", req.DisputeID)
	if tc, tcErr := temporal.GetClient(); tcErr == nil {
		wfInput := temporal.DisputeWorkflowInput{
			DisputeID:     req.DisputeID,
			MerchantID:    req.MerchantID,
			TransactionID: req.TransactionID,
			Amount:        fmt.Sprintf("%d", req.Amount),
			Reason:        req.Reason,
			Evidence:      req.EvidenceURL,
		}
		opts := gotemporal.StartWorkflowOptions{ID: wfID, TaskQueue: temporal.TaskQueue}
		if run, wfErr := tc.ExecuteWorkflow(ctx, opts, temporal.DisputeResolutionWorkflow, wfInput); wfErr != nil {
			slog.Error("[disputes] DisputeResolutionWorkflow start failed", "err", wfErr)
		} else {
			slog.Info("[disputes] DisputeResolutionWorkflow started", "run_id", run.GetID())
		}
	}

	// Stream to Fluvio (non-blocking)
	go func() {
		_ = fluvio.Get().ProduceDisputeEvent(ctx, fluvio.DisputeFundFlowEvent{
			EventID:    uuid.NewString(),
			DisputeID:  req.DisputeID,
			MerchantID: req.MerchantID,
			EventType:  "submitted",
			AmountKobo: int64(req.Amount),
			OccurredAt: time.Now().UTC(),
		})
	}()

	writeJSON(w, http.StatusOK, types.SubmitDisputeResponse{
		DisputeID:     req.DisputeID,
		WorkflowID:    wfID,
		ReservationID: reservationID,
		Status:        "reserved",
	})
}

// ResolveDispute handles POST /v1/disputes/{id}/resolve
//
// Flow:
//  1. Permify authorisation check (merchant:resolve_dispute)
//  2. Retrieve escrow context from Redis
//  3. TigerBeetle finalisation based on resolution:
//     - "won"     → escrow → float (funds returned to float, merchant loses)
//     - "lost"    → escrow → merchant (funds returned to merchant)
//     - "partial" → split: partial to float, remainder to merchant
//  4. Publish Kafka dispute.resolved event
func ResolveDispute(w http.ResponseWriter, r *http.Request) {
	// Extract dispute ID from URL path: /v1/disputes/{id}/resolve
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// parts: ["v1", "disputes", "{id}", "resolve"]
	if len(parts) < 4 {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	disputeID := parts[2]

	var req types.ResolveDisputeRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.DisputeID = disputeID

	if req.MerchantID == "" || req.Resolution == "" || req.ReviewerID == "" {
		writeError(w, http.StatusBadRequest,
			"merchant_id, resolution, and reviewer_id are required")
		return
	}
	if req.Resolution != "won" && req.Resolution != "lost" && req.Resolution != "partial" {
		writeError(w, http.StatusBadRequest,
			"resolution must be 'won', 'lost', or 'partial'")
		return
	}

	ctx := r.Context()

	// Permify authorisation
	perm := permify.Get()
	allowed, err := perm.CheckPermission(ctx, permify.CheckRequest{
		Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
		Permission: "resolve_dispute",
		Subject:    fmt.Sprintf("user:%s", req.ReviewerID),
	})
	if err != nil {
		slog.Warn("[disputes] permify resolve check error", "err", err)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "not authorised to resolve disputes")
		return
	}

	// Idempotency
	rdb := redis.Get()
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "dispute.resolve", req.DisputeID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.ResolveDisputeResponse{
			DisputeID:     req.DisputeID,
			LedgerEntryID: "idempotent",
			Status:        "already_resolved",
		})
		return
	}

	client := tb.GetActive()

	// Retrieve escrow context
	escrowCtxKey := fmt.Sprintf("dispute:escrow:%s", req.DisputeID)
	escrowCtxVal, found, _ := rdb.GetString(ctx, escrowCtxKey)
	currency := "NGN"
	merchantIDStr := req.MerchantID
	if found && strings.Contains(escrowCtxVal, ":") {
		parts2 := strings.SplitN(escrowCtxVal, ":", 2)
		merchantIDStr = parts2[0]
		currency = parts2[1]
	}

	ledger := tb.CurrencyToLedger(currency)

	merchantID, err := tb.UUIDToID(merchantIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	escrowID, err := tb.UUIDToID(req.DisputeID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid dispute_id: %v", err))
		return
	}
	floatID := tb.FloatAccountID()

	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	var ledgerEntryID string

	switch req.Resolution {
	case "won":
		// Customer wins: escrow → float (merchant loses the funds)
		releaseRef := "dispute-won-" + req.DisputeID
		releaseID := tb.ReferenceToID(releaseRef)
		escrowBal, _ := client.GetBalance(escrowID)
		if escrowBal > 0 {
			if err := client.Transfer(releaseID, escrowID, floatID, escrowBal, ledger, tb.CodeFloat); err != nil {
				writeError(w, http.StatusInternalServerError,
					fmt.Sprintf("dispute won transfer failed: %v", err))
				return
			}
		}
		ledgerEntryID = releaseID.String()

	case "lost":
		// Merchant wins: escrow → merchant (funds returned)
		returnRef := "dispute-lost-" + req.DisputeID
		returnID := tb.ReferenceToID(returnRef)
		escrowBal, _ := client.GetBalance(escrowID)
		if escrowBal > 0 {
			if err := client.Transfer(returnID, escrowID, merchantID, escrowBal, ledger, tb.CodeWallet); err != nil {
				writeError(w, http.StatusInternalServerError,
					fmt.Sprintf("dispute lost transfer failed: %v", err))
				return
			}
		}
		ledgerEntryID = returnID.String()

	case "partial":
		// Split: req.Amount to float (customer), remainder to merchant
		escrowBal, _ := client.GetBalance(escrowID)
		customerAmount := req.Amount
		if customerAmount > escrowBal {
			customerAmount = escrowBal
		}
		merchantAmount := escrowBal - customerAmount

		if customerAmount > 0 {
			floatRef := "dispute-partial-float-" + req.DisputeID
			floatID2 := tb.ReferenceToID(floatRef)
			if err := client.Transfer(floatID2, escrowID, floatID, customerAmount, ledger, tb.CodeFloat); err != nil {
				writeError(w, http.StatusInternalServerError,
					fmt.Sprintf("dispute partial float transfer failed: %v", err))
				return
			}
			ledgerEntryID = floatID2.String()
		}
		if merchantAmount > 0 {
			merchantRef := "dispute-partial-merchant-" + req.DisputeID
			merchantID2 := tb.ReferenceToID(merchantRef)
			if err := client.Transfer(merchantID2, escrowID, merchantID, merchantAmount, ledger, tb.CodeWallet); err != nil {
				writeError(w, http.StatusInternalServerError,
					fmt.Sprintf("dispute partial merchant transfer failed: %v", err))
				return
			}
		}
	}

	// Clean up escrow Redis key
	_ = rdb.Del(ctx, escrowCtxKey)

	// Publish Kafka dispute.resolved
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.dispute.resolved",
			req.MerchantID, map[string]any{
				"event_id":        uuid.NewString(),
				"dispute_id":      req.DisputeID,
				"merchant_id":     req.MerchantID,
				"resolution":      req.Resolution,
				"ledger_entry_id": ledgerEntryID,
				"reviewer_id":     req.ReviewerID,
				"occurred_at":     time.Now().UTC(),
			})
	}()

	slog.Info("[disputes] resolved",
		"dispute_id", req.DisputeID,
		"resolution", req.Resolution,
		"ledger_entry_id", ledgerEntryID,
	)

	writeJSON(w, http.StatusOK, types.ResolveDisputeResponse{
		DisputeID:     req.DisputeID,
		LedgerEntryID: ledgerEntryID,
		Status:        "resolved",
	})
}
