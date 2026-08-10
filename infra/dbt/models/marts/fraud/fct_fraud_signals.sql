-- fct_fraud_signals: Fraud detection mart
-- Aggregates fraud signals per merchant for risk scoring
{{ config(
    materialized='incremental',
    unique_key='transaction_id',
    tags=['fraud', 'mart']
) }}

WITH txns AS (
    SELECT * FROM {{ ref('stg_transactions') }}
    {% if is_incremental() %}
        WHERE transaction_at >= (SELECT MAX(transaction_at) - INTERVAL '1 day' FROM {{ this }})
    {% endif %}
),

fraud_features AS (
    SELECT
        t.transaction_id,
        t.merchant_id,
        t.customer_id,
        t.transaction_at,
        t.amount_naira,
        t.fraud_score,
        t.fraud_risk_level,
        t.ip_address,
        t.device_fingerprint,
        t.channel,
        -- Velocity: last 1 hour
        COUNT(*) OVER (
            PARTITION BY t.customer_id
            ORDER BY t.transaction_at
            RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
        ) AS txn_count_1h,
        SUM(t.amount_naira) OVER (
            PARTITION BY t.customer_id
            ORDER BY t.transaction_at
            RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
        ) AS txn_volume_1h,
        -- Velocity: last 24 hours
        COUNT(*) OVER (
            PARTITION BY t.customer_id
            ORDER BY t.transaction_at
            RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND CURRENT ROW
        ) AS txn_count_24h,
        -- Device sharing (fraud ring signal)
        COUNT(DISTINCT t.customer_id) OVER (
            PARTITION BY t.device_fingerprint
            ORDER BY t.transaction_at
            RANGE BETWEEN INTERVAL '24 hours' PRECEDING AND CURRENT ROW
        ) AS device_customer_count_24h,
        -- IP sharing
        COUNT(DISTINCT t.customer_id) OVER (
            PARTITION BY t.ip_address
            ORDER BY t.transaction_at
            RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
        ) AS ip_customer_count_1h
    FROM txns t
)

SELECT
    *,
    CASE
        WHEN fraud_score >= 0.9 THEN 'CRITICAL'
        WHEN fraud_score >= 0.8 OR device_customer_count_24h > 5 THEN 'HIGH'
        WHEN fraud_score >= 0.6 OR txn_count_1h > 10 THEN 'MEDIUM'
        WHEN fraud_score >= 0.4 OR ip_customer_count_1h > 3 THEN 'LOW'
        ELSE 'CLEAN'
    END AS composite_risk_level,
    NOW() AS dbt_updated_at
FROM fraud_features
