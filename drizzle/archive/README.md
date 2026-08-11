# drizzle/archive — quarantined migrations

## 0000_wonderful_wallow.sql (quarantined 2026 — P0-13a repair)

This file was a **divergent duplicate baseline** that had replaced the real
baseline in `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json`,
rendering the migration set unprovisionable on a fresh database.

Why it was removed from the active migration set:

- The true baseline is `drizzle/0000_white_kid_colt.sql` (11 tables, 12 enums:
  `api_keys`, `customers`, `disputes`, `merchants`, `payment_links`, `payouts`,
  `team_members`, `transactions`, `users`, `virtual_cards`, `webhooks`).
  Migration `0001_mute_tattoo.sql` references `webhooks`/`merchants` created by
  that baseline, and the entire snapshot chain `0001..0080` descends from it.
- `0000_wonderful_wallow.sql` creates a conflicting `"users"` table plus three
  tables (`alert_thresholds`, `breach_events`, `named_alert_rules`) that exist
  **nowhere** in `drizzle/schema.ts` or in the final snapshot
  (`0080_snapshot.json`). Applying it alongside the real baseline fails with
  duplicate-relation errors.
- `drizzle/meta/0000_snapshot.json` was reconstructed as the post-`white_kid_colt`
  baseline state (id `78df20df-…`, which `0001_snapshot.json` already referenced
  as its `prevId`), and `_journal.json` was rebuilt with all 81 entries
  (`0000_white_kid_colt` … `0080_wealthy_squadron_sinister`).

Do not move this file back into `drizzle/`. If the alert-threshold tables are
ever needed, regenerate them as a new forward migration from `drizzle/schema.ts`
(`drizzle-kit generate`).
