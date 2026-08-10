"""
PayGate Daily Data Pipeline DAG
Orchestrates: dbt transformations → fraud scoring → AML checks → settlement processing → reports
Schedule: Daily at 02:00 WAT (01:00 UTC)
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.bash import BashOperator
from airflow.operators.dummy import DummyOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.http.sensors.http import HttpSensor
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.models import Variable
import json
import logging

logger = logging.getLogger(__name__)

# ─── Default Args ────────────────────────────────────────────────────────────
default_args = {
    "owner": "paygate-data-team",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "email": ["data-alerts@paygate.ng"],
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(hours=2),
}

# ─── DAG Definition ───────────────────────────────────────────────────────────
with DAG(
    dag_id="paygate_daily_pipeline",
    default_args=default_args,
    description="PayGate daily ETL: dbt → fraud → AML → settlements → reports",
    schedule_interval="0 1 * * *",  # 01:00 UTC = 02:00 WAT
    catchup=False,
    max_active_runs=1,
    tags=["paygate", "daily", "production"],
    doc_md="""
    ## PayGate Daily Pipeline

    This DAG runs the complete PayGate data pipeline daily:

    1. **Health checks** — verify all services are up
    2. **dbt staging** — clean and standardize raw data
    3. **dbt marts** — build revenue, fraud, merchant health, and AML marts
    4. **Fraud scoring** — run ML inference on yesterday's transactions
    5. **AML checks** — detect structuring and round-trip patterns
    6. **Settlement processing** — trigger NIBSS/Mojaloop settlement batches
    7. **Lakehouse compaction** — compact Parquet files in S3
    8. **Reports** — generate merchant digest emails and compliance reports
    """,
) as dag:

    # ─── Start ────────────────────────────────────────────────────────────────
    start = DummyOperator(task_id="start")

    # ─── Health Checks ────────────────────────────────────────────────────────
    check_postgres = HttpSensor(
        task_id="check_postgres",
        http_conn_id="paygate_api",
        endpoint="/api/trpc/system.health",
        method="GET",
        response_check=lambda response: response.status_code == 200,
        poke_interval=30,
        timeout=120,
    )

    check_fraud_service = HttpSensor(
        task_id="check_fraud_service",
        http_conn_id="fraud_scoring_service",
        endpoint="/health",
        method="GET",
        response_check=lambda response: response.status_code == 200,
        poke_interval=30,
        timeout=120,
    )

    check_lakehouse = HttpSensor(
        task_id="check_lakehouse",
        http_conn_id="lakehouse_ai_service",
        endpoint="/health",
        method="GET",
        response_check=lambda response: response.status_code == 200,
        poke_interval=30,
        timeout=120,
    )

    # ─── dbt Staging ──────────────────────────────────────────────────────────
    dbt_staging = BashOperator(
        task_id="dbt_staging",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt run --select staging --target prod --profiles-dir /opt/airflow/dbt && \
            dbt test --select staging --target prod --profiles-dir /opt/airflow/dbt
        """,
        env={
            "DBT_HOST": "{{ var.value.get('PG_HOST', 'postgres') }}",
            "DBT_USER": "{{ var.value.get('PG_USER', 'paygate') }}",
            "DBT_PASSWORD": "{{ var.value.get('PG_PASSWORD', '') }}",
            "DBT_DATABASE": "{{ var.value.get('PG_DATABASE', 'paygate') }}",
        },
    )

    # ─── dbt Marts ────────────────────────────────────────────────────────────
    dbt_marts_finance = BashOperator(
        task_id="dbt_marts_finance",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt run --select marts.finance --target prod --profiles-dir /opt/airflow/dbt
        """,
    )

    dbt_marts_fraud = BashOperator(
        task_id="dbt_marts_fraud",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt run --select marts.fraud --target prod --profiles-dir /opt/airflow/dbt
        """,
    )

    dbt_marts_merchant = BashOperator(
        task_id="dbt_marts_merchant",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt run --select marts.merchant --target prod --profiles-dir /opt/airflow/dbt
        """,
    )

    dbt_marts_compliance = BashOperator(
        task_id="dbt_marts_compliance",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt run --select marts.compliance --target prod --profiles-dir /opt/airflow/dbt
        """,
    )

    # ─── Fraud Scoring Batch ──────────────────────────────────────────────────
    run_fraud_scoring = SimpleHttpOperator(
        task_id="run_fraud_scoring_batch",
        http_conn_id="fraud_scoring_service",
        endpoint="/v1/batch/score",
        method="POST",
        data=json.dumps({
            "date": "{{ ds }}",
            "mode": "batch",
            "model_version": "latest",
        }),
        headers={"Content-Type": "application/json", "X-Internal-Key": "{{ var.value.get('MIDDLEWARE_INTERNAL_KEY', 'dev-internal-key') }}"},
        response_check=lambda response: response.status_code == 200,
        log_response=True,
    )

    # ─── AML Checks ───────────────────────────────────────────────────────────
    run_aml_checks = SimpleHttpOperator(
        task_id="run_aml_checks",
        http_conn_id="aml_monitor_service",
        endpoint="/v1/scan/daily",
        method="POST",
        data=json.dumps({
            "date": "{{ ds }}",
            "rules": ["structuring", "round_trip", "velocity", "geographic"],
        }),
        headers={"Content-Type": "application/json", "X-Internal-Key": "{{ var.value.get('MIDDLEWARE_INTERNAL_KEY', 'dev-internal-key') }}"},
        response_check=lambda response: response.status_code == 200,
        log_response=True,
    )

    # ─── Settlement Processing ────────────────────────────────────────────────
    trigger_settlement_batch = SimpleHttpOperator(
        task_id="trigger_settlement_batch",
        http_conn_id="go_bridge",
        endpoint="/v1/settlements/process-batch",
        method="POST",
        data=json.dumps({
            "date": "{{ ds }}",
            "rails": ["nibss", "mojaloop"],
        }),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer {{ var.value.get('MIDDLEWARE_INTERNAL_KEY', 'dev-internal-key') }}",
        },
        response_check=lambda response: response.status_code in [200, 202],
        log_response=True,
    )

    # ─── Lakehouse Compaction ─────────────────────────────────────────────────
    compact_lakehouse = SimpleHttpOperator(
        task_id="compact_lakehouse_parquet",
        http_conn_id="lakehouse_ai_service",
        endpoint="/v1/compact",
        method="POST",
        data=json.dumps({
            "date": "{{ ds }}",
            "partitions": ["transactions", "fraud_features", "audit_events"],
        }),
        headers={"Content-Type": "application/json"},
        response_check=lambda response: response.status_code == 200,
        log_response=True,
    )

    # ─── Generate Merchant Digest Emails ─────────────────────────────────────
    send_merchant_digests = SimpleHttpOperator(
        task_id="send_merchant_digest_emails",
        http_conn_id="paygate_api",
        endpoint="/api/trpc/reports.sendDailyDigest",
        method="POST",
        data=json.dumps({"date": "{{ ds }}"}),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Key": "{{ var.value.get('INTERNAL_API_KEY', 'dev-api-key') }}",
        },
        response_check=lambda response: response.status_code in [200, 207],
        log_response=True,
    )

    # ─── Generate Compliance Report ───────────────────────────────────────────
    generate_compliance_report = PostgresOperator(
        task_id="generate_compliance_report",
        postgres_conn_id="paygate_postgres",
        sql="""
            INSERT INTO compliance_reports (
                report_type, period_start, period_end, status,
                total_transactions, flagged_transactions, aml_alerts,
                generated_at
            )
            SELECT
                'DAILY_COMPLIANCE',
                '{{ ds }}'::DATE,
                '{{ ds }}'::DATE + INTERVAL '1 day',
                'generated',
                COUNT(*),
                COUNT(CASE WHEN fraud_score > 0.8 THEN 1 END),
                (SELECT COUNT(*) FROM aml_alerts WHERE created_at::DATE = '{{ ds }}'::DATE),
                NOW()
            FROM transactions
            WHERE created_at::DATE = '{{ ds }}'::DATE
            ON CONFLICT (report_type, period_start) DO UPDATE
            SET status = 'regenerated', generated_at = NOW();
        """,
    )

    # ─── dbt Tests (post-run validation) ─────────────────────────────────────
    dbt_test_all = BashOperator(
        task_id="dbt_test_all_marts",
        bash_command="""
            cd /opt/airflow/dbt/paygate && \
            dbt test --select marts --target prod --profiles-dir /opt/airflow/dbt
        """,
    )

    # ─── End ──────────────────────────────────────────────────────────────────
    end = DummyOperator(task_id="end")

    # ─── Task Dependencies ────────────────────────────────────────────────────
    start >> [check_postgres, check_fraud_service, check_lakehouse]
    [check_postgres, check_fraud_service, check_lakehouse] >> dbt_staging
    dbt_staging >> [dbt_marts_finance, dbt_marts_fraud, dbt_marts_merchant, dbt_marts_compliance]
    dbt_marts_fraud >> run_fraud_scoring
    dbt_marts_compliance >> run_aml_checks
    dbt_marts_finance >> trigger_settlement_batch
    [run_fraud_scoring, run_aml_checks, trigger_settlement_batch] >> compact_lakehouse
    compact_lakehouse >> [send_merchant_digests, generate_compliance_report]
    [send_merchant_digests, generate_compliance_report] >> dbt_test_all
    dbt_test_all >> end
