-- stg_merchants: Staging model for merchant data
{{ config(materialized='view', tags=['staging', 'merchants']) }}

WITH source AS (
    SELECT * FROM {{ source('paygate_raw', 'merchants') }}
),

renamed AS (
    SELECT
        id                          AS merchant_id,
        name                        AS merchant_name,
        email,
        phone,
        UPPER(status)               AS merchant_status,
        UPPER(tier)                 AS merchant_tier,
        UPPER(kyc_status)           AS kyc_status,
        business_type,
        business_category,
        country,
        currency,
        settlement_account,
        settlement_bank,
        fee_percentage::NUMERIC(5,4) AS fee_rate,
        monthly_volume_limit::NUMERIC(20,2) AS monthly_volume_limit_kobo,
        created_at                  AS onboarded_at,
        updated_at,
        -- Derived
        DATE_TRUNC('month', created_at) AS cohort_month,
        CASE
            WHEN kyc_status = 'verified' AND status = 'active' THEN TRUE
            ELSE FALSE
        END AS is_fully_active
    FROM source
)

SELECT * FROM renamed
