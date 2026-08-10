package temporal

import (
	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// uint128FromUint64 converts a uint64 to a TigerBeetle Uint128.
func uint128FromUint64(v uint64) tb_types.Uint128 {
	return tb_types.ToUint128(v)
}
