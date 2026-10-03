package handlers

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/paygate/go-bridge/internal/pgdb"
)

// recordWebhookReceipt writes a durable receipt row BEFORE the webhook is
// forwarded, so a crash between receipt and forwarding never loses the event.
//
// Fail-loud semantics:
//   - production: pgdb unavailable or insert error => non-nil error (caller
//     MUST return 503 and never silently forward).
//   - dev: pgdb unavailable => in-memory pass with a warning log (id 0).
func recordWebhookReceipt(ctx context.Context, source, eventID string, payload []byte) (int64, error) {
	if !pgdb.Available() {
		if isProductionEnv() {
			return 0, fmt.Errorf("pgdb unavailable in production — refusing to forward webhook without durable receipt (source=%s event_id=%s)", source, eventID)
		}
		slog.Warn("[webhook-receipt] pgdb unavailable — dev in-memory pass, receipt NOT persisted",
			"source", source, "event_id", eventID)
		return 0, nil
	}
	id, err := pgdb.InsertWebhookReceipt(ctx, source, eventID, payload)
	if err != nil {
		return 0, err
	}
	return id, nil
}
