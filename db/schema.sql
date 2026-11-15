-- TERA ON-CHAIN PostgreSQL schema (initial MVP + commercial-ready foundations)
-- All timestamps are stored as timestamptz (UTC).
-- Every guild-scoped query must include guild_id.

CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  name TEXT,
  alert_channel_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  label TEXT,
  added_by_user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, chain, address)
);
CREATE INDEX IF NOT EXISTS idx_tracked_wallets_active ON tracked_wallets(chain, enabled);

CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('whale_transfer','wallet_activity','token_volume','token_liquidity')),
  chain TEXT NOT NULL,
  target_address TEXT,
  threshold_usd NUMERIC(30, 8),
  destination_channel_id TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(chain, enabled, rule_type);

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  rule_id BIGINT REFERENCES alert_rules(id) ON DELETE SET NULL,
  chain TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  event_index INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  source_provider TEXT NOT NULL,
  source_url TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','delivered','failed','ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, rule_id, chain, transaction_id, event_index)
);
CREATE INDEX IF NOT EXISTS idx_alert_events_pending ON alert_events(delivery_status, created_at);

CREATE TABLE IF NOT EXISTS token_scans (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  risk_indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  score_version TEXT NOT NULL,
  source_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_scans_lookup ON token_scans(chain, token_address, scanned_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id TEXT,
  feature TEXT NOT NULL,
  provider TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_guild_date ON usage_events(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE REFERENCES guilds(guild_id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free'
    CHECK (status IN ('free','active','past_due','expired','cancelled','review')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crypto_payment_intents (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  chain TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  asset_contract TEXT,
  expected_amount NUMERIC(30, 12) NOT NULL,
  destination_address TEXT NOT NULL,
  transaction_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','detected','confirmed','underpaid','expired','rejected','review')),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_pending ON crypto_payment_intents(status, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_date ON audit_logs(guild_id, created_at DESC);


-- Alert polling state. Cursors are scoped per guild wallet; chain blocks are scanned once globally.
ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS last_seen_cursor TEXT;
ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS min_alert_usd NUMERIC(30, 8) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chain_scan_state (
  chain TEXT PRIMARY KEY,
  last_scanned_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure idempotency for wallet activity rows without a specific alert rule.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_wallet_dedupe
  ON alert_events(guild_id, chain, transaction_id, event_index)
  WHERE rule_id IS NULL;
