// Package permify provides Permify-based authorisation checks for Mojaloop operations.
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

// MojaloopAuthz checks Permify for Mojaloop transfer permissions.
type MojaloopAuthz struct {
	client    *http.Client
	permifyURL string
	apiKey    string
}

// NewMojaloopAuthz creates a new authz client from env vars.
func NewMojaloopAuthz() *MojaloopAuthz {
	return &MojaloopAuthz{
		client:    &http.Client{Timeout: 5 * time.Second},
		permifyURL: getEnv("PERMIFY_URL", "http://permify:3476"),
		apiKey:    getEnv("PERMIFY_API_KEY", ""),
	}
}

type permifyCheckRequest struct {
	Metadata struct {
		SchemaVersion string `json:"schema_version,omitempty"`
		SnapToken     string `json:"snap_token,omitempty"`
		Depth         int    `json:"depth"`
	} `json:"metadata"`
	Entity struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"entity"`
	Permission string `json:"permission"`
	Subject    struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"subject"`
}

type permifyCheckResponse struct {
	Can string `json:"can"` // "RESULT_ALLOWED" | "RESULT_DENIED"
}

// CanInitiateTransfer checks if a merchant has the mojaloop:transfer:initiate permission.
func (a *MojaloopAuthz) CanInitiateTransfer(ctx context.Context, merchantID string) bool {
	return a.check(ctx, "merchant", merchantID, "initiate_mojaloop_transfer", "merchant", merchantID)
}

// CanViewTransfers checks if a merchant can view their Mojaloop transfers.
func (a *MojaloopAuthz) CanViewTransfers(ctx context.Context, merchantID string) bool {
	return a.check(ctx, "merchant", merchantID, "view_mojaloop_transfers", "merchant", merchantID)
}

func (a *MojaloopAuthz) check(ctx context.Context, entityType, entityID, permission, subjectType, subjectID string) bool {
	req := permifyCheckRequest{}
	req.Metadata.Depth = 5
	req.Entity.Type = entityType
	req.Entity.ID = entityID
	req.Permission = permission
	req.Subject.Type = subjectType
	req.Subject.ID = subjectID

	body, err := json.Marshal(req)
	if err != nil {
		return false
	}

	url := fmt.Sprintf("%s/v1/permissions/check", a.permifyURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return false
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if a.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+a.apiKey)
	}

	resp, err := a.client.Do(httpReq)
	if err != nil {
		// Fail open in dev, fail closed in prod
		return getEnv("NODE_ENV", "development") == "development"
	}
	defer resp.Body.Close()

	var result permifyCheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Can == "RESULT_ALLOWED"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
