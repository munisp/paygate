// Package tigerbeetle provides a high-level wrapper around the official
// tigerbeetle-go client for use in the PayGate bridge service.
//
// The client is initialised once and shared across all request handlers.
// All operations are synchronous from the caller's perspective; the
// underlying tigerbeetle-go library handles concurrency internally.
package tigerbeetle

import (
	"encoding/binary"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/google/uuid"
	tb "github.com/tigerbeetle/tigerbeetle-go"
	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// ─── Ledger constants ─────────────────────────────────────────────────────────

const (
	LedgerNGN uint32 = 1 // Nigerian Naira (kobo)
	LedgerUSD uint32 = 2 // US Dollar (cents)
	LedgerGHS uint32 = 3 // Ghanaian Cedi (pesewas)
	LedgerKES uint32 = 4 // Kenyan Shilling (cents)
	LedgerZAR uint32 = 5 // South African Rand (cents)
	LedgerEUR uint32 = 6 // Euro (cents)
	LedgerGBP uint32 = 7 // British Pound (pence)

	CodeWallet  uint16 = 1 // merchant / consumer wallet
	CodeEscrow  uint16 = 2 // reserve / escrow account
	CodeFeePool uint16 = 3 // fee collection account
	CodeFloat   uint16 = 4 // settlement float pool
)

// CurrencyToLedger maps an ISO 4217 currency code to a TigerBeetle ledger ID.
func CurrencyToLedger(currency string) uint32 {
	switch currency {
	case "NGN":
		return LedgerNGN
	case "USD":
		return LedgerUSD
	case "GHS":
		return LedgerGHS
	case "KES":
		return LedgerKES
	case "ZAR":
		return LedgerZAR
	case "EUR":
		return LedgerEUR
	case "GBP":
		return LedgerGBP
	default:
		return LedgerNGN
	}
}

// ─── Client ──────────────────────────────────────────────────────────────────

// Client wraps the tigerbeetle-go client with helper methods.
// It implements clientInterface.
type Client struct {
	inner tb.Client
	mu    sync.Mutex
}

var (
	globalClient *Client
	once         sync.Once
	initErr      error
)

// Init initialises the global TigerBeetle client.
// addresses is a comma-separated list of cluster node addresses
// (e.g. "10.0.0.1:3902,10.0.0.2:3902,10.0.0.3:3902" for a 3-node cluster,
// or "127.0.0.1:3902" for a single-node dev setup).
// clusterID is the TigerBeetle cluster ID (usually 0).
func Init(addresses string, clusterID uint64) error {
	once.Do(func() {
		nodes := parseAddresses(addresses)
		c, err := tb.NewClient(tb_types.ToUint128(clusterID), nodes)
		if err != nil {
			initErr = fmt.Errorf("tigerbeetle.NewClient(%v): %w", nodes, err)
			return
		}
		globalClient = &Client{inner: c}
		activeClient = globalClient
	})
	return initErr
}

// parseAddresses splits a comma-separated address string into a slice.
// Whitespace around each address is trimmed.
func parseAddresses(addresses string) []string {
	parts := strings.Split(addresses, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) == 0 {
		return []string{"127.0.0.1:3902"}
	}
	return result
}

// Get returns the global client.  Panics if Init has not been called.
func Get() *Client {
	if globalClient == nil {
		panic("tigerbeetle: client not initialised — call Init() first")
	}
	return globalClient
}

// Close releases the underlying client resources.
func Close() {
	if globalClient != nil {
		globalClient.inner.Close()
	}
}

// DefaultTigerBeetleAddress returns the TigerBeetle address from the
// TIGERBEETLE_ADDRESS environment variable, defaulting to 127.0.0.1:3902.
func DefaultTigerBeetleAddress() string {
	if addr := os.Getenv("TIGERBEETLE_ADDRESS"); addr != "" {
		return addr
	}
	return "127.0.0.1:3902"
}

// ─── Account helpers ──────────────────────────────────────────────────────────

// UUIDToID converts a UUID string to a TigerBeetle 128-bit account ID.
// Falls back to parsing as a plain uint64 if the input is not a UUID.
func UUIDToID(id string) (tb_types.Uint128, error) {
	u, err := uuid.Parse(id)
	if err == nil {
		// UUID bytes → little-endian Uint128 (TigerBeetle stores in LE)
		b := u[:]
		hi := binary.BigEndian.Uint64(b[0:8])
		lo := binary.BigEndian.Uint64(b[8:16])
		// Pack as little-endian bytes for BytesToUint128
		var raw [16]byte
		binary.LittleEndian.PutUint64(raw[0:8], lo)
		binary.LittleEndian.PutUint64(raw[8:16], hi)
		return tb_types.BytesToUint128(raw), nil
	}
	// Try plain integer
	var n uint64
	if _, scanErr := fmt.Sscanf(id, "%d", &n); scanErr != nil {
		return tb_types.Uint128{}, fmt.Errorf("invalid account ID %q: %w", id, err)
	}
	return tb_types.ToUint128(n), nil
}

// FloatAccountID returns the well-known settlement float account ID.
// We use a sentinel value that won't collide with UUID-derived IDs.
func FloatAccountID() tb_types.Uint128 {
	return tb_types.ToUint128(0xFFFFFFFFFFFFFFFE)
}

// ReferenceToID converts a payment reference string to a deterministic
// TigerBeetle 128-bit transfer ID using FNV-1a hashing.
func ReferenceToID(reference string) tb_types.Uint128 {
	const (
		fnvOffset uint64 = 14695981039346656037
		fnvPrime  uint64 = 1099511628211
	)
	h := fnvOffset
	for _, b := range []byte(reference) {
		h ^= uint64(b)
		h *= fnvPrime
	}
	// Use a second pass for the high 64 bits
	h2 := h ^ (h >> 32)
	h2 *= fnvPrime
	var raw [16]byte
	binary.LittleEndian.PutUint64(raw[0:8], h)
	binary.LittleEndian.PutUint64(raw[8:16], h2)
	return tb_types.BytesToUint128(raw)
}

// ─── Client methods ───────────────────────────────────────────────────────────

// EnsureAccount creates a TigerBeetle account if it does not already exist.
// This is idempotent — if the account already exists the call is a no-op.
func (c *Client) EnsureAccount(id tb_types.Uint128, ledger uint32, code uint16) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	existing, err := c.inner.LookupAccounts([]tb_types.Uint128{id})
	if err != nil {
		return fmt.Errorf("LookupAccounts: %w", err)
	}
	if len(existing) > 0 {
		return nil
	}

	accounts := []tb_types.Account{
		{
			ID:     id,
			Ledger: ledger,
			Code:   code,
			Flags:  0,
		},
	}
	results, err := c.inner.CreateAccounts(accounts)
	if err != nil {
		return fmt.Errorf("CreateAccounts: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.AccountOK {
			return fmt.Errorf("CreateAccounts[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}

// GetBalance returns the available balance of an account.
// Available balance = credits_posted - debits_posted.
func (c *Client) GetBalance(id tb_types.Uint128) (uint64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	accounts, err := c.inner.LookupAccounts([]tb_types.Uint128{id})
	if err != nil {
		return 0, fmt.Errorf("LookupAccounts: %w", err)
	}
	if len(accounts) == 0 {
		return 0, nil
	}
	acc := accounts[0]
	cp := acc.CreditsPosted.BigInt()
	dp := acc.DebitsPosted.BigInt()
	if dp.Cmp(&cp) > 0 {
		return 0, nil
	}
	cp.Sub(&cp, &dp)
	return cp.Uint64(), nil
}

// Transfer executes a single TigerBeetle transfer.
func (c *Client) Transfer(
	transferID tb_types.Uint128,
	debitAccountID tb_types.Uint128,
	creditAccountID tb_types.Uint128,
	amount uint64,
	ledger uint32,
	code uint16,
) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	transfers := []tb_types.Transfer{
		{
			ID:              transferID,
			DebitAccountID:  debitAccountID,
			CreditAccountID: creditAccountID,
			Amount:          tb_types.ToUint128(amount),
			Ledger:          ledger,
			Code:            code,
		},
	}
	results, err := c.inner.CreateTransfers(transfers)
	if err != nil {
		return fmt.Errorf("CreateTransfers: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.TransferOK {
			return fmt.Errorf("CreateTransfers[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}

// ─── Batch transfers ────────────────────────────────────────────────────────

// TB_MAX_BATCH_SIZE is the maximum number of transfers per TigerBeetle batch.
// Each transfer is 128 bytes; 8,190 × 128 B = 1,048,320 B ≈ 1 MB — the exact
// size of one TigerBeetle network message envelope.
// Source: https://backend.how/posts/1b-payments-per-day/
const TB_MAX_BATCH_SIZE = 8190

// BatchTransfers submits up to TB_MAX_BATCH_SIZE transfers in a single
// CreateTransfers call. This is the high-throughput path: one kernel
// doorbell ring (io_uring_enter) per ~8,190 transfers instead of one per
// transfer, eliminating the per-transfer network round-trip overhead.
//
// Callers MUST chunk slices larger than TB_MAX_BATCH_SIZE before calling.
// If the slice is empty, BatchTransfers returns nil immediately.
//
// The linked flag on each transfer controls atomicity:
//   - linked=true on transfers[0..n-2] + linked=false on transfers[n-1]
//     makes the entire batch succeed or fail atomically.
//   - All linked=false means each transfer is independent.
func (c *Client) BatchTransfers(transfers []tb_types.Transfer) error {
	if len(transfers) == 0 {
		return nil
	}
	if len(transfers) > TB_MAX_BATCH_SIZE {
		return fmt.Errorf("BatchTransfers: batch size %d exceeds maximum %d", len(transfers), TB_MAX_BATCH_SIZE)
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	results, err := c.inner.CreateTransfers(transfers)
	if err != nil {
		return fmt.Errorf("BatchTransfers CreateTransfers: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.TransferOK {
			return fmt.Errorf("BatchTransfers[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}

// ─── Two-phase transfers ──────────────────────────────────────────────────────

// CodeUSDCEscrow is the TigerBeetle account code for USDC payout escrow accounts.
// These hold funds during the two-phase transfer while awaiting Solana confirmation.
const CodeUSDCEscrow uint16 = 5

// CreatePendingTransfer creates a two-phase transfer in the pending state.
// This locks the funds in escrow without moving them to the final destination.
// The transfer must be resolved with PostPendingTransfer (to complete) or
// VoidPendingTransfer (to rollback) before the timeout expires.
//
// Used for USDC payouts: reserve funds → await Solana confirmation → post.
func (c *Client) CreatePendingTransfer(
	transferID tb_types.Uint128,
	debitAccountID tb_types.Uint128,
	creditAccountID tb_types.Uint128,
	amount uint64,
	ledger uint32,
	code uint16,
	timeout uint32, // seconds until auto-void (0 = no timeout)
) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	transfers := []tb_types.Transfer{
		{
			ID:              transferID,
			DebitAccountID:  debitAccountID,
			CreditAccountID: creditAccountID,
			Amount:          tb_types.ToUint128(amount),
			Ledger:          ledger,
			Code:            code,
			Flags:           tb_types.TransferFlags{Pending: true}.ToUint16(),
			Timeout:         timeout,
		},
	}
	results, err := c.inner.CreateTransfers(transfers)
	if err != nil {
		return fmt.Errorf("CreatePendingTransfer: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.TransferOK {
			return fmt.Errorf("CreatePendingTransfer[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}

// PostPendingTransfer resolves a pending transfer by posting it.
// This moves the funds from escrow to the final destination.
// Called after Solana transaction finality is confirmed.
func (c *Client) PostPendingTransfer(
	pendingID tb_types.Uint128,
	ledger uint32,
	code uint16,
) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	transfers := []tb_types.Transfer{
		{
			ID:        tb_types.ID(), // new unique ID for the post operation
			PendingID: pendingID,
			Ledger:    ledger,
			Code:      code,
			Flags:     tb_types.TransferFlags{PostPendingTransfer: true}.ToUint16(),
		},
	}
	results, err := c.inner.CreateTransfers(transfers)
	if err != nil {
		return fmt.Errorf("PostPendingTransfer: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.TransferOK {
			return fmt.Errorf("PostPendingTransfer[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}

// VoidPendingTransfer cancels a pending transfer and returns the funds to
// the debit account. Used when a Solana transaction fails or times out.
func (c *Client) VoidPendingTransfer(
	pendingID tb_types.Uint128,
	ledger uint32,
	code uint16,
) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	transfers := []tb_types.Transfer{
		{
			ID:        tb_types.ID(), // new unique ID for the void operation
			PendingID: pendingID,
			Ledger:    ledger,
			Code:      code,
			Flags:     tb_types.TransferFlags{VoidPendingTransfer: true}.ToUint16(),
		},
	}
	results, err := c.inner.CreateTransfers(transfers)
	if err != nil {
		return fmt.Errorf("VoidPendingTransfer: %w", err)
	}
	for _, r := range results {
		if r.Result != tb_types.TransferOK {
			return fmt.Errorf("VoidPendingTransfer[%d]: %v", r.Index, r.Result)
		}
	}
	return nil
}
