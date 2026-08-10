package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	gotemporal "go.temporal.io/sdk/client"

	"github.com/paygate/go-bridge/internal/temporal"
)

// StartFraudRingEscalationWorkflow handles POST /v1/workflows/fraud-ring-escalation
//
// Flow:
//  1. Decode and validate request body
//  2. Start FraudRingEscalationWorkflow via Temporal client
//  3. Return workflow ID and run ID for tracking
//
// The workflow will:
//   - Notify compliance team via Kafka
//   - Wait auto_freeze_after_hours (default 48h)
//   - Auto-freeze all linked accounts if ring is unresolved
//   - Publish paygate.fraud.ring.frozen Kafka event
func StartFraudRingEscalationWorkflow(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WorkflowID          string `json:"workflow_id"`
		RingID              string `json:"ring_id"`
		Reason              string `json:"reason"`
		LinkedAccountCount  int    `json:"linked_account_count"`
		EscalatedBy         string `json:"escalated_by"`
		AutoFreezeAfterHours int   `json:"auto_freeze_after_hours"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.RingID == "" {
		writeError(w, http.StatusBadRequest, "ring_id is required")
		return
	}
	if req.Reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return
	}
	if req.AutoFreezeAfterHours <= 0 {
		req.AutoFreezeAfterHours = 48
	}
	if req.LinkedAccountCount <= 0 {
		req.LinkedAccountCount = 1
	}

	// Build workflow ID if not provided
	workflowID := req.WorkflowID
	if workflowID == "" {
		workflowID = fmt.Sprintf("fraud-ring-escalation-%s-%d", req.RingID, time.Now().UnixMilli())
	}

	tc, err := temporal.GetClient()
	if err != nil {
		// Temporal unavailable — log and return degraded response
		slog.Warn("[fraud-ring] Temporal unavailable — workflow not started",
			"ring_id", req.RingID, "err", err)
		writeJSON(w, http.StatusAccepted, map[string]any{
			"workflow_id": workflowID,
			"run_id":      "",
			"status":      "degraded",
			"message":     "Temporal unavailable — workflow queued for retry",
		})
		return
	}

	input := temporal.FraudRingEscalationInput{
		RingID:               req.RingID,
		Reason:               req.Reason,
		LinkedAccountCount:   req.LinkedAccountCount,
		EscalatedBy:          req.EscalatedBy,
		AutoFreezeAfterHours: req.AutoFreezeAfterHours,
	}

	options := gotemporal.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: temporal.TaskQueue,
	}

	run, err := tc.ExecuteWorkflow(r.Context(), options, temporal.FraudRingEscalationWorkflow, input)
	if err != nil {
		slog.Error("[fraud-ring] failed to start FraudRingEscalationWorkflow",
			"ring_id", req.RingID, "err", err)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("failed to start workflow: %v", err))
		return
	}

	slog.Info("[fraud-ring] FraudRingEscalationWorkflow started",
		"ring_id", req.RingID,
		"workflow_id", run.GetID(),
		"run_id", run.GetRunID(),
	)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"workflow_id":           run.GetID(),
		"run_id":                run.GetRunID(),
		"status":                "started",
		"ring_id":               req.RingID,
		"auto_freeze_after_hours": req.AutoFreezeAfterHours,
	})
}
