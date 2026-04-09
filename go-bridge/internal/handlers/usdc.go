// Package handlers implements the HTTP handlers for the PayGate bridge service.
package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/paygate/go-bridge/internal/solana"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/internal/temporal"
	"github.com/paygate/go-bridge/pkg/types"
	gotemporal "go.temporal.io/sdk/client"
)

// ─── Request / Response types ─────────────────────────────────────────────────

type USDCPayoutRequest struct {
	TransferID      string `json:"transfer_id"`
	MerchantID      string `json:"merchant_id"`
	RecipientWallet string `json:"recipient_wallet"` // base58 Solana address
	AmountLamports  uint64 `json:"amount_lamports"`  // 1 USDC = 1_000_000 lamports
	Reference       string `json:"reference"`
}

type USDCPayoutResponse struct {
	WorkflowID string `json:"workflow_id"`
	RunID      string `json:"run_id"`
	Status     string `json:"status"`
}

type USDCWalletValidateRequest struct {
	WalletAddress string `json:"wallet_address"`
}

type USDCWalletValidateResponse struct {
	Valid          bool    `json:"valid"`
	HasTokenAccount bool   `json:"has_token_account"`
	USDCBalance    float64 `json:"usdc_balance"`
	Error          string  `json:"error,omitempty"`
}

type USDCBalanceResponse struct {
	MerchantID     string  `json:"merchant_id"`
	USDCBalance    float64 `json:"usdc_balance_usdc"`
	LamportBalance uint64  `json:"lamport_balance"`
	WalletAddress  string  `json:"wallet_address"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// InitiateUSDCPayout handles POST /v1/usdc/payout
// Dispatches a CrossBorderTransferWorkflow with Corridor="USDC".
// The workflow orchestrates: TigerBeetle escrow → Solana broadcast → finality confirmation.
func InitiateUSDCPayout(w http.ResponseWriter, r *http.Request) {
	var req USDCPayoutRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.TransferID == "" || req.MerchantID == "" || req.RecipientWallet == "" || req.AmountLamports == 0 {
		writeError(w, http.StatusBadRequest, "transfer_id, merchant_id, recipient_wallet, and amount_lamports are required")
		return
	}

	// Validate the recipient wallet has a USDC token account before reserving funds
	sc := solana.NewClient()
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	hasAccount, err := sc.HasUSDCTokenAccount(ctx, req.RecipientWallet)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("wallet validation failed: %v", err))
		return
	}
	if !hasAccount {
		writeError(w, http.StatusUnprocessableEntity,
			"recipient wallet does not have a USDC token account — the recipient must create one first")
		return
	}

	// Dispatch Temporal workflow
	tc, err := temporal.GetClient()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Sprintf("temporal unavailable: %v", err))
		return
	}

	workflowInput := temporal.CrossBorderInput{
		TransferID:      req.TransferID,
		MerchantID:      req.MerchantID,
		Corridors:       "USDC",
		Amount:          int64(req.AmountLamports),
		RecipientWallet: req.RecipientWallet,
		Reference:       req.Reference,
	}

	options := gotemporal.StartWorkflowOptions{
		ID:        fmt.Sprintf("usdc-payout-%s", req.TransferID),
		TaskQueue: temporal.TaskQueue,
	}

	run, err := tc.ExecuteWorkflow(r.Context(), options, temporal.CrossBorderTransferWorkflow, workflowInput)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to start workflow: %v", err))
		return
	}

	writeJSON(w, http.StatusAccepted, USDCPayoutResponse{
		WorkflowID: run.GetID(),
		RunID:      run.GetRunID(),
		Status:     "pending",
	})
}

// ValidateUSDCWallet handles POST /v1/usdc/wallet/validate
// Checks whether a Solana address is valid and has a USDC token account.
// This must be called before registering a recipient wallet to prevent failed payouts.
func ValidateUSDCWallet(w http.ResponseWriter, r *http.Request) {
	var req USDCWalletValidateRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.WalletAddress == "" {
		writeError(w, http.StatusBadRequest, "wallet_address is required")
		return
	}

	sc := solana.NewClient()
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Step 1: Validate the address is a valid Ed25519 public key on-chain
	valid, err := sc.ValidateWalletAddress(ctx, req.WalletAddress)
	if err != nil || !valid {
		writeJSON(w, http.StatusOK, USDCWalletValidateResponse{
			Valid: false,
			Error: fmt.Sprintf("invalid wallet address: %v", err),
		})
		return
	}

	// Step 2: Check for USDC Associated Token Account
	hasTokenAccount, err := sc.HasUSDCTokenAccount(ctx, req.WalletAddress)
	if err != nil {
		writeJSON(w, http.StatusOK, USDCWalletValidateResponse{
			Valid:          true,
			HasTokenAccount: false,
			Error:          fmt.Sprintf("token account check failed: %v", err),
		})
		return
	}

	// Step 3: Get USDC balance if token account exists
	var usdcBalance float64
	if hasTokenAccount {
		lamports, err := sc.GetUSDCBalance(ctx, req.WalletAddress)
		if err == nil {
			usdcBalance = float64(lamports) / 1_000_000 // convert lamports to USDC
		}
	}

	writeJSON(w, http.StatusOK, USDCWalletValidateResponse{
		Valid:          true,
		HasTokenAccount: hasTokenAccount,
		USDCBalance:    usdcBalance,
	})
}

// GetUSDCBalance handles GET /v1/usdc/balance?merchant_id=xxx
// Returns the merchant's USDC balance from TigerBeetle (LedgerUSD=2).
func GetUSDCBalance(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "merchant_id query parameter is required")
		return
	}

	client := tb.GetActive()
	accountID, err := tb.UUIDToID(merchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}

	accounts, err := client.LookupAccounts([]types.Uint128{accountID})
	if err != nil || len(accounts) == 0 {
		writeError(w, http.StatusNotFound, "merchant USDC account not found")
		return
	}

	acc := accounts[0]
	// Credits - Debits = available balance in lamports
	lamportBalance := acc.CreditsPosted - acc.DebitsPosted
	usdcBalance := float64(lamportBalance) / 1_000_000

	writeJSON(w, http.StatusOK, USDCBalanceResponse{
		MerchantID:     merchantID,
		USDCBalance:    usdcBalance,
		LamportBalance: lamportBalance,
	})
}
