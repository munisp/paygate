// Package policy defines the PBAC resource types, actions, and role-permission matrix.
// This is the authoritative source of truth for all access control decisions when
// Permify is unreachable (fail-safe local fallback).
package policy

import "strings"

// ResourceType identifies a protected resource in the system.
type ResourceType string

// Action identifies an operation that can be performed on a resource.
type Action string

// Resource definitions — mirrors the TypeScript PBAC_POLICIES in server/pbac.ts
const (
	ResourceTransaction      ResourceType = "transaction"
	ResourcePayout           ResourceType = "payout"
	ResourceDispute          ResourceType = "dispute"
	ResourceKYC              ResourceType = "kyc"
	ResourceAPIKey           ResourceType = "api_key"
	ResourceWebhook          ResourceType = "webhook"
	ResourceVirtualCard      ResourceType = "virtual_card"
	ResourceSettlement       ResourceType = "settlement"
	ResourceFraudRule        ResourceType = "fraud_rule"
	ResourceComplianceReport ResourceType = "compliance_report"
	ResourceTeamMember       ResourceType = "team_member"
	ResourcePaymentLink      ResourceType = "payment_link"
	ResourceEscrow           ResourceType = "escrow"
	ResourceCarbonCredit     ResourceType = "carbon_credit"
	ResourceLoyaltyProgram   ResourceType = "loyalty_program"
	ResourceAdminPanel       ResourceType = "admin_panel"
)

// CheckRequest is the input to a PBAC permission check.
type CheckRequest struct {
	UserID     string
	UserRole   string
	TenantID   string
	Resource   ResourceType
	Action     Action
	ResourceID string // optional: specific resource instance
	// Contextual attributes for ABAC (Attribute-Based Access Control)
	Attributes map[string]string
}

// CheckResult is the output of a PBAC permission check.
type CheckResult struct {
	Allowed bool
	Source  string // "permify" | "local_matrix" | "deny_default"
	Reason  string
}

// rolePermissions is the local fallback permission matrix.
// Roles: owner > admin > finance_manager > compliance_officer > developer > viewer > user
var rolePermissions = map[string]map[ResourceType][]Action{
	"owner": {
		ResourceTransaction:      {"view", "initiate", "cancel", "export"},
		ResourcePayout:           {"view", "initiate", "approve", "reject", "cancel"},
		ResourceDispute:          {"view", "create", "respond", "escalate", "close"},
		ResourceKYC:              {"view", "submit", "approve", "reject", "override"},
		ResourceAPIKey:           {"view", "create", "revoke", "rotate"},
		ResourceWebhook:          {"view", "create", "update", "delete", "test"},
		ResourceVirtualCard:      {"view", "create", "freeze", "unfreeze", "terminate"},
		ResourceSettlement:       {"view", "trigger", "approve", "export"},
		ResourceFraudRule:        {"view", "create", "update", "delete", "toggle"},
		ResourceComplianceReport: {"view", "generate", "export", "archive"},
		ResourceTeamMember:       {"view", "invite", "remove", "update_role"},
		ResourcePaymentLink:      {"view", "create", "update", "deactivate", "export"},
		ResourceEscrow:           {"view", "create", "release", "dispute", "cancel"},
		ResourceCarbonCredit:     {"view", "purchase", "retire", "transfer"},
		ResourceLoyaltyProgram:   {"view", "create", "update", "deactivate", "award_points"},
		ResourceAdminPanel:       {"view", "configure", "export_data", "impersonate"},
	},
	"admin": {
		ResourceTransaction:      {"view", "initiate", "cancel", "export"},
		ResourcePayout:           {"view", "initiate", "approve", "reject", "cancel"},
		ResourceDispute:          {"view", "create", "respond", "escalate", "close"},
		ResourceKYC:              {"view", "submit", "approve", "reject", "override"},
		ResourceAPIKey:           {"view", "create", "revoke", "rotate"},
		ResourceWebhook:          {"view", "create", "update", "delete", "test"},
		ResourceVirtualCard:      {"view", "create", "freeze", "unfreeze", "terminate"},
		ResourceSettlement:       {"view", "trigger", "approve", "export"},
		ResourceFraudRule:        {"view", "create", "update", "delete", "toggle"},
		ResourceComplianceReport: {"view", "generate", "export", "archive"},
		ResourceTeamMember:       {"view", "invite", "remove", "update_role"},
		ResourcePaymentLink:      {"view", "create", "update", "deactivate", "export"},
		ResourceEscrow:           {"view", "create", "release", "dispute", "cancel"},
		ResourceCarbonCredit:     {"view", "purchase", "retire", "transfer"},
		ResourceLoyaltyProgram:   {"view", "create", "update", "deactivate", "award_points"},
		ResourceAdminPanel:       {"view", "configure", "export_data"},
	},
	"finance_manager": {
		ResourceTransaction:      {"view", "initiate", "export"},
		ResourcePayout:           {"view", "initiate", "approve"},
		ResourceDispute:          {"view", "create", "respond"},
		ResourceKYC:              {"view"},
		ResourceAPIKey:           {"view"},
		ResourceWebhook:          {"view"},
		ResourceVirtualCard:      {"view", "freeze"},
		ResourceSettlement:       {"view", "trigger", "export"},
		ResourceFraudRule:        {"view"},
		ResourceComplianceReport: {"view", "generate", "export"},
		ResourceTeamMember:       {"view"},
		ResourcePaymentLink:      {"view", "create", "update"},
		ResourceEscrow:           {"view", "create"},
		ResourceCarbonCredit:     {"view", "purchase"},
		ResourceLoyaltyProgram:   {"view"},
		ResourceAdminPanel:       {},
	},
	"compliance_officer": {
		ResourceTransaction:      {"view", "export"},
		ResourcePayout:           {"view"},
		ResourceDispute:          {"view", "respond", "escalate"},
		ResourceKYC:              {"view", "approve", "reject", "override"},
		ResourceAPIKey:           {"view"},
		ResourceWebhook:          {"view"},
		ResourceVirtualCard:      {"view"},
		ResourceSettlement:       {"view", "export"},
		ResourceFraudRule:        {"view", "create", "update", "toggle"},
		ResourceComplianceReport: {"view", "generate", "export", "archive"},
		ResourceTeamMember:       {"view"},
		ResourcePaymentLink:      {"view"},
		ResourceEscrow:           {"view"},
		ResourceCarbonCredit:     {"view"},
		ResourceLoyaltyProgram:   {"view"},
		ResourceAdminPanel:       {"view"},
	},
	"developer": {
		ResourceTransaction:      {"view"},
		ResourcePayout:           {"view"},
		ResourceDispute:          {"view"},
		ResourceKYC:              {"view"},
		ResourceAPIKey:           {"view", "create", "revoke", "rotate"},
		ResourceWebhook:          {"view", "create", "update", "delete", "test"},
		ResourceVirtualCard:      {"view"},
		ResourceSettlement:       {"view"},
		ResourceFraudRule:        {"view"},
		ResourceComplianceReport: {"view"},
		ResourceTeamMember:       {"view"},
		ResourcePaymentLink:      {"view", "create"},
		ResourceEscrow:           {"view"},
		ResourceCarbonCredit:     {"view"},
		ResourceLoyaltyProgram:   {"view"},
		ResourceAdminPanel:       {},
	},
	"viewer": {
		ResourceTransaction:      {"view"},
		ResourcePayout:           {"view"},
		ResourceDispute:          {"view"},
		ResourceKYC:              {"view"},
		ResourceAPIKey:           {"view"},
		ResourceWebhook:          {"view"},
		ResourceVirtualCard:      {"view"},
		ResourceSettlement:       {"view"},
		ResourceFraudRule:        {"view"},
		ResourceComplianceReport: {"view"},
		ResourceTeamMember:       {"view"},
		ResourcePaymentLink:      {"view"},
		ResourceEscrow:           {"view"},
		ResourceCarbonCredit:     {"view"},
		ResourceLoyaltyProgram:   {"view"},
		ResourceAdminPanel:       {},
	},
	"user": {
		ResourceTransaction:      {"view", "initiate"},
		ResourcePayout:           {"view", "initiate"},
		ResourceDispute:          {"view", "create"},
		ResourceKYC:              {"view", "submit"},
		ResourceAPIKey:           {"view", "create", "revoke"},
		ResourceWebhook:          {"view", "create", "update", "delete", "test"},
		ResourceVirtualCard:      {"view", "create", "freeze", "unfreeze"},
		ResourceSettlement:       {"view"},
		ResourceFraudRule:        {},
		ResourceComplianceReport: {},
		ResourceTeamMember:       {"view"},
		ResourcePaymentLink:      {"view", "create", "update", "deactivate"},
		ResourceEscrow:           {"view", "create"},
		ResourceCarbonCredit:     {"view", "purchase"},
		ResourceLoyaltyProgram:   {"view"},
		ResourceAdminPanel:       {},
	},
}

// CheckLocal evaluates the permission against the local role-permission matrix.
// This is the fail-safe fallback when Permify is unreachable.
func CheckLocal(req CheckRequest) CheckResult {
	role := strings.ToLower(req.UserRole)
	if role == "" {
		role = "user"
	}

	perms, ok := rolePermissions[role]
	if !ok {
		// Unknown role — deny by default
		return CheckResult{
			Allowed: false,
			Source:  "deny_default",
			Reason:  "unknown role: " + role,
		}
	}

	actions, ok := perms[req.Resource]
	if !ok {
		return CheckResult{
			Allowed: false,
			Source:  "local_matrix",
			Reason:  "resource not in role matrix",
		}
	}

	for _, a := range actions {
		if a == req.Action {
			return CheckResult{
				Allowed: true,
				Source:  "local_matrix",
				Reason:  "role " + role + " has " + string(req.Action) + " on " + string(req.Resource),
			}
		}
	}

	return CheckResult{
		Allowed: false,
		Source:  "local_matrix",
		Reason:  "role " + role + " lacks " + string(req.Action) + " on " + string(req.Resource),
	}
}

// AllResources returns all defined resource types.
func AllResources() []ResourceType {
	return []ResourceType{
		ResourceTransaction, ResourcePayout, ResourceDispute, ResourceKYC,
		ResourceAPIKey, ResourceWebhook, ResourceVirtualCard, ResourceSettlement,
		ResourceFraudRule, ResourceComplianceReport, ResourceTeamMember,
		ResourcePaymentLink, ResourceEscrow, ResourceCarbonCredit,
		ResourceLoyaltyProgram, ResourceAdminPanel,
	}
}

// AllRoles returns all defined roles in descending privilege order.
func AllRoles() []string {
	return []string{"owner", "admin", "finance_manager", "compliance_officer", "developer", "viewer", "user"}
}
