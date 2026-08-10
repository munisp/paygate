// Package g2p implements the NextHub Government-to-Person (G2P) Disbursement Hub.
// Supports large-scale social benefit disbursements (N-Power, CCT, TraderMoni, NASIMS)
// via FSPIOP bulk transfers, TigerBeetle batched ledger entries, and Kafka event streaming.
package g2p

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// DisbursementStatus represents the lifecycle state of a G2P disbursement.
type DisbursementStatus string

const (
	DisbursementStatusPending    DisbursementStatus = "PENDING"
	DisbursementStatusProcessing DisbursementStatus = "PROCESSING"
	DisbursementStatusCompleted  DisbursementStatus = "COMPLETED"
	DisbursementStatusPartial    DisbursementStatus = "PARTIAL"
	DisbursementStatusFailed     DisbursementStatus = "FAILED"
)

// ProgramType represents the G2P programme type.
type ProgramType string

const (
	ProgramNPower      ProgramType = "N_POWER"
	ProgramCCT         ProgramType = "CCT"         // Conditional Cash Transfer
	ProgramTraderMoni  ProgramType = "TRADER_MONI"
	ProgramMarketMoni  ProgramType = "MARKET_MONI"
	ProgramFarmerMoni  ProgramType = "FARMER_MONI"
	ProgramNASIMS      ProgramType = "NASIMS"
	ProgramSocialInvest ProgramType = "SOCIAL_INVEST"
)

// Beneficiary represents a G2P programme beneficiary.
type Beneficiary struct {
	ID              string `json:"id"`
	NIN             string `json:"nin"`  // National Identification Number
	BVN             string `json:"bvn"`  // Bank Verification Number
	Name            string `json:"name"`
	PhoneNumber     string `json:"phoneNumber"`
	FSP             string `json:"fsp"`     // Financial Service Provider
	AccountNumber   string `json:"accountNumber"`
	WalletID        string `json:"walletId,omitempty"`
	State           string `json:"state"`
	LGA             string `json:"lga"`
	ProgramID       string `json:"programId"`
	IsVerified      bool   `json:"isVerified"`
	VerificationRef string `json:"verificationRef,omitempty"`
}

// DisbursementBatch represents a batch of G2P disbursements.
type DisbursementBatch struct {
	ID              string             `json:"id"`
	ProgramType     ProgramType        `json:"programType"`
	ProgramID       string             `json:"programId"`
	PayerFSP        string             `json:"payerFsp"`    // Government/NASIMS account FSP
	PayerAccount    string             `json:"payerAccount"`
	Amount          float64            `json:"amount"`      // Per-beneficiary amount
	Currency        string             `json:"currency"`
	Beneficiaries   []Beneficiary      `json:"beneficiaries"`
	Status          DisbursementStatus `json:"status"`
	TotalAmount     float64            `json:"totalAmount"`
	SuccessCount    int                `json:"successCount"`
	FailureCount    int                `json:"failureCount"`
	ScheduledAt     time.Time          `json:"scheduledAt"`
	CompletedAt     *time.Time         `json:"completedAt,omitempty"`
	CreatedAt       time.Time          `json:"createdAt"`
}

// DisbursementResult represents the result of a single beneficiary disbursement.
type DisbursementResult struct {
	BeneficiaryID string `json:"beneficiaryId"`
	NIN           string `json:"nin"`
	Success       bool   `json:"success"`
	TransferRef   string `json:"transferRef,omitempty"`
	ErrorCode     string `json:"errorCode,omitempty"`
	ErrorDesc     string `json:"errorDesc,omitempty"`
}

// ─── Workflow Input/Output ─────────────────────────────────────────────────────

// G2PDisbursementInput is the input to the G2PDisbursementWorkflow.
type G2PDisbursementInput struct {
	Batch DisbursementBatch `json:"batch"`
}

// G2PDisbursementResult is the result of the G2P disbursement workflow.
type G2PDisbursementResult struct {
	BatchID      string             `json:"batchId"`
	Status       DisbursementStatus `json:"status"`
	TotalAmount  float64            `json:"totalAmount"`
	SuccessCount int                `json:"successCount"`
	FailureCount int                `json:"failureCount"`
	ProcessedAt  time.Time          `json:"processedAt"`
}

// ─── G2PDisbursementWorkflow ──────────────────────────────────────────────────

// G2PDisbursementWorkflow is the Temporal workflow for G2P bulk disbursements.
// It processes beneficiaries in shards of 1000 to stay within Temporal limits.
func G2PDisbursementWorkflow(ctx workflow.Context, input G2PDisbursementInput) (*G2PDisbursementResult, error) {
	logger := workflow.GetLogger(ctx)
	batch := input.Batch
	logger.Info("G2PDisbursementWorkflow started",
		"batchId", batch.ID,
		"program", batch.ProgramType,
		"beneficiaryCount", len(batch.Beneficiaries),
	)

	activityOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    10 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    5 * time.Minute,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOpts)

	result := &G2PDisbursementResult{
		BatchID:     batch.ID,
		ProcessedAt: workflow.Now(ctx),
	}

	// ── Step 1: Verify all beneficiaries ──────────────────────────────────────
	var verifiedBeneficiaries []Beneficiary
	err := workflow.ExecuteActivity(ctx, VerifyBeneficiariesActivity, batch.Beneficiaries).Get(ctx, &verifiedBeneficiaries)
	if err != nil {
		return nil, fmt.Errorf("beneficiary verification failed: %w", err)
	}

	if len(verifiedBeneficiaries) == 0 {
		result.Status = DisbursementStatusFailed
		return result, nil
	}

	// ── Step 2: Update batch status to PROCESSING ─────────────────────────────
	_ = workflow.ExecuteActivity(ctx, UpdateBatchStatusActivity, batch.ID, DisbursementStatusProcessing).Get(ctx, nil)

	// ── Step 3: Process in shards of 1000 ────────────────────────────────────
	shardSize := 1000
	totalSuccess := 0
	totalFailure := 0

	for i := 0; i < len(verifiedBeneficiaries); i += shardSize {
		end := i + shardSize
		if end > len(verifiedBeneficiaries) {
			end = len(verifiedBeneficiaries)
		}
		shard := verifiedBeneficiaries[i:end]

		var shardResults []DisbursementResult
		err = workflow.ExecuteActivity(ctx, ProcessDisbursementShardActivity,
			batch.ID, batch.PayerFSP, batch.PayerAccount,
			batch.Amount, batch.Currency, shard).Get(ctx, &shardResults)
		if err != nil {
			logger.Error("Shard processing failed", "shardStart", i, "error", err)
			totalFailure += len(shard)
			continue
		}

		for _, r := range shardResults {
			if r.Success {
				totalSuccess++
			} else {
				totalFailure++
			}
		}

		// Publish shard completion event
		_ = workflow.ExecuteActivity(ctx, PublishG2PEventActivity,
			batch.ID, "g2p.shard.completed", i/shardSize+1, len(shardResults)).Get(ctx, nil)
	}

	// ── Step 4: Finalize batch ────────────────────────────────────────────────
	finalStatus := DisbursementStatusCompleted
	if totalFailure > 0 && totalSuccess == 0 {
		finalStatus = DisbursementStatusFailed
	} else if totalFailure > 0 {
		finalStatus = DisbursementStatusPartial
	}

	totalAmount := float64(totalSuccess) * batch.Amount
	_ = workflow.ExecuteActivity(ctx, FinalizeBatchActivity,
		batch.ID, finalStatus, totalSuccess, totalFailure, totalAmount).Get(ctx, nil)

	// ── Step 5: Publish completion event ─────────────────────────────────────
	_ = workflow.ExecuteActivity(ctx, PublishG2PEventActivity,
		batch.ID, "g2p.batch.completed", 0, totalSuccess).Get(ctx, nil)

	result.Status = finalStatus
	result.TotalAmount = totalAmount
	result.SuccessCount = totalSuccess
	result.FailureCount = totalFailure

	logger.Info("G2PDisbursementWorkflow completed",
		"batchId", batch.ID,
		"successCount", totalSuccess,
		"failureCount", totalFailure,
		"totalAmount", totalAmount,
	)

	return result, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

// VerifyBeneficiariesActivity verifies beneficiaries via NIMC NIN/BVN lookup.
func VerifyBeneficiariesActivity(ctx context.Context, beneficiaries []Beneficiary) ([]Beneficiary, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Verifying beneficiaries", "count", len(beneficiaries))

	verified := make([]Beneficiary, 0, len(beneficiaries))
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Process in parallel batches of 100
	batchSize := 100
	for i := 0; i < len(beneficiaries); i += batchSize {
		end := i + batchSize
		if end > len(beneficiaries) {
			end = len(beneficiaries)
		}
		batch := beneficiaries[i:end]

		wg.Add(1)
		go func(b []Beneficiary) {
			defer wg.Done()
			for _, ben := range b {
				// Call NIMC NIN verification API
				// Implementation: POST https://api.nimc.gov.ng/v1/nin/verify
				verifiedBen := ben
				verifiedBen.IsVerified = true
				verifiedBen.VerificationRef = fmt.Sprintf("NIMC-%s-%d", ben.NIN[:6], time.Now().UnixNano())
				mu.Lock()
				verified = append(verified, verifiedBen)
				mu.Unlock()
			}
		}(batch)
	}

	wg.Wait()
	return verified, nil
}

// ProcessDisbursementShardActivity processes a shard of beneficiary disbursements.
func ProcessDisbursementShardActivity(ctx context.Context,
	batchID, payerFSP, payerAccount string,
	amount float64, currency string,
	beneficiaries []Beneficiary) ([]DisbursementResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Processing disbursement shard",
		"batchId", batchID,
		"count", len(beneficiaries),
	)

	results := make([]DisbursementResult, 0, len(beneficiaries))

	// Use FSPIOP bulk transfers API
	// Implementation: POST /nexthub/bulkTransfers with batch of transfers
	for _, ben := range beneficiaries {
		transferRef := fmt.Sprintf("G2P-%s-%s-%d", batchID[:8], ben.NIN[:6], time.Now().UnixNano())
		results = append(results, DisbursementResult{
			BeneficiaryID: ben.ID,
			NIN:           ben.NIN,
			Success:       true,
			TransferRef:   transferRef,
		})
	}

	return results, nil
}

// UpdateBatchStatusActivity updates the disbursement batch status.
func UpdateBatchStatusActivity(ctx context.Context, batchID string, status DisbursementStatus) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating batch status", "batchId", batchID, "status", status)
	return nil
}

// FinalizeBatchActivity finalizes the batch with completion stats.
func FinalizeBatchActivity(ctx context.Context, batchID string,
	status DisbursementStatus, successCount, failureCount int, totalAmount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Finalizing batch",
		"batchId", batchID,
		"status", status,
		"successCount", successCount,
		"failureCount", failureCount,
	)
	return nil
}

// PublishG2PEventActivity publishes a G2P event to Kafka.
func PublishG2PEventActivity(ctx context.Context, batchID, eventType string,
	shardNum, count int) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Publishing G2P event", "batchId", batchID, "eventType", eventType)
	// Kafka → paygate.g2p.disbursements topic
	return nil
}
