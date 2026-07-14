// Package temporal — production workflow helpers.
//
// This file adds:
//   - Workflow versioning with GetVersion (safe deterministic upgrades)
//   - Standard retry policies per risk tier
//   - Activity heartbeat helpers with cancellation propagation
//   - Worker health endpoint data
//   - ContinueAsNew helpers for long-running workflows
//   - Search attribute registration helpers
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Workflow Versioning ───────────────────────────────────────────────────────

// VersionIDs for deterministic workflow upgrades.
// Increment MaxSupported when making breaking changes to a workflow.
const (
	// VersionInitial is the baseline version for all workflows.
	VersionInitial = 1
	// VersionAddedFraudCheck added fraud check activity (v2).
	VersionAddedFraudCheck = 2
	// VersionAddedInsiderThreat added insider threat gate (v3).
	VersionAddedInsiderThreat = 3
	// VersionAddedOpenSearch added OpenSearch indexing (v4).
	VersionAddedOpenSearch = 4
	// VersionCurrent is the latest version all new workflows will use.
	VersionCurrent = VersionAddedOpenSearch
)

// GetWorkflowVersion wraps workflow.GetVersion with structured logging.
// changeID should be a human-readable string like "add-fraud-check".
func GetWorkflowVersion(ctx workflow.Context, changeID string, minSupported, maxSupported workflow.Version) workflow.Version {
	v := workflow.GetVersion(ctx, changeID, minSupported, maxSupported)
	workflow.GetLogger(ctx).Info("workflow version resolved",
		"change_id", changeID, "version", v)
	return v
}

// ─── Retry Policies ───────────────────────────────────────────────────────────

// RetryPolicy returns a Temporal RetryPolicy appropriate for the given risk tier.
// Tiers: "critical", "high", "medium", "low".
func RetryPolicy(tier string) *temporal.RetryPolicy {
	switch tier {
	case "critical":
		// Critical financial operations: fast retries, limited attempts, no jitter.
		return &temporal.RetryPolicy{
			InitialInterval:        500 * time.Millisecond,
			BackoffCoefficient:     1.5,
			MaximumInterval:        10 * time.Second,
			MaximumAttempts:        5,
			NonRetryableErrorTypes: []string{"INSUFFICIENT_FUNDS", "ACCOUNT_FROZEN", "DUPLICATE_TRANSACTION"},
		}
	case "high":
		return &temporal.RetryPolicy{
			InitialInterval:        1 * time.Second,
			BackoffCoefficient:     2.0,
			MaximumInterval:        30 * time.Second,
			MaximumAttempts:        7,
			NonRetryableErrorTypes: []string{"INVALID_ACCOUNT", "KYC_REJECTED"},
		}
	case "medium":
		return &temporal.RetryPolicy{
			InitialInterval:        2 * time.Second,
			BackoffCoefficient:     2.0,
			MaximumInterval:        2 * time.Minute,
			MaximumAttempts:        10,
			NonRetryableErrorTypes: []string{"VALIDATION_ERROR"},
		}
	default: // "low"
		return &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    10 * time.Minute,
			MaximumAttempts:    15,
		}
	}
}

// StandardActivityOptions returns ActivityOptions for the given tier.
func StandardActivityOptions(tier string, scheduleToClose time.Duration) workflow.ActivityOptions {
	return workflow.ActivityOptions{
		ScheduleToCloseTimeout: scheduleToClose,
		StartToCloseTimeout:    scheduleToClose / 2,
		HeartbeatTimeout:       30 * time.Second,
		RetryPolicy:            RetryPolicy(tier),
		WaitForCancellation:    false,
	}
}

// ─── Heartbeat Helpers ────────────────────────────────────────────────────────

// HeartbeatLoop sends Temporal heartbeats at the given interval until ctx is
// cancelled or done is closed. Call this in a goroutine from long activities.
func HeartbeatLoop(ctx context.Context, interval time.Duration, details ...interface{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			activity.RecordHeartbeat(ctx, details...)
			if ctx.Err() != nil {
				return
			}
		}
	}
}

// CheckCancellation returns an error if the activity context has been cancelled
// by Temporal (e.g., workflow cancelled or timed out).
func CheckCancellation(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return fmt.Errorf("activity cancelled: %w", ctx.Err())
	default:
		return nil
	}
}

// ─── ContinueAsNew ────────────────────────────────────────────────────────────

// MaxWorkflowHistoryEvents is the threshold at which a workflow should
// ContinueAsNew to avoid hitting Temporal's history size limit (50k events).
const MaxWorkflowHistoryEvents = 10_000

// ShouldContinueAsNew returns true if the workflow history has grown large
// enough that ContinueAsNew should be triggered.
func ShouldContinueAsNew(ctx workflow.Context) bool {
	info := workflow.GetInfo(ctx)
	return info.GetCurrentHistoryLength() >= MaxWorkflowHistoryEvents
}

// ─── Worker Health ────────────────────────────────────────────────────────────

// WorkerHealthSnapshot is returned by the /health endpoint for the Temporal worker.
type WorkerHealthSnapshot struct {
	Status          string    `json:"status"`
	Namespace       string    `json:"namespace"`
	TaskQueue       string    `json:"task_queue"`
	RegisteredWorkflows []string `json:"registered_workflows"`
	RegisteredActivities []string `json:"registered_activities"`
	CheckedAt       time.Time `json:"checked_at"`
}

// workerRegistrations tracks registered workflow and activity names.
var workerRegistrations = struct {
	workflows  []string
	activities []string
}{}

// RegisterWorkflowName records a workflow name for health reporting.
func RegisterWorkflowName(name string) {
	workerRegistrations.workflows = append(workerRegistrations.workflows, name)
}

// RegisterActivityName records an activity name for health reporting.
func RegisterActivityName(name string) {
	workerRegistrations.activities = append(workerRegistrations.activities, name)
}

// GetWorkerHealth returns the current worker health snapshot.
func GetWorkerHealth(namespace, taskQueue string) WorkerHealthSnapshot {
	return WorkerHealthSnapshot{
		Status:               "healthy",
		Namespace:            namespace,
		TaskQueue:            taskQueue,
		RegisteredWorkflows:  workerRegistrations.workflows,
		RegisteredActivities: workerRegistrations.activities,
		CheckedAt:            time.Now().UTC(),
	}
}

// ─── Search Attributes ────────────────────────────────────────────────────────

// PayGateSearchAttributes are custom Temporal search attributes used for
// workflow visibility queries.
var PayGateSearchAttributes = map[string]string{
	"MerchantID":      "Keyword",
	"TransactionID":   "Keyword",
	"PaymentMethod":   "Keyword",
	"RiskTier":        "Keyword",
	"WorkflowStatus":  "Keyword",
	"AmountKobo":      "Int",
	"CreatedAt":       "Datetime",
}

// UpsertSearchAttributes updates the search attributes for the current workflow.
func UpsertSearchAttributes(ctx workflow.Context, attrs map[string]interface{}) error {
	return workflow.UpsertTypedSearchAttributes(ctx, buildSearchAttributes(attrs)...)
}

func buildSearchAttributes(attrs map[string]interface{}) []temporal.SearchAttributeUpdate {
	// Returns empty slice — full implementation requires typed search attribute
	// keys which are registered per-namespace in Temporal Cloud / self-hosted.
	// This stub satisfies the compiler; wire real keys when namespace is provisioned.
	slog.Info("[temporal] upsert search attributes", "count", len(attrs))
	return nil
}
