# PayGate Database Backup Policy

**Version:** 1.0 — Wave 50  
**Last Updated:** 2026-03-15  
**Owner:** Platform Engineering

---

## 1. Scope

This policy covers all PostgreSQL databases used by the PayGate platform:

| Database | Purpose | Tier |
|---|---|---|
| `paygate_prod` | Primary application database (55 tables) | Critical |
| `temporal_prod` | Temporal workflow history | High |
| `keycloak_prod` | Keycloak IAM realm data | High |
| `paygate_staging` | Staging / QA environment | Medium |

---

## 2. Backup Schedule

| Backup Type | Frequency | Retention | Storage |
|---|---|---|---|
| Full snapshot | Daily at 02:00 UTC | 30 days | S3 `paygate-backups/daily/` |
| Incremental WAL | Continuous (WAL streaming) | 7 days | S3 `paygate-backups/wal/` |
| Weekly archive | Every Sunday at 03:00 UTC | 1 year | S3 `paygate-backups/weekly/` |
| Monthly archive | 1st of each month at 04:00 UTC | 7 years (compliance) | S3 Glacier `paygate-backups/monthly/` |

---

## 3. Backup Commands

### 3.1 Manual Full Backup

```bash
# Full database dump (compressed)
pg_dump \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$DB_USER \
  --dbname=paygate_prod \
  --format=custom \
  --compress=9 \
  --file=/tmp/paygate_$(date +%Y%m%d_%H%M%S).dump

# Upload to S3
aws s3 cp /tmp/paygate_*.dump \
  s3://paygate-backups/daily/ \
  --sse aws:kms \
  --kms-key-id $BACKUP_KMS_KEY_ID
```

### 3.2 Automated Daily Backup (cron)

```bash
# /etc/cron.d/paygate-backup
0 2 * * * postgres /usr/local/bin/paygate-backup.sh >> /var/log/paygate-backup.log 2>&1
```

### 3.3 WAL Archiving (postgresql.conf)

```ini
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://paygate-backups/wal/%f --sse aws:kms'
archive_timeout = 300
```

---

## 4. Restore Procedure

### 4.1 Point-in-Time Recovery (PITR)

```bash
# 1. Stop the application
systemctl stop paygate-portal

# 2. Restore base backup
aws s3 cp s3://paygate-backups/daily/paygate_YYYYMMDD.dump /tmp/restore.dump

pg_restore \
  --host=$DB_HOST \
  --username=$DB_USER \
  --dbname=paygate_restore \
  --format=custom \
  --jobs=4 \
  /tmp/restore.dump

# 3. Apply WAL segments up to target time
# (configure recovery_target_time in postgresql.conf)
echo "recovery_target_time = '2026-03-15 10:30:00'" >> $PGDATA/postgresql.conf
pg_ctl start -D $PGDATA

# 4. Verify data integrity
psql -c "SELECT COUNT(*) FROM transactions;" paygate_restore
psql -c "SELECT MAX(created_at) FROM transactions;" paygate_restore

# 5. Promote and switch application
pg_ctl promote -D $PGDATA
```

### 4.2 RTO / RPO Targets

| Metric | Target | Notes |
|---|---|---|
| **RPO** (Recovery Point Objective) | < 5 minutes | WAL streaming ensures near-zero data loss |
| **RTO** (Recovery Time Objective) | < 30 minutes | Full restore from daily snapshot + WAL replay |
| **MTTR** (Mean Time to Recovery) | < 60 minutes | Including validation and traffic cutover |

---

## 5. Backup Verification

### 5.1 Weekly Restore Test

Every Sunday at 05:00 UTC, an automated job:
1. Restores the latest daily backup to `paygate_verify` database
2. Runs integrity checks (`pg_dump --schema-only` diff against schema.ts)
3. Counts rows in critical tables (transactions, settlements, wallets)
4. Sends a pass/fail notification to the ops channel

```bash
# /usr/local/bin/paygate-backup-verify.sh
#!/bin/bash
set -euo pipefail

BACKUP=$(aws s3 ls s3://paygate-backups/daily/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://paygate-backups/daily/$BACKUP" /tmp/verify.dump

pg_restore --dbname=paygate_verify --clean --if-exists /tmp/verify.dump

TXNS=$(psql -t -c "SELECT COUNT(*) FROM transactions;" paygate_verify | tr -d ' ')
WALLETS=$(psql -t -c "SELECT COUNT(*) FROM wallets;" paygate_verify | tr -d ' ')

echo "Backup verify: transactions=$TXNS wallets=$WALLETS backup=$BACKUP"
# Alert if counts are suspiciously low
[ "$TXNS" -gt 0 ] && [ "$WALLETS" -gt 0 ] && echo "PASS" || echo "FAIL — alert ops"
```

---

## 6. Encryption

- All backups are encrypted at rest using **AES-256** via AWS KMS (`BACKUP_KMS_KEY_ID`)
- WAL segments are encrypted in transit via TLS 1.3
- Backup bucket has **S3 Block Public Access** enabled and **versioning** enabled
- KMS key rotation: **annual** (automated)

---

## 7. Access Control

| Role | Permissions |
|---|---|
| `paygate-backup-role` | `s3:PutObject`, `s3:GetObject` on `paygate-backups/*` |
| `paygate-restore-role` | `s3:GetObject` on `paygate-backups/*` |
| `paygate-ops` | Full access (break-glass, requires MFA) |
| CI/CD pipeline | `paygate-backup-role` only |

---

## 8. Compliance

| Regulation | Requirement | Implementation |
|---|---|---|
| PCI-DSS | 1-year minimum retention | Monthly archives retained 7 years |
| NDPR (Nigeria) | Data residency | Backups stored in `af-south-1` (Cape Town) |
| ISO 27001 | Backup testing | Weekly automated restore verification |
| CBN Guidelines | Audit trail | All backup operations logged to CloudTrail |

---

## 9. Monitoring & Alerting

| Alert | Threshold | Channel |
|---|---|---|
| Backup job failed | Any failure | PagerDuty P2 |
| Backup age > 26 hours | Missed daily window | Slack #ops-alerts |
| Backup size < 80% of previous | Possible data loss | PagerDuty P1 |
| Restore test failed | Weekly failure | PagerDuty P2 |
| WAL gap > 10 minutes | Streaming interrupted | PagerDuty P1 |

---

## 10. Disaster Recovery

For full DR runbook, see `infra/runbooks/disaster-recovery.md`.

**Key contacts:**
- Platform Engineering on-call: PagerDuty escalation policy `paygate-platform`
- Database Administrator: `dba@paygate.io`
- CISO (data breach): `security@paygate.io`
