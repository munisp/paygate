package solana

import (
	"errors"
	"regexp"
)

// base58Regex matches valid Solana base58 addresses (32–44 chars, no 0/O/I/l).
var base58Regex = regexp.MustCompile(`^[1-9A-HJ-NP-Za-km-z]{32,44}$`)

// IsValidBase58Address returns true when addr is a syntactically valid Solana
// public key (base58-encoded, 32–44 characters, no ambiguous characters).
// It does NOT perform an on-chain lookup.
func IsValidBase58Address(addr string) bool {
	if addr == "" {
		return false
	}
	return base58Regex.MatchString(addr)
}

// LamportsToUsdc converts a raw lamport value (6 decimal places for USDC SPL
// token) to a human-readable USDC float.
func LamportsToUsdc(lamports uint64) float64 {
	return float64(lamports) / 1_000_000
}

// UsdcToLamports converts a whole-unit USDC amount to the equivalent lamport
// representation used by the SPL token program.
func UsdcToLamports(usdc uint64) uint64 {
	return usdc * 1_000_000
}

// PayoutRequest represents a validated payout instruction before it is
// serialised into an unsigned Solana transaction payload.
type PayoutRequest struct {
	// RecipientAddress is the destination Ed25519 public key (base58).
	RecipientAddress string
	// AmountLamports is the transfer amount in USDC lamports (6 decimal places).
	AmountLamports uint64
	// Network selects the Solana cluster: "mainnet" or "devnet".
	Network string
	// Reference is an optional idempotency / tracing key.
	Reference string
}

// Validate performs basic sanity checks on the payout request.
func (r PayoutRequest) Validate() error {
	if !IsValidBase58Address(r.RecipientAddress) {
		return errors.New("solana: invalid recipient address")
	}
	if r.AmountLamports == 0 {
		return errors.New("solana: amount must be greater than zero")
	}
	if r.Network != "mainnet" && r.Network != "devnet" {
		return errors.New("solana: network must be 'mainnet' or 'devnet'")
	}
	return nil
}
