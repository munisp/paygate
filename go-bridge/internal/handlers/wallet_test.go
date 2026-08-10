package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/paygate/go-bridge/internal/handlers"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// initMock initialises the TigerBeetle client with the mock address.
// The mock client is used when TIGERBEETLE_ADDRESS is set to "mock://".
func initMock(t *testing.T) {
	t.Helper()
	t.Setenv("TIGERBEETLE_ADDRESS", "mock://")
	if err := tb.InitMock(); err != nil {
		t.Fatalf("InitMock: %v", err)
	}
}

func postJSON(t *testing.T, handler http.HandlerFunc, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

func TestCredit(t *testing.T) {
	initMock(t)

	rr := postJSON(t, handlers.Credit, types.CreditRequest{
		WalletID:  "00000000-0000-0000-0000-000000000010",
		Amount:    500_000,
		Currency:  "NGN",
		Reference: "test-credit-go-001",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp types.CreditResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != "credited" {
		t.Errorf("expected status=credited, got %q", resp.Status)
	}
	if resp.NewBalance != 500_000 {
		t.Errorf("expected new_balance=500000, got %d", resp.NewBalance)
	}
	if resp.LedgerEntryID == "" {
		t.Error("expected non-empty ledger_entry_id")
	}
}

func TestDebit(t *testing.T) {
	initMock(t)

	wallet := "00000000-0000-0000-0000-000000000011"

	// Fund first
	postJSON(t, handlers.Credit, types.CreditRequest{
		WalletID:  wallet,
		Amount:    1_000_000,
		Currency:  "NGN",
		Reference: "test-fund-go-011",
	})

	// Debit
	rr := postJSON(t, handlers.Debit, types.DebitRequest{
		WalletID:  wallet,
		Amount:    300_000,
		Currency:  "NGN",
		Reference: "test-debit-go-011",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp types.DebitResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != "debited" {
		t.Errorf("expected status=debited, got %q", resp.Status)
	}
	if resp.NewBalance != 700_000 {
		t.Errorf("expected new_balance=700000, got %d", resp.NewBalance)
	}
}

func TestBalance(t *testing.T) {
	initMock(t)

	wallet := "00000000-0000-0000-0000-000000000012"

	postJSON(t, handlers.Credit, types.CreditRequest{
		WalletID:  wallet,
		Amount:    250_000,
		Currency:  "NGN",
		Reference: "test-fund-go-012",
	})

	rr := postJSON(t, handlers.Balance, types.BalanceRequest{
		WalletID: wallet,
		Currency: "NGN",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp types.BalanceResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Balance != 250_000 {
		t.Errorf("expected balance=250000, got %d", resp.Balance)
	}
}

func TestP2PTransfer(t *testing.T) {
	initMock(t)

	sender := "00000000-0000-0000-0000-000000000013"
	receiver := "00000000-0000-0000-0000-000000000014"

	// Fund sender
	postJSON(t, handlers.Credit, types.CreditRequest{
		WalletID:  sender,
		Amount:    2_000_000,
		Currency:  "NGN",
		Reference: "test-fund-sender-013",
	})

	rr := postJSON(t, handlers.P2PTransfer, types.P2PRequest{
		SenderWalletID:   sender,
		ReceiverWalletID: receiver,
		Amount:           800_000,
		Currency:         "NGN",
		Reference:        "test-p2p-go-013",
	})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp types.P2PResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != "transferred" {
		t.Errorf("expected status=transferred, got %q", resp.Status)
	}
	if resp.SenderNewBalance != 1_200_000 {
		t.Errorf("expected sender_new_balance=1200000, got %d", resp.SenderNewBalance)
	}
	if resp.ReceiverNewBalance != 800_000 {
		t.Errorf("expected receiver_new_balance=800000, got %d", resp.ReceiverNewBalance)
	}
}

func TestMissingFields(t *testing.T) {
	initMock(t)

	rr := postJSON(t, handlers.Credit, types.CreditRequest{
		WalletID: "00000000-0000-0000-0000-000000000099",
		// Amount missing
		Currency:  "NGN",
		Reference: "test-missing",
	})

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}
