package redis

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

// TestMemCacheConcurrent exercises the RWMutex-guarded in-memory cache under
// concurrency (run with -race to catch regressions).
func TestMemCacheConcurrent(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := fmt.Sprintf("k:%d", i%8)
			memSet(key, "v", time.Minute)
			_, _ = memGet(key)
			memIncr(key+":n", time.Minute)
			memDel(key + ":x")
		}(i)
	}
	wg.Wait()
}

// TestSetIdempotencyKey_DevModeFallback confirms dev/test (no Redis, no pg)
// still works with an in-memory-only write and a duplicate is detected.
func TestSetIdempotencyKey_DevModeFallback(t *testing.T) {
	t.Setenv("ENV", "dev")
	t.Setenv("APP_ENV", "")
	c := NewCacheClient(Config{})
	ctx := context.Background()

	ok, err := c.SetIdempotencyKey(ctx, "t-key-1", map[string]interface{}{"r": 1}, time.Hour)
	if err != nil || !ok {
		t.Fatalf("first set: ok=%v err=%v", ok, err)
	}
	ok, err = c.SetIdempotencyKey(ctx, "t-key-1", map[string]interface{}{"r": 1}, time.Hour)
	if err != nil || ok {
		t.Fatalf("duplicate set should be (false,nil): ok=%v err=%v", ok, err)
	}
	if _, found := c.GetIdempotencyResult(ctx, "t-key-1"); !found {
		t.Fatal("expected idempotency result to be retrievable")
	}
}

// TestSetIdempotencyKey_ProductionFailLoud confirms money paths refuse
// in-memory-only writes in production when both Redis and Postgres are down.
func TestSetIdempotencyKey_ProductionFailLoud(t *testing.T) {
	t.Setenv("ENV", "production")
	c := NewCacheClient(Config{})
	ctx := context.Background()

	if _, err := c.SetIdempotencyKey(ctx, "t-key-prod", map[string]interface{}{"r": 1}, time.Hour); err == nil {
		t.Fatal("expected error when no durable backend is available in production")
	}
}

// TestSetTransferState_ProductionFailLoud — same fail-loud guarantee for
// transfer state writes.
func TestSetTransferState_ProductionFailLoud(t *testing.T) {
	t.Setenv("ENV", "production")
	c := NewCacheClient(Config{})

	err := c.SetTransferState(context.Background(), TransferState{
		TransferID: "t-xfer-prod", Status: "pending",
	})
	if err == nil {
		t.Fatal("expected error when no durable backend is available in production")
	}
}

// TestTransferState_DevModeRoundTrip confirms dev mode stores and reads back.
func TestTransferState_DevModeRoundTrip(t *testing.T) {
	t.Setenv("ENV", "dev")
	t.Setenv("APP_ENV", "")
	c := NewCacheClient(Config{})
	ctx := context.Background()

	if err := c.SetTransferState(ctx, TransferState{TransferID: "t-xfer-1", Status: "pending"}); err != nil {
		t.Fatalf("set: %v", err)
	}
	st, found := c.GetTransferState(ctx, "t-xfer-1")
	if !found || st.Status != "pending" {
		t.Fatalf("round trip failed: found=%v state=%+v", found, st)
	}
}
