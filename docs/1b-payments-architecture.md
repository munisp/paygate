# 1B Payments/Day Architecture Lessons Applied to PayGate

> Source: [backend.how/posts/1b-payments-per-day](https://backend.how/posts/1b-payments-per-day/) and [github.com/pratikgajjar/1b-payments](https://github.com/pratikgajjar/1b-payments)

## Summary of Key Findings

India's UPI processed **20+ billion transactions/month** by February 2026 — ~700 million/day growing at 28% YoY. A single bank shard handling 1B/day needs ~12,000 average TPS, 30,000 TPS at daily peak (11AM + 8-10PM), and 60,000 TPS for seasonal peaks (Diwali, month-end, tax deadlines).

The benchmark compared **TigerBeetle** (Zig, single-threaded, `io_uring` + `O_DIRECT`) vs **PostgreSQL 17** on identical hardware (Apple M4 Mac Mini, 10-core, 24 GB RAM):

| Operation | TigerBeetle | PostgreSQL | Ratio |
|---|---|---|---|
| 10M accounts (bulk) | 12.3s (815K/s) | 22.3s COPY (449K/s) | **1.8×** |
| 10M accounts (per-row) | 12.3s (815K/s) | 12m46s INSERT (13K/s) | **62×** |
| Transfers throughput | ~48K sustained / 63K burst | 3,356 RPS | **~14×** |
| Storage amplification | 8.2× | 1.2× | PG wins |
| fsyncs per row | **0** | 0.42 | ∞ |
| io_uring_enter per 100K rows | 4,225 | n/a | — |

**The lesson:** PostgreSQL spent 89% of wall-clock time on 4.17 million `fdatasync()` calls for 10M inserts. TigerBeetle made **zero** fsync calls — durability via `O_DIRECT` + circular WAL + checksums.

---

## Lessons Applied to PayGate

### ✅ Already Implemented

| Lesson | PayGate Implementation |
|---|---|
| **TigerBeetle double-entry ledger** | `go-bridge/internal/tigerbeetle/client.go` — full TB client with `CreateAccounts`, `CreateTransfers`, `LookupAccounts` |
| **Batch size = 8,190** | `TB_MAX_BATCH_SIZE = 8190` in `client.go:286` — exactly matches TB's 1 MB message envelope |
| **`BatchTransfers()` function** | `client.go:300` — submits up to 8,190 transfers in one network call |
| **Idempotency keys** | `server/idempotency.ts` — SHA-256 request hashing, Redis-backed, 24-hour TTL |
| **Redis sliding-window rate limiter** | `server/rateLimit.ts` — per-procedure, per-user, ZADD+ZREMRANGEBYSCORE pipeline |
| **Multiple currency ledgers** | `LedgerNGN=1, LedgerUSD=2, LedgerGHS=3, LedgerKES=4, LedgerZAR=5, LedgerEUR=6, LedgerGBP=7` |
| **TigerBeetle ↔ PostgreSQL reconciliation** | `go-bridge/cmd/reconciler/` — balance mismatch detection |
| **Account balance checkpointing** | `drizzle/schema.ts:1454` — `reconciliation_discrepancies` table |

### ✅ Newly Added in This Sprint

| Lesson | PayGate Implementation |
|---|---|
| **Hot/Warm/Cold tiering** | `server/tieringArchival.ts` — 3-tier archival pipeline with S3 cold storage |
| **Capacity planning math** | `estimateCapacity()` — napkin-math TPS/storage estimator |
| **TPS capacity health check** | `checkTpsCapacity()` — real-time utilization vs 3 thresholds |
| **Day-partitioned archival** | Archives transactions by day (128 GB/day raw → ~27 GB/day compressed) |

---

## Architecture Decision: TigerBeetle + PostgreSQL (Both)

> "The question isn't 'which is better' — it's 'where does each one belong in the same system?'"
> — Pratik Gajjar

**TigerBeetle handles:** debit A, credit B, enforce balance invariants, commit — millions of times/day.

**PostgreSQL handles:** KYC, disputes, merchant metadata, reporting, analytics, anything needing JOINs.

PayGate uses **both** — TigerBeetle via the Go bridge for the hot ledger path, PostgreSQL (MySQL/TiDB) for all business logic tables.

---

## Capacity Planning for PayGate

Using `estimateCapacity()` from `server/tieringArchival.ts`:

### 100M transactions/day (Nigerian market scale)
```
avgTps:              1,157 TPS
dailyPeakTps:        2,893 TPS
seasonalPeakTps:     5,787 TPS
rawDataPerDayGb:     12.8 GB
hotStoragePerDayGb:  105 GB (8.2× LSM amplification)
coldStoragePerDayGb: 2.7 GB (4.7× zstd compression)
hotTierTotalTb:      57 TB (90-day × 6 replicas)
coldTierTotalTb:     9.9 TB (10-year cold)
recommendedClusters: 1
coldTierMonthlyCostUsd: $228/month
```

### 1B transactions/day (UPI scale)
```
avgTps:              11,574 TPS
dailyPeakTps:        28,935 TPS
seasonalPeakTps:     57,870 TPS
rawDataPerDayGb:     128 GB
hotStoragePerDayGb:  1,050 GB (1 TB/day)
coldStoragePerDayGb: 27.2 GB
hotTierTotalTb:      567 TB (90-day × 6 replicas)
coldTierTotalTb:     99.3 TB (10-year cold)
recommendedClusters: 3
coldTierMonthlyCostUsd: $2,284/month
```

---

## Hot/Warm/Cold Tiering Strategy

```
Age          | Tier   | Storage                    | Query Latency
-------------|--------|----------------------------|---------------
0–90 days    | HOT    | TigerBeetle cluster        | single-digit ms
90d–1 year   | WARM   | PostgreSQL compressed      | seconds
1–10 years   | COLD   | S3 Parquet (zstd level 3)  | minutes
```

### Archival Pipeline (nightly cron)
1. Query transactions with `createdAt < NOW() - 90 days`
2. Stream to S3 in batches of 8,190 (aligned with TigerBeetle batch size)
3. Partition by day: `archive/transactions/date=YYYY-MM-DD/batch-N.json`
4. Account balances at cutoff ARE the checkpoint — no re-import needed
5. For disputes/audits: pull Parquet partition into warm ClickHouse instance

### Compression Target
- **zstd level 3 + dictionary encoding**: ~4.7× compression ratio on 128-byte transfer records
- 80 of 128 bytes are random (amount + account IDs) — no structural compression possible
- Dictionary encoding on 12 low-cardinality columns (ledger, flags, code) adds ~2%

---

## TigerBeetle Batch Processing Pattern

The Go bridge already implements the optimal batching pattern:

```go
// client.go:286 — exact TB batch size
const TB_MAX_BATCH_SIZE = 8190  // 8,190 × 128 bytes = 1 MB message

// BatchTransfers submits up to 8,190 transfers in a single network call
func (c *Client) BatchTransfers(transfers []tb_types.Transfer) error {
    // One io_uring_enter per ~24 transfers — not one fsync per transfer
}
```

**Why 8,190?** `8,190 × 128 bytes = 1,048,320 bytes ≈ 1 MB` — fits exactly in TigerBeetle's 1 MB message envelope. At 30K TPS, one batch fills in 273ms; server processes in 170ms — pipeline is fill-bound, not server-bound.

---

## Idempotency Pattern

Every payment mutation in PayGate uses `withIdempotency()`:

```typescript
// server/idempotency.ts — SHA-256 request hashing
const result = await withIdempotency(ctx, {
  key: input.idempotencyKey,       // Client-supplied UUID
  merchantId: ctx.user.merchantId,
  operation: "transactions.create",
  requestBody: input,
  execute: async () => { /* actual payment logic */ },
});
// Same key + same body → cached response (no double-charge)
// Same key + different body → 422 Conflict (detected replay with mutation)
```

---

## Rate Limiting (Redis Sliding Window)

```typescript
// server/rateLimit.ts — ZADD + ZREMRANGEBYSCORE pipeline
// Per-procedure, per-user limits aligned with TPS thresholds:
const transferLimiter = rateLimit({ max: 100, windowMs: 60_000 });  // 1.67 TPS/user
const batchLimiter    = rateLimit({ max: 10,  windowMs: 60_000 });  // 10 batches/min
```

---

## References

- [1B Payments/Day — TigerBeetle & PostgreSQL](https://backend.how/posts/1b-payments-per-day/) — Pratik Gajjar
- [pratikgajjar/1b-payments](https://github.com/pratikgajjar/1b-payments) — Benchmark code & eBPF scripts
- [TigerBeetle Documentation](https://docs.tigerbeetle.com/) — Official TB docs
- [sirupsen/napkin-math](https://github.com/sirupsen/napkin-math) — Reference numbers for system sizing
