package permify

import (
	"context"
	"fmt"
	"log/slog"
)

// CheckPermission is a package-level convenience wrapper for Client.CheckPermission.
// entityType and entityID are combined as "entityType:entityID" for the Entity field.
// permission is the action being checked.
// Returns an error if the permission is denied.
func CheckPermission(ctx context.Context, entityType, entityID, permission string) error {
	c := Get()
	if c == nil {
		slog.Warn("permify.CheckPermission: client not initialised, allowing by default",
			"entity_type", entityType, "entity_id", entityID, "permission", permission)
		return nil
	}
	allowed, err := c.CheckPermission(ctx, CheckRequest{
		Entity:     fmt.Sprintf("%s:%s", entityType, entityID),
		Permission: permission,
		Subject:    fmt.Sprintf("%s:%s", entityType, entityID),
	})
	if err != nil {
		slog.Error("permify.CheckPermission: error", "err", err)
		return nil // fail-open on permify errors
	}
	if !allowed {
		return fmt.Errorf("permission denied: %s on %s/%s", permission, entityType, entityID)
	}
	return nil
}
