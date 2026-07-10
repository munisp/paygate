// Package redis provides Redis caching helpers for Mojaloop FSPIOP state management.
// Pending party lookups, quotes, and transfers are cached with TTLs to handle
// the asynchronous callback pattern used by the Mojaloop Hub.
package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

const (
	partyLookupTTL = 60 * time.Second
	quoteTTL       = 120 * time.Second
	transferTTL    = 300 * time.Second
)

// MojaloopCache wraps Redis for Mojaloop-specific state.
type MojaloopCache struct {
	client *goredis.Client
}

// NewMojaloopCache creates a new cache from REDIS_URL env var.
func NewMojaloopCache() *MojaloopCache {
	opt, err := goredis.ParseURL(getEnv("REDIS_URL", "redis://localhost:6379"))
	if err != nil {
		panic(fmt.Sprintf("mojaloop redis: invalid REDIS_URL: %v", err))
	}
	return &MojaloopCache{client: goredis.NewClient(opt)}
}

// ─── Party Lookup ─────────────────────────────────────────────────────────────

func (c *MojaloopCache) SetPartyLookupPending(ctx context.Context, idType, identifier, merchantID string) error {
	key := partyKey(idType, identifier)
	return c.client.Set(ctx, key, merchantID, partyLookupTTL).Err()
}

func (c *MojaloopCache) GetPartyLookupPending(ctx context.Context, idType, identifier string) (string, error) {
	key := partyKey(idType, identifier)
	return c.client.Get(ctx, key).Result()
}

func (c *MojaloopCache) DeletePartyLookupPending(ctx context.Context, idType, identifier string) error {
	return c.client.Del(ctx, partyKey(idType, identifier)).Err()
}

// ─── Quote ────────────────────────────────────────────────────────────────────

func (c *MojaloopCache) SetQuotePending(ctx context.Context, quoteID, merchantID string) error {
	key := quoteKey(quoteID)
	return c.client.Set(ctx, key, merchantID, quoteTTL).Err()
}

func (c *MojaloopCache) GetQuotePending(ctx context.Context, quoteID string) (string, error) {
	return c.client.Get(ctx, quoteKey(quoteID)).Result()
}

func (c *MojaloopCache) DeleteQuotePending(ctx context.Context, quoteID string) error {
	return c.client.Del(ctx, quoteKey(quoteID)).Err()
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

type transferState struct {
	MerchantID string `json:"merchantId"`
	QuoteID    string `json:"quoteId"`
}

func (c *MojaloopCache) SetTransferPending(ctx context.Context, transferID, merchantID, quoteID string) error {
	state := transferState{MerchantID: merchantID, QuoteID: quoteID}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, transferKey(transferID), data, transferTTL).Err()
}

func (c *MojaloopCache) GetTransferPending(ctx context.Context, transferID string) (merchantID, quoteID string, err error) {
	data, err := c.client.Get(ctx, transferKey(transferID)).Bytes()
	if err != nil {
		return "", "", err
	}
	var state transferState
	if err := json.Unmarshal(data, &state); err != nil {
		return "", "", err
	}
	return state.MerchantID, state.QuoteID, nil
}

func (c *MojaloopCache) DeleteTransferPending(ctx context.Context, transferID string) error {
	return c.client.Del(ctx, transferKey(transferID)).Err()
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

func partyKey(idType, identifier string) string {
	return fmt.Sprintf("mojaloop:party:%s:%s", idType, identifier)
}

func quoteKey(quoteID string) string {
	return fmt.Sprintf("mojaloop:quote:%s", quoteID)
}

func transferKey(transferID string) string {
	return fmt.Sprintf("mojaloop:transfer:%s", transferID)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
