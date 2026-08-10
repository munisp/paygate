// Temporal Workflow: ProvisionTenantBilling
// Orchestrates the complete billing setup for a new tenant or white-label customer.
// This workflow runs at tenant inception — before any transactions can be processed.
//
// Workflow guarantees:
//   - All steps are idempotent (safe to retry)
//   - If any step fails, Temporal retries with exponential backoff
//   - The workflow can be queried for status at any point
//   - A compensating workflow (DeprovisionTenantBilling) reverses all steps on failure

package workflows

import (
	"time"

	"github.com/paygate/billing-engine/go-onboarding-workflow/internal/activities"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// TenantBillingInput is the input to the ProvisionTenantBilling workflow.
type TenantBillingInput struct {
	TenantID          string `json:"tenant_id"`
	TenantName        string `json:"tenant_name"`
	TenantType        string `json:"tenant_type"` // "platform" | "white_label" | "reseller"
	PricingModel      string `json:"pricing_model"` // "per_transaction" | "subscription" | "hybrid"
	FeeRateBps        int    `json:"fee_rate_bps"`  // basis points, e.g. 150 = 1.5%
	FeeCapKobo        int64  `json:"fee_cap_kobo"`
	FeeFloorKobo      int64  `json:"fee_floor_kobo"`
	PlatformShareBps  int    `json:"platform_share_bps"` // e.g. 6500 = 65%
	InterchangeKobo   int64  `json:"interchange_cost_kobo"`
	SignOnFeeKobo     int64  `json:"sign_on_fee_kobo"`
	SubscriptionKobo  int64  `json:"subscription_fee_kobo"`
	AdminEmail        string `json:"admin_email"`
	ResellerID        string `json:"reseller_id,omitempty"`
	InitiatedBy       string `json:"initiated_by"` // actor user ID
}

// TenantBillingResult is the output of the ProvisionTenantBilling workflow.
type TenantBillingResult struct {
	TenantID                  string `json:"tenant_id"`
	BillingConfigID           string `json:"billing_config_id"`
	TbMerchantPayableAccount  string `json:"tb_merchant_payable_account"`
	TbPlatformRevenueAccount  string `json:"tb_platform_revenue_account"`
	TbResellerPayableAccount  string `json:"tb_reseller_payable_account"`
	TbInterchangeCostAccount  string `json:"tb_interchange_cost_account"`
	TbSignOnRevenueAccount    string `json:"tb_sign_on_revenue_account"`
	KeycloakRolesCreated      bool   `json:"keycloak_roles_created"`
	PermifyPoliciesCreated    bool   `json:"permify_policies_created"`
	KafkaTopicsRegistered     bool   `json:"kafka_topics_registered"`
	NotificationSent          bool   `json:"notification_sent"`
}

// ProvisionTenantBilling is the main Temporal workflow for billing provisioning.
func ProvisionTenantBilling(ctx workflow.Context, input TenantBillingInput) (*TenantBillingResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("ProvisionTenantBilling started", "tenant_id", input.TenantID)

	// Activity options: 30s timeout, 3 retries with exponential backoff
	actOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    3,
			BackoffCoefficient: 2.0,
			InitialInterval:    2 * time.Second,
			MaximumInterval:    30 * time.Second,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, actOpts)

	result := &TenantBillingResult{TenantID: input.TenantID}

	// ── Step 1: Create Keycloak billing roles ─────────────────────────────────
	var keycloakResult activities.CreateKeycloakRolesResult
	if err := workflow.ExecuteActivity(ctx,
		activities.CreateKeycloakRoles,
		activities.CreateKeycloakRolesInput{TenantID: input.TenantID},
	).Get(ctx, &keycloakResult); err != nil {
		logger.Error("CreateKeycloakRoles failed", "error", err)
		return nil, err
	}
	result.KeycloakRolesCreated = true
	logger.Info("Keycloak billing roles created", "tenant_id", input.TenantID)

	// ── Step 2: Create Permify billing policies ───────────────────────────────
	var permifyResult activities.CreatePermifyPoliciesResult
	if err := workflow.ExecuteActivity(ctx,
		activities.CreatePermifyPolicies,
		activities.CreatePermifyPoliciesInput{TenantID: input.TenantID},
	).Get(ctx, &permifyResult); err != nil {
		logger.Error("CreatePermifyPolicies failed", "error", err)
		return nil, err
	}
	result.PermifyPoliciesCreated = true

	// ── Step 3: Create TigerBeetle ledger accounts ────────────────────────────
	var tbResult activities.CreateTigerBeetleAccountsResult
	if err := workflow.ExecuteActivity(ctx,
		activities.CreateTigerBeetleAccounts,
		activities.CreateTigerBeetleAccountsInput{TenantID: input.TenantID},
	).Get(ctx, &tbResult); err != nil {
		logger.Error("CreateTigerBeetleAccounts failed", "error", err)
		return nil, err
	}
	result.TbMerchantPayableAccount = tbResult.MerchantPayableAccountID
	result.TbPlatformRevenueAccount = tbResult.PlatformRevenueAccountID
	result.TbResellerPayableAccount = tbResult.ResellerPayableAccountID
	result.TbInterchangeCostAccount = tbResult.InterchangeCostAccountID
	result.TbSignOnRevenueAccount = tbResult.SignOnRevenueAccountID
	logger.Info("TigerBeetle accounts created", "tenant_id", input.TenantID)

	// ── Step 4: Create billing config in PostgreSQL ───────────────────────────
	var configResult activities.CreateBillingConfigResult
	if err := workflow.ExecuteActivity(ctx,
		activities.CreateBillingConfig,
		activities.CreateBillingConfigInput{
			TenantID:                 input.TenantID,
			PricingModel:             input.PricingModel,
			FeeRateBps:               input.FeeRateBps,
			FeeCapKobo:               input.FeeCapKobo,
			FeeFloorKobo:             input.FeeFloorKobo,
			PlatformShareBps:         input.PlatformShareBps,
			InterchangeCostKobo:      input.InterchangeKobo,
			SignOnFeeKobo:            input.SignOnFeeKobo,
			SubscriptionFeeKobo:      input.SubscriptionKobo,
			TbMerchantPayableAccount: tbResult.MerchantPayableAccountID,
			TbPlatformRevenueAccount: tbResult.PlatformRevenueAccountID,
			TbResellerPayableAccount: tbResult.ResellerPayableAccountID,
			TbInterchangeCostAccount: tbResult.InterchangeCostAccountID,
			TbSignOnRevenueAccount:   tbResult.SignOnRevenueAccountID,
		},
	).Get(ctx, &configResult); err != nil {
		logger.Error("CreateBillingConfig failed", "error", err)
		return nil, err
	}
	result.BillingConfigID = configResult.BillingConfigID
	logger.Info("Billing config created", "config_id", configResult.BillingConfigID)

	// ── Step 5: Warm Redis cache with billing config ──────────────────────────
	if err := workflow.ExecuteActivity(ctx,
		activities.SeedRedisCache,
		activities.SeedRedisCacheInput{
			TenantID:        input.TenantID,
			BillingConfigID: configResult.BillingConfigID,
		},
	).Get(ctx, nil); err != nil {
		// Non-fatal: Redis cache miss will fall back to PostgreSQL
		logger.Warn("SeedRedisCache failed (non-fatal)", "error", err)
	}

	// ── Step 6: Register Kafka topics for this tenant ─────────────────────────
	var kafkaResult activities.RegisterKafkaTopicsResult
	if err := workflow.ExecuteActivity(ctx,
		activities.RegisterKafkaTopics,
		activities.RegisterKafkaTopicsInput{TenantID: input.TenantID},
	).Get(ctx, &kafkaResult); err != nil {
		logger.Error("RegisterKafkaTopics failed", "error", err)
		return nil, err
	}
	result.KafkaTopicsRegistered = true

	// ── Step 7: Emit audit event ──────────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx,
		activities.EmitAuditEvent,
		activities.EmitAuditEventInput{
			TenantID:    input.TenantID,
			ActorID:     input.InitiatedBy,
			Action:      "billing_config.provisioned",
			ResourceID:  configResult.BillingConfigID,
			AfterState:  configResult.ConfigJSON,
		},
	).Get(ctx, nil); err != nil {
		logger.Warn("EmitAuditEvent failed (non-fatal)", "error", err)
	}

	// ── Step 8: Notify owner ──────────────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx,
		activities.NotifyOwner,
		activities.NotifyOwnerInput{
			Title:   "New Tenant Billing Provisioned",
			Content: "Tenant " + input.TenantName + " (" + input.TenantID + ") billing configuration has been provisioned successfully.",
		},
	).Get(ctx, nil); err != nil {
		logger.Warn("NotifyOwner failed (non-fatal)", "error", err)
	}
	result.NotificationSent = true

	logger.Info("ProvisionTenantBilling completed", "tenant_id", input.TenantID, "config_id", result.BillingConfigID)
	return result, nil
}

// UpdateBillingConfig is a workflow for updating an existing tenant's billing config.
// It emits an audit event and notification on every change.
type UpdateBillingConfigInput struct {
	TenantID        string                 `json:"tenant_id"`
	BillingConfigID string                 `json:"billing_config_id"`
	Changes         map[string]interface{} `json:"changes"`
	ActorID         string                 `json:"actor_id"`
	ActorRole       string                 `json:"actor_role"`
	Reason          string                 `json:"reason"`
}

func UpdateBillingConfig(ctx workflow.Context, input UpdateBillingConfigInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("UpdateBillingConfig started", "tenant_id", input.TenantID)

	actOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 15 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, actOpts)

	// Fetch before-state for audit
	var beforeState activities.GetBillingConfigResult
	if err := workflow.ExecuteActivity(ctx,
		activities.GetBillingConfig,
		activities.GetBillingConfigInput{BillingConfigID: input.BillingConfigID},
	).Get(ctx, &beforeState); err != nil {
		return err
	}

	// Apply changes
	if err := workflow.ExecuteActivity(ctx,
		activities.ApplyBillingConfigChanges,
		activities.ApplyBillingConfigChangesInput{
			BillingConfigID: input.BillingConfigID,
			Changes:         input.Changes,
		},
	).Get(ctx, nil); err != nil {
		return err
	}

	// Invalidate Redis cache
	if err := workflow.ExecuteActivity(ctx,
		activities.InvalidateRedisCache,
		activities.InvalidateRedisCacheInput{TenantID: input.TenantID},
	).Get(ctx, nil); err != nil {
		logger.Warn("Cache invalidation failed (non-fatal)", "error", err)
	}

	// Emit audit event with before/after state
	if err := workflow.ExecuteActivity(ctx,
		activities.EmitAuditEvent,
		activities.EmitAuditEventInput{
			TenantID:    input.TenantID,
			ActorID:     input.ActorID,
			ActorRole:   input.ActorRole,
			Action:      "billing_config.updated",
			ResourceID:  input.BillingConfigID,
			BeforeState: beforeState.ConfigJSON,
			AfterState:  input.Changes,
			Reason:      input.Reason,
		},
	).Get(ctx, nil); err != nil {
		logger.Warn("EmitAuditEvent failed (non-fatal)", "error", err)
	}

	// Notify admin of billing config change
	if err := workflow.ExecuteActivity(ctx,
		activities.NotifyOwner,
		activities.NotifyOwnerInput{
			Title:   "Billing Config Changed",
			Content: "Billing configuration for tenant " + input.TenantID + " was modified by " + input.ActorID + ". Reason: " + input.Reason,
		},
	).Get(ctx, nil); err != nil {
		logger.Warn("NotifyOwner failed (non-fatal)", "error", err)
	}

	logger.Info("UpdateBillingConfig completed", "tenant_id", input.TenantID)
	return nil
}
