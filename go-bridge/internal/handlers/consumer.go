package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── Consumer Wallet Credit ────────────────────────────────────────────────────

type ConsumerCreditRequest struct {
	UserID      string `json:"user_id"`
	WalletID    string `json:"wallet_id"`
	AmountKobo  int64  `json:"amount_kobo"`
	Currency    string `json:"currency"`
	Reference   string `json:"reference"`
	Description string `json:"description"`
}

type ConsumerCreditResponse struct {
	Success     bool   `json:"success"`
	Reference   string `json:"reference"`
	AmountKobo  int64  `json:"amount_kobo"`
	ProcessedAt string `json:"processed_at"`
}

// ConsumerWalletCredit handles POST /v1/consumer/wallet/credit
func ConsumerWalletCredit(w http.ResponseWriter, r *http.Request) {
	var req ConsumerCreditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" || req.WalletID == "" || req.AmountKobo <= 0 {
		writeError(w, http.StatusBadRequest, "user_id, wallet_id, and amount_kobo are required")
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}

	// TigerBeetle: credit consumer wallet (via transfer from float account)
	tbClient := tb.Get()
	if tbClient != nil {
		accountID, err := tb.UUIDToID(req.WalletID)
		if err == nil {
			floatID := tb.FloatAccountID()
			transferID := tb.ReferenceToID(req.Reference)
			if terr := tbClient.Transfer(transferID, floatID, accountID, uint64(req.AmountKobo), tb.CurrencyToLedger(req.Currency), 0); terr != nil {
				slog.Warn("tigerbeetle consumer credit failed (non-fatal)", "err", terr, "wallet", req.WalletID)
			}
		}
	}

	// Kafka: emit consumer.wallet.credited event
	event := map[string]interface{}{
		"event":       "consumer.wallet.credited",
		"user_id":     req.UserID,
		"wallet_id":   req.WalletID,
		"amount_kobo": req.AmountKobo,
		"currency":    req.Currency,
		"reference":   req.Reference,
		"description": req.Description,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-wallet-events", req.WalletID, event); err != nil {
			slog.Warn("kafka consumer credit event failed (non-fatal)", "err", err)
		}
	}

	slog.Info("consumer wallet credited",
		"user_id", req.UserID,
		"wallet_id", req.WalletID,
		"amount_kobo", req.AmountKobo,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, ConsumerCreditResponse{
		Success:     true,
		Reference:   req.Reference,
		AmountKobo:  req.AmountKobo,
		ProcessedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Consumer Wallet Debit ─────────────────────────────────────────────────────

type ConsumerDebitRequest struct {
	UserID      string `json:"user_id"`
	WalletID    string `json:"wallet_id"`
	AmountKobo  int64  `json:"amount_kobo"`
	Currency    string `json:"currency"`
	Reference   string `json:"reference"`
	Description string `json:"description"`
	TxType      string `json:"tx_type"` // "bill_pay", "qr_pay", "debit"
}

// ConsumerWalletDebit handles POST /v1/consumer/wallet/debit
func ConsumerWalletDebit(w http.ResponseWriter, r *http.Request) {
	var req ConsumerDebitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" || req.WalletID == "" || req.AmountKobo <= 0 {
		writeError(w, http.StatusBadRequest, "user_id, wallet_id, and amount_kobo are required")
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}
	if req.TxType == "" {
		req.TxType = "debit"
	}

	// TigerBeetle: debit consumer wallet (transfer to float account)
	tbClient := tb.Get()
	if tbClient != nil {
		accountID, err := tb.UUIDToID(req.WalletID)
		if err == nil {
			floatID := tb.FloatAccountID()
			transferID := tb.ReferenceToID(req.Reference)
			if terr := tbClient.Transfer(transferID, accountID, floatID, uint64(req.AmountKobo), tb.CurrencyToLedger(req.Currency), 0); terr != nil {
				slog.Warn("tigerbeetle consumer debit failed (non-fatal)", "err", terr, "wallet", req.WalletID)
			}
		}
	}

	// Kafka: emit consumer.wallet.debited event
	event := map[string]interface{}{
		"event":       "consumer.wallet.debited",
		"user_id":     req.UserID,
		"wallet_id":   req.WalletID,
		"amount_kobo": req.AmountKobo,
		"currency":    req.Currency,
		"reference":   req.Reference,
		"description": req.Description,
		"tx_type":     req.TxType,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-wallet-events", req.WalletID, event); err != nil {
			slog.Warn("kafka consumer debit event failed (non-fatal)", "err", err)
		}
	}

	slog.Info("consumer wallet debited",
		"user_id", req.UserID,
		"wallet_id", req.WalletID,
		"amount_kobo", req.AmountKobo,
		"tx_type", req.TxType,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"reference":    req.Reference,
		"amount_kobo":  req.AmountKobo,
		"processed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Consumer P2P Transfer ─────────────────────────────────────────────────────

type ConsumerP2PRequest struct {
	SenderUserID      string `json:"sender_user_id"`
	SenderWalletID    string `json:"sender_wallet_id"`
	RecipientUserID   string `json:"recipient_user_id"`
	RecipientWalletID string `json:"recipient_wallet_id"`
	AmountKobo        int64  `json:"amount_kobo"`
	Currency          string `json:"currency"`
	Reference         string `json:"reference"`
	Note              string `json:"note"`
}

// ConsumerP2PTransfer handles POST /v1/consumer/transfer/p2p
func ConsumerP2PTransfer(w http.ResponseWriter, r *http.Request) {
	var req ConsumerP2PRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SenderWalletID == "" || req.RecipientWalletID == "" || req.AmountKobo <= 0 {
		writeError(w, http.StatusBadRequest, "sender_wallet_id, recipient_wallet_id, and amount_kobo are required")
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}

	// TigerBeetle: double-entry debit sender, credit recipient
	tbClient := tb.Get()
	if tbClient != nil {
		senderID, err1 := tb.UUIDToID(req.SenderWalletID)
		recipientID, err2 := tb.UUIDToID(req.RecipientWalletID)
		if err1 == nil && err2 == nil {
			ledger := tb.CurrencyToLedger(req.Currency)
			transferID := tb.ReferenceToID(req.Reference)
			if terr := tbClient.Transfer(transferID, senderID, recipientID, uint64(req.AmountKobo), ledger, 0); terr != nil {
				slog.Warn("tigerbeetle p2p transfer failed (non-fatal)", "err", terr)
			}
		}
	}

	// Kafka: emit consumer.transfer.p2p event
	event := map[string]interface{}{
		"event":               "consumer.transfer.p2p",
		"sender_user_id":      req.SenderUserID,
		"sender_wallet_id":    req.SenderWalletID,
		"recipient_user_id":   req.RecipientUserID,
		"recipient_wallet_id": req.RecipientWalletID,
		"amount_kobo":         req.AmountKobo,
		"currency":            req.Currency,
		"reference":           req.Reference,
		"note":                req.Note,
		"timestamp":           time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-transfer-events", req.Reference, event); err != nil {
			slog.Warn("kafka p2p transfer event failed (non-fatal)", "err", err)
		}
	}

	slog.Info("consumer p2p transfer",
		"sender", req.SenderWalletID,
		"recipient", req.RecipientWalletID,
		"amount_kobo", req.AmountKobo,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"reference":    req.Reference,
		"amount_kobo":  req.AmountKobo,
		"processed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Consumer Bank Transfer ────────────────────────────────────────────────────

type ConsumerBankTransferRequest struct {
	UserID        string `json:"user_id"`
	WalletID      string `json:"wallet_id"`
	AmountKobo    int64  `json:"amount_kobo"`
	Currency      string `json:"currency"`
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
	Narration     string `json:"narration"`
	Reference     string `json:"reference"`
}

// ConsumerBankTransfer handles POST /v1/consumer/transfer/bank
func ConsumerBankTransfer(w http.ResponseWriter, r *http.Request) {
	var req ConsumerBankTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.WalletID == "" || req.AmountKobo <= 0 || req.BankCode == "" || req.AccountNumber == "" {
		writeError(w, http.StatusBadRequest, "wallet_id, amount_kobo, bank_code, and account_number are required")
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}

	// TigerBeetle: debit consumer wallet (transfer to float account)
	tbClient := tb.Get()
	if tbClient != nil {
		accountID, err := tb.UUIDToID(req.WalletID)
		if err == nil {
			floatID := tb.FloatAccountID()
			ledger := tb.CurrencyToLedger(req.Currency)
			transferID := tb.ReferenceToID(req.Reference)
			if terr := tbClient.Transfer(transferID, accountID, floatID, uint64(req.AmountKobo), ledger, 0); terr != nil {
				slog.Warn("tigerbeetle bank transfer debit failed (non-fatal)", "err", terr)
			}
		}
	}

	// Kafka: emit consumer.transfer.bank event (NIP processor picks this up)
	event := map[string]interface{}{
		"event":          "consumer.transfer.bank",
		"user_id":        req.UserID,
		"wallet_id":      req.WalletID,
		"amount_kobo":    req.AmountKobo,
		"currency":       req.Currency,
		"bank_code":      req.BankCode,
		"account_number": req.AccountNumber,
		"account_name":   req.AccountName,
		"narration":      req.Narration,
		"reference":      req.Reference,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-transfer-events", req.Reference, event); err != nil {
			slog.Warn("kafka bank transfer event failed (non-fatal)", "err", err)
		}
	}

	slog.Info("consumer bank transfer",
		"user_id", req.UserID,
		"bank_code", req.BankCode,
		"amount_kobo", req.AmountKobo,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"reference":    req.Reference,
		"amount_kobo":  req.AmountKobo,
		"status":       "processing",
		"processed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Consumer Bill Pay ─────────────────────────────────────────────────────────

type ConsumerBillPayRequest struct {
	UserID      string `json:"user_id"`
	WalletID    string `json:"wallet_id"`
	AmountKobo  int64  `json:"amount_kobo"`
	Currency    string `json:"currency"`
	BillerCode  string `json:"biller_code"`
	BillerName  string `json:"biller_name"`
	CustomerRef string `json:"customer_ref"`
	Reference   string `json:"reference"`
}

// ConsumerBillPay handles POST /v1/consumer/bill-pay
func ConsumerBillPay(w http.ResponseWriter, r *http.Request) {
	var req ConsumerBillPayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.WalletID == "" || req.AmountKobo <= 0 || req.BillerCode == "" {
		writeError(w, http.StatusBadRequest, "wallet_id, amount_kobo, and biller_code are required")
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}

	// TigerBeetle: debit consumer wallet (transfer to float account)
	tbClient := tb.Get()
	if tbClient != nil {
		accountID, err := tb.UUIDToID(req.WalletID)
		if err == nil {
			floatID := tb.FloatAccountID()
			ledger := tb.CurrencyToLedger(req.Currency)
			transferID := tb.ReferenceToID(req.Reference)
			if terr := tbClient.Transfer(transferID, accountID, floatID, uint64(req.AmountKobo), ledger, 0); terr != nil {
				slog.Warn("tigerbeetle bill pay debit failed (non-fatal)", "err", terr)
			}
		}
	}

	// Kafka: emit consumer.bill.paid event (billing processor picks this up)
	event := map[string]interface{}{
		"event":        "consumer.bill.paid",
		"user_id":      req.UserID,
		"wallet_id":    req.WalletID,
		"amount_kobo":  req.AmountKobo,
		"currency":     req.Currency,
		"biller_code":  req.BillerCode,
		"biller_name":  req.BillerName,
		"customer_ref": req.CustomerRef,
		"reference":    req.Reference,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-billing-events", req.Reference, event); err != nil {
			slog.Warn("kafka bill pay event failed (non-fatal)", "err", err)
		}
	}

	slog.Info("consumer bill pay",
		"user_id", req.UserID,
		"biller_code", req.BillerCode,
		"amount_kobo", req.AmountKobo,
		"reference", req.Reference,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"reference":    req.Reference,
		"amount_kobo":  req.AmountKobo,
		"status":       "processing",
		"processed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Consumer Fraud Score ──────────────────────────────────────────────────────

type ConsumerFraudScoreRequest struct {
	UserID      string  `json:"user_id"`
	WalletID    string  `json:"wallet_id"`
	AmountKobo  int64   `json:"amount_kobo"`
	TxType      string  `json:"tx_type"`
	Reference   string  `json:"reference"`
	IPAddress   string  `json:"ip_address"`
	DeviceID    string  `json:"device_id"`
}

type ConsumerFraudScoreResponse struct {
	Score     int    `json:"score"`
	Verdict   string `json:"verdict"` // "allow", "review", "block"
	Reference string `json:"reference"`
}

// ConsumerFraudScore handles POST /v1/consumer/fraud/score
func ConsumerFraudScore(w http.ResponseWriter, r *http.Request) {
	var req ConsumerFraudScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Simple rule-based scoring (ML service integration via Kafka)
	score := 0
	if req.AmountKobo > 5_000_000_00 { // > 500k NGN
		score += 30
	}
	if req.AmountKobo > 10_000_000_00 { // > 1M NGN
		score += 20
	}
	if req.IPAddress == "" || req.DeviceID == "" {
		score += 15 // missing device info is suspicious
	}

	verdict := "allow"
	if score >= 70 {
		verdict = "block"
	} else if score >= 40 {
		verdict = "review"
	}

	// Emit to Kafka for ML model async scoring
	event := map[string]interface{}{
		"event":       "consumer.fraud.score_requested",
		"user_id":     req.UserID,
		"wallet_id":   req.WalletID,
		"amount_kobo": req.AmountKobo,
		"tx_type":     req.TxType,
		"reference":   req.Reference,
		"ip_address":  req.IPAddress,
		"device_id":   req.DeviceID,
		"rule_score":  score,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}
	if p := kafka.GetProducer(); p != nil {
		if err := p.Publish(context.Background(), "paygate-consumer-fraud-events", req.Reference, event); err != nil {
			slog.Warn("kafka consumer fraud score event failed (non-fatal)", "err", err)
		}
	}

	writeJSON(w, http.StatusOK, ConsumerFraudScoreResponse{
		Score:     score,
		Verdict:   verdict,
		Reference: req.Reference,
	})
}

// ─── Consumer Mobile Sync ──────────────────────────────────────────────────────

type ConsumerSyncRequest struct {
	UserID   string                 `json:"user_id"`
	DeviceID string                 `json:"device_id"`
	Events   []map[string]interface{} `json:"events"`
}

// ConsumerMobileSync handles POST /api/mobile/sync
// Relays offline-queued events from the mobile app to Kafka
func ConsumerMobileSync(w http.ResponseWriter, r *http.Request) {
	var req ConsumerSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	processed := 0
	for _, evt := range req.Events {
		evt["user_id"] = req.UserID
		evt["device_id"] = req.DeviceID
		evt["synced_at"] = time.Now().UTC().Format(time.RFC3339)
		ref := fmt.Sprintf("sync_%s_%d", req.UserID, time.Now().UnixNano())
		if p := kafka.GetProducer(); p != nil {
			_ = p.Publish(context.Background(), "paygate-consumer-mobile-sync", ref, evt)
		}
		processed++
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"processed": processed,
		"total":     len(req.Events),
	})
}
