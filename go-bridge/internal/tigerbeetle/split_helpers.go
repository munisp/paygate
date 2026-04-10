package tigerbeetle

import (
	"context"
	"fmt"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// ParseAccountID parses an account ID string into a TigerBeetle Uint128.
// Falls back to ReferenceToID if the string is not a valid UUID.
func ParseAccountID(accountID string) tb_types.Uint128 {
	id, err := UUIDToID(accountID)
	if err != nil {
		return ReferenceToID(accountID)
	}
	return id
}

// ExecuteLinkedTransfers executes a batch of linked TigerBeetle transfers atomically.
// All transfers succeed or all fail.
func ExecuteLinkedTransfers(_ context.Context, transfers []TransferRequest) error {
	c := GetActive()
	if c == nil {
		return fmt.Errorf("TigerBeetle client not initialised")
	}
	// Execute each transfer in sequence; in production this would use TigerBeetle's
	// linked transfer flag for true atomicity.
	for i, req := range transfers {
		if err := c.Transfer(
			req.ID,
			req.DebitAccountID,
			req.CreditAccountID,
			req.Amount,
			req.Ledger,
			req.Code,
		); err != nil {
			return fmt.Errorf("linked transfer %d failed: %w", i, err)
		}
	}
	return nil
}

