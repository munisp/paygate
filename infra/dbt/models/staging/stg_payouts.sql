-- stg_payouts: Staging model for payout data
{{ config(materialized='view', tags=['staging', 'payouts']) }}

WITH source AS (
    SELECT * FROM {{ source('paygate_raw', 'payouts') }}
),

renamed AS (
    SELECT
        id                          AS payout_id,
        merchant_id,
        amount::NUMERIC(20,2)       AS amount_kobo,
        (amount::NUMERIC(20,2) / 100.0) AS amount_naira,
        currency,
        UPPER(status)               AS payout_status,
        bank_code,
        account_number,
        account_name,
        reference                   AS payout_reference,
        narration,
        approved_by,
        approved_at,
        settled_at,
        created_at                  AS initiated_at,
        updated_at,
        -- Derived
        CASE
            WHEN settled_at IS NOT NULL THEN
                EXTRACT(EPOCH FROM (settled_at - created_at)) / 3600.0
            ELSE NULL
        END                         AS settlement_hours,
        DATE_TRUNC('day', created_at) AS payout_date
    FROM source
)

SELECT * FROM renamed
