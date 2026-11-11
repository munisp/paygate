-- 0114_regulatory_events.sql — durable store for compliance/regulatory Kafka events
--
-- The portal (psp-production.ts) and go-bridge (cbn_str.go) publish
-- compliance events (str.filed, str.submitted, velocity_limit.updated,
-- chargeback.submitted_to_scheme, regulatory.generate_form_a/b/c) that had NO
-- consumer. go-bridge's kafka consumer (internal/kafka/consumer.go
-- HandleRegulatoryEvent) now persists every one of these events here and
-- commits the Kafka offset ONLY after a successful insert (at-least-once).

CREATE TABLE IF NOT EXISTS regulatory_events (
  id          BIGSERIAL PRIMARY KEY,
  topic       TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_events_topic_received_idx
  ON regulatory_events (topic, received_at);
