package main

import (
	"testing"

	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

func init() {
	// Use TigerBeetle mock client and noop pgdb for all reconciler tests.
	tb.InitMock()
	pgdb.InitNoop()
}

// TestRunReconciliation_NoDB verifies that the reconciler handles a disabled
// pgdb gracefully (returns nil — no balances to compare).
func TestRunReconciliation_NoDB(t *testing.T) {
	// pgdb is not initialised — GetMerchantBalances returns nil, nil.
	// The reconciler should return nil (nothing to compare).
	err := runReconciliation(0)
	if err != nil {
		t.Fatalf("expected nil when pgdb is disabled, got: %v", err)
	}
}

// TestRunReconciliation_ZeroTolerance verifies that a zero tolerance value
// is accepted without error when there are no rows to compare.
func TestRunReconciliation_ZeroTolerance(t *testing.T) {
	err := runReconciliation(0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestRunReconciliation_HighTolerance verifies that a high tolerance value
// does not cause any errors when there are no rows.
func TestRunReconciliation_HighTolerance(t *testing.T) {
	err := runReconciliation(1_000_000_000)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
