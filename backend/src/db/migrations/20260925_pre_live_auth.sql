-- Narrow pre-live schema update for login lockout and Spotify OAuth state.
-- This file is deliberately limited to auth/OAuth tables; the bootstrap
-- schema.sql also manages unrelated domains that are out of scope here.

CREATE TABLE IF NOT EXISTS auth_login_attempts (
    identifier_hash CHAR(64) PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked_until
    ON auth_login_attempts(locked_until);

CREATE TABLE IF NOT EXISTS spotify_oauth_states (
    state_hash CHAR(64) PRIMARY KEY,
    state_kind VARCHAR(16) NOT NULL DEFAULT 'admin',
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    return_origin VARCHAR(2048),
    code_verifier VARCHAR(128),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE spotify_oauth_states
    ADD COLUMN IF NOT EXISTS state_kind VARCHAR(16) NOT NULL DEFAULT 'admin';
ALTER TABLE spotify_oauth_states
    ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id) ON DELETE CASCADE;
ALTER TABLE spotify_oauth_states
    ADD COLUMN IF NOT EXISTS code_verifier VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_spotify_oauth_states_expires_at
    ON spotify_oauth_states(expires_at);
