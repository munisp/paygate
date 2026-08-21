#!/usr/bin/env python3
"""
weekly_orm_report.py
────────────────────
Generates a weekly ORM performance metrics report for the PayGate platform.
Collects metrics from the PostgreSQL database (query stats via pg_stat_statements),
PgBouncer pool stats, and computes per-router latency summaries.

Outputs a Markdown report to /home/ubuntu/reports/orm_weekly_<YYYY-WW>.md
"""

import os
import sys
import json
import datetime
import subprocess
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

# Fallback targets the LOCAL embedded dev DB (127.0.0.1) only — safe for local reports.
# For any non-localhost database set PG_DATABASE_URL explicitly.
DB_URL = os.environ.get(
    "PG_DATABASE_URL",
    "postgresql://paygate_user:paygate_dev_2026@127.0.0.1:5432/paygate_db"
)
PGBOUNCER_URL = os.environ.get("PGBOUNCER_URL", "")
REPORTS_DIR = Path("/home/ubuntu/reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

NOW = datetime.datetime.utcnow()
WEEK_LABEL = NOW.strftime("%Y-W%W")
REPORT_PATH = REPORTS_DIR / f"orm_weekly_{WEEK_LABEL}.md"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def run_psql(url: str, sql: str) -> list[dict]:
    """Run a SQL query via psql and return rows as list of dicts."""
    try:
        result = subprocess.run(
            ["psql", url, "-t", "-A", "-F", "\t", "-c", sql],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return []
        rows = []
        for line in result.stdout.strip().splitlines():
            if line:
                rows.append(line.split("\t"))
        return rows
    except Exception as e:
        print(f"[warn] psql failed: {e}", file=sys.stderr)
        return []


def get_pg_stat_statements() -> list[dict]:
    """Fetch top slow queries from pg_stat_statements (if extension is enabled)."""
    sql = """
    SELECT
        LEFT(query, 80) AS query_snippet,
        calls,
        ROUND((total_exec_time / calls)::numeric, 2) AS avg_ms,
        ROUND(total_exec_time::numeric, 2) AS total_ms,
        ROUND(stddev_exec_time::numeric, 2) AS stddev_ms
    FROM pg_stat_statements
    WHERE calls > 10
    ORDER BY avg_ms DESC
    LIMIT 15;
    """
    rows = run_psql(DB_URL, sql)
    results = []
    for row in rows:
        if len(row) >= 5:
            results.append({
                "query": row[0],
                "calls": row[1],
                "avg_ms": row[2],
                "total_ms": row[3],
                "stddev_ms": row[4],
            })
    return results


def get_table_sizes() -> list[dict]:
    """Fetch sizes of the 7 new ORM-backed tables."""
    tables = [
        "chargebacks", "chargeback_timeline", "chargeback_evidence_packages",
        "interchange_fee_records", "kyc_submissions", "regulatory_reports",
        "scheme_memberships", "velocity_breaches", "str_records",
    ]
    table_list = ", ".join(f"'{t}'" for t in tables)
    sql = f"""
    SELECT
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows,
        last_vacuum,
        last_autovacuum
    FROM pg_stat_user_tables
    WHERE relname IN ({table_list})
    ORDER BY pg_total_relation_size(relid) DESC;
    """
    rows = run_psql(DB_URL, sql)
    results = []
    for row in rows:
        if len(row) >= 6:
            results.append({
                "table": row[0],
                "size": row[1],
                "live_rows": row[2],
                "dead_rows": row[3],
                "last_vacuum": row[4] or "never",
                "last_autovacuum": row[5] or "never",
            })
    return results


def get_index_usage() -> list[dict]:
    """Fetch index usage stats for the new composite indexes."""
    sql = """
    SELECT
        schemaname,
        relname,
        indexrelname,
        idx_scan AS scans,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched
    FROM pg_stat_user_indexes
    WHERE relname IN (
        'chargebacks', 'chargeback_timeline', 'chargeback_evidence_packages',
        'interchange_fee_records', 'kyc_submissions', 'regulatory_reports',
        'scheme_memberships', 'velocity_breaches', 'str_records'
    )
    ORDER BY idx_scan DESC
    LIMIT 20;
    """
    rows = run_psql(DB_URL, sql)
    results = []
    for row in rows:
        if len(row) >= 6:
            results.append({
                "table": row[1],
                "index": row[2],
                "scans": row[3],
                "tuples_read": row[4],
                "tuples_fetched": row[5],
            })
    return results


def get_pgbouncer_stats() -> list[dict]:
    """Fetch PgBouncer pool stats if PGBOUNCER_URL is configured."""
    if not PGBOUNCER_URL:
        return []
    rows = run_psql(PGBOUNCER_URL, "SHOW POOLS;")
    results = []
    for row in rows:
        if len(row) >= 8:
            results.append({
                "database": row[0],
                "user": row[1],
                "cl_active": row[2],
                "cl_waiting": row[3],
                "sv_active": row[4],
                "sv_idle": row[5],
                "sv_used": row[6],
                "maxwait": row[7],
            })
    return results


# ─── Report Builder ───────────────────────────────────────────────────────────

def build_report() -> str:
    slow_queries = get_pg_stat_statements()
    table_sizes = get_table_sizes()
    index_usage = get_index_usage()
    pgbouncer = get_pgbouncer_stats()

    lines = [
        f"# Weekly ORM Performance Report — {WEEK_LABEL}",
        f"",
        f"**Generated:** {NOW.strftime('%Y-%m-%d %H:%M UTC')}  ",
        f"**Platform:** PayGate `feature/wave227-240`  ",
        f"**Database:** PostgreSQL via Drizzle ORM  ",
        f"",
        f"---",
        f"",
        f"## 1. Top Slow Queries (pg_stat_statements)",
        f"",
    ]

    if slow_queries:
        lines += [
            "| Query Snippet | Calls | Avg (ms) | Total (ms) | Stddev (ms) |",
            "| :--- | ---: | ---: | ---: | ---: |",
        ]
        for q in slow_queries:
            snippet = q["query"].replace("|", "\\|")
            lines.append(f"| `{snippet}` | {q['calls']} | {q['avg_ms']} | {q['total_ms']} | {q['stddev_ms']} |")
    else:
        lines.append(
            "_pg_stat_statements extension not available or no queries with >10 calls yet. "
            "Enable with `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` for live data._"
        )

    lines += [
        "",
        "## 2. ORM-Backed Table Sizes",
        "",
    ]

    if table_sizes:
        lines += [
            "| Table | Total Size | Live Rows | Dead Rows | Last Vacuum | Last Autovacuum |",
            "| :--- | :--- | ---: | ---: | :--- | :--- |",
        ]
        for t in table_sizes:
            lines.append(
                f"| `{t['table']}` | {t['size']} | {t['live_rows']} | {t['dead_rows']} "
                f"| {t['last_vacuum']} | {t['last_autovacuum']} |"
            )
    else:
        lines.append("_No table stats available — database may not be accessible from this environment._")

    lines += [
        "",
        "## 3. Composite Index Usage",
        "",
    ]

    if index_usage:
        lines += [
            "| Table | Index | Scans | Tuples Read | Tuples Fetched |",
            "| :--- | :--- | ---: | ---: | ---: |",
        ]
        for idx in index_usage:
            lines.append(
                f"| `{idx['table']}` | `{idx['index']}` | {idx['scans']} "
                f"| {idx['tuples_read']} | {idx['tuples_fetched']} |"
            )
        # Flag unused indexes
        unused = [i for i in index_usage if int(i["scans"] or 0) == 0]
        if unused:
            lines += [
                "",
                f"> **Warning:** {len(unused)} index(es) have 0 scans this period. "
                "Consider reviewing if they are still needed: "
                + ", ".join(f"`{i['index']}`" for i in unused),
            ]
    else:
        lines.append("_No index stats available._")

    lines += [
        "",
        "## 4. PgBouncer Connection Pool",
        "",
    ]

    if pgbouncer:
        lines += [
            "| Database | User | Active Clients | Waiting | Active Servers | Idle Servers | Max Wait (ms) |",
            "| :--- | :--- | ---: | ---: | ---: | ---: | ---: |",
        ]
        for p in pgbouncer:
            lines.append(
                f"| {p['database']} | {p['user']} | {p['cl_active']} | {p['cl_waiting']} "
                f"| {p['sv_active']} | {p['sv_idle']} | {p['maxwait']} |"
            )
    else:
        lines.append(
            "_PgBouncer not configured (`PGBOUNCER_URL` not set). "
            "Set `PGBOUNCER_URL` to enable live pool monitoring._"
        )

    lines += [
        "",
        "## 5. Recommendations",
        "",
        "The following actions are recommended based on this week's metrics:",
        "",
        "- If any query in Section 1 has `avg_ms > 50`, investigate adding a covering index or rewriting the query.",
        "- If any table in Section 2 has `dead_rows > 10% of live_rows`, trigger a manual `VACUUM ANALYZE` on that table.",
        "- If any index in Section 3 has 0 scans for two consecutive weeks, consider dropping it to reduce write overhead.",
        "- If PgBouncer shows `cl_waiting > 0` consistently, increase `DEFAULT_POOL_SIZE` in the PgBouncer config.",
        "",
        "---",
        f"_Report auto-generated by `scripts/weekly_orm_report.py` on {NOW.strftime('%Y-%m-%d')}._",
    ]

    return "\n".join(lines)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"[weekly_orm_report] Generating report for week {WEEK_LABEL}...")
    report = build_report()
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"[weekly_orm_report] Report written to {REPORT_PATH}")
    # Also print to stdout so Manus can capture it in the task result
    print("\n" + "=" * 60)
    print(report)
