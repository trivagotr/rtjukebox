BEGIN;

CREATE TABLE IF NOT EXISTS arcade_game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    game_id UUID NOT NULL REFERENCES arcade_games(id) ON DELETE RESTRICT,
    client_round_id VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    current_nonce_hash CHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    last_ip INET,
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    UNIQUE (user_id, client_round_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_arcade_game_sessions_one_active
    ON arcade_game_sessions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_arcade_game_sessions_user_started
    ON arcade_game_sessions(user_id, started_at DESC);
ALTER TABLE arcade_game_sessions ADD COLUMN IF NOT EXISTS game_state JSONB NOT NULL DEFAULT '{}';
ALTER TABLE arcade_game_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE arcade_game_sessions ADD COLUMN IF NOT EXISTS server_score INTEGER NOT NULL DEFAULT 0 CHECK (server_score >= 0);
CREATE INDEX IF NOT EXISTS idx_arcade_game_sessions_expiry
    ON arcade_game_sessions(expires_at) WHERE status = 'active';

ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS client_round_id VARCHAR(120);
ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES arcade_game_sessions(id) ON DELETE RESTRICT;
ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS reported_score INTEGER;
ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS server_elapsed_seconds INTEGER;
ALTER TABLE game_score_submissions ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_score_submissions_user_round
    ON game_score_submissions(user_id, client_round_id) WHERE client_round_id IS NOT NULL;

INSERT INTO arcade_games (id, slug, title, description, point_rate, daily_point_limit, is_active, metadata)
VALUES (
    '9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e100',
    'pool-dive',
    'Pool Dive',
    'Follow the server signal and choose the correct diving lane across eight verified rounds.',
    0.02,
    10,
    TRUE,
    '{"surface":"social","verification":"server-authoritative","rounds":8}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    point_rate = EXCLUDED.point_rate,
    daily_point_limit = EXCLUDED.daily_point_limit,
    is_active = TRUE,
    metadata = EXCLUDED.metadata;

INSERT INTO app_events (id, title, description, location, check_in_points, is_active, metadata)
VALUES
    (
        'd54f7be3-8ce1-4ca5-bcd4-93e1c07b0101',
        'Daily Focus Sprint',
        'Find a verified seat, focus with the campus community and advance your Social study path.',
        'Library',
        0,
        TRUE,
        '{"surface":"social","always_open":true,"activity":"verified-focus"}'::jsonb
    ),
    (
        'd54f7be3-8ce1-4ca5-bcd4-93e1c07b0102',
        'Pool Dive Challenge',
        'Play eight server-scored rounds. Fast, correct choices can earn up to 10 Gold per day.',
        'Sports Center',
        0,
        TRUE,
        '{"surface":"social","always_open":true,"activity":"pool-dive"}'::jsonb
    )
ON CONFLICT (id) DO NOTHING;

COMMIT;
