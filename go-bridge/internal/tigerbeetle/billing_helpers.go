package tigerbeetle

import (
	"context"
	"fmt"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// TransferRequest holds parameters for a TigerBeetle transfer.
type TransferRequest struct {
	ID              tb_types.Uint128
	DebitAccountID  tb_types.Uint128
	CreditAccountID tb_types.Uint128
	Amount          uint64
	Code            uint16
	Ledger          uint32
	UserData128     tb_types.Uint128
	Flags           uint16 // TigerBeetle transfer flags (e.g. linked=1)
}

// CustomerAccountID returns the TigerBeetle account ID for a customer.
func CustomerAccountID(customerID string) tb_types.Uint128 {
	return ReferenceToID("customer:" + customerID)
}

// MerchantAccountID returns the TigerBeetle account ID for a merchant.
func MerchantAccountID(merchantID string) tb_types.Uint128 {
	return ReferenceToID("merchant:" + merchantID)
}

// NewUUID generates a new UUID string.
func NewUUID() (string, error) {
	id := tb_types.ID()
	return fmt.Sprintf("%x", id.Bytes()), nil
}

// UUIDToUint128 converts a UUID string to a TigerBeetle Uint128.
func UUIDToUint128(uuid string) (tb_types.Uint128, error) {
	return UUIDToID(uuid)
}

// ExecuteTransfer executes a TigerBeetle transfer.
func ExecuteTransfer(_ context.Context, req TransferRequest) error {
	c := GetActive()
	if c == nil {
		return fmt.Errorf("TigerBeetle client not initialised")
	}
	return c.Transfer(
		req.ID,
		req.DebitAccountID,
		req.CreditAccountID,
		req.Amount,
		req.Ledger,
		req.Code,
	)
}
