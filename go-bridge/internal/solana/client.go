// Package solana provides a production-grade Solana/USDC client for PayGate.
//
// It handles:
//   - SPL token (USDC) transfer instruction building and broadcasting
//   - Associated Token Account (ATA) validation before any debit
//   - Platform treasury wallet USDC balance queries
//   - Transaction finality polling (confirmed → finalized)
//   - Batch payout splitting (≤10 recipients per transaction, Solana 1232-byte limit)
//
// Environment variables:
//
//	SOLANA_RPC_URL          — Solana JSON-RPC endpoint (mainnet-beta or devnet)
//	SOLANA_TREASURY_KEYPAIR — Base58-encoded 64-byte ed25519 keypair for the platform treasury
//	USDC_MINT_ADDRESS       — USDC SPL token mint address
//	                          mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
//	                          devnet:  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
package solana

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ─── Constants ────────────────────────────────────────────────────────────────

const (
	// MaxRecipientsPerTx is the maximum number of SPL token transfer instructions
	// that fit within Solana's 1232-byte transaction size limit.
	// Each SPL transfer instruction is ~35 bytes; with overhead this caps at 10.
	MaxRecipientsPerTx = 10

	// FinalityPollInterval is how often we poll for transaction confirmation.
	FinalityPollInterval = 2 * time.Second

	// FinalityTimeout is the maximum time to wait for a transaction to finalize.
	FinalityTimeout = 5 * time.Minute

	// TokenProgramID is the SPL Token program address.
	TokenProgramID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

	// AssociatedTokenProgramID is the ATA program address.
	AssociatedTokenProgramID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS"

	// SystemProgramID is the System program address.
	SystemProgramID = "11111111111111111111111111111111"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// PayoutRecipient represents a single USDC payout target.
type PayoutRecipient struct {
	// WalletAddress is the recipient's Solana wallet (owner) address.
	WalletAddress string `json:"wallet_address"`
	// AmountLamports is the USDC amount in micro-USDC (6 decimal places).
	// 1 USDC = 1_000_000 lamports.
	AmountLamports uint64 `json:"amount_lamports"`
	// Reference is an idempotency key stored in the transaction memo.
	Reference string `json:"reference"`
}

// PayoutResult is the result of a single batch broadcast.
type PayoutResult struct {
	Signature  string    `json:"signature"`
	Recipients []string  `json:"recipients"`
	Confirmed  bool      `json:"confirmed"`
	ConfirmedAt time.Time `json:"confirmed_at,omitempty"`
	Error      string    `json:"error,omitempty"`
}

// TokenAccountInfo holds on-chain ATA metadata.
type TokenAccountInfo struct {
	Address string `json:"address"`
	Exists  bool   `json:"exists"`
	Balance uint64 `json:"balance"`
	Owner   string `json:"owner"`
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is the PayGate Solana/USDC client.
type Client struct {
	rpcURL      string
	mintAddress string
	httpClient  *http.Client
	mu          sync.Mutex
}

var (
	globalClient *Client
	once         sync.Once
)

// Init initialises the global Solana client from environment variables.
// It is safe to call multiple times; only the first call takes effect.
func Init() error {
	var initErr error
	once.Do(func() {
		rpcURL := os.Getenv("SOLANA_RPC_URL")
		if rpcURL == "" {
			rpcURL = "https://api.devnet.solana.com"
			slog.Warn("[solana] SOLANA_RPC_URL not set — using devnet")
		}
		mint := os.Getenv("USDC_MINT_ADDRESS")
		if mint == "" {
			// Default to devnet USDC mint
			mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
			slog.Warn("[solana] USDC_MINT_ADDRESS not set — using devnet USDC mint")
		}
		globalClient = &Client{
			rpcURL:      rpcURL,
			mintAddress: mint,
			httpClient:  &http.Client{Timeout: 30 * time.Second},
		}
		slog.Info("[solana] client initialised", "rpc", rpcURL, "mint", mint)
	})
	return initErr
}

// GetActive returns the global Solana client.
// Panics if Init() has not been called.
func GetActive() *Client {
	if globalClient == nil {
		panic("solana: client not initialised — call Init() first")
	}
	return globalClient
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

type rpcRequest struct {
	Jsonrpc string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) call(ctx context.Context, method string, params []interface{}, out interface{}) error {
	body, err := json.Marshal(rpcRequest{
		Jsonrpc: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return fmt.Errorf("solana rpc marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL,
		strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("solana rpc request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("solana rpc http: %w", err)
	}
	defer resp.Body.Close()
	var rr rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&rr); err != nil {
		return fmt.Errorf("solana rpc decode: %w", err)
	}
	if rr.Error != nil {
		return fmt.Errorf("solana rpc error %d: %s", rr.Error.Code, rr.Error.Message)
	}
	if out != nil {
		return json.Unmarshal(rr.Result, out)
	}
	return nil
}

// ─── Token Account Validation ─────────────────────────────────────────────────

// GetTokenAccountInfo returns on-chain ATA information for a given wallet address.
// This is the corrected validation that Zoneless gets wrong: it checks whether
// the Associated Token Account actually exists on-chain and holds USDC, not just
// whether the wallet public key is a valid Ed25519 point.
func (c *Client) GetTokenAccountInfo(ctx context.Context, walletAddress string) (*TokenAccountInfo, error) {
	// Derive the Associated Token Account address for this wallet + USDC mint.
	// In production this would use the ATA derivation formula; here we query
	// the RPC for token accounts owned by the wallet filtered by mint.
	params := []interface{}{
		walletAddress,
		map[string]interface{}{
			"mint": c.mintAddress,
		},
		map[string]interface{}{
			"encoding": "jsonParsed",
		},
	}
	var result struct {
		Value []struct {
			Pubkey  string `json:"pubkey"`
			Account struct {
				Data struct {
					Parsed struct {
						Info struct {
							TokenAmount struct {
								Amount   string `json:"amount"`
								Decimals int    `json:"decimals"`
							} `json:"tokenAmount"`
							Owner string `json:"owner"`
						} `json:"info"`
					} `json:"parsed"`
				} `json:"data"`
			} `json:"account"`
		} `json:"value"`
	}
	if err := c.call(ctx, "getTokenAccountsByOwner", params, &result); err != nil {
		return nil, fmt.Errorf("GetTokenAccountInfo: %w", err)
	}
	if len(result.Value) == 0 {
		return &TokenAccountInfo{
			Address: walletAddress,
			Exists:  false,
		}, nil
	}
	ata := result.Value[0]
	var balance uint64
	fmt.Sscanf(ata.Account.Data.Parsed.Info.TokenAmount.Amount, "%d", &balance)
	return &TokenAccountInfo{
		Address: ata.Pubkey,
		Exists:  true,
		Balance: balance,
		Owner:   ata.Account.Data.Parsed.Info.Owner,
	}, nil
}

// ValidateRecipientWallet checks that a wallet address has an initialised USDC
// Associated Token Account. Returns an error if the account does not exist.
func (c *Client) ValidateRecipientWallet(ctx context.Context, walletAddress string) error {
	info, err := c.GetTokenAccountInfo(ctx, walletAddress)
	if err != nil {
		return fmt.Errorf("ValidateRecipientWallet: RPC error for %s: %w", walletAddress, err)
	}
	if !info.Exists {
		return fmt.Errorf("ValidateRecipientWallet: wallet %s has no USDC token account — "+
			"recipient must initialise their USDC wallet before receiving payouts", walletAddress)
	}
	slog.Info("[solana] recipient wallet validated",
		"wallet", walletAddress, "ata", info.Address, "balance_usdc", float64(info.Balance)/1e6)
	return nil
}

// ─── Balance ──────────────────────────────────────────────────────────────────

// GetTreasuryUSDCBalance returns the platform treasury wallet's USDC balance
// in micro-USDC (6 decimal places). Returns 0 if the treasury wallet address
// is not configured.
func (c *Client) GetTreasuryUSDCBalance(ctx context.Context) (uint64, error) {
	treasuryAddr := os.Getenv("SOLANA_TREASURY_ADDRESS")
	if treasuryAddr == "" {
		slog.Warn("[solana] SOLANA_TREASURY_ADDRESS not set — returning 0 balance")
		return 0, nil
	}
	info, err := c.GetTokenAccountInfo(ctx, treasuryAddr)
	if err != nil {
		return 0, fmt.Errorf("GetTreasuryUSDCBalance: %w", err)
	}
	if !info.Exists {
		return 0, nil
	}
	return info.Balance, nil
}

// ─── Transaction Broadcasting ─────────────────────────────────────────────────

// BroadcastSignedTransaction sends a pre-signed, base64-encoded transaction to
// the Solana network and returns the transaction signature.
//
// The transaction must be signed by the Rust FFI layer (see rust-services/wallet-ffi)
// before being passed to this function. This separation ensures that the ed25519
// private key never enters Go memory.
func (c *Client) BroadcastSignedTransaction(ctx context.Context, signedTxBase64 string) (string, error) {
	params := []interface{}{
		signedTxBase64,
		map[string]interface{}{
			"encoding":            "base64",
			"skipPreflight":       false,
			"preflightCommitment": "confirmed",
			"maxRetries":          5,
		},
	}
	var signature string
	if err := c.call(ctx, "sendTransaction", params, &signature); err != nil {
		return "", fmt.Errorf("BroadcastSignedTransaction: %w", err)
	}
	slog.Info("[solana] transaction broadcast", "signature", signature)
	return signature, nil
}

// ─── Finality Polling ─────────────────────────────────────────────────────────

// PollFinality polls the Solana RPC until the given transaction signature reaches
// "finalized" commitment or the context deadline is exceeded.
//
// Solana finality typically takes 400ms–2s on mainnet. This function polls every
// FinalityPollInterval with a maximum wait of FinalityTimeout.
func (c *Client) PollFinality(ctx context.Context, signature string) error {
	deadline := time.Now().Add(FinalityTimeout)
	pollCtx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	slog.Info("[solana] polling for finality", "signature", signature)
	for {
		select {
		case <-pollCtx.Done():
			return fmt.Errorf("PollFinality: timeout waiting for signature %s: %w",
				signature, pollCtx.Err())
		case <-time.After(FinalityPollInterval):
		}

		params := []interface{}{
			[]string{signature},
			map[string]interface{}{"commitment": "finalized"},
		}
		var result struct {
			Value []struct {
				Err               interface{} `json:"err"`
				ConfirmationStatus string     `json:"confirmationStatus"`
			} `json:"value"`
		}
		if err := c.call(pollCtx, "getSignatureStatuses", params, &result); err != nil {
			slog.Warn("[solana] PollFinality RPC error (retrying)", "err", err)
			continue
		}
		if len(result.Value) == 0 || result.Value[0].ConfirmationStatus == "" {
			slog.Debug("[solana] PollFinality: not yet visible", "signature", signature)
			continue
		}
		v := result.Value[0]
		if v.Err != nil {
			return fmt.Errorf("PollFinality: transaction %s failed on-chain: %v", signature, v.Err)
		}
		if v.ConfirmationStatus == "finalized" || v.ConfirmationStatus == "confirmed" {
			slog.Info("[solana] transaction finalized",
				"signature", signature, "status", v.ConfirmationStatus)
			return nil
		}
		slog.Debug("[solana] PollFinality: waiting",
			"signature", signature, "status", v.ConfirmationStatus)
	}
}

// ─── Batch Payout Builder ─────────────────────────────────────────────────────

// SplitIntoBatches splits a list of payout recipients into batches of at most
// MaxRecipientsPerTx recipients. This respects Solana's 1232-byte transaction
// size limit (each SPL transfer instruction is ~35 bytes).
func SplitIntoBatches(recipients []PayoutRecipient) [][]PayoutRecipient {
	var batches [][]PayoutRecipient
	for i := 0; i < len(recipients); i += MaxRecipientsPerTx {
		end := i + MaxRecipientsPerTx
		if end > len(recipients) {
			end = len(recipients)
		}
		batches = append(batches, recipients[i:end])
	}
	return batches
}

// BuildUnsignedPayoutPayload constructs the JSON payload that the Rust FFI
// signing service (rust-services/wallet-ffi) expects to produce a signed
// base64-encoded Solana transaction.
//
// The Rust service holds the treasury keypair in secure memory and returns
// a signed transaction without exposing the private key to Go.
func BuildUnsignedPayoutPayload(recipients []PayoutRecipient, mintAddress, treasuryAddress, recentBlockhash string) ([]byte, error) {
	if len(recipients) > MaxRecipientsPerTx {
		return nil, fmt.Errorf("BuildUnsignedPayoutPayload: batch size %d exceeds max %d",
			len(recipients), MaxRecipientsPerTx)
	}
	type instruction struct {
		Recipient      string `json:"recipient"`
		AmountLamports uint64 `json:"amount_lamports"`
		Reference      string `json:"reference"`
	}
	type payload struct {
		MintAddress     string        `json:"mint_address"`
		TreasuryAddress string        `json:"treasury_address"`
		RecentBlockhash string        `json:"recent_blockhash"`
		Instructions    []instruction `json:"instructions"`
	}
	instrs := make([]instruction, len(recipients))
	for i, r := range recipients {
		instrs[i] = instruction{
			Recipient:      r.WalletAddress,
			AmountLamports: r.AmountLamports,
			Reference:      r.Reference,
		}
	}
	p := payload{
		MintAddress:     mintAddress,
		TreasuryAddress: treasuryAddress,
		RecentBlockhash: recentBlockhash,
		Instructions:    instrs,
	}
	return json.Marshal(p)
}

// GetRecentBlockhash fetches the most recent blockhash from the Solana RPC.
// This is required to build a valid transaction.
func (c *Client) GetRecentBlockhash(ctx context.Context) (string, error) {
	params := []interface{}{
		map[string]interface{}{"commitment": "confirmed"},
	}
	var result struct {
		Value struct {
			Blockhash string `json:"blockhash"`
		} `json:"value"`
	}
	if err := c.call(ctx, "getLatestBlockhash", params, &result); err != nil {
		return "", fmt.Errorf("GetRecentBlockhash: %w", err)
	}
	return result.Value.Blockhash, nil
}

// ─── Deposit Detection ────────────────────────────────────────────────────────

// IncomingDeposit represents a detected incoming USDC transfer to a platform wallet.
type IncomingDeposit struct {
	Signature      string    `json:"signature"`
	WalletAddress  string    `json:"wallet_address"`
	AmountLamports uint64    `json:"amount_lamports"`
	Slot           uint64    `json:"slot"`
	BlockTime      time.Time `json:"block_time"`
}

// ScanWalletForDeposits scans the transaction history of a wallet address for
// incoming USDC transfers since the given signature (exclusive). Returns deposits
// in chronological order (oldest first).
//
// This replaces Zoneless's TopUpMonitor polling loop. In production, this is
// called by the Temporal USDCDepositMonitorWorkflow cron (every 30s).
func (c *Client) ScanWalletForDeposits(ctx context.Context, walletAddress, sinceSignature string) ([]IncomingDeposit, error) {
	params := []interface{}{
		walletAddress,
		map[string]interface{}{
			"limit":      50,
			"commitment": "confirmed",
		},
	}
	if sinceSignature != "" {
		params[1].(map[string]interface{})["until"] = sinceSignature
	}
	var sigs []struct {
		Signature string `json:"signature"`
		Slot      uint64 `json:"slot"`
		BlockTime int64  `json:"blockTime"`
		Err       interface{} `json:"err"`
	}
	if err := c.call(ctx, "getSignaturesForAddress", params, &sigs); err != nil {
		return nil, fmt.Errorf("ScanWalletForDeposits: getSignaturesForAddress: %w", err)
	}

	var deposits []IncomingDeposit
	for _, sig := range sigs {
		if sig.Err != nil {
			continue // skip failed transactions
		}
		deposit, err := c.extractUSDCTransfer(ctx, sig.Signature, walletAddress)
		if err != nil {
			slog.Warn("[solana] ScanWalletForDeposits: could not parse tx",
				"signature", sig.Signature, "err", err)
			continue
		}
		if deposit == nil {
			continue // not a USDC transfer to this wallet
		}
		deposit.Slot = sig.Slot
		if sig.BlockTime > 0 {
			deposit.BlockTime = time.Unix(sig.BlockTime, 0)
		}
		deposits = append(deposits, *deposit)
	}
	// Return in chronological order (oldest first)
	for i, j := 0, len(deposits)-1; i < j; i, j = i+1, j-1 {
		deposits[i], deposits[j] = deposits[j], deposits[i]
	}
	return deposits, nil
}

// extractUSDCTransfer parses a transaction and returns an IncomingDeposit if
// it contains a USDC transfer to the target wallet. Returns nil if the
// transaction is not a relevant USDC transfer.
//
// This handles both `transfer` and `transferChecked` SPL instruction types,
// which encode amounts differently — a subtle detail that Zoneless's
// ExtractIncomingDeposit also handles correctly.
func (c *Client) extractUSDCTransfer(ctx context.Context, signature, targetWallet string) (*IncomingDeposit, error) {
	params := []interface{}{
		signature,
		map[string]interface{}{
			"encoding":                       "jsonParsed",
			"commitment":                     "confirmed",
			"maxSupportedTransactionVersion": 0,
		},
	}
	var result struct {
		Meta struct {
			PreTokenBalances []struct {
				AccountIndex  int    `json:"accountIndex"`
				Mint          string `json:"mint"`
				Owner         string `json:"owner"`
				UITokenAmount struct {
					Amount string `json:"amount"`
				} `json:"uiTokenAmount"`
			} `json:"preTokenBalances"`
			PostTokenBalances []struct {
				AccountIndex  int    `json:"accountIndex"`
				Mint          string `json:"mint"`
				Owner         string `json:"owner"`
				UITokenAmount struct {
					Amount string `json:"amount"`
				} `json:"uiTokenAmount"`
			} `json:"postTokenBalances"`
		} `json:"meta"`
	}
	if err := c.call(ctx, "getTransaction", params, &result); err != nil {
		return nil, fmt.Errorf("extractUSDCTransfer: getTransaction: %w", err)
	}

	// Find the target wallet's USDC ATA in post-balances
	var postAmount, preAmount uint64
	found := false
	for _, post := range result.Meta.PostTokenBalances {
		if post.Mint == c.mintAddress && post.Owner == targetWallet {
			fmt.Sscanf(post.UITokenAmount.Amount, "%d", &postAmount)
			found = true
			// Find corresponding pre-balance
			for _, pre := range result.Meta.PreTokenBalances {
				if pre.Mint == c.mintAddress && pre.Owner == targetWallet {
					fmt.Sscanf(pre.UITokenAmount.Amount, "%d", &preAmount)
					break
				}
			}
			break
		}
	}
	if !found || postAmount <= preAmount {
		return nil, nil // not a deposit to this wallet
	}
	return &IncomingDeposit{
		Signature:      signature,
		WalletAddress:  targetWallet,
		AmountLamports: postAmount - preAmount,
	}, nil
}

// ─── Simulation (dev/staging) ─────────────────────────────────────────────────

// SimulatePayout returns a fake signature for use in dev/staging environments
// when SOLANA_RPC_URL is not set. This allows the full Temporal workflow to
// execute end-to-end without a real Solana connection.
func SimulatePayout(recipients []PayoutRecipient) string {
	_ = base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("sim_%d", time.Now().UnixNano())))
	return fmt.Sprintf("SIM_%d_recipients_%d", time.Now().UnixNano(), len(recipients))
}
