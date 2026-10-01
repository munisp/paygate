// go_cache.go — durable write-through store for the Go bridge cache layer.
//
// These helpers back the cross-border cache (internal/redis/crossborder_cache.go)
// so that idempotency keys and transfer state survive process restarts even
// when Redis is unavailable.  Tables are created by drizzle/0108_go_cache_tables.sql.
//
// All functions are fail-loud: when the pool is disabled (dev/test mode) they
// return ErrDisabled so callers can decide per-environment policy — money
// paths must NOT silently fall back to memory-only storage in production.
package pgdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ErrDisabled is returned when the pgdb pool is not initialised / disabled.
var ErrDisabled = errors.New("pgdb: disabled (DATABASE_URL not set)")

// Enabled reports whether the global DB pool is connected to PostgreSQL.
// Safe to call before Init (returns false instead of panicking).
func Enabled() bool {
	return globalDB != nil && globalDB.enabled && globalDB.db != nil
}

// UpsertIdempotencyKey inserts an idempotency key.  Returns created=false
// (with nil error) when the key already exists — the duplicate-request path.
func UpsertIdempotencyKey(ctx context.Context, key string, result []byte, ttl time.Duration) (bool, error) {
	if !Enabled() {
		return false, ErrDisabled
	}
	expiresAt := time.Now().UTC().Add(ttl)
	res, err := globalDB.db.ExecContext(ctx, `
		INSERT INTO idempotency_keys (key, result, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO NOTHING`, key, result, expiresAt)
	if err != nil {
		return false, fmt.Errorf("pgdb: insert idempotency key: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// GetIdempotencyKey fetches a non-expired idempotency key result.
// found=false means the key is absent or expired (correct miss semantics).
func GetIdempotencyKey(ctx context.Context, key string) ([]byte, bool, error) {
	if !Enabled() {
		return nil, false, ErrDisabled
	}
	var result []byte
	err := globalDB.db.QueryRowContext(ctx, `
		SELECT result FROM idempotency_keys
		WHERE key = $1 AND expires_at > now()`, key).Scan(&result)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("pgdb: get idempotency key: %w", err)
	}
	return result, true, nil
}

// UpsertTransferState persists the latest state of a cross-border transfer.
func UpsertTransferState(ctx context.Context, transferID string, state []byte) error {
	if !Enabled() {
		return ErrDisabled
	}
	_, err := globalDB.db.ExecContext(ctx, `
		INSERT INTO transfer_state (transfer_id, state, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (transfer_id) DO UPDATE
		SET state = EXCLUDED.state, updated_at = now()`, transferID, state)
	if err != nil {
		return fmt.Errorf("pgdb: upsert transfer state: %w", err)
	}
	return nil
}

// GetTransferState fetches the persisted state of a cross-border transfer.
func GetTransferState(ctx context.Context, transferID string) ([]byte, bool, error) {
	if !Enabled() {
		return nil, false, ErrDisabled
	}
	var state []byte
	err := globalDB.db.QueryRowContext(ctx, `
		SELECT state FROM transfer_state WHERE transfer_id = $1`, transferID).Scan(&state)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("pgdb: get transfer state: %w", err)
	}
	return state, true, nil
}

// NextInvoiceNumber atomically allocates the next invoice sequence number
// via SELECT nextval('invoice_number_seq').  Fail-loud: any database error
// is returned to the caller, which must reject the invoice creation.
func NextInvoiceNumber(ctx context.Context) (int64, error) {
	if !Enabled() {
		return 0, ErrDisabled
	}
	var n int64
	if err := globalDB.db.QueryRowContext(ctx,
		`SELECT nextval('invoice_number_seq')`).Scan(&n); err != nil {
		return 0, fmt.Errorf("pgdb: nextval invoice_number_seq: %w", err)
	}
	return n, nil
}
