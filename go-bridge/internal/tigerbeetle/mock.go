package tigerbeetle

import (
	"encoding/binary"
	"fmt"
	"sync"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// mockAccount stores the in-memory state for a single TigerBeetle account.
type mockAccount struct {
	id            tb_types.Uint128
	ledger        uint32
	code          uint16
	creditsPosted uint64
	debitsPosted  uint64
}

// mockStore is the global in-memory store for mock accounts.
var (
	mockStore   = make(map[string]*mockAccount)
	mockStoreMu sync.Mutex
)

func uint128Key(id tb_types.Uint128) string {
	return id.String()
}

// mockClient implements the same interface as the real TigerBeetle client
// but stores all state in memory.
type mockClient struct{}

func (m *mockClient) EnsureAccount(id tb_types.Uint128, ledger uint32, code uint16) error {
	mockStoreMu.Lock()
	defer mockStoreMu.Unlock()
	k := uint128Key(id)
	if _, ok := mockStore[k]; !ok {
		mockStore[k] = &mockAccount{id: id, ledger: ledger, code: code}
	}
	return nil
}

func (m *mockClient) GetBalance(id tb_types.Uint128) (uint64, error) {
	mockStoreMu.Lock()
	defer mockStoreMu.Unlock()
	k := uint128Key(id)
	acc, ok := mockStore[k]
	if !ok {
		return 0, nil
	}
	if acc.debitsPosted > acc.creditsPosted {
		return 0, nil
	}
	return acc.creditsPosted - acc.debitsPosted, nil
}

func (m *mockClient) Transfer(
	transferID tb_types.Uint128,
	debitAccountID tb_types.Uint128,
	creditAccountID tb_types.Uint128,
	amount uint64,
	ledger uint32,
	code uint16,
) error {
	mockStoreMu.Lock()
	defer mockStoreMu.Unlock()

	dk := uint128Key(debitAccountID)
	ck := uint128Key(creditAccountID)

	if _, ok := mockStore[dk]; !ok {
		mockStore[dk] = &mockAccount{id: debitAccountID, ledger: ledger, code: code}
	}
	if _, ok := mockStore[ck]; !ok {
		mockStore[ck] = &mockAccount{id: creditAccountID, ledger: ledger, code: code}
	}

	mockStore[dk].debitsPosted += amount
	mockStore[ck].creditsPosted += amount
	return nil
}

// BatchTransfers processes a slice of transfers in a single operation.
// The mock applies each transfer sequentially in memory.
// In the real client this maps to a single CreateTransfers call with up to
// 8,190 transfers packed into one 1 MB network message.
func (m *mockClient) BatchTransfers(transfers []tb_types.Transfer) error {
	mockStoreMu.Lock()
	defer mockStoreMu.Unlock()

	for i, t := range transfers {
		dk := uint128Key(t.DebitAccountID)
		ck := uint128Key(t.CreditAccountID)
		// Extract the uint64 value from the Uint128 amount.
		// Uint128 is stored in little-endian order; the low 8 bytes are the
		// uint64 value for all practical payment amounts (high word == 0).
		amountBytes := t.Amount.Bytes()
		amount := binary.LittleEndian.Uint64(amountBytes[:8])

		if _, ok := mockStore[dk]; !ok {
			mockStore[dk] = &mockAccount{id: t.DebitAccountID, ledger: t.Ledger, code: t.Code}
		}
		if _, ok := mockStore[ck]; !ok {
			mockStore[ck] = &mockAccount{id: t.CreditAccountID, ledger: t.Ledger, code: t.Code}
		}

		if mockStore[dk].creditsPosted < mockStore[dk].debitsPosted+amount {
			return fmt.Errorf("BatchTransfers[%d]: insufficient balance", i)
		}
		mockStore[dk].debitsPosted += amount
		mockStore[ck].creditsPosted += amount
	}
	return nil
}

// clientInterface is the interface used by handlers so we can swap in the mock.
type clientInterface interface {
	EnsureAccount(id tb_types.Uint128, ledger uint32, code uint16) error
	GetBalance(id tb_types.Uint128) (uint64, error)
	Transfer(
		transferID tb_types.Uint128,
		debitAccountID tb_types.Uint128,
		creditAccountID tb_types.Uint128,
		amount uint64,
		ledger uint32,
		code uint16,
	) error
	// BatchTransfers submits up to 8,190 transfers in a single 1 MB network
	// message — the TigerBeetle-recommended batch size from the 1B/day benchmark.
	// Each transfer in the slice is independent unless the linked flag is set.
	// Callers should chunk slices larger than TB_MAX_BATCH_SIZE (8,190) before
	// calling this method.
	BatchTransfers(transfers []tb_types.Transfer) error
}

// activeClient is the client used by all handlers.
// It is set by Init (real) or InitMock (test).
var activeClient clientInterface

// InitMock replaces the global client with an in-memory mock.
// This is intended for unit tests only.
func InitMock() error {
	mockStoreMu.Lock()
	mockStore = make(map[string]*mockAccount) // reset state
	mockStoreMu.Unlock()

	activeClient = &mockClient{}
	// Also set globalClient so Get() works
	globalClient = &Client{} // placeholder; handlers use activeClient
	return nil
}

// Get returns the active client interface.
// Handlers should call GetActive() instead of Get() to support mock injection.
func GetActive() clientInterface {
	if activeClient != nil {
		return activeClient
	}
	return globalClient
}
