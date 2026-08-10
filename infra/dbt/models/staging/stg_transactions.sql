-- stg_transactions: Staging model for raw transaction data
-- Cleans, casts, and standardizes transactions for downstream models
{{ config(materialized='view', tags=['staging', 'transactions']) }}

WITH source AS (
    SELECT * FROM {{ source('paygate_raw', 'transactions') }}
),

renamed AS (
    SELECT
        id                                          AS transaction_id,
        merchant_id,
        customer_id,
        reference                                   AS transaction_reference,
        amount::NUMERIC(20, 2)                      AS amount_kobo,
        (amount::NUMERIC(20, 2) / 100.0)            AS amount_naira,
        currency,
        UPPER(status)                               AS status,
        UPPER(channel)                              AS channel,
        UPPER(type)                                 AS transaction_type,
        fee_amount::NUMERIC(20, 2)                  AS fee_kobo,
        (fee_amount::NUMERIC(20, 2) / 100.0)        AS fee_naira,
        fraud_score::NUMERIC(5, 4)                  AS fraud_score,
        ip_address,
        device_fingerprint,
        metadata,
        created_at                                  AS transaction_at,
        updated_at,
        -- Derived fields
        CASE
            WHEN fraud_score::NUMERIC(5, 4) >= 0.8 THEN 'HIGH'
            WHEN fraud_score::NUMERIC(5, 4) >= 0.5 THEN 'MEDIUM'
            ELSE 'LOW'
        END                                         AS fraud_risk_level,
        DATE_TRUNC('day', created_at)               AS transaction_date,
        DATE_TRUNC('week', created_at)              AS transaction_week,
        DATE_TRUNC('month', created_at)             AS transaction_month,
        EXTRACT(HOUR FROM created_at)               AS transaction_hour,
        EXTRACT(DOW FROM created_at)                AS day_of_week
    FROM source
    WHERE created_at IS NOT NULL
)

SELECT * FROM renamed
