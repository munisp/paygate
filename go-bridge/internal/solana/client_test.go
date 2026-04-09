package solana_test

import (
	"testing"

	"github.com/paygate/bridge/internal/solana"
)

// TestValidateWalletAddress tests the Ed25519 + token account pre-check logic.
// These tests run without a live Solana RPC — they exercise the address
// validation and error-path behaviour of the client.
func TestValidateWalletAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		address     string
		expectValid bool
	}{
		{
			name:        "valid base58 address",
			address:     "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			expectValid: true,
		},
		{
			name:        "empty address",
			address:     "",
			expectValid: false,
		},
		{
			name:        "too short",
			address:     "abc123",
			expectValid: false,
		},
		{
			name:        "too long",
			address:     "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			expectValid: false,
		},
		{
			name:        "invalid base58 characters (0, O, I, l)",
			address:     "0xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			expectValid: false,
		},
		{
			name:        "valid devnet faucet address",
			address:     "4Nd1mBQtrMJVYVfKf2PX99kkXoHf9Q6NRM9gkZJBrKZg",
			expectValid: true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := solana.IsValidBase58Address(tc.address)
			if got != tc.expectValid {
				t.Errorf("IsValidBase58Address(%q) = %v, want %v", tc.address, got, tc.expectValid)
			}
		})
	}
}

// TestLamportsToUsdc tests the USDC lamport conversion helper.
func TestLamportsToUsdc(t *testing.T) {
	t.Parallel()

	tests := []struct {
		lamports uint64
		want     float64
	}{
		{lamports: 1_000_000, want: 1.0},
		{lamports: 500_000, want: 0.5},
		{lamports: 1, want: 0.000001},
		{lamports: 0, want: 0.0},
		{lamports: 1_000_000_000, want: 1000.0},
	}

	for _, tc := range tests {
		tc := tc
		t.Run("", func(t *testing.T) {
			t.Parallel()
			got := solana.LamportsToUsdc(tc.lamports)
			if got != tc.want {
				t.Errorf("LamportsToUsdc(%d) = %f, want %f", tc.lamports, got, tc.want)
			}
		})
	}
}

// TestUsdcToLamports tests the reverse conversion.
func TestUsdcToLamports(t *testing.T) {
	t.Parallel()

	tests := []struct {
		usdc uint64
		want uint64
	}{
		{usdc: 1, want: 1_000_000},
		{usdc: 100, want: 100_000_000},
		{usdc: 0, want: 0},
	}

	for _, tc := range tests {
		tc := tc
		t.Run("", func(t *testing.T) {
			t.Parallel()
			got := solana.UsdcToLamports(tc.usdc)
			if got != tc.want {
				t.Errorf("UsdcToLamports(%d) = %d, want %d", tc.usdc, got, tc.want)
			}
		})
	}
}

// TestPayoutRequestValidation tests the payout request validation logic.
func TestPayoutRequestValidation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		req         solana.PayoutRequest
		expectError bool
	}{
		{
			name: "valid mainnet request",
			req: solana.PayoutRequest{
				RecipientAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
				AmountLamports:   1_000_000,
				Network:          "mainnet",
				Reference:        "order-123",
			},
			expectError: false,
		},
		{
			name: "zero amount",
			req: solana.PayoutRequest{
				RecipientAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
				AmountLamports:   0,
				Network:          "mainnet",
			},
			expectError: true,
		},
		{
			name: "invalid recipient",
			req: solana.PayoutRequest{
				RecipientAddress: "",
				AmountLamports:   1_000_000,
				Network:          "mainnet",
			},
			expectError: true,
		},
		{
			name: "invalid network",
			req: solana.PayoutRequest{
				RecipientAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
				AmountLamports:   1_000_000,
				Network:          "testnet", // only mainnet and devnet are supported
			},
			expectError: true,
		},
		{
			name: "valid devnet request",
			req: solana.PayoutRequest{
				RecipientAddress: "4Nd1mBQtrMJVYVfKf2PX99kkXoHf9Q6NRM9gkZJBrKZg",
				AmountLamports:   500_000,
				Network:          "devnet",
			},
			expectError: false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.req.Validate()
			if (err != nil) != tc.expectError {
				t.Errorf("PayoutRequest.Validate() error = %v, expectError = %v", err, tc.expectError)
			}
		})
	}
}
