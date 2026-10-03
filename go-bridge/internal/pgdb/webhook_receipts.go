package pgdb

import (
	"context"
	"fmt"
	"log/slog"
)

// Available reports whether the pgdb pool is initialised and enabled.
func Available() bool {
	return globalDB != nil && globalDB.enabled && globalDB.db != nil
}

// InsertWebhookReceipt durably records an inbound webhook BEFORE it is
// forwarded, so a crash between receipt and forwarding never loses the event.
// Returns the receipt row ID. In noop mode it logs and returns 0.
func InsertWebhookReceipt(ctx context.Context, source, eventID string, payload []byte) (int64, error) {
	if !Available() {
		slog.Warn("[pgdb:noop] InsertWebhookReceipt — receipt NOT persisted", "source", source, "event_id", eventID)
		return 0, nil
	}
	var id int64
	err := globalDB.db.QueryRowContext(ctx,
		`INSERT INTO webhook_receipts (source, event_id, payload) VALUES ($1, $2, $3) RETURNING id`,
		source, eventID, payload).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("InsertWebhookReceipt: %w", err)
	}
	return id, nil
}

// MarkWebhookReceiptForwarded sets forwarded_at on a receipt after a
// successful forward.
func MarkWebhookReceiptForwarded(ctx context.Context, id int64) {
	if !Available() || id == 0 {
		return
	}
	if _, err := globalDB.db.ExecContext(ctx,
		`UPDATE webhook_receipts SET forwarded_at = now() WHERE id = $1`, id); err != nil {
		slog.Error("[pgdb] MarkWebhookReceiptForwarded failed", "id", id, "err", err)
	}
}

// MarkWebhookReceiptFailed records the forward error on a receipt so the
// event can be replayed later.
func MarkWebhookReceiptFailed(ctx context.Context, id int64, errMsg string) {
	if !Available() || id == 0 {
		return
	}
	if _, err := globalDB.db.ExecContext(ctx,
		`UPDATE webhook_receipts SET forward_error = $2 WHERE id = $1`, id, errMsg); err != nil {
		slog.Error("[pgdb] MarkWebhookReceiptFailed failed", "id", id, "err", err)
	}
}
