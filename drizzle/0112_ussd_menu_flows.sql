-- 0112_ussd_menu_flows.sql — per-merchant USSD menu-flow configuration
--
-- wave80Router ussdSessionV2.updateMenuFlow previously returned a fake
-- success without persisting anything; getMenuFlow served a hardcoded
-- constant. This table is the durable store for merchant-editable USSD menu
-- flows (one row per merchant).

CREATE TABLE IF NOT EXISTS ussd_menu_flows (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  menus       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ussd_menu_flows_merchant_unique
  ON ussd_menu_flows (merchant_id);
