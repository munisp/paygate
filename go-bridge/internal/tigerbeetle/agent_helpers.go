package tigerbeetle

import (
	"context"
	"crypto/sha256"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// Transfer codes for agent banking
const (
	TransferCodeFloatTopUp    uint16 = 10
	TransferCodeAgentDeposit  uint16 = 11
	TransferCodeAgentWithdraw uint16 = 12
	TransferCodeCommission    uint16 = 13
)

// CreateAccount ensures an account exists in TigerBeetle for the given entity.
// entityType: "agent_float", "merchant", "customer", etc.
func (c *Client) CreateAccount(ctx context.Context, entityID, entityType, ownerID string) error {
	h := sha256.Sum256([]byte(entityType + ":" + entityID))
	var b16 [16]byte
	copy(b16[:], h[:16])
	id := tb_types.BytesToUint128(b16)
	ledger := uint32(1) // NGN ledger
	code := uint16(1)
	switch entityType {
	case "agent_float":
		code = 10
	case "merchant":
		code = 2
	case "customer":
		code = 3
	}
	return c.EnsureAccount(id, ledger, code)
}

// AgentFloatAccountID returns the TigerBeetle account ID for an agent's float account.
func AgentFloatAccountID(agentID string) tb_types.Uint128 {
	h := sha256.Sum256([]byte("agent_float:" + agentID))
	var b16 [16]byte
	copy(b16[:], h[:16])
	return tb_types.BytesToUint128(b16)
}
