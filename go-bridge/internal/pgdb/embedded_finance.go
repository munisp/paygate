package pgdb

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// SDKTokenRecord holds an issued SDK token record.
type SDKTokenRecord struct {
	TokenID     string
	MerchantID  string
	Scopes      []string
	Environment string
	ExpiresAt   time.Time
	IssuedAt    time.Time
}

// WebhookEndpoint holds a merchant webhook endpoint registration.
type WebhookEndpoint struct {
	EndpointID    string
	MerchantID    string
	EndpointURL   string
	Events        []string
	SigningSecret string
	Active        bool
	CreatedAt     time.Time
}

// LogSDKTokenIssuance records an SDK token issuance event.
func LogSDKTokenIssuance(ctx context.Context, rec SDKTokenRecord) {
	db := Get()
	if db == nil {
		return
	}
	scopesJSON, _ := json.Marshal(rec.Scopes)
	_, _ = db.db.ExecContext(ctx,
		`INSERT INTO sdk_token_log (token_id, merchant_id, scopes, environment, expires_at, issued_at, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
		rec.TokenID, rec.MerchantID, string(scopesJSON), rec.Environment, rec.ExpiresAt, rec.IssuedAt,
	)
}

// CreateWebhookEndpoint registers a new webhook endpoint.
func CreateWebhookEndpoint(ctx context.Context, ep WebhookEndpoint) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	eventsJSON, _ := json.Marshal(ep.Events)
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO webhook_endpoints
		   (endpoint_id, merchant_id, endpoint_url, events, signing_secret, active, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
		ep.EndpointID, ep.MerchantID, ep.EndpointURL, string(eventsJSON), ep.SigningSecret, ep.Active,
	)
	if err != nil {
		return fmt.Errorf("CreateWebhookEndpoint: %w", err)
	}
	return nil
}

// GetActiveWebhookEndpoints fetches active webhook endpoints for a merchant and event type.
func GetActiveWebhookEndpoints(ctx context.Context, merchantID, eventType string) ([]WebhookEndpoint, error) {
	db := Get()
	if db == nil {
		return nil, nil
	}
	rows, err := db.db.QueryContext(ctx,
		`SELECT endpoint_id, merchant_id, endpoint_url, signing_secret
		   FROM webhook_endpoints
		   WHERE merchant_id = ? AND active = 1
		     AND (JSON_CONTAINS(events, JSON_QUOTE(?)) OR JSON_CONTAINS(events, '"*"'))`,
		merchantID, eventType,
	)
	if err != nil {
		return nil, fmt.Errorf("GetActiveWebhookEndpoints: %w", err)
	}
	defer rows.Close()
	var endpoints []WebhookEndpoint
	for rows.Next() {
		var ep WebhookEndpoint
		if err := rows.Scan(&ep.EndpointID, &ep.MerchantID, &ep.EndpointURL, &ep.SigningSecret); err != nil {
			return nil, fmt.Errorf("GetActiveWebhookEndpoints scan: %w", err)
		}
		ep.Active = true
		endpoints = append(endpoints, ep)
	}
	return endpoints, nil
}

// LogWebhookDelivery records a webhook delivery attempt.
func LogWebhookDelivery(ctx context.Context, endpointID, eventType string, statusCode int, status, errorMsg string) {
	db := Get()
	if db == nil {
		return
	}
	_, _ = db.db.ExecContext(ctx,
		`INSERT INTO webhook_delivery_log (endpoint_id, event_type, status_code, status, error_msg, created_at)
		   VALUES (?, ?, ?, ?, ?, NOW())`,
		endpointID, eventType, statusCode, status, errorMsg,
	)
}
