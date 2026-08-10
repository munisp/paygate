package permify

import (
	"context"
	"fmt"
	"log/slog"
)

// CheckPermission is a package-level convenience wrapper for Client.CheckPermission.
// entityType and entityID are combined as "entityType:entityID" for the Entity field.
// permission is the action being checked.
// Returns an error if the permission is denied OR if Permify is unavailable
// (fail-closed; PERMIFY_FAIL_OPEN=true opts out for non-money paths).
func CheckPermission(ctx context.Context, entityType, entityID, permission string) error {
	c := Get()
	if c == nil {
		if FailOpen() {
			slog.Warn("permify.CheckPermission: client not initialised, granting via PERMIFY_FAIL_OPEN",
				"entity_type", entityType, "entity_id", entityID, "permission", permission)
			return nil
		}
		slog.Error("permify.CheckPermission: client not initialised — DENYING",
			"entity_type", entityType, "entity_id", entityID, "permission", permission)
		return ErrUnavailable
	}
	allowed, err := c.CheckPermission(ctx, CheckRequest{
		Entity:     fmt.Sprintf("%s:%s", entityType, entityID),
		Permission: permission,
		Subject:    fmt.Sprintf("%s:%s", entityType, entityID),
	})
	if err != nil {
		slog.Error("permify.CheckPermission: error — denying", "err", err)
		return err // fail-closed on permify errors
	}
	if !allowed {
		return fmt.Errorf("permission denied: %s on %s/%s", permission, entityType, entityID)
	}
	return nil
}
