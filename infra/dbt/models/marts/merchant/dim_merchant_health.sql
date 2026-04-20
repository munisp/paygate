-- dim_merchant_health: Merchant health dimension
-- 360-degree health score for each merchant
{{ config(materialized='table', tags=['merchant', 'mart']) }}

WITH revenue AS (
    SELECT
        merchant_id,
        SUM(gross_volume_naira)     AS total_volume_30d,
        SUM(transaction_count)      AS total_txns_30d,
        AVG(avg_fraud_score)        AS avg_fraud_score_30d,
        SUM(high_fraud_count)       AS high_fraud_txns_30d
    FROM {{ ref('fct_merchant_revenue') }}
    WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY merchant_id
),

disputes AS (
    SELECT
        merchant_id,
        COUNT(*)                    AS dispute_count_30d,
        SUM(disputed_amount_naira)  AS disputed_volume_30d,
        COUNT(CASE WHEN is_overdue THEN 1 END) AS overdue_disputes
    FROM {{ ref('stg_disputes') }}
    WHERE raised_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY merchant_id
),

merchants AS (
    SELECT * FROM {{ ref('stg_merchants') }}
)

SELECT
    m.merchant_id,
    m.merchant_name,
    m.merchant_tier,
    m.merchant_status,
    m.kyc_status,
    m.business_category,
    m.country,
    m.onboarded_at,
    m.cohort_month,
    COALESCE(r.total_volume_30d, 0)         AS volume_30d_naira,
    COALESCE(r.total_txns_30d, 0)           AS transactions_30d,
    COALESCE(r.avg_fraud_score_30d, 0)      AS avg_fraud_score,
    COALESCE(r.high_fraud_txns_30d, 0)      AS high_fraud_count,
    COALESCE(d.dispute_count_30d, 0)        AS disputes_30d,
    COALESCE(d.disputed_volume_30d, 0)      AS disputed_volume_naira,
    COALESCE(d.overdue_disputes, 0)         AS overdue_disputes,
    CASE
        WHEN COALESCE(r.total_txns_30d, 0) > 0
        THEN COALESCE(d.dispute_count_30d, 0)::FLOAT / r.total_txns_30d
        ELSE 0
    END                                     AS dispute_rate,
    GREATEST(0, LEAST(100,
        100
        - (COALESCE(r.avg_fraud_score_30d, 0) * 30)
        - (CASE WHEN COALESCE(d.dispute_count_30d, 0) > 5 THEN 20 ELSE COALESCE(d.dispute_count_30d, 0) * 4 END)
        - (COALESCE(d.overdue_disputes, 0) * 10)
        + (CASE WHEN COALESCE(r.total_txns_30d, 0) > 100 THEN 10 ELSE 0 END)
    ))                                      AS health_score,
    NOW()                                   AS dbt_updated_at
FROM merchants m
LEFT JOIN revenue r ON m.merchant_id = r.merchant_id
LEFT JOIN disputes d ON m.merchant_id = d.merchant_id
