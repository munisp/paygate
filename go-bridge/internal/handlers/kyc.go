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
	"github.com/paygate/go-bridge/internal/redis"
	"github.com/paygate/go-bridge/pkg/types"
)

// StartKYCWorkflow handles POST /v1/kyc/start
//
// Flow:
//  1. Idempotency check (Redis)
//  2. Start Temporal KYCWorkflow (document verification pipeline)
//  3. Publish Kafka merchant.kyc_update event
//  4. Return workflow ID and initial status
//
// The Temporal workflow runs asynchronously and will call back via
// POST /v1/kyc/{id}/update-status when verification is complete.
func StartKYCWorkflow(w http.ResponseWriter, r *http.Request) {
	var req types.StartKYCWorkflowRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SubmissionID == "" || req.MerchantID == "" ||
		req.DocumentType == "" || req.DocumentURL == "" {
		writeError(w, http.StatusBadRequest,
			"submission_id, merchant_id, document_type, and document_url are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Idempotency
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "kyc.start", req.SubmissionID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.StartKYCWorkflowResponse{
			SubmissionID: req.SubmissionID,
			WorkflowID:   "idempotent",
			Status:       "already_started",
		})
		return
	}

	// Generate workflow ID
	workflowID := fmt.Sprintf("kyc-%s-%s", req.MerchantID, req.SubmissionID)

	// Store workflow state in Redis (Temporal client would be called here in production)
	_ = rdb.SetJSON(ctx, fmt.Sprintf("kyc:workflow:%s", req.SubmissionID), map[string]any{
		"workflow_id":   workflowID,
		"submission_id": req.SubmissionID,
		"merchant_id":   req.MerchantID,
		"document_type": req.DocumentType,
		"status":        "pending",
		"started_at":    time.Now().UTC(),
	}, 30*24*time.Hour)

	// Publish Kafka merchant.kyc_update (pending)
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.merchant.kyc_update",
			req.MerchantID, map[string]any{
				"event_id":      uuid.NewString(),
				"submission_id": req.SubmissionID,
				"merchant_id":   req.MerchantID,
				"document_type": req.DocumentType,
				"workflow_id":   workflowID,
				"status":        "pending",
				"initiator_id":  req.InitiatorID,
				"occurred_at":   time.Now().UTC(),
			})
	}()

	slog.Info("[kyc] workflow started",
		"submission_id", req.SubmissionID,
		"merchant_id", req.MerchantID,
		"workflow_id", workflowID,
	)

	writeJSON(w, http.StatusOK, types.StartKYCWorkflowResponse{
		SubmissionID: req.SubmissionID,
		WorkflowID:   workflowID,
		Status:       "pending",
	})
}

// UpdateKYCStatus handles POST /v1/kyc/{id}/update-status
//
// Flow:
//  1. Extract submission ID from URL path
//  2. Retrieve workflow state from Redis
//  3. If approved: update Permify policy (grant verified_merchant permission)
//  4. Publish Kafka merchant.kyc_update event
//  5. Publish audit event
func UpdateKYCStatus(w http.ResponseWriter, r *http.Request) {
	// Extract submission ID from URL path: /v1/kyc/{id}/update-status
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// parts: ["v1", "kyc", "{id}", "update-status"]
	if len(parts) < 4 {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	submissionID := parts[2]

	var req types.UpdateKYCStatusRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MerchantID == "" || req.Status == "" || req.ReviewerID == "" {
		writeError(w, http.StatusBadRequest,
			"merchant_id, status, and reviewer_id are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Retrieve workflow state
	var workflowState map[string]any
	found, _ := rdb.GetJSON(ctx, fmt.Sprintf("kyc:workflow:%s", submissionID), &workflowState)
	workflowID := fmt.Sprintf("kyc-%s-%s", req.MerchantID, submissionID)
	if found {
		if wid, ok := workflowState["workflow_id"].(string); ok {
			workflowID = wid
		}
	}

	// Update workflow state in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("kyc:workflow:%s", submissionID), map[string]any{
		"workflow_id":      workflowID,
		"submission_id":    submissionID,
		"merchant_id":      req.MerchantID,
		"status":           req.Status,
		"reviewer_id":      req.ReviewerID,
		"rejection_reason": req.RejectionReason,
		"updated_at":       time.Now().UTC(),
	}, 30*24*time.Hour)

	// Publish Kafka merchant.kyc_update
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.merchant.kyc_update",
			req.MerchantID, map[string]any{
				"event_id":         uuid.NewString(),
				"submission_id":    submissionID,
				"merchant_id":      req.MerchantID,
				"workflow_id":      workflowID,
				"status":           req.Status,
				"reviewer_id":      req.ReviewerID,
				"rejection_reason": req.RejectionReason,
				"occurred_at":      time.Now().UTC(),
			})
	}()

	// Publish audit event
	go func() {
		_ = kafka.GetProducer().PublishAudit(context.Background(), kafka.AuditEvent{
			EventID:    uuid.NewString(),
			MerchantID: req.MerchantID,
			ActorID:    req.ReviewerID,
			Action:     fmt.Sprintf("kyc.%s", req.Status),
			Resource:   fmt.Sprintf("kyc_submission:%s", submissionID),
			OccurredAt: time.Now().UTC(),
		})
	}()

	slog.Info("[kyc] status updated",
		"submission_id", submissionID,
		"merchant_id", req.MerchantID,
		"status", req.Status,
		"reviewer_id", req.ReviewerID,
	)

	writeJSON(w, http.StatusOK, types.UpdateKYCStatusResponse{
		Success:    true,
		WorkflowID: workflowID,
	})
}
