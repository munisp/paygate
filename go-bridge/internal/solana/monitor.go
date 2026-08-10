// Package solana — deposit monitor for the Temporal USDCDepositMonitorWorkflow.
//
// This replaces Zoneless's TopUpMonitor. Unlike Zoneless's in-process polling
// loop (which causes duplicate processing in multi-instance deployments), this
// monitor is driven by a Temporal cron workflow that guarantees exactly-once
// execution across all Go bridge replicas.
package solana

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// MonitorConfig holds configuration for the deposit monitor.
type MonitorConfig struct {
	// WatchedWallets is the list of platform wallet addresses to monitor.
	// In production, this is loaded from the database (merchant USDC wallets).
	WatchedWallets []string
	// LastSignatures maps wallet address → last processed signature.
	// Used to avoid reprocessing already-seen transactions.
	LastSignatures map[string]string
}

// DepositScanResult is the result of a single scan cycle.
type DepositScanResult struct {
	WalletAddress  string           `json:"wallet_address"`
	Deposits       []IncomingDeposit `json:"deposits"`
	LastSignature  string           `json:"last_signature"`
	Error          string           `json:"error,omitempty"`
}

// ScanAllWallets scans all watched wallets for new USDC deposits.
// This is called by the Temporal USDCDepositMonitorActivity every 30 seconds.
//
// It returns one DepositScanResult per wallet. Results with deposits are
// published to Kafka (paygate.usdc.deposit.received) by the caller.
func ScanAllWallets(ctx context.Context, cfg MonitorConfig) ([]DepositScanResult, error) {
	client := GetActive()
	results := make([]DepositScanResult, 0, len(cfg.WatchedWallets))

	for _, wallet := range cfg.WatchedWallets {
		since := cfg.LastSignatures[wallet]
		deposits, err := client.ScanWalletForDeposits(ctx, wallet, since)
		result := DepositScanResult{
			WalletAddress: wallet,
		}
		if err != nil {
			slog.Error("[solana] ScanAllWallets: scan failed",
				"wallet", wallet, "err", err)
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		result.Deposits = deposits
		if len(deposits) > 0 {
			// Update the last-seen signature to the most recent deposit.
			result.LastSignature = deposits[len(deposits)-1].Signature
			slog.Info("[solana] ScanAllWallets: new deposits found",
				"wallet", wallet, "count", len(deposits))
		} else {
			result.LastSignature = since // unchanged
		}
		results = append(results, result)
	}
	return results, nil
}

// GetPlatformWallets returns the list of platform USDC wallet addresses to monitor.
// In production this queries the database; in dev it reads from env.
func GetPlatformWallets() []string {
	treasury := os.Getenv("SOLANA_TREASURY_ADDRESS")
	if treasury == "" {
		slog.Warn("[solana] SOLANA_TREASURY_ADDRESS not set — no wallets to monitor")
		return nil
	}
	return []string{treasury}
}

// FormatUSDC converts micro-USDC lamports to a human-readable USDC string.
// 1 USDC = 1_000_000 lamports (6 decimal places).
func FormatUSDC(lamports uint64) string {
	whole := lamports / 1_000_000
	frac := lamports % 1_000_000
	return fmt.Sprintf("%d.%06d USDC", whole, frac)
}

// LamportsToUSDCCents converts micro-USDC lamports to USD cents (2 decimal places).
// Used for TigerBeetle ledger entries (LedgerUSD stores amounts in cents).
func LamportsToUSDCCents(lamports uint64) int64 {
	// 1 USDC = 100 cents = 1_000_000 lamports
	// cents = lamports / 10_000
	return int64(lamports / 10_000)
}

// USDCCentsToLamports converts USD cents to micro-USDC lamports.
func USDCCentsToLamports(cents int64) uint64 {
	return uint64(cents) * 10_000
}

// DepositAge returns how old a deposit is relative to now.
func DepositAge(deposit IncomingDeposit) time.Duration {
	if deposit.BlockTime.IsZero() {
		return 0
	}
	return time.Since(deposit.BlockTime)
}
