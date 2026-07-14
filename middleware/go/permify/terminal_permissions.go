// Package permify provides Permify authorization helpers for terminal operations.
// Terminal permissions follow the schema:
//
//	entity terminal {}
//	entity merchant {
//	  relation owner @user
//	  relation operator @user
//	  permission terminal_read  = owner or operator
//	  permission terminal_write = owner
//	  permission terminal_refund = owner
//	}
package permify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

var permifyClient = &http.Client{Timeout: 5 * time.Second}

func getPermifyURL() string {
	if v := os.Getenv("PERMIFY_URL"); v != "" {
		return v
	}
	return "http://localhost:3476"
}

func getPermifyKey() string {
	return os.Getenv("PERMIFY_API_KEY")
}

// CheckPermission verifies that subjectID has the given permission on the
// given entity type. Returns nil if allowed, error if denied or on failure.
//
// Example:
//
//	err := permify.CheckPermission(ctx, merchantID, "terminal", "refund")
func CheckPermission(ctx context.Context, subjectID, entityType, permission string) error {
	body, _ := json.Marshal(map[string]any{
		"metadata": map[string]any{
			"schema_version":  "",
			"snap_token":      "",
			"depth":           20,
		},
		"entity": map[string]any{
			"type": entityType,
			"id":   subjectID,
		},
		"permission": permission,
		"subject": map[string]any{
			"type": "user",
			"id":   subjectID,
		},
	})

	url := fmt.Sprintf("%s/v1/tenants/paygate/permissions/check", getPermifyURL())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		// Fail open on network error to avoid blocking operations
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	if key := getPermifyKey(); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := permifyClient.Do(req)
	if err != nil {
		// Fail open — Permify unavailable should not block payments
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Can string `json:"can"` // "RESULT_ALLOWED" | "RESULT_DENIED"
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil // fail open
	}

	if result.Can == "RESULT_DENIED" {
		return fmt.Errorf("permission denied: %s on %s/%s", permission, entityType, subjectID)
	}
	return nil
}

// WriteTerminalRelationship creates a Permify relationship for a terminal.
// Called when a terminal is provisioned to grant the merchant owner access.
func WriteTerminalRelationship(ctx context.Context, terminalID, merchantID, userID string) error {
	body, _ := json.Marshal(map[string]any{
		"metadata": map[string]any{"schema_version": ""},
		"tuples": []map[string]any{
			{
				"entity":   map[string]any{"type": "terminal", "id": terminalID},
				"relation": "owner",
				"subject":  map[string]any{"type": "merchant", "id": merchantID},
			},
			{
				"entity":   map[string]any{"type": "merchant", "id": merchantID},
				"relation": "terminal_owner",
				"subject":  map[string]any{"type": "user", "id": userID},
			},
		},
	})

	url := fmt.Sprintf("%s/v1/tenants/paygate/relationships/write", getPermifyURL())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := getPermifyKey(); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := permifyClient.Do(req)
	if err != nil {
		return fmt.Errorf("permify write relationship: %w", err)
	}
	defer resp.Body.Close()
	return nil
}
