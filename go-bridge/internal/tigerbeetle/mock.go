package tigerbeetle

import (
	"sync"

	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// mockAccount stores the in-memory state for a single TigerBeetle account.
type mockAccount struct {
	id             tb_types.Uint128
	ledger         uint32
	code           uint16
	creditsPosted  uint64
	debitsPosted   uint64
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
