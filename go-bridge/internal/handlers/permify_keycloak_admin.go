// permify_keycloak_admin.go — Admin endpoints for Permify policy sync and
// Keycloak role management (Wave 131 / Gap: Permify + Keycloak admin routes)
//
// Routes registered in main.go:
//   POST /v1/permify/schema/write        — push new RBAC schema version
//   POST /v1/permify/relationships/write  — create relationship tuples
//   POST /v1/permify/relationships/delete — remove relationship tuples
//   POST /v1/permify/relationships/list   — list relationships for an entity
//   POST /v1/keycloak/users/sync-group    — sync a user into a Keycloak merchant group
//   POST /v1/keycloak/users/assign-role   — assign a realm role to a user
//   POST /v1/keycloak/users/revoke-role   — revoke a realm role from a user

package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/paygate/go-bridge/internal/keycloak"
	"github.com/paygate/go-bridge/internal/permify"
)

// jsonErr formats an error as a JSON string for HTTP responses.
func jsonErr(err error) string {
	return fmt.Sprintf(`{"error":%q}`, err.Error())
}

// ─── Permify: Schema Write ─────────────────────────────────────────────────────

type writeSchemaReq struct {
	Schema string `json:"schema"`
}

// PermifyWriteSchema pushes a new RBAC schema to Permify.
// POST /v1/permify/schema/write
func PermifyWriteSchema(w http.ResponseWriter, r *http.Request) {
	var req writeSchemaReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Schema == "" {
		http.Error(w, `{"error":"schema is required"}`, http.StatusBadRequest)
		return
	}
	version, err := permify.Get().WriteSchema(r.Context(), req.Schema)
	if err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"schema_version": version})
}

// ─── Permify: Relationships ────────────────────────────────────────────────────

type writeTuplesReq struct {
	Tuples []permify.Tuple `json:"tuples"`
}

// PermifyWriteRelationships creates relationship tuples in Permify.
// POST /v1/permify/relationships/write
func PermifyWriteRelationships(w http.ResponseWriter, r *http.Request) {
	var req writeTuplesReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Tuples) == 0 {
		http.Error(w, `{"error":"tuples array is required"}`, http.StatusBadRequest)
		return
	}
	if err := permify.Get().WriteRelationship(r.Context(), req.Tuples); err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(req.Tuples)})
}

// PermifyDeleteRelationship removes a single relationship tuple from Permify.
// POST /v1/permify/relationships/delete
func PermifyDeleteRelationship(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Tuple permify.Tuple `json:"tuple"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"tuple is required"}`, http.StatusBadRequest)
		return
	}
	if err := permify.Get().DeleteRelationship(r.Context(), req.Tuple); err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// PermifyListRelationships lists relationship tuples for an entity.
// POST /v1/permify/relationships/list
func PermifyListRelationships(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EntityType string `json:"entity_type"`
		EntityID   string `json:"entity_id"`
		Relation   string `json:"relation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EntityType == "" {
		http.Error(w, `{"error":"entity_type is required"}`, http.StatusBadRequest)
		return
	}
	tuples, err := permify.Get().ListRelationships(r.Context(), permify.ListRelationshipsFilter{
		EntityType: req.EntityType,
		EntityID:   req.EntityID,
		Relation:   req.Relation,
	})
	if err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tuples": tuples, "count": len(tuples)})
}

// ─── Keycloak: Group + Role Management ────────────────────────────────────────

// KeycloakSyncGroup syncs a user into a merchant Keycloak group.
// POST /v1/keycloak/users/sync-group
func KeycloakSyncGroup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID     string `json:"user_id"`
		MerchantID string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" || req.MerchantID == "" {
		http.Error(w, `{"error":"user_id and merchant_id are required"}`, http.StatusBadRequest)
		return
	}
	if err := keycloak.Get().SyncMerchantGroup(r.Context(), req.UserID, req.MerchantID); err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// KeycloakAssignRole assigns a realm role to a Keycloak user.
// POST /v1/keycloak/users/assign-role
func KeycloakAssignRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"user_id"`
		RoleName string `json:"role_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" || req.RoleName == "" {
		http.Error(w, `{"error":"user_id and role_name are required"}`, http.StatusBadRequest)
		return
	}
	if err := keycloak.Get().AssignRealmRole(r.Context(), req.UserID, req.RoleName); err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// KeycloakRevokeRole revokes a realm role from a Keycloak user.
// POST /v1/keycloak/users/revoke-role
func KeycloakRevokeRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"user_id"`
		RoleName string `json:"role_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" || req.RoleName == "" {
		http.Error(w, `{"error":"user_id and role_name are required"}`, http.StatusBadRequest)
		return
	}
	if err := keycloak.Get().RevokeRealmRole(r.Context(), req.UserID, req.RoleName); err != nil {
		http.Error(w, jsonErr(err), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
