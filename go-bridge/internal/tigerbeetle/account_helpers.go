package tigerbeetle

import (
	"context"
	"fmt"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// GetAccountBalance returns the balance of a TigerBeetle account.
func GetAccountBalance(_ context.Context, accountID tb_types.Uint128) (uint64, error) {
	c := GetActive()
	if c == nil {
		return 0, fmt.Errorf("TigerBeetle client not initialised")
	}
	return c.GetBalance(accountID)
}

// uint128FromUint64 converts a uint64 to a TigerBeetle Uint128.
// This is a package-internal helper used by temporal activities.
func uint128FromUint64(v uint64) tb_types.Uint128 {
	return tb_types.ToUint128(v)
}
