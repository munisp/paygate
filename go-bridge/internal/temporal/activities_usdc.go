// Package temporal — USDC payout activity implementations.
//
// This file extends ActivitySet with USDC-specific activities:
//   - ReserveUSDCFunds: TigerBeetle two-phase escrow lock
//   - ExecuteUSDCPayout: Solana SPL token transfer via Rust FFI signer
//   - ConfirmSolanaTransaction: finality poll + TigerBeetle post/void
//   - ScanUSDCDeposits: cron deposit monitor
//
// All activities integrate with:
//   - TigerBeetle (two-phase transfers, LedgerUSD)
//   - Solana client (internal/solana)
//   - Rust FFI signer (rust-services/wallet-ffi via HTTP)
//   - Kafka (paygate.usdc.payout.settled, paygate.usdc.deposit.received)
package temporal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/solana"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

// ─── USDC Payout Input ────────────────────────────────────────────────────────

// USDCPayoutInput carries state between USDC payout workflow activities.
// Fields are populated progressively as the workflow advances.
type USDCPayoutInput struct {
	TransferID           string `json:"transfer_id"`
	MerchantID           string `json:"merchant_id"`
	RecipientWallet      string `json:"recipient_wallet"`
	AmountLamports       uint64 `json:"amount_lamports"` // micro-USDC (6 decimals)
	Reference            string `json:"reference"`
	PendingTransferIDHex string `json:"pending_transfer_id_hex,omitempty"` // set after ReserveUSDCFunds
	SolanaSignature      string `json:"solana_signature,omitempty"`         // set after ExecuteUSDCPayout
}

// ─── Activity: ReserveUSDCFunds ───────────────────────────────────────────────

// ReserveUSDCFunds locks the merchant's USDC balance in a TigerBeetle
// two-phase escrow transfer. Returns the pending transfer ID (hex) to be
// passed to subsequent activities.
//
// This is the first step in the USDC payout workflow. It ensures funds are
// locked before any Solana broadcast begins, eliminating the pre-debit race
// condition found in Zoneless's Payout.ts.
func (a *ActivitySet) ReserveUSDCFunds(ctx context.Context, input USDCPayoutInput) (string, error) {
	slog.Info("[activity] ReserveUSDCFunds",
		"transfer_id", input.TransferID,
		"merchant_id", input.MerchantID,
		"amount_lamports", input.AmountLamports)

	tbClient := tb.Get()

	// Derive TigerBeetle account IDs
	merchantAccID, err := tb.UUIDToID(input.MerchantID)
	if err != nil {
		return "", fmt.Errorf("ReserveUSDCFunds: invalid merchant ID: %w", err)
	}
	escrowAccID := tb.FloatAccountID() // platform USDC escrow account

	// Ensure the USDC escrow account exists
	if err := tbClient.EnsureAccount(escrowAccID, tb.LedgerUSD, tb.CodeUSDCEscrow); err != nil {
		return "", fmt.Errorf("ReserveUSDCFunds: ensure escrow account: %w", err)
	}

	// Convert lamports to USD cents for TigerBeetle (LedgerUSD stores in cents)
	// 1 USDC = 1_000_000 lamports = 100 cents → 1 cent = 10_000 lamports
	amountCents := input.AmountLamports / 10_000
	if amountCents == 0 {
		return "", fmt.Errorf("ReserveUSDCFunds: amount too small (min 10,000 lamports = 0.01 USDC)")
	}

	// Create the pending transfer (escrow lock)
	pendingID := tb.ReferenceToID("usdc-reserve-" + input.TransferID)
	const payoutTimeoutSeconds = 300 // 5 minutes — matches Temporal activity timeout
	if err := tbClient.CreatePendingTransfer(
		pendingID,
		merchantAccID,
		escrowAccID,
		amountCents,
		tb.LedgerUSD,
		tb.CodeUSDCEscrow,
		payoutTimeoutSeconds,
	); err != nil {
		return "", fmt.Errorf("ReserveUSDCFunds: CreatePendingTransfer: %w", err)
	}

	// Encode the pending ID as hex for passing between activities
	pendingIDBytes := pendingID.Bytes()
	pendingIDHex := fmt.Sprintf("%x", pendingIDBytes)

	slog.Info("[activity] ReserveUSDCFunds: funds reserved",
		"transfer_id", input.TransferID,
		"pending_id_hex", pendingIDHex,
		"amount_cents", amountCents)

	return pendingIDHex, nil
}

// ─── Activity: ExecuteUSDCPayout ──────────────────────────────────────────────

// ExecuteUSDCPayout broadcasts the USDC transfer to the Solana network.
// It calls the Rust FFI signing service to sign the transaction, then
// broadcasts the signed transaction via the Solana client.
//
// Returns the Solana transaction signature.
func (a *ActivitySet) ExecuteUSDCPayout(ctx context.Context, input USDCPayoutInput) (string, error) {
	slog.Info("[activity] ExecuteUSDCPayout",
		"transfer_id", input.TransferID,
		"recipient", input.RecipientWallet,
		"amount_lamports", input.AmountLamports)

	solanaRPCURL := os.Getenv("SOLANA_RPC_URL")
	if solanaRPCURL == "" {
		// Dev/staging simulation mode — return a deterministic fake signature
		sig := fmt.Sprintf("SIM_%s_%d", input.TransferID[:8], time.Now().Unix())
		slog.Warn("[activity] ExecuteUSDCPayout: SOLANA_RPC_URL not set — simulating",
			"simulated_signature", sig)
		return sig, nil
	}

	client := solana.GetActive()

	// Step 1: Validate recipient has a USDC token account on-chain
	if err := client.ValidateRecipientWallet(ctx, input.RecipientWallet); err != nil {
		return "", fmt.Errorf("ExecuteUSDCPayout: %w", err)
	}

	// Step 2: Get recent blockhash for transaction construction
	blockhash, err := client.GetRecentBlockhash(ctx)
	if err != nil {
		return "", fmt.Errorf("ExecuteUSDCPayout: GetRecentBlockhash: %w", err)
	}

	// Step 3: Build the unsigned payout payload for the Rust FFI signer
	mintAddress := os.Getenv("USDC_MINT_ADDRESS")
	treasuryAddress := os.Getenv("SOLANA_TREASURY_ADDRESS")
	if mintAddress == "" || treasuryAddress == "" {
		return "", fmt.Errorf("ExecuteUSDCPayout: USDC_MINT_ADDRESS and SOLANA_TREASURY_ADDRESS must be set")
	}

	recipients := []solana.PayoutRecipient{{
		WalletAddress:  input.RecipientWallet,
		AmountLamports: input.AmountLamports,
		Reference:      input.Reference,
	}}
	payload, err := solana.BuildUnsignedPayoutPayload(recipients, mintAddress, treasuryAddress, blockhash)
	if err != nil {
		return "", fmt.Errorf("ExecuteUSDCPayout: BuildUnsignedPayoutPayload: %w", err)
	}

	// Step 4: Call the Rust FFI signing service
	signedTxBase64, err := callRustFFISigner(ctx, payload)
	if err != nil {
		return "", fmt.Errorf("ExecuteUSDCPayout: Rust FFI signer: %w", err)
	}

	// Step 5: Broadcast the signed transaction
	signature, err := client.BroadcastSignedTransaction(ctx, signedTxBase64)
	if err != nil {
		return "", fmt.Errorf("ExecuteUSDCPayout: BroadcastSignedTransaction: %w", err)
	}

	slog.Info("[activity] ExecuteUSDCPayout: transaction broadcast",
		"transfer_id", input.TransferID,
		"signature", signature)

	return signature, nil
}

// ─── Activity: ConfirmSolanaTransaction ──────────────────────────────────────

// ConfirmSolanaTransaction polls for Solana finality and then posts the
// TigerBeetle pending transfer to complete the two-phase transfer.
//
// On success: TigerBeetle escrow → posted, Kafka event published.
// On failure: TigerBeetle pending transfer is voided (funds returned).
func (a *ActivitySet) ConfirmSolanaTransaction(ctx context.Context, input USDCPayoutInput) error {
	slog.Info("[activity] ConfirmSolanaTransaction",
		"transfer_id", input.TransferID,
		"signature", input.SolanaSignature,
		"pending_id_hex", input.PendingTransferIDHex)

	tbClient := tb.Get()

	// Decode the pending transfer ID from hex
	var pendingIDBytes [16]byte
	if _, err := fmt.Sscanf(input.PendingTransferIDHex, "%x", &pendingIDBytes); err != nil {
		return fmt.Errorf("ConfirmSolanaTransaction: decode pending ID: %w", err)
	}
	pendingID := tb_types.BytesToUint128(pendingIDBytes)

	// Simulation mode: skip Solana polling for SIM_ prefixed signatures
	isSimulated := len(input.SolanaSignature) >= 4 && input.SolanaSignature[:4] == "SIM_"
	if os.Getenv("SOLANA_RPC_URL") == "" || isSimulated {
		slog.Warn("[activity] ConfirmSolanaTransaction: simulation mode — posting without Solana poll")
		if err := tbClient.PostPendingTransfer(pendingID, tb.LedgerUSD, tb.CodeUSDCEscrow); err != nil {
			return fmt.Errorf("ConfirmSolanaTransaction: PostPendingTransfer (sim): %w", err)
		}
		return a.publishUSDCPayoutSettled(ctx, input)
	}

	// Poll for Solana finality
	client := solana.GetActive()
	if err := client.PollFinality(ctx, input.SolanaSignature); err != nil {
		// Finality failed — void the pending transfer to return funds
		slog.Error("[activity] ConfirmSolanaTransaction: finality failed — voiding escrow",
			"transfer_id", input.TransferID, "err", err)
		if voidErr := tbClient.VoidPendingTransfer(pendingID, tb.LedgerUSD, tb.CodeUSDCEscrow); voidErr != nil {
			slog.Error("[activity] ConfirmSolanaTransaction: VoidPendingTransfer failed",
				"transfer_id", input.TransferID, "err", voidErr)
		}
		return fmt.Errorf("ConfirmSolanaTransaction: %w", err)
	}

	// Finality confirmed — post the pending transfer
	if err := tbClient.PostPendingTransfer(pendingID, tb.LedgerUSD, tb.CodeUSDCEscrow); err != nil {
		return fmt.Errorf("ConfirmSolanaTransaction: PostPendingTransfer: %w", err)
	}

	slog.Info("[activity] ConfirmSolanaTransaction: transfer confirmed and posted",
		"transfer_id", input.TransferID,
		"signature", input.SolanaSignature)

	return a.publishUSDCPayoutSettled(ctx, input)
}

// publishUSDCPayoutSettled publishes a Kafka event after a USDC payout settles.
func (a *ActivitySet) publishUSDCPayoutSettled(ctx context.Context, input USDCPayoutInput) error {
	producer := kafka.GetProducer()
	evt := kafka.USDCPayoutEvent{
		PayoutID:        input.TransferID,
		MerchantID:      input.MerchantID,
		RecipientWallet: input.RecipientWallet,
		AmountLamports:  input.AmountLamports,
		SolanaSignature: input.SolanaSignature,
		Reference:       input.Reference,
		SettledAt:       time.Now().UTC().Format(time.RFC3339),
	}
	if err := producer.PublishUSDCPayout(ctx, evt); err != nil {
		slog.Warn("[activity] publishUSDCPayoutSettled: Kafka publish failed", "err", err)
		// Non-fatal: the transfer is already settled in TigerBeetle
	}
	return nil
}

// ─── Activity: ScanUSDCDeposits ───────────────────────────────────────────────

// ScanUSDCDeposits is the Temporal cron activity for the deposit monitor.
// It scans all platform USDC wallets for new deposits and publishes
// paygate.usdc.deposit.received events to Kafka.
//
// Called every 30 seconds by the USDCDepositMonitorWorkflow cron.
func (a *ActivitySet) ScanUSDCDeposits(ctx context.Context) error {
	slog.Info("[activity] ScanUSDCDeposits: starting scan")

	wallets := solana.GetPlatformWallets()
	if len(wallets) == 0 {
		slog.Debug("[activity] ScanUSDCDeposits: no wallets to monitor")
		return nil
	}

	cfg := solana.MonitorConfig{
		WatchedWallets: wallets,
		LastSignatures: make(map[string]string),
	}
	results, err := solana.ScanAllWallets(ctx, cfg)
	if err != nil {
		return fmt.Errorf("ScanUSDCDeposits: %w", err)
	}

	producer := kafka.GetProducer()
	for _, result := range results {
		if result.Error != "" {
			slog.Warn("[activity] ScanUSDCDeposits: scan error",
				"wallet", result.WalletAddress, "err", result.Error)
			continue
		}
		for _, deposit := range result.Deposits {
			slog.Info("[activity] ScanUSDCDeposits: new deposit",
				"wallet", deposit.WalletAddress,
				"amount_usdc", solana.FormatUSDC(deposit.AmountLamports),
				"signature", deposit.Signature)
			evt := kafka.USDCDepositEvent{
				WalletAddress:  deposit.WalletAddress,
				AmountLamports: deposit.AmountLamports,
				Signature:      deposit.Signature,
				Slot:           deposit.Slot,
				DetectedAt:     time.Now().UTC().Format(time.RFC3339),
			}
			if err := producer.PublishUSDCDeposit(ctx, evt); err != nil {
				slog.Warn("[activity] ScanUSDCDeposits: Kafka publish failed", "err", err)
			}
		}
	}
	slog.Info("[activity] ScanUSDCDeposits: scan complete", "wallets_scanned", len(results))
	return nil
}

// ─── Rust FFI Signer ──────────────────────────────────────────────────────────

// callRustFFISigner sends an unsigned transaction payload to the Rust FFI
// signing service (rust-services/wallet-ffi) via its HTTP API and returns
// the base64-encoded signed transaction.
//
// The Rust service holds the treasury ed25519 keypair in secure memory and
// never exposes the private key to Go.
func callRustFFISigner(ctx context.Context, payload []byte) (string, error) {
	signerURL := os.Getenv("RUST_FFI_SIGNER_URL")
	if signerURL == "" {
		signerURL = "http://localhost:8099"
		slog.Warn("[activity] callRustFFISigner: RUST_FFI_SIGNER_URL not set — using localhost:8099")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		signerURL+"/v1/sign/usdc-transfer",
		bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("callRustFFISigner: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", os.Getenv("MIDDLEWARE_INTERNAL_KEY"))

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("callRustFFISigner: HTTP call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("callRustFFISigner: signer returned status %d", resp.StatusCode)
	}

	var result struct {
		SignedTxBase64 string `json:"signed_tx_base64"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("callRustFFISigner: decode response: %w", err)
	}
	if result.SignedTxBase64 == "" {
		return "", fmt.Errorf("callRustFFISigner: empty signed transaction")
	}
	return result.SignedTxBase64, nil
}
