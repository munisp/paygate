-- fct_aml_signals: AML/CFT compliance mart
-- Identifies structuring, layering, and integration patterns per NFIU/CBN requirements
{{ config(materialized='table', tags=['compliance', 'mart', 'aml']) }}

WITH txns AS (
    SELECT * FROM {{ ref('stg_transactions') }}
    WHERE transaction_date >= CURRENT_DATE - INTERVAL '{{ var("lookback_days", 90) }} days'
),

-- Structuring: multiple transactions just below NGN 500K reporting threshold
structuring AS (
    SELECT
        customer_id,
        merchant_id,
        transaction_date,
        COUNT(*)                AS txn_count,
        SUM(amount_naira)       AS total_amount,
        COUNT(CASE WHEN amount_naira BETWEEN 400000 AND 499999 THEN 1 END) AS near_threshold_count
    FROM txns
    WHERE status = 'SUCCESS'
    GROUP BY customer_id, merchant_id, transaction_date
    HAVING COUNT(CASE WHEN amount_naira BETWEEN 400000 AND 499999 THEN 1 END) >= 3
),

-- Round-trip: funds in and out within 48 hours (layering indicator)
round_trip AS (
    SELECT DISTINCT
        t1.merchant_id,
        t1.customer_id,
        t1.transaction_id AS outbound_id,
        t1.amount_naira
    FROM txns t1
    JOIN txns t2 ON
        t1.customer_id = t2.customer_id
        AND t1.transaction_id != t2.transaction_id
        AND ABS(t1.amount_naira - t2.amount_naira) < t1.amount_naira * 0.05
        AND t2.transaction_at BETWEEN t1.transaction_at AND t1.transaction_at + INTERVAL '48 hours'
)

SELECT
    'STRUCTURING'           AS signal_type,
    s.customer_id,
    s.merchant_id,
    s.transaction_date::TIMESTAMP AS signal_at,
    s.total_amount          AS signal_amount,
    s.near_threshold_count  AS signal_count,
    'Multiple transactions just below NGN 500K NFIU threshold' AS description,
    'HIGH'                  AS risk_level,
    NOW()                   AS dbt_updated_at
FROM structuring s

UNION ALL

SELECT
    'ROUND_TRIP'            AS signal_type,
    r.customer_id,
    r.merchant_id,
    NOW()                   AS signal_at,
    r.amount_naira          AS signal_amount,
    1                       AS signal_count,
    'Funds returned within 48 hours — possible layering pattern' AS description,
    'HIGH'                  AS risk_level,
    NOW()                   AS dbt_updated_at
FROM round_trip r
