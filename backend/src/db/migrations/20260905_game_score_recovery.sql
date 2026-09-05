-- Additive. Run once before starting a release that uses durable score recovery.
-- Keep this table when rolling application code back; committed outcomes must survive.
CREATE TABLE IF NOT EXISTS game_score_recoveries (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_round_id VARCHAR(128) NOT NULL,
    request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    outcome JSONB NOT NULL CHECK (jsonb_typeof(outcome) = 'object'),
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, client_round_id)
);
