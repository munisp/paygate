-- fct_merchant_revenue: Merchant revenue fact table
-- Aggregates transaction fees, volumes, and net revenue per merchant per day
{{ config(
    materialized='incremental',
    unique_key=['merchant_id', 'transaction_date'],
    incremental_strategy='merge',
    tags=['finance', 'mart', 'revenue']
) }}

WITH transactions AS (
    SELECT * FROM {{ ref('stg_transactions') }}
    WHERE status = 'SUCCESS'
    {% if is_incremental() %}
        AND transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '3 days' FROM {{ this }})
    {% endif %}
),

merchants AS (
    SELECT * FROM {{ ref('stg_merchants') }}
),

daily_revenue AS (
    SELECT
        t.merchant_id,
        t.transaction_date,
        t.currency,
        COUNT(*)                                    AS transaction_count,
        SUM(t.amount_naira)                         AS gross_volume_naira,
        SUM(t.fee_naira)                            AS total_fees_naira,
        SUM(t.amount_naira) - SUM(t.fee_naira)      AS net_volume_naira,
        AVG(t.amount_naira)                         AS avg_transaction_naira,
        MAX(t.amount_naira)                         AS max_transaction_naira,
        MIN(t.amount_naira)                         AS min_transaction_naira,
        COUNT(DISTINCT t.customer_id)               AS unique_customers,
        SUM(CASE WHEN t.channel = 'CARD' THEN 1 ELSE 0 END) AS card_transactions,
        SUM(CASE WHEN t.channel = 'BANK_TRANSFER' THEN 1 ELSE 0 END) AS bank_transfer_transactions,
        SUM(CASE WHEN t.channel = 'USSD' THEN 1 ELSE 0 END) AS ussd_transactions,
        SUM(CASE WHEN t.fraud_risk_level = 'HIGH' THEN 1 ELSE 0 END) AS high_fraud_count,
        AVG(t.fraud_score)                          AS avg_fraud_score
    FROM transactions t
    GROUP BY t.merchant_id, t.transaction_date, t.currency
)

SELECT
    dr.*,
    m.merchant_name,
    m.merchant_tier,
    m.merchant_status,
    m.business_category,
    m.country,
    m.fee_rate,
    -- Revenue share calculation
    dr.total_fees_naira * 0.7                       AS merchant_share_naira,
    dr.total_fees_naira * 0.3                       AS platform_share_naira,
    -- Churn risk signal
    CASE
        WHEN dr.transaction_count < 5 THEN 'AT_RISK'
        WHEN dr.transaction_count < 20 THEN 'MONITOR'
        ELSE 'HEALTHY'
    END                                             AS activity_health,
    NOW()                                           AS dbt_updated_at
FROM daily_revenue dr
LEFT JOIN merchants m ON dr.merchant_id = m.merchant_id
