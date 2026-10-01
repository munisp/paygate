package tigerbeetle

import "testing"

// TestInitMock_ProductionPanics verifies the CRITICAL guard: the in-memory
// mock ledger must never activate when ENV=production.
func TestInitMock_ProductionPanics(t *testing.T) {
	t.Setenv("ENV", "production")
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected InitMock to panic in production")
		}
	}()
	_ = InitMock()
}

// TestInitMock_DevAllowed confirms InitMock still works outside production.
func TestInitMock_DevAllowed(t *testing.T) {
	t.Setenv("ENV", "dev")
	t.Setenv("APP_ENV", "")
	if err := InitMock(); err != nil {
		t.Fatalf("InitMock: %v", err)
	}
}
