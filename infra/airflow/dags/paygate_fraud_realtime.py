"""
PayGate Real-Time Fraud Alert Processing DAG
Triggered by Kafka sensor when fraud.alerts topic has new messages.
Runs every 5 minutes to process pending fraud alerts.
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.dummy import DummyOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
import json
import logging

logger = logging.getLogger(__name__)

default_args = {
    "owner": "paygate-fraud-team",
    "depends_on_past": False,
    "start_date": datetime(2024, 1, 1),
    "email": ["fraud-ops@paygate.ng"],
    "email_on_failure": True,
    "retries": 2,
    "retry_delay": timedelta(minutes=1),
    "execution_timeout": timedelta(minutes=10),
}

with DAG(
    dag_id="paygate_fraud_realtime",
    default_args=default_args,
    description="Process fraud alerts from Kafka every 5 minutes",
    schedule_interval="*/5 * * * *",
    catchup=False,
    max_active_runs=1,
    tags=["paygate", "fraud", "realtime"],
) as dag:

    start = DummyOperator(task_id="start")

    # Fetch pending fraud alerts from the fraud scoring service
    fetch_pending_alerts = SimpleHttpOperator(
        task_id="fetch_pending_fraud_alerts",
        http_conn_id="fraud_scoring_service",
        endpoint="/v1/alerts/pending",
        method="GET",
        headers={"X-Internal-Key": "{{ var.value.get('MIDDLEWARE_INTERNAL_KEY', 'dev-internal-key') }}"},
        response_check=lambda response: response.status_code == 200,
        log_response=True,
    )

    # Run ART reasoning on high-risk alerts
    run_art_reasoning = SimpleHttpOperator(
        task_id="run_art_reasoning",
        http_conn_id="art_reasoning_service",
        endpoint="/v1/reason",
        method="POST",
        data=json.dumps({
            "context": "fraud_alert_triage",
            "batch_mode": True,
            "max_steps": 5,
        }),
        headers={"Content-Type": "application/json"},
        response_check=lambda response: response.status_code == 200,
        log_response=True,
    )

    # Update alert statuses in PostgreSQL
    update_alert_statuses = PostgresOperator(
        task_id="update_alert_statuses",
        postgres_conn_id="paygate_postgres",
        sql="""
            UPDATE fraud_alerts
            SET status = 'processed', processed_at = NOW()
            WHERE status = 'pending'
              AND created_at < NOW() - INTERVAL '5 minutes';
        """,
    )

    # Notify merchant for high-risk alerts
    notify_merchants = SimpleHttpOperator(
        task_id="notify_merchants_high_risk",
        http_conn_id="paygate_api",
        endpoint="/api/trpc/fraud.notifyMerchantsHighRisk",
        method="POST",
        data=json.dumps({}),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Key": "{{ var.value.get('INTERNAL_API_KEY', 'dev-api-key') }}",
        },
        response_check=lambda response: response.status_code in [200, 207],
    )

    end = DummyOperator(task_id="end")

    start >> fetch_pending_alerts >> run_art_reasoning >> update_alert_statuses >> notify_merchants >> end
