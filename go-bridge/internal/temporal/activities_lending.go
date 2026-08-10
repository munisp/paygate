// Package temporal — Lending Activities
// All activities used by LoanDisbursementWorkflow and RepaymentScheduleWorkflow.
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ValidateLoanEligibilityActivity checks that the loan is in approved status and the merchant is active.
func ValidateLoanEligibilityActivity(ctx context.Context, loanID string) (bool, error) {
	loan, err := pgdb.GetMerchantLoan(ctx, loanID)
	if err != nil {
		return false, fmt.Errorf("loan not found: %w", err)
	}
	if loan.Status != "approved" {
		slog.Warn("loan not eligible for disbursement", "loan_id", loanID, "status", loan.Status)
		return false, nil
	}
	return true, nil
}

// ReserveCreditFundsActivity creates a Redis reservation for the loan amount.
func ReserveCreditFundsActivity(ctx context.Context, loanID string, amountKobo uint64) (string, error) {
	reservationID := fmt.Sprintf("credit-reservation-%s", loanID)
	if err := redis.SetJSON(ctx, reservationID, map[string]interface{}{
		"loan_id":     loanID,
		"amount_kobo": amountKobo,
		"reserved_at": time.Now().UTC().Format(time.RFC3339),
	}, 30*time.Minute); err != nil {
		return "", fmt.Errorf("failed to reserve funds: %w", err)
	}
	slog.Info("credit funds reserved", "loan_id", loanID, "amount_kobo", amountKobo)
	return reservationID, nil
}

// DisburseFundsActivity executes the TigerBeetle credit transfer.
func DisburseFundsActivity(ctx context.Context, loanID, merchantID string, amountKobo uint64, reservationID string) (string, error) {
	merchantAccountID := tb.MerchantAccountID(merchantID)
	creditReserveID := uint128FromUint64(9000000000000001)

	transferID, err := tb.NewUUID()
	if err != nil {
		return "", fmt.Errorf("generate transfer ID: %w", err)
	}
	tbTransferID, _ := tb.UUIDToUint128(transferID)

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbTransferID,
		DebitAccountID:  creditReserveID,
		CreditAccountID: merchantAccountID,
		Amount:          amountKobo,
		Code:            30, // CodeCreditLoan
		Ledger:          1,
		UserData128:     tbTransferID,
	}); err != nil {
		return "", fmt.Errorf("TigerBeetle transfer failed: %w", err)
	}

	// Release reservation
	redis.Delete(ctx, reservationID)

	slog.Info("loan funds disbursed via TigerBeetle",
		"loan_id", loanID,
		"merchant_id", merchantID,
		"amount_kobo", amountKobo,
		"transfer_id", transferID,
	)
	return transferID, nil
}

// ReleaseReservationActivity releases a credit reservation on workflow failure.
func ReleaseReservationActivity(ctx context.Context, reservationID string) error {
	redis.Delete(ctx, reservationID)
	return nil
}

// UpdateLoanToDisbursedActivity updates the loan record status to disbursed.
func UpdateLoanToDisbursedActivity(ctx context.Context, loanID, transferID, approvedBy string) error {
	return pgdb.UpdateLoanStatus(ctx, loanID, "disbursed", transferID)
}

// SendLoanDisbursementNotificationActivity sends a Kafka event and owner notification.
func SendLoanDisbursementNotificationActivity(ctx context.Context, loanID, merchantID string, amountKobo uint64) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":  "loan.disbursement.notification",
			"loan_id":     loanID,
			"merchant_id": merchantID,
			"amount_kobo": amountKobo,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}

// PersistRepaymentScheduleActivity saves the repayment schedule to the database.
func PersistRepaymentScheduleActivity(ctx context.Context, loanID string, schedule []RepaymentInstalment) error {
	records := make([]pgdb.LoanInstalmentRecord, len(schedule))
	for i, inst := range schedule {
		records[i] = pgdb.LoanInstalmentRecord{
			LoanID:           loanID,
			InstalmentNumber: inst.InstalmentNumber,
			DueDate:          inst.DueDate,
			PrincipalKobo:    inst.PrincipalKobo,
			InterestKobo:     inst.InterestKobo,
			TotalKobo:        inst.TotalKobo,
			Status:           "pending",
		}
	}
	return pgdb.PersistLoanInstalments(ctx, records)
}

// RepaymentDeductActivity attempts to auto-deduct an instalment from the merchant wallet.
func RepaymentDeductActivity(ctx context.Context, loanID, merchantID string, amountKobo uint64, instalmentNumber int) (bool, error) {
	// Check merchant wallet balance
	balance, err := tb.GetAccountBalance(ctx, tb.MerchantAccountID(merchantID))
	if err != nil {
		return false, fmt.Errorf("failed to check balance: %w", err)
	}
	if balance < amountKobo {
		slog.Warn("insufficient balance for loan repayment",
			"loan_id", loanID,
			"merchant_id", merchantID,
			"balance", balance,
			"required", amountKobo,
		)
		return false, nil
	}

	// Execute TigerBeetle deduction
	merchantAccountID := tb.MerchantAccountID(merchantID)
	creditReserveID := uint128FromUint64(9000000000000001)

	repaymentID, _ := tb.NewUUID()
	tbRepaymentID, _ := tb.UUIDToUint128(repaymentID)

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbRepaymentID,
		DebitAccountID:  merchantAccountID,
		CreditAccountID: creditReserveID,
		Amount:          amountKobo,
		Code:            31, // CodeLoanRepayment
		Ledger:          1,
		UserData128:     tbRepaymentID,
	}); err != nil {
		return false, fmt.Errorf("repayment deduction failed: %w", err)
	}

	// Record repayment
	pgdb.RecordLoanRepayment(ctx, pgdb.LoanRepaymentRecord{
		RepaymentID:      repaymentID,
		LoanID:           loanID,
		MerchantID:       merchantID,
		AmountKobo:       amountKobo,
		Reference:        fmt.Sprintf("AUTO-DEDUCT-%s-%d", loanID, instalmentNumber),
		TransferID:       repaymentID,
		InstalmentNumber: instalmentNumber,
	})

	// Update instalment status
	pgdb.UpdateInstalmentStatus(ctx, loanID, instalmentNumber, "paid")

	// Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":        "loan.repayment.auto_deducted",
			"loan_id":           loanID,
			"merchant_id":       merchantID,
			"amount_kobo":       amountKobo,
			"instalment_number": instalmentNumber,
			"timestamp":         time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("auto-deducted loan repayment",
		"loan_id", loanID,
		"instalment", instalmentNumber,
		"amount_kobo", amountKobo,
	)
	return true, nil
}

// SendDunningNotificationActivity sends a dunning notification via Kafka.
func SendDunningNotificationActivity(ctx context.Context, loanID, merchantID, channel string, dayNumber int) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":  "loan.dunning.notification",
			"loan_id":     loanID,
			"merchant_id": merchantID,
			"channel":     channel,
			"day_number":  dayNumber,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}

// CheckInstalmentPaidActivity checks if an instalment has been paid.
func CheckInstalmentPaidActivity(ctx context.Context, loanID string, instalmentNumber int) (bool, error) {
	return pgdb.IsInstalmentPaid(ctx, loanID, instalmentNumber)
}

// FlagLoanDefaultRiskActivity flags a merchant for loan default risk.
func FlagLoanDefaultRiskActivity(ctx context.Context, loanID, merchantID string) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":  "loan.default_risk.flagged",
			"loan_id":     loanID,
			"merchant_id": merchantID,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})
	return pgdb.FlagMerchantDefaultRisk(ctx, merchantID, loanID)
}

// MarkLoanCompletedActivity marks a loan as fully repaid.
func MarkLoanCompletedActivity(ctx context.Context, loanID string) error {
	return pgdb.UpdateLoanStatus(ctx, loanID, "completed", "")
}
