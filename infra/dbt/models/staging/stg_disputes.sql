-- stg_disputes: Staging model for dispute/chargeback data
{{ config(materialized='view', tags=['staging', 'disputes']) }}

WITH source AS (
    SELECT * FROM {{ source('paygate_raw', 'disputes') }}
),

renamed AS (
    SELECT
        id                          AS dispute_id,
        transaction_id,
        merchant_id,
        customer_id,
        UPPER(status)               AS dispute_status,
        UPPER(reason)               AS dispute_reason,
        amount::NUMERIC(20,2)       AS disputed_amount_kobo,
        (amount::NUMERIC(20,2) / 100.0) AS disputed_amount_naira,
        evidence,
        resolution,
        resolved_at,
        due_date,
        created_at                  AS raised_at,
        updated_at,
        -- Derived
        CASE
            WHEN resolved_at IS NOT NULL THEN
                EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400.0
            ELSE
                EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0
        END                         AS age_days,
        CASE
            WHEN due_date < NOW() AND status NOT IN ('RESOLVED', 'CLOSED') THEN TRUE
            ELSE FALSE
        END                         AS is_overdue
    FROM source
)

SELECT * FROM renamed
