-- 0105_onboarding_hardening.sql
-- Onboarding/KYC hardening (G5, G6):
--  * onboarding session tables gain an owner column so sessions are scoped to
--    the user who created them (legacy NULL rows are admin-only).
--  * kyc_submissions gains client-reported liveness columns: the wizard may
--    report a liveness outcome, but it is stored as UNVERIFIED metadata only —
--    liveness_passed_at may be set exclusively by a server-side checkLiveness
--    result or an admin override.
-- Idempotent: every statement is safe to re-run.

-- ─── G6: onboarding session ownership ────────────────────────────────────────
ALTER TABLE dfsp_onboarding_sessions ADD COLUMN IF NOT EXISTS created_by_user_id text;
CREATE INDEX IF NOT EXISTS dfsp_onb_created_by_idx ON dfsp_onboarding_sessions (created_by_user_id);

ALTER TABLE pisp_onboarding_sessions ADD COLUMN IF NOT EXISTS created_by_user_id text;
CREATE INDEX IF NOT EXISTS pisp_onb_created_by_idx ON pisp_onboarding_sessions (created_by_user_id);

ALTER TABLE psp_onboarding_sessions ADD COLUMN IF NOT EXISTS created_by_user_id text;
CREATE INDEX IF NOT EXISTS psp_onb_created_by_idx ON psp_onboarding_sessions (created_by_user_id);

ALTER TABLE pos_operator_onboarding_sessions ADD COLUMN IF NOT EXISTS created_by_user_id text;
CREATE INDEX IF NOT EXISTS pos_op_onb_created_by_idx ON pos_operator_onboarding_sessions (created_by_user_id);

-- ─── G5: client-reported (unverified) liveness metadata ──────────────────────
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS client_reported_liveness_score real;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS client_reported_liveness_passed boolean;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS client_reported_liveness_at timestamptz;
