-- 0093: alert_subscriptions — Novu alert bridge (OTEL spec §7)
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  tenant_id text,
  channel varchar(16) NOT NULL,
  min_severity varchar(16) NOT NULL DEFAULT 'warning',
  target varchar(255) NOT NULL,
  novu_subscriber_id varchar(128),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alert_subscriptions_merchant_channel_target_uniq
  ON alert_subscriptions (merchant_id, channel, target);
CREATE INDEX IF NOT EXISTS alert_subscriptions_merchant_idx
  ON alert_subscriptions (merchant_id);
