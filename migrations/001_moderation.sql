-- Terastore Moderation schema v1
-- Retention values are configurable per guild. NULL means retain indefinitely.
CREATE TABLE guild_config (
  guild_id VARCHAR(20) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  log_channel_id VARCHAR(20),
  automod_log_channel_id VARCHAR(20),
  case_retention_days INTEGER CHECK (case_retention_days IS NULL OR case_retention_days > 0),
  automod_retention_days INTEGER CHECK (automod_retention_days IS NULL OR automod_retention_days > 0),
  mod_log_retention_days INTEGER CHECK (mod_log_retention_days IS NULL OR mod_log_retention_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE case_counters (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  case_number BIGINT NOT NULL CHECK (case_number > 0),
  type VARCHAR(20) NOT NULL CHECK (type IN ('WARN','TIMEOUT','KICK','BAN','UNBAN','UNWARN','NOTE')),
  moderator_id VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVERSED')),
  duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms > 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  reversed_by VARCHAR(20),
  reversal_reason TEXT,
  UNIQUE (guild_id, user_id, case_number),
  CHECK ((status = 'REVERSED' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL) OR status <> 'REVERSED')
);

CREATE INDEX idx_cases_user_created ON cases (guild_id, user_id, created_at DESC);
CREATE INDEX idx_cases_moderator_created ON cases (guild_id, moderator_id, created_at DESC);
CREATE INDEX idx_cases_status ON cases (guild_id, status);

CREATE TABLE case_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  guild_id VARCHAR(20) NOT NULL,
  actor_id VARCHAR(20),
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('CREATED','REVERSED','EXPIRED','UPDATED')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_events_case ON case_events (case_id, created_at);

CREATE TABLE automod_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20),
  rule_id VARCHAR(30) NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  channel_id VARCHAR(20),
  message_id VARCHAR(30),
  matched_keyword TEXT,
  matched_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automod_user_created ON automod_events (guild_id, user_id, created_at DESC);

CREATE TABLE mod_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20),
  action VARCHAR(40) NOT NULL,
  target_user_id VARCHAR(20),
  case_id UUID REFERENCES cases(id) ON DELETE RESTRICT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mod_logs_guild_created ON mod_logs (guild_id, created_at DESC);
