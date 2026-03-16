// Package main — TigerBeetle ↔ PostgreSQL Reconciliation Worker
//
// This binary runs as a scheduled job (cron or Kubernetes CronJob) and
// compares the merchant wallet balances held in TigerBeetle against the
// sum of completed transaction net_amounts stored in PostgreSQL.
//
// When a mismatch exceeds the configured tolerance threshold it:
//   1. Inserts a reconciliation_alert row in PostgreSQL for audit.
//   2. Publishes a Kafka audit event so downstream systems can react.
//   3. Logs a structured warning with full context.
//
// Environment variables:
//   TIGERBEETLE_ADDRESSES  — comma-separated TigerBeetle cluster addresses
//   TIGERBEETLE_CLUSTER_ID — TigerBeetle cluster ID (default: 0)
//   DATABASE_URL           — PostgreSQL connection string
//   KAFKA_BROKERS          — comma-separated Kafka broker addresses
//   RECON_TOLERANCE_KOBO   — mismatch tolerance in minor currency units (default: 0)
//   RECON_RUN_ONCE         — if "true", run once and exit (default: false for daemon mode)
//   RECON_INTERVAL_SECS    — interval between runs in daemon mode (default: 300)
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	slog.Info("[reconciler] starting")

	// Initialise dependencies.
	if err := pgdb.Init(); err != nil {
		slog.Warn("[reconciler] pgdb init failed — will run in noop mode", "err", err)
	}
	if err := tb.Init(tb.DefaultTigerBeetleAddress(), 0); err != nil {
		slog.Warn("[reconciler] TigerBeetle init failed — will run in noop mode", "err", err)
	}
	kafka.GetProducer() // initialises the producer with KAFKA_BROKERS from env

	toleranceKobo := int64(0)
	if v := os.Getenv("RECON_TOLERANCE_KOBO"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			toleranceKobo = n
		}
	}

	runOnce := os.Getenv("RECON_RUN_ONCE") == "true"
	intervalSecs := 300
	if v := os.Getenv("RECON_INTERVAL_SECS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			intervalSecs = n
		}
	}

	if runOnce {
		if err := runReconciliation(toleranceKobo); err != nil {
			slog.Error("[reconciler] run failed", "err", err)
			os.Exit(1)
		}
		slog.Info("[reconciler] run complete — exiting")
		return
	}

	// Daemon mode: run on interval.
	slog.Info("[reconciler] daemon mode", "interval_secs", intervalSecs)
	ticker := time.NewTicker(time.Duration(intervalSecs) * time.Second)
	defer ticker.Stop()

	// Run immediately on startup.
	if err := runReconciliation(toleranceKobo); err != nil {
		slog.Error("[reconciler] initial run failed", "err", err)
	}

	for range ticker.C {
		if err := runReconciliation(toleranceKobo); err != nil {
			slog.Error("[reconciler] run failed", "err", err)
		}
	}
}

// runReconciliation performs one full reconciliation pass.
func runReconciliation(toleranceKobo int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	slog.Info("[reconciler] starting reconciliation pass")
	start := time.Now()

	db := pgdb.Get()
	tbClient := tb.GetActive()
	producer := kafka.GetProducer()

	// 1. Fetch all merchant balances from PostgreSQL.
	pgRows, err := db.GetMerchantBalances(ctx)
	if err != nil {
		return fmt.Errorf("GetMerchantBalances: %w", err)
	}

	if len(pgRows) == 0 {
		slog.Info("[reconciler] no merchant balances in PostgreSQL — nothing to reconcile")
		return nil
	}

	var (
		totalChecked  int
		totalMismatch int
		totalAlerted  int
	)

	for _, row := range pgRows {
		totalChecked++

		// 2. Look up the corresponding TigerBeetle wallet balance.
		merchantID, err := tb.UUIDToID(row.MerchantID)
		if err != nil {
			slog.Warn("[reconciler] invalid merchant_id — skipping",
				"merchant_id", row.MerchantID, "err", err)
			continue
		}

		tbBalance, err := tbClient.GetBalance(merchantID)
		if err != nil {
			slog.Warn("[reconciler] TigerBeetle GetBalance failed — skipping",
				"merchant_id", row.MerchantID, "currency", row.Currency, "err", err)
			continue
		}

		// 3. Compare.
		pgBalance := row.PGBalance
		tbBalanceSigned := int64(tbBalance)
		delta := pgBalance - tbBalanceSigned
		if delta < 0 {
			delta = -delta
		}

		if delta <= toleranceKobo {
			slog.Debug("[reconciler] balance OK",
				"merchant_id", row.MerchantID,
				"currency", row.Currency,
				"pg_balance", pgBalance,
				"tb_balance", tbBalanceSigned,
			)
			continue
		}

		// 4. Mismatch detected — record and alert.
		totalMismatch++
		slog.Warn("[reconciler] BALANCE MISMATCH",
			"merchant_id", row.MerchantID,
			"currency", row.Currency,
			"pg_balance", pgBalance,
			"tb_balance", tbBalanceSigned,
			"delta", delta,
		)

		// Insert audit record.
		if alertErr := db.InsertReconciliationAlert(ctx,
			row.MerchantID, row.Currency, pgBalance, tbBalanceSigned, delta,
		); alertErr != nil {
			slog.Error("[reconciler] InsertReconciliationAlert failed",
				"merchant_id", row.MerchantID, "err", alertErr)
		} else {
			totalAlerted++
		}

		// Publish Kafka audit event.
		_ = producer.PublishAudit(ctx, kafka.AuditEvent{
			EventID:    fmt.Sprintf("recon-mismatch-%s-%s-%d", row.MerchantID, row.Currency, time.Now().UnixMilli()),
			MerchantID: row.MerchantID,
			ActorID:    "reconciler",
			Action:     "balance_mismatch",
			Resource:   "wallet",
			ResourceID: row.MerchantID,
			OccurredAt: time.Now().UTC(),
		})
	}

	elapsed := time.Since(start)
	slog.Info("[reconciler] reconciliation pass complete",
		"duration_ms", elapsed.Milliseconds(),
		"total_checked", totalChecked,
		"total_mismatch", totalMismatch,
		"total_alerted", totalAlerted,
	)

	if totalMismatch > 0 {
		return fmt.Errorf("reconciliation found %d mismatches (tolerance: %d kobo)", totalMismatch, toleranceKobo)
	}
	return nil
}
