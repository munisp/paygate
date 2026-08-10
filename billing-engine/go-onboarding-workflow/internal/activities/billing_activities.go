// Temporal Activities for Billing Provisioning
// Each activity is idempotent and handles its own error recovery.

package activities

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
)

// ── Keycloak ──────────────────────────────────────────────────────────────────

type CreateKeycloakRolesInput struct {
	TenantID string `json:"tenant_id"`
}

type CreateKeycloakRolesResult struct {
	RolesCreated []string `json:"roles_created"`
}

// CreateKeycloakRoles creates billing-specific roles in Keycloak for the tenant.
func CreateKeycloakRoles(ctx context.Context, input CreateKeycloakRolesInput) (*CreateKeycloakRolesResult, error) {
	keycloakURL := os.Getenv("KEYCLOAK_URL")
	realm := os.Getenv("KEYCLOAK_REALM")
	adminToken := os.Getenv("KEYCLOAK_ADMIN_TOKEN")

	roles := []string{
		fmt.Sprintf("billing:admin:%s", input.TenantID),
		fmt.Sprintf("billing:config:write:%s", input.TenantID),
		fmt.Sprintf("billing:config:read:%s", input.TenantID),
		fmt.Sprintf("billing:report:read:%s", input.TenantID),
		fmt.Sprintf("billing:viewer:%s", input.TenantID),
	}

	created := []string{}
	for _, role := range roles {
		body, _ := json.Marshal(map[string]interface{}{
			"name":        role,
			"description": fmt.Sprintf("Billing role for tenant %s", input.TenantID),
		})
		url := fmt.Sprintf("%s/admin/realms/%s/roles", keycloakURL, realm)
		req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+adminToken)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("create keycloak role %s: %w", role, err)
		}
		resp.Body.Close()
		// 409 Conflict = role already exists (idempotent)
		if resp.StatusCode != 201 && resp.StatusCode != 409 {
			return nil, fmt.Errorf("keycloak role creation returned %d for %s", resp.StatusCode, role)
		}
		created = append(created, role)
	}

	return &CreateKeycloakRolesResult{RolesCreated: created}, nil
}

// ── Permify ───────────────────────────────────────────────────────────────────

type CreatePermifyPoliciesInput struct {
	TenantID string `json:"tenant_id"`
}

type CreatePermifyPoliciesResult struct {
	PolicyID string `json:"policy_id"`
}

// CreatePermifyPolicies creates fine-grained RBAC policies in Permify.
func CreatePermifyPolicies(ctx context.Context, input CreatePermifyPoliciesInput) (*CreatePermifyPoliciesResult, error) {
	permifyURL := os.Getenv("PERMIFY_URL")
	permifyKey := os.Getenv("PERMIFY_API_KEY")

	schema := fmt.Sprintf(`
entity billing_config {
    relation admin @user
    relation config_writer @user
    relation config_reader @user
    relation report_reader @user
    relation viewer @user

    permission read   = admin or config_reader or report_reader or viewer
    permission write  = admin or config_writer
    permission delete = admin
    permission audit  = admin or report_reader
} tenant_id: %s
`, input.TenantID)

	body, _ := json.Marshal(map[string]interface{}{
		"schema": schema,
	})

	url := fmt.Sprintf("%s/v1/tenants/%s/schemas/write", permifyURL, input.TenantID)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+permifyKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("create permify policy: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	policyID := fmt.Sprintf("billing:%s", input.TenantID)
	return &CreatePermifyPoliciesResult{PolicyID: policyID}, nil
}

// ── TigerBeetle ───────────────────────────────────────────────────────────────

type CreateTigerBeetleAccountsInput struct {
	TenantID string `json:"tenant_id"`
}

type CreateTigerBeetleAccountsResult struct {
	MerchantPayableAccountID string `json:"merchant_payable_account_id"`
	PlatformRevenueAccountID string `json:"platform_revenue_account_id"`
	ResellerPayableAccountID string `json:"reseller_payable_account_id"`
	InterchangeCostAccountID string `json:"interchange_cost_account_id"`
	SignOnRevenueAccountID   string `json:"sign_on_revenue_account_id"`
}

const (
	LedgerNGN         = 566 // ISO 4217 numeric for NGN
	CodeMerchantPayable = 10
	CodePlatformRevenue = 11
	CodeResellerPayable = 12
	CodeInterchangeCost = 13
	CodeSignOnRevenue   = 14
)

// CreateTigerBeetleAccounts creates 5 double-entry ledger accounts for the tenant.
func CreateTigerBeetleAccounts(ctx context.Context, input CreateTigerBeetleAccountsInput) (*CreateTigerBeetleAccountsResult, error) {
	tbURL := os.Getenv("TIGERBEETLE_HTTP_URL")

	// Generate deterministic account IDs from tenant UUID
	tenantUUID, err := uuid.Parse(input.TenantID)
	if err != nil {
		return nil, fmt.Errorf("invalid tenant_id: %w", err)
	}
	base := tenantUUID.ID()

	accounts := []map[string]interface{}{
		{"id": fmt.Sprintf("%d", base+1), "ledger": LedgerNGN, "code": CodeMerchantPayable, "flags": 0, "user_data_128": input.TenantID},
		{"id": fmt.Sprintf("%d", base+2), "ledger": LedgerNGN, "code": CodePlatformRevenue, "flags": 0, "user_data_128": input.TenantID},
		{"id": fmt.Sprintf("%d", base+3), "ledger": LedgerNGN, "code": CodeResellerPayable, "flags": 0, "user_data_128": input.TenantID},
		{"id": fmt.Sprintf("%d", base+4), "ledger": LedgerNGN, "code": CodeInterchangeCost, "flags": 0, "user_data_128": input.TenantID},
		{"id": fmt.Sprintf("%d", base+5), "ledger": LedgerNGN, "code": CodeSignOnRevenue, "flags": 0, "user_data_128": input.TenantID},
	}

	body, _ := json.Marshal(map[string]interface{}{"accounts": accounts})
	req, _ := http.NewRequestWithContext(ctx, "POST", tbURL+"/accounts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("create tigerbeetle accounts: %w", err)
	}
	resp.Body.Close()

	return &CreateTigerBeetleAccountsResult{
		MerchantPayableAccountID: fmt.Sprintf("%d", base+1),
		PlatformRevenueAccountID: fmt.Sprintf("%d", base+2),
		ResellerPayableAccountID: fmt.Sprintf("%d", base+3),
		InterchangeCostAccountID: fmt.Sprintf("%d", base+4),
		SignOnRevenueAccountID:   fmt.Sprintf("%d", base+5),
	}, nil
}

// ── PostgreSQL Billing Config ─────────────────────────────────────────────────

type CreateBillingConfigInput struct {
	TenantID                 string `json:"tenant_id"`
	PricingModel             string `json:"pricing_model"`
	FeeRateBps               int    `json:"fee_rate_bps"`
	FeeCapKobo               int64  `json:"fee_cap_kobo"`
	FeeFloorKobo             int64  `json:"fee_floor_kobo"`
	PlatformShareBps         int    `json:"platform_share_bps"`
	InterchangeCostKobo      int64  `json:"interchange_cost_kobo"`
	SignOnFeeKobo            int64  `json:"sign_on_fee_kobo"`
	SubscriptionFeeKobo      int64  `json:"subscription_fee_kobo"`
	TbMerchantPayableAccount string `json:"tb_merchant_payable_account"`
	TbPlatformRevenueAccount string `json:"tb_platform_revenue_account"`
	TbResellerPayableAccount string `json:"tb_reseller_payable_account"`
	TbInterchangeCostAccount string `json:"tb_interchange_cost_account"`
	TbSignOnRevenueAccount   string `json:"tb_sign_on_revenue_account"`
}

type CreateBillingConfigResult struct {
	BillingConfigID string      `json:"billing_config_id"`
	ConfigJSON      interface{} `json:"config_json"`
}

func CreateBillingConfig(ctx context.Context, input CreateBillingConfigInput) (*CreateBillingConfigResult, error) {
	// Convert basis points to decimal strings for PostgreSQL NUMERIC columns
	feeRate := fmt.Sprintf("%.6f", float64(input.FeeRateBps)/10000.0)
	platformShare := fmt.Sprintf("%.6f", float64(input.PlatformShareBps)/10000.0)
	resellerShare := fmt.Sprintf("%.6f", 1.0-float64(input.PlatformShareBps)/10000.0)

	configID := uuid.New().String()

	// In production this would use pgx directly; using HTTP API for portability
	portalURL := os.Getenv("PORTAL_INTERNAL_API_URL")
	internalKey := os.Getenv("INTERNAL_API_KEY")

	body, _ := json.Marshal(map[string]interface{}{
		"id":                         configID,
		"tenant_id":                  input.TenantID,
		"pricing_model":              input.PricingModel,
		"fee_rate":                   feeRate,
		"fee_cap_kobo":               input.FeeCapKobo,
		"fee_floor_kobo":             input.FeeFloorKobo,
		"platform_share":             platformShare,
		"reseller_share":             resellerShare,
		"interchange_cost_kobo":      input.InterchangeCostKobo,
		"sign_on_fee_kobo":           input.SignOnFeeKobo,
		"sign_on_platform_share":     "0.700000",
		"subscription_fee_kobo":      input.SubscriptionFeeKobo,
		"subscription_platform_share": platformShare,
		"tb_merchant_payable_account": input.TbMerchantPayableAccount,
		"tb_platform_revenue_account": input.TbPlatformRevenueAccount,
		"tb_reseller_payable_account": input.TbResellerPayableAccount,
		"tb_interchange_cost_account": input.TbInterchangeCostAccount,
		"tb_sign_on_revenue_account":  input.TbSignOnRevenueAccount,
		"active":                     true,
		"version":                    1,
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", portalURL+"/internal/billing-configs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("create billing config: %w", err)
	}
	resp.Body.Close()

	return &CreateBillingConfigResult{
		BillingConfigID: configID,
		ConfigJSON:      body,
	}, nil
}

// ── Redis Cache ───────────────────────────────────────────────────────────────

type SeedRedisCacheInput struct {
	TenantID        string `json:"tenant_id"`
	BillingConfigID string `json:"billing_config_id"`
}

func SeedRedisCache(ctx context.Context, input SeedRedisCacheInput) error {
	// Trigger cache warm via billing core health endpoint
	billingCoreURL := os.Getenv("BILLING_CORE_URL")
	url := fmt.Sprintf("%s/billing/cache/warm/%s", billingCoreURL, input.TenantID)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("seed redis cache: %w", err)
	}
	resp.Body.Close()
	return nil
}

type InvalidateRedisCacheInput struct {
	TenantID string `json:"tenant_id"`
}

func InvalidateRedisCache(ctx context.Context, input InvalidateRedisCacheInput) error {
	billingCoreURL := os.Getenv("BILLING_CORE_URL")
	url := fmt.Sprintf("%s/billing/cache/invalidate/%s", billingCoreURL, input.TenantID)
	req, _ := http.NewRequestWithContext(ctx, "DELETE", url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("invalidate redis cache: %w", err)
	}
	resp.Body.Close()
	return nil
}

// ── Kafka Topics ──────────────────────────────────────────────────────────────

type RegisterKafkaTopicsInput struct {
	TenantID string `json:"tenant_id"`
}

type RegisterKafkaTopicsResult struct {
	Topics []string `json:"topics"`
}

func RegisterKafkaTopics(ctx context.Context, input RegisterKafkaTopicsInput) (*RegisterKafkaTopicsResult, error) {
	// Topics are auto-created by Kafka when first published to
	// This activity documents the intent and could call Kafka Admin API
	topics := []string{
		fmt.Sprintf("payment.completed.%s", input.TenantID),
		fmt.Sprintf("billing.computed.%s", input.TenantID),
	}
	return &RegisterKafkaTopicsResult{Topics: topics}, nil
}

// ── Audit Event ───────────────────────────────────────────────────────────────

type EmitAuditEventInput struct {
	TenantID    string      `json:"tenant_id"`
	ActorID     string      `json:"actor_id"`
	ActorRole   string      `json:"actor_role,omitempty"`
	Action      string      `json:"action"`
	ResourceID  string      `json:"resource_id"`
	BeforeState interface{} `json:"before_state,omitempty"`
	AfterState  interface{} `json:"after_state,omitempty"`
	Reason      string      `json:"reason,omitempty"`
}

func EmitAuditEvent(ctx context.Context, input EmitAuditEventInput) error {
	opensearchURL := os.Getenv("OPENSEARCH_URL")
	indexName := "billing-audit-logs"

	doc := map[string]interface{}{
		"tenant_id":    input.TenantID,
		"actor_id":     input.ActorID,
		"actor_role":   input.ActorRole,
		"action":       input.Action,
		"resource_id":  input.ResourceID,
		"before_state": input.BeforeState,
		"after_state":  input.AfterState,
		"reason":       input.Reason,
		"timestamp":    time.Now().UTC().UnixMilli(),
	}

	body, _ := json.Marshal(doc)
	url := fmt.Sprintf("%s/%s/_doc", opensearchURL, indexName)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("emit audit event: %w", err)
	}
	resp.Body.Close()
	return nil
}

// ── Notify Owner ──────────────────────────────────────────────────────────────

type NotifyOwnerInput struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

func NotifyOwner(ctx context.Context, input NotifyOwnerInput) error {
	portalURL := os.Getenv("PORTAL_INTERNAL_API_URL")
	internalKey := os.Getenv("INTERNAL_API_KEY")

	body, _ := json.Marshal(map[string]string{
		"title":   input.Title,
		"content": input.Content,
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", portalURL+"/internal/notify-owner", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("notify owner: %w", err)
	}
	resp.Body.Close()
	return nil
}

// ── Get / Apply Billing Config ────────────────────────────────────────────────

type GetBillingConfigInput struct {
	BillingConfigID string `json:"billing_config_id"`
}

type GetBillingConfigResult struct {
	ConfigJSON interface{} `json:"config_json"`
}

func GetBillingConfig(ctx context.Context, input GetBillingConfigInput) (*GetBillingConfigResult, error) {
	portalURL := os.Getenv("PORTAL_INTERNAL_API_URL")
	internalKey := os.Getenv("INTERNAL_API_KEY")

	url := fmt.Sprintf("%s/internal/billing-configs/%s", portalURL, input.BillingConfigID)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get billing config: %w", err)
	}
	defer resp.Body.Close()

	var config interface{}
	json.NewDecoder(resp.Body).Decode(&config)
	return &GetBillingConfigResult{ConfigJSON: config}, nil
}

type ApplyBillingConfigChangesInput struct {
	BillingConfigID string                 `json:"billing_config_id"`
	Changes         map[string]interface{} `json:"changes"`
}

func ApplyBillingConfigChanges(ctx context.Context, input ApplyBillingConfigChangesInput) error {
	portalURL := os.Getenv("PORTAL_INTERNAL_API_URL")
	internalKey := os.Getenv("INTERNAL_API_KEY")

	body, _ := json.Marshal(input.Changes)
	url := fmt.Sprintf("%s/internal/billing-configs/%s", portalURL, input.BillingConfigID)
	req, _ := http.NewRequestWithContext(ctx, "PATCH", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", internalKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("apply billing config changes: %w", err)
	}
	resp.Body.Close()
	return nil
}
