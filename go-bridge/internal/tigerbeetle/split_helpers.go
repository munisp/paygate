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
// All transfers succeed or all fail (linked flag set on all but the last).
//
// This uses BatchTransfers — a single CreateTransfers call with up to 8,190
// transfers packed into one 1 MB network message — rather than one call per
// transfer. This is the key lesson from the 1B payments/day benchmark:
// per-transfer round-trips are the primary throughput bottleneck.
// Source: https://backend.how/posts/1b-payments-per-day/
//
// For batches larger than TB_MAX_BATCH_SIZE (8,190), the slice is automatically
// chunked. Each chunk is atomic within itself; cross-chunk atomicity requires
// the caller to use two-phase (pending/post) transfers instead.
func ExecuteLinkedTransfers(_ context.Context, transfers []TransferRequest) error {
	if len(transfers) == 0 {
		return nil
	}
	c := GetActive()
	if c == nil {
		return fmt.Errorf("TigerBeetle client not initialised")
	}

	// Chunk into TB_MAX_BATCH_SIZE (8,190) batches.
	// Within each chunk, set the linked flag on all transfers except the last
	// so the entire chunk is atomic.
	for start := 0; start < len(transfers); start += TB_MAX_BATCH_SIZE {
		end := start + TB_MAX_BATCH_SIZE
		if end > len(transfers) {
			end = len(transfers)
		}
		chunk := transfers[start:end]

		// Build the tb_types.Transfer slice with linked flags.
		tbTransfers := make([]tb_types.Transfer, len(chunk))
		for i, req := range chunk {
			flags := req.Flags
			if i < len(chunk)-1 {
				// Set the linked bit (bit 0) on all but the last transfer.
				flags |= 1
			}
			tbTransfers[i] = tb_types.Transfer{
				ID:              req.ID,
				DebitAccountID:  req.DebitAccountID,
				CreditAccountID: req.CreditAccountID,
				Amount:          tb_types.ToUint128(req.Amount),
				Ledger:          req.Ledger,
				Code:            req.Code,
				Flags:           flags,
				UserData128:     req.UserData128,
			}
		}

		if err := c.BatchTransfers(tbTransfers); err != nil {
			return fmt.Errorf("linked batch [%d:%d] failed: %w", start, end, err)
		}
	}
	return nil
}
