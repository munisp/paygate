// Package handlers implements the HTTP handlers for the PayGate bridge service.
package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// ─── helpers ─────────────────────────────────────────────────────────────────


func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, types.ErrorResponse{Error: msg, Code: status})
}

func decodeBody(r *http.Request, dst any) error {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		return fmt.Errorf("JSON decode: %w", err)
	}
	return nil
}

// ─── Debit ────────────────────────────────────────────────────────────────────

// Debit handles POST /v1/wallets/debit
// Moves funds from a wallet account to the settlement float pool.
func Debit(w http.ResponseWriter, r *http.Request) {
	var req types.DebitRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.WalletID == "" || req.Amount == 0 || req.Currency == "" || req.Reference == "" {
		writeError(w, http.StatusBadRequest, "wallet_id, amount, currency, and reference are required")
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	walletID, err := tb.UUIDToID(req.WalletID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid wallet_id: %v", err))
		return
	}

	// Resolve float account
	floatID := tb.FloatAccountID()
	if req.FloatAccountID != "" {
		floatID, err = tb.UUIDToID(req.FloatAccountID)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid float_account_id: %v", err))
			return
		}
	}

	// Ensure both accounts exist
	if err := client.EnsureAccount(walletID, ledger, tb.CodeWallet); err != nil {
		slog.Error("EnsureAccount wallet", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to ensure wallet account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		slog.Error("EnsureAccount float", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Execute debit: wallet → float
	transferID := tb.ReferenceToID(req.Reference)
	if err := client.Transfer(transferID, walletID, floatID, req.Amount, ledger, tb.CodeWallet); err != nil {
		slog.Error("Transfer debit", "err", err, "ref", req.Reference)
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("debit transfer failed: %v", err))
		return
	}

	// Read back new balance
	newBalance, err := client.GetBalance(walletID)
	if err != nil {
		slog.Warn("GetBalance after debit", "err", err)
	}

	slog.Info("wallet debited",
		"wallet_id", req.WalletID,
		"amount", req.Amount,
		"currency", req.Currency,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, types.DebitResponse{
		WalletID:      req.WalletID,
		LedgerEntryID: transferID.String(),
		NewBalance:    newBalance,
		Status:        "debited",
	})
}

// ─── Credit ───────────────────────────────────────────────────────────────────

// Credit handles POST /v1/wallets/credit
// Moves funds from the settlement float pool to a wallet account.
func Credit(w http.ResponseWriter, r *http.Request) {
	var req types.CreditRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.WalletID == "" || req.Amount == 0 || req.Currency == "" || req.Reference == "" {
		writeError(w, http.StatusBadRequest, "wallet_id, amount, currency, and reference are required")
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	walletID, err := tb.UUIDToID(req.WalletID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid wallet_id: %v", err))
		return
	}

	floatID := tb.FloatAccountID()
	if req.FloatAccountID != "" {
		floatID, err = tb.UUIDToID(req.FloatAccountID)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid float_account_id: %v", err))
			return
		}
	}

	if err := client.EnsureAccount(walletID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure wallet account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Execute credit: float → wallet
	transferID := tb.ReferenceToID(req.Reference)
	if err := client.Transfer(transferID, floatID, walletID, req.Amount, ledger, tb.CodeWallet); err != nil {
		slog.Error("Transfer credit", "err", err, "ref", req.Reference)
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("credit transfer failed: %v", err))
		return
	}

	newBalance, err := client.GetBalance(walletID)
	if err != nil {
		slog.Warn("GetBalance after credit", "err", err)
	}

	slog.Info("wallet credited",
		"wallet_id", req.WalletID,
		"amount", req.Amount,
		"currency", req.Currency,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, types.CreditResponse{
		WalletID:      req.WalletID,
		LedgerEntryID: transferID.String(),
		NewBalance:    newBalance,
		Status:        "credited",
	})
}

// ─── Balance ──────────────────────────────────────────────────────────────────

// Balance handles POST /v1/wallets/balance
func Balance(w http.ResponseWriter, r *http.Request) {
	var req types.BalanceRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.WalletID == "" || req.Currency == "" {
		writeError(w, http.StatusBadRequest, "wallet_id and currency are required")
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	walletID, err := tb.UUIDToID(req.WalletID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid wallet_id: %v", err))
		return
	}

	if err := client.EnsureAccount(walletID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure wallet account")
		return
	}

	balance, err := client.GetBalance(walletID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("GetBalance failed: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, types.BalanceResponse{
		WalletID: req.WalletID,
		Balance:  balance,
		Currency: req.Currency,
	})
}

// ─── P2P Transfer ─────────────────────────────────────────────────────────────

// P2PTransfer handles POST /v1/wallets/p2p-transfer
// Executes an atomic sender → receiver transfer in TigerBeetle.
func P2PTransfer(w http.ResponseWriter, r *http.Request) {
	var req types.P2PRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SenderWalletID == "" || req.ReceiverWalletID == "" ||
		req.Amount == 0 || req.Currency == "" || req.Reference == "" {
		writeError(w, http.StatusBadRequest, "sender_wallet_id, receiver_wallet_id, amount, currency, and reference are required")
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	senderID, err := tb.UUIDToID(req.SenderWalletID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid sender_wallet_id: %v", err))
		return
	}
	receiverID, err := tb.UUIDToID(req.ReceiverWalletID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid receiver_wallet_id: %v", err))
		return
	}

	if err := client.EnsureAccount(senderID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure sender account")
		return
	}
	if err := client.EnsureAccount(receiverID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure receiver account")
		return
	}

	// Atomic transfer: sender → receiver
	transferID := tb.ReferenceToID(req.Reference)
	if err := client.Transfer(transferID, senderID, receiverID, req.Amount, ledger, tb.CodeWallet); err != nil {
		slog.Error("P2P transfer", "err", err, "ref", req.Reference)
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("p2p transfer failed: %v", err))
		return
	}

	senderBal, _ := client.GetBalance(senderID)
	receiverBal, _ := client.GetBalance(receiverID)

	slog.Info("p2p transfer completed",
		"sender", req.SenderWalletID,
		"receiver", req.ReceiverWalletID,
		"amount", req.Amount,
		"currency", req.Currency,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, types.P2PResponse{
		TransferID:         transferID.String(),
		SenderNewBalance:   senderBal,
		ReceiverNewBalance: receiverBal,
		Status:             "transferred",
	})
}
