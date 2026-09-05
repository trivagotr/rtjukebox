-- RadioTEDU Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NULL for guests
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    is_guest BOOLEAN DEFAULT FALSE,
    role VARCHAR(20) DEFAULT 'user', -- guest, user, moderator, admin
    rank_score INTEGER DEFAULT 0,
    vote_weight DECIMAL(5,2) DEFAULT 1.0,
    total_songs_added INTEGER DEFAULT 0,
    total_upvotes_received INTEGER DEFAULT 0,
    total_downvotes_received INTEGER DEFAULT 0,
    last_super_vote_at TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    last_ip INET,
    user_agent TEXT,
    fcm_token VARCHAR(500),
    push_preferences JSONB DEFAULT '{"podcast": true, "radio": true, "jukebox": true}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip INET;

-- Study Sessions / Avatar Customization
CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location VARCHAR(40) NOT NULL CHECK (location IN ('library', 'chim-alan')),
    client_session_id VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    session_type VARCHAR(20) NOT NULL DEFAULT 'study' CHECK (session_type IN ('study', 'pomodoro')),
    pomodoro_target_minutes INTEGER CHECK (pomodoro_target_minutes IS NULL OR (pomodoro_target_minutes BETWEEN 5 AND 120)),
    current_nonce_hash VARCHAR(128) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    valid_heartbeat_count INTEGER NOT NULL DEFAULT 0,
    eligible_seconds INTEGER NOT NULL DEFAULT 0,
    awarded_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, client_session_id)
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_status ON study_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(started_at);
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) NOT NULL DEFAULT 'study';
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS pomodoro_target_minutes INTEGER;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'study_sessions_session_type_check'
    ) THEN
        ALTER TABLE study_sessions
        ADD CONSTRAINT study_sessions_session_type_check CHECK (session_type IN ('study', 'pomodoro'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'study_sessions_pomodoro_target_minutes_check'
    ) THEN
        ALTER TABLE study_sessions
        ADD CONSTRAINT study_sessions_pomodoro_target_minutes_check
        CHECK (pomodoro_target_minutes IS NULL OR (pomodoro_target_minutes BETWEEN 5 AND 120));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS study_session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    server_received_at TIMESTAMP NOT NULL DEFAULT NOW(),
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    seat_id VARCHAR(120),
    interaction VARCHAR(40) NOT NULL DEFAULT 'idle',
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_study_session_events_session ON study_session_events(session_id, server_received_at);
ALTER TABLE study_session_events ADD COLUMN IF NOT EXISTS seat_id VARCHAR(120);

CREATE TABLE IF NOT EXISTS avatar_items (
    item_id VARCHAR(80) PRIMARY KEY,
    slot VARCHAR(20) NOT NULL CHECK (slot IN ('hair', 'top', 'bottom', 'shoes', 'hat', 'accessory')),
    title VARCHAR(120) NOT NULL,
    cost_points INTEGER NOT NULL DEFAULT 0,
    rarity VARCHAR(20) NOT NULL DEFAULT 'common',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avatar_inventory (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(80) NOT NULL REFERENCES avatar_items(item_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS avatar_equipment (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot VARCHAR(20) NOT NULL CHECK (slot IN ('hair', 'top', 'bottom', 'shoes', 'hat', 'accessory')),
    item_id VARCHAR(80) NOT NULL REFERENCES avatar_items(item_id) ON DELETE CASCADE,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(user_id, slot)
);

ALTER TABLE avatar_items DROP CONSTRAINT IF EXISTS avatar_items_slot_check;
ALTER TABLE avatar_items
    ADD CONSTRAINT avatar_items_slot_check
    CHECK (slot IN ('hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'));
ALTER TABLE avatar_equipment DROP CONSTRAINT IF EXISTS avatar_equipment_slot_check;
ALTER TABLE avatar_equipment
    ADD CONSTRAINT avatar_equipment_slot_check
    CHECK (slot IN ('hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'));

INSERT INTO avatar_items (item_id, slot, title, cost_points, rarity, is_default, enabled)
VALUES
    ('default-hair', 'hair', 'Default Hair', 0, 'default', true, true),
    ('default-top', 'top', 'RadioTEDU Tee', 0, 'default', true, true),
    ('default-bottom', 'bottom', 'Campus Jeans', 0, 'default', true, true),
    ('default-shoes', 'shoes', 'Campus Sneakers', 0, 'default', true, true),
    ('spark-hoodie', 'top', 'Spark Hoodie', 80, 'rare', false, true),
    ('rock-pin', 'accessory', 'Rock Pin', 45, 'common', false, true),
    ('short-hair', 'hair', 'Short Hair', 0, 'default', true, true),
    ('radio-hoodie', 'top', 'Radio Hoodie', 0, 'default', true, true),
    ('radiotedu-tee', 'top', 'RadioTEDU Tee', 45, 'common', false, true),
    ('varsity-jacket', 'top', 'Varsity Jacket', 80, 'rare', false, true),
    ('jeans', 'bottom', 'Jeans', 0, 'default', true, true),
    ('black-cargos', 'bottom', 'Black Cargos', 60, 'common', false, true),
    ('sneakers', 'shoes', 'Sneakers', 0, 'default', true, true),
    ('boots', 'shoes', 'Boots', 50, 'common', false, true),
    ('bucket-hat', 'hat', 'Bucket Hat', 0, 'default', true, true),
    ('beanie', 'hat', 'Beanie', 35, 'common', false, true)
ON CONFLICT (item_id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_super_vote_at TIMESTAMP;

-- User Monthly Rank Scores Table
CREATE TABLE IF NOT EXISTS user_monthly_rank_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL, -- YYYY-MM, Istanbul month bucket
    score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_user_monthly_rank_scores_user_month
    ON user_monthly_rank_scores(user_id, year_month);

-- Guest Daily Song Limits Table
CREATE TABLE IF NOT EXISTS guest_daily_song_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint VARCHAR(255) NOT NULL,
    day_key DATE NOT NULL, -- Istanbul day bucket
    songs_added INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(fingerprint, day_key)
);
CREATE INDEX IF NOT EXISTS idx_guest_daily_song_limits_day_key
    ON guest_daily_song_limits(day_key);

-- Devices (Kiosk) Table
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    current_song_id UUID, -- Circular reference, handle carefully or add FK later if needed
    last_heartbeat TIMESTAMP,
    password VARCHAR(50), -- Registration & user connection password
    created_at TIMESTAMP DEFAULT NOW()
);

-- Songs Table (Hybrid Spotify + Local Catalog)
CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(20) NOT NULL DEFAULT 'local',
    visibility VARCHAR(20) NOT NULL DEFAULT 'public',
    asset_role VARCHAR(20) NOT NULL DEFAULT 'music',
    spotify_uri VARCHAR(100),
    spotify_id VARCHAR(50),
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200) NOT NULL,
    artist_id VARCHAR(50),
    album VARCHAR(200),
    cover_url VARCHAR(500),
    file_url VARCHAR(500),
    duration_ms INTEGER,
    duration_seconds INTEGER,
    is_explicit BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    genre VARCHAR(100),
    play_count INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    last_played_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_songs_search ON songs USING gin(to_tsvector('simple', title || ' ' || artist));

ALTER TABLE songs ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS visibility VARCHAR(20);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS asset_role VARCHAR(20);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_uri VARCHAR(100);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_id VARCHAR(50);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS artist_id VARCHAR(50);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_explicit BOOLEAN DEFAULT FALSE;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS genre VARCHAR(100);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMP;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'songs'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'spotify_uri'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE tablename = 'songs'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%(spotify_uri)%'
    ) THEN
        CREATE UNIQUE INDEX idx_songs_spotify_uri_unique ON songs(spotify_uri);
    END IF;
END $$;
UPDATE songs
SET source_type = CASE
    WHEN source_type IS NOT NULL THEN source_type
    WHEN spotify_uri IS NOT NULL OR spotify_id IS NOT NULL THEN 'spotify'
    ELSE 'local'
END;
UPDATE songs SET visibility = COALESCE(visibility, 'public');
UPDATE songs SET asset_role = COALESCE(asset_role, 'music');
ALTER TABLE songs ALTER COLUMN source_type SET DEFAULT 'local';
ALTER TABLE songs ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE songs ALTER COLUMN visibility SET DEFAULT 'public';
ALTER TABLE songs ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE songs ALTER COLUMN asset_role SET DEFAULT 'music';
ALTER TABLE songs ALTER COLUMN asset_role SET NOT NULL;
ALTER TABLE songs ALTER COLUMN spotify_uri DROP NOT NULL;
ALTER TABLE songs ALTER COLUMN spotify_id DROP NOT NULL;
ALTER TABLE songs ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE songs ALTER COLUMN duration_ms DROP NOT NULL;
ALTER TABLE songs ALTER COLUMN duration_seconds DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_songs_spotify_id ON songs(spotify_id);
CREATE INDEX IF NOT EXISTS idx_songs_blocked ON songs(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_songs_source_type ON songs(source_type);
CREATE INDEX IF NOT EXISTS idx_songs_visibility ON songs(visibility);
CREATE INDEX IF NOT EXISTS idx_songs_asset_role ON songs(asset_role);

-- Radio Profiles Table
CREATE TABLE IF NOT EXISTS radio_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    autoplay_spotify_playlist_uri VARCHAR(255),
    jingle_every_n_songs INTEGER,
    ad_break_interval_minutes INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_radio_profiles_name ON radio_profiles(name);
CREATE INDEX IF NOT EXISTS idx_radio_profiles_active ON radio_profiles(is_active);

-- Radio Profile Assets Table
CREATE TABLE IF NOT EXISTS radio_profile_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    radio_profile_id UUID NOT NULL REFERENCES radio_profiles(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    slot_type VARCHAR(20) NOT NULL,
    sort_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(radio_profile_id, song_id, slot_type)
);
CREATE INDEX IF NOT EXISTS idx_radio_profile_assets_lookup ON radio_profile_assets(radio_profile_id, slot_type);

-- Radio Profile Autoplay Stats Table
CREATE TABLE IF NOT EXISTS radio_profile_playlist_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    radio_profile_id UUID NOT NULL REFERENCES radio_profiles(id) ON DELETE CASCADE,
    spotify_uri VARCHAR(100) NOT NULL,
    play_count INTEGER NOT NULL DEFAULT 0,
    last_played_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(radio_profile_id, spotify_uri)
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS radio_profile_id UUID;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_autoplay_spotify_playlist_uri VARCHAR(255);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_jingle_every_n_songs INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS override_ad_break_interval_minutes INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ad_break_at TIMESTAMP;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS spotify_playback_device_id VARCHAR(255);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS spotify_player_name VARCHAR(200);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS spotify_player_connected_at TIMESTAMP;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS spotify_player_is_active BOOLEAN DEFAULT FALSE;
UPDATE devices SET override_enabled = COALESCE(override_enabled, FALSE);
UPDATE devices SET spotify_player_is_active = COALESCE(spotify_player_is_active, FALSE);
ALTER TABLE devices ALTER COLUMN override_enabled SET DEFAULT FALSE;
ALTER TABLE devices ALTER COLUMN override_enabled SET NOT NULL;
ALTER TABLE devices ALTER COLUMN spotify_player_is_active SET DEFAULT FALSE;
ALTER TABLE devices ALTER COLUMN spotify_player_is_active SET NOT NULL;

-- Add FK to devices.current_song_id now that songs exists
ALTER TABLE devices DROP CONSTRAINT IF EXISTS fk_devices_radio_profile;
ALTER TABLE devices ADD CONSTRAINT fk_devices_radio_profile FOREIGN KEY (radio_profile_id) REFERENCES radio_profiles(id);
ALTER TABLE devices DROP CONSTRAINT IF EXISTS fk_devices_current_song;
ALTER TABLE devices ADD CONSTRAINT fk_devices_current_song FOREIGN KEY (current_song_id) REFERENCES songs(id);

-- Queue Items Table
CREATE TABLE IF NOT EXISTS queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id),
    song_id UUID NOT NULL REFERENCES songs(id),
    added_by UUID NOT NULL REFERENCES users(id),
    queue_reason VARCHAR(20) NOT NULL DEFAULT 'user',
    autoplay_radio_profile_id UUID,
    status VARCHAR(20) DEFAULT 'pending', -- pending, playing, played, skipped
    priority_score DECIMAL(10,2) DEFAULT 0,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    position INTEGER,
    added_at TIMESTAMP DEFAULT NOW(),
    played_at TIMESTAMP
);
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS queue_reason VARCHAR(20);
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS autoplay_radio_profile_id UUID;
UPDATE queue_items SET queue_reason = COALESCE(queue_reason, 'user');
ALTER TABLE queue_items ALTER COLUMN queue_reason SET DEFAULT 'user';
ALTER TABLE queue_items ALTER COLUMN queue_reason SET NOT NULL;
ALTER TABLE queue_items DROP CONSTRAINT IF EXISTS fk_queue_items_autoplay_radio_profile;
ALTER TABLE queue_items ADD CONSTRAINT fk_queue_items_autoplay_radio_profile FOREIGN KEY (autoplay_radio_profile_id) REFERENCES radio_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_queue_device_status ON queue_items(device_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(device_id, priority_score DESC) WHERE status = 'pending';

-- Votes Table
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    vote_type SMALLINT NOT NULL, -- 1 = upvote, -1 = downvote, 3 = supervote
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(queue_item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_queue ON votes(queue_item_id);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_fingerprint VARCHAR(255),
    session_family_id UUID,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT refresh_tokens_user_session_family_key
        UNIQUE (user_id, session_family_id)
);
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS session_family_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'refresh_tokens_user_session_family_key'
          AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_user_session_family_key
            UNIQUE (user_id, session_family_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_family_expires
    ON refresh_tokens (user_id, session_family_id, expires_at)
    WHERE session_family_id IS NOT NULL;

-- ERP is the internal identity provider. An ERP login creates or links a user
-- in this public account pool; local app registration never writes to ERP.
CREATE TABLE IF NOT EXISTS external_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    display_name VARCHAR(255),
    roles JSONB NOT NULL DEFAULT '[]',
    permissions JSONB NOT NULL DEFAULT '[]',
    authorization_version BIGINT NOT NULL DEFAULT 1,
    access_token_ciphertext TEXT NOT NULL,
    refresh_token_ciphertext TEXT,
    token_expires_at TIMESTAMPTZ NOT NULL,
    last_verified_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider),
    UNIQUE(provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_external_identities_user
    ON external_identities(user_id, provider);

CREATE TABLE IF NOT EXISTS external_identity_link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'link'
        CHECK (purpose IN ('link', 'login')),
    state_hash CHAR(64) NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    return_uri TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    login_code_hash CHAR(64) UNIQUE,
    login_code_expires_at TIMESTAMPTZ,
    exchanged_at TIMESTAMPTZ,
    client_code_challenge VARCHAR(128),
    client_code_challenge_method VARCHAR(8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE external_identity_link_requests
    ADD COLUMN IF NOT EXISTS client_code_challenge VARCHAR(128),
    ADD COLUMN IF NOT EXISTS client_code_challenge_method VARCHAR(8);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'external_identity_link_requests_client_pkce_check'
          AND conrelid = 'external_identity_link_requests'::regclass
    ) THEN
        ALTER TABLE external_identity_link_requests
        ADD CONSTRAINT external_identity_link_requests_client_pkce_check
        CHECK (
            (client_code_challenge IS NULL AND client_code_challenge_method IS NULL)
            OR (
                client_code_challenge ~ '^[A-Za-z0-9_-]{43}$'
                AND client_code_challenge_method = 'S256'
            )
        );
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_external_identity_link_expiry
    ON external_identity_link_requests(expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_external_identity_login_code
    ON external_identity_link_requests(login_code_hash)
    WHERE exchanged_at IS NULL;

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- Radio Schedule Table
CREATE TABLE IF NOT EXISTS radio_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week SMALLINT NOT NULL, -- 0-6 (Sunday-Saturday)
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    show_name VARCHAR(200) NOT NULL,
    dj_name VARCHAR(100),
    description TEXT,
    is_live BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_day ON radio_schedule(day_of_week);

-- Device Sessions Table
CREATE TABLE IF NOT EXISTS device_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_lookup ON device_sessions(user_id, device_id);

-- Podcast Feed Registry Tables
CREATE TABLE IF NOT EXISTS podcast_feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255),
    feed_url TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMP,
    last_sync_error TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
    guid TEXT,
    episode_url TEXT,
    audio_url TEXT,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    image_url TEXT,
    published_at TIMESTAMP,
    author VARCHAR(255),
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_guid_unique
    ON podcast_episodes(feed_id, guid) WHERE guid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_audio_url_unique
    ON podcast_episodes(feed_id, audio_url) WHERE audio_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_feed_episode_url_unique
    ON podcast_episodes(feed_id, episode_url) WHERE episode_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published_at
    ON podcast_episodes(published_at DESC);

-- Gamification Tables
CREATE TABLE IF NOT EXISTS user_points (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    spendable_points INTEGER NOT NULL DEFAULT 0,
    monthly_points INTEGER NOT NULL DEFAULT 0,
    listening_points INTEGER NOT NULL DEFAULT 0,
    events_points INTEGER NOT NULL DEFAULT 0,
    games_points INTEGER NOT NULL DEFAULT 0,
    social_points INTEGER NOT NULL DEFAULT 0,
    jukebox_points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_points_lifetime ON user_points(lifetime_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_spendable ON user_points(spendable_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_monthly ON user_points(monthly_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_listening ON user_points(listening_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_events ON user_points(events_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_games ON user_points(games_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_social ON user_points(social_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_jukebox ON user_points(jukebox_points DESC);

CREATE TABLE IF NOT EXISTS points_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    category VARCHAR(30) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_created ON points_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_category_created ON points_ledger(category, created_at DESC);
ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
ALTER TABLE points_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_user_idempotency
    ON points_ledger(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_points_spendable_nonnegative'
    ) THEN
        ALTER TABLE user_points
        ADD CONSTRAINT user_points_spendable_nonnegative
        CHECK (spendable_points >= 0);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) UNIQUE NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    icon VARCHAR(120),
    category VARCHAR(30) NOT NULL DEFAULT 'general',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, awarded_at DESC);

CREATE TABLE IF NOT EXISTS market_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(160) NOT NULL,
    description TEXT,
    item_kind VARCHAR(30) NOT NULL DEFAULT 'digital',
    cost_points INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    stock_quantity INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_items_active_cost ON market_items(is_active, cost_points);

CREATE TABLE IF NOT EXISTS market_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_item_id UUID NOT NULL REFERENCES market_items(id) ON DELETE CASCADE,
    cost_points INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    redemption_code VARCHAR(120),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_redemptions_user ON market_redemptions(user_id, created_at DESC);
ALTER TABLE market_redemptions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_redemptions_user_idempotency
ON market_redemptions(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(180) NOT NULL,
    description TEXT,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    location VARCHAR(255),
    image_url TEXT,
    external_event_id VARCHAR(120),
    check_in_points INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_events_active_starts ON app_events(is_active, starts_at);

CREATE TABLE IF NOT EXISTS event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES app_events(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'registered',
    ticket_code VARCHAR(120),
    checked_in_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id, status);

CREATE TABLE IF NOT EXISTS qr_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(120) UNIQUE NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    event_id UUID REFERENCES app_events(id) ON DELETE SET NULL,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    max_claims_per_user INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qr_reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_reward_id UUID NOT NULL REFERENCES qr_rewards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(qr_reward_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_qr_reward_claims_user ON qr_reward_claims(user_id, claimed_at DESC);

CREATE TABLE IF NOT EXISTS arcade_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) UNIQUE NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    point_rate DECIMAL(10,4) NOT NULL DEFAULT 0,
    daily_point_limit INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arcade_games_active ON arcade_games(is_active, title);

CREATE TABLE IF NOT EXISTS game_score_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES arcade_games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 0,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_score_submissions_user_day ON game_score_submissions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_score_submissions_game_score ON game_score_submissions(game_id, score DESC);

CREATE TABLE IF NOT EXISTS listening_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(30) NOT NULL,
    content_id VARCHAR(120),
    content_title VARCHAR(500),
    started_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat_at TIMESTAMP DEFAULT NOW(),
    listened_seconds INTEGER NOT NULL DEFAULT 0,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_listening_sessions_user_started ON listening_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS study_room_presence (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    room_id VARCHAR(80) NOT NULL DEFAULT 'sesli-kutuphane',
    instance_id VARCHAR(96),
    client_session_id VARCHAR(128),
    day_key VARCHAR(10) NOT NULL,
    node_id VARCHAR(120) NOT NULL DEFAULT 'spawn',
    avatar_style VARCHAR(80) NOT NULL DEFAULT 'classic-red',
    position_x INTEGER NOT NULL DEFAULT 6,
    position_y INTEGER NOT NULL DEFAULT 8,
    studied_seconds_today INTEGER NOT NULL DEFAULT 0,
    studied_seconds_total INTEGER NOT NULL DEFAULT 0,
    current_session_started_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat_at TIMESTAMP DEFAULT NOW(),
    seat_id VARCHAR(80),
    presence_mode VARCHAR(24) NOT NULL DEFAULT 'studying' CHECK (presence_mode IN ('studying', 'break')),
    break_zone_id VARCHAR(80),
    equipped_outfit JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE study_room_presence ADD COLUMN IF NOT EXISTS node_id VARCHAR(120) NOT NULL DEFAULT 'spawn';
ALTER TABLE study_room_presence ADD COLUMN IF NOT EXISTS instance_id VARCHAR(96);
ALTER TABLE study_room_presence ADD COLUMN IF NOT EXISTS client_session_id VARCHAR(128);
UPDATE study_room_presence
SET instance_id = room_id || '-1'
WHERE instance_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_study_room_presence_room_active ON study_room_presence(room_id, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_room_presence_instance_active
    ON study_room_presence(instance_id, last_heartbeat_at DESC)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_study_room_presence_client_session
    ON study_room_presence(client_session_id, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_room_presence_room_seat_active ON study_room_presence(room_id, seat_id, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_room_presence_today ON study_room_presence(day_key, studied_seconds_today DESC);
CREATE INDEX IF NOT EXISTS idx_study_room_presence_total ON study_room_presence(studied_seconds_total DESC);

CREATE TABLE IF NOT EXISTS study_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan')),
    instance_id VARCHAR(96),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE study_chat_messages ADD COLUMN IF NOT EXISTS instance_id VARCHAR(96);
UPDATE study_chat_messages
SET instance_id = room_id || '-1'
WHERE instance_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_study_chat_room_created
    ON study_chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_chat_instance_created
    ON study_chat_messages(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_chat_user_created
    ON study_chat_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_profile_customization (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    favorite_song_title VARCHAR(255),
    favorite_song_artist VARCHAR(255),
    favorite_song_spotify_uri VARCHAR(120),
    favorite_artist_name VARCHAR(255),
    favorite_artist_spotify_id VARCHAR(120),
    favorite_podcast_id UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
    favorite_podcast_title VARCHAR(500),
    profile_headline VARCHAR(180),
    featured_badge_id UUID REFERENCES badges(id) ON DELETE SET NULL,
    theme_key VARCHAR(80),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL,
    target_id VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(120),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(comment_id, reporter_user_id)
);

-- Blocked Artists Table (Content Filtering)
CREATE TABLE IF NOT EXISTS blocked_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_name VARCHAR(200) NOT NULL,
    spotify_artist_id VARCHAR(50),
    blocked_by UUID REFERENCES users(id),
    reason VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_artists_spotify_id
    ON blocked_artists(spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;

-- Spotify OAuth Tokens Table
CREATE TABLE IF NOT EXISTS spotify_app_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    client_id VARCHAR(255) NOT NULL,
    client_secret TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spotify_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    scopes TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spotify_device_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
    spotify_account_id VARCHAR(100) NOT NULL,
    spotify_display_name VARCHAR(255) NOT NULL,
    spotify_email VARCHAR(255),
    spotify_product VARCHAR(50),
    spotify_country VARCHAR(10),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    scopes TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Radio Song History Table (now-playing log for live radio channels)
CREATE TABLE IF NOT EXISTS song_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    cover_url TEXT,
    played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_song_history_channel_played_at
    ON song_history(channel_id, played_at DESC);

-- RadioTEDU website library. Content IDs are WordPress stable IDs rather than
-- database foreign keys so accounts stay portable across editorial migrations.
CREATE TABLE IF NOT EXISTS user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL
        CHECK (kind IN ('station', 'podcast_show', 'podcast_episode')),
    content_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    subtitle VARCHAR(500),
    artwork_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, kind, content_id)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_created
    ON user_favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listening_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id VARCHAR(255) NOT NULL,
    position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    title VARCHAR(500),
    subtitle VARCHAR(500),
    artwork_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_listening_progress_user_updated
    ON listening_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS listening_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL
        CHECK (kind IN ('station', 'podcast_show', 'podcast_episode')),
    content_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    subtitle VARCHAR(500),
    artwork_url TEXT,
    event_type VARCHAR(20) NOT NULL DEFAULT 'play'
        CHECK (event_type IN ('play', 'resume', 'complete')),
    position_seconds INTEGER CHECK (position_seconds IS NULL OR position_seconds >= 0),
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    listened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listening_history_user_listened
    ON listening_history(user_id, listened_at DESC);
-- RadioTEDU Study-only moderation model. This migration does not alter shared
-- account, ERP, mail, WordPress, or unrelated application records.
CREATE TABLE IF NOT EXISTS study_moderation_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    is_protected_service BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_moderation_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    capability VARCHAR(48) NOT NULL CHECK (capability IN (
        'study.moderation.read',
        'study.moderation.ban',
        'study.moderation.unban',
        'study.moderation.reports',
        'study.moderation.audit'
    )),
    source_ref VARCHAR(160) NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP,
    UNIQUE (user_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_study_moderation_capabilities_active
    ON study_moderation_capabilities(user_id, capability)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS study_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason VARCHAR(40) NOT NULL CHECK (reason IN ('harassment', 'spam', 'unsafe-profile', 'other')),
    note VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMP,
    revoke_note VARCHAR(500),
    CHECK (target_user_id <> created_by),
    CHECK (expires_at IS NULL OR expires_at > created_at),
    CHECK (
        (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
        OR (status = 'expired' AND revoked_at IS NULL AND revoked_by IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_bans_one_active_per_user
    ON study_bans(target_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_study_bans_target_history
    ON study_bans(target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS study_moderation_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(48) NOT NULL,
    idempotency_key UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json JSONB,
    status_code INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    UNIQUE (operator_user_id, action, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_study_moderation_idempotency_created
    ON study_moderation_idempotency(created_at DESC);

CREATE TABLE IF NOT EXISTS study_moderation_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(48) NOT NULL CHECK (action IN (
        'ban-created',
        'ban-revoked',
        'ban-expired',
        'report-resolved',
        'report-dismissed'
    )),
    operator_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ban_id UUID REFERENCES study_bans(id) ON DELETE RESTRICT,
    report_id UUID REFERENCES study_player_reports(id) ON DELETE RESTRICT,
    reason VARCHAR(40),
    note VARCHAR(500) NOT NULL,
    request_id UUID NOT NULL,
    idempotency_key UUID,
    expires_at TIMESTAMP,
    previous_event_hash CHAR(64),
    event_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_moderation_audit_request
    ON study_moderation_audit_events(request_id);
CREATE INDEX IF NOT EXISTS idx_study_moderation_audit_created
    ON study_moderation_audit_events(created_at DESC, id DESC);

ALTER TABLE study_player_reports
    ADD COLUMN IF NOT EXISTS summary VARCHAR(500),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS review_note VARCHAR(500);

ALTER TABLE study_player_reports
    DROP CONSTRAINT IF EXISTS study_player_reports_status_check;
ALTER TABLE study_player_reports
    ADD CONSTRAINT study_player_reports_status_check
    CHECK (status IN ('open', 'resolved', 'dismissed'));

-- Shared account and Gold economy v2. All changes are additive. ERP and
-- WordPress identities remain external clients of this application database.
ALTER TABLE user_profile_customization
    ADD COLUMN IF NOT EXISTS department VARCHAR(160),
    ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS legal_acceptance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('registration', 'erp-first-login')),
    terms_version VARCHAR(32) NOT NULL,
    privacy_version VARCHAR(32) NOT NULL,
    age_18_confirmed BOOLEAN,
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('web', 'mobile', 'erp')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_type)
);

CREATE TABLE IF NOT EXISTS gold_economy_rules (
    rule_key VARCHAR(64) PRIMARY KEY,
    direction VARCHAR(8) NOT NULL CHECK (direction IN ('earn', 'spend')),
    amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000),
    daily_cap INTEGER CHECK (daily_cap IS NULL OR daily_cap BETWEEN 1 AND 100000),
    category VARCHAR(30) NOT NULL CHECK (category IN ('listening', 'events', 'games', 'social', 'jukebox')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description VARCHAR(240) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gold_economy_rules (rule_key, direction, amount, daily_cap, category, description)
VALUES
    ('first_login', 'earn', 25, NULL, 'social', 'First successful RadioTEDU or TEDU ERP sign-in'),
    ('profile_complete', 'earn', 40, NULL, 'social', 'Complete the account profile including department'),
    ('radio_hour', 'earn', 20, 40, 'listening', 'Every verified 60 minutes of RadioTEDU listening'),
    ('focus_25', 'earn', 15, 45, 'social', 'Complete a verified 25 minute Focus session'),
    ('study_minute', 'earn', 1, 25, 'social', 'Every verified minute in Study'),
    ('ai_message', 'spend', 5, NULL, 'social', 'Send one listener message to RTAI')
ON CONFLICT (rule_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS verified_listening_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    channel_id VARCHAR(40) NOT NULL,
    client_session_id VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'expired')),
    current_nonce_hash CHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    eligible_seconds INTEGER NOT NULL DEFAULT 0 CHECK (eligible_seconds >= 0),
    valid_heartbeat_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_heartbeat_count >= 0),
    last_ip INET,
    user_agent VARCHAR(500),
    UNIQUE (user_id, client_session_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_listening_one_active
    ON verified_listening_sessions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_verified_listening_user_created
    ON verified_listening_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS gold_activity_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    activity_key VARCHAR(64) NOT NULL,
    eligible_seconds BIGINT NOT NULL DEFAULT 0 CHECK (eligible_seconds >= 0),
    completed_units BIGINT NOT NULL DEFAULT 0 CHECK (completed_units >= 0),
    rewarded_units BIGINT NOT NULL DEFAULT 0 CHECK (rewarded_units >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_key)
);

CREATE TABLE IF NOT EXISTS focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    client_session_id VARCHAR(128) NOT NULL,
    target_seconds INTEGER NOT NULL DEFAULT 1500 CHECK (target_seconds BETWEEN 300 AND 7200),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    current_nonce_hash CHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    eligible_seconds INTEGER NOT NULL DEFAULT 0 CHECK (eligible_seconds >= 0),
    valid_heartbeat_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_heartbeat_count >= 0),
    awarded_points INTEGER NOT NULL DEFAULT 0 CHECK (awarded_points >= 0),
    last_ip INET,
    user_agent VARCHAR(500),
    UNIQUE (user_id, client_session_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_sessions_one_active
    ON focus_sessions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_created
    ON focus_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_listener_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 800),
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'received', 'reviewed', 'rejected')),
    cost_points INTEGER NOT NULL CHECK (cost_points > 0),
    ledger_id UUID REFERENCES points_ledger(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(180) NOT NULL,
    moderation_reason VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_listener_messages_user_created
    ON ai_listener_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_listener_messages_status_created
    ON ai_listener_messages(status, created_at ASC);

CREATE TABLE IF NOT EXISTS study_shop_items (
    item_id VARCHAR(80) PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(280) NOT NULL,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('computer')),
    cost_points INTEGER NOT NULL CHECK (cost_points >= 0),
    rarity VARCHAR(20) NOT NULL DEFAULT 'common',
    asset_key VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO study_shop_items (item_id, title, description, kind, cost_points, rarity, asset_key)
VALUES
    ('computer-slate', 'SlateBook 14', 'A compact study laptop for your desk.', 'computer', 250, 'common', 'computer-slate'),
    ('computer-coral', 'Coral Desktop', 'A quiet desktop setup with a warm RadioTEDU accent.', 'computer', 450, 'rare', 'computer-coral'),
    ('computer-gold', 'Gold Studio', 'A premium dual-screen workstation for long sessions.', 'computer', 750, 'epic', 'computer-gold')
ON CONFLICT (item_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS study_user_items (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    item_id VARCHAR(80) NOT NULL REFERENCES study_shop_items(item_id) ON DELETE RESTRICT,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS study_user_equipment (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('computer')),
    item_id VARCHAR(80) NOT NULL REFERENCES study_shop_items(item_id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS gold_admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_identifier VARCHAR(160) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    csrf_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_ip INET,
    user_agent VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS idx_gold_admin_sessions_expiry
    ON gold_admin_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS gold_admin_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_identifier VARCHAR(160) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    reason VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}',
    previous_event_hash CHAR(64),
    event_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id)
);
CREATE INDEX IF NOT EXISTS idx_gold_admin_audit_created
    ON gold_admin_audit_events(created_at DESC);

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

INSERT INTO arcade_games (id, slug, title, description, point_rate, daily_point_limit, is_active, metadata)
VALUES
    ('9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e201', 'snake', 'Neon Snake', 'Collect notes and protect three lives.', 0.05, 10, TRUE, '{"surface":"mobile","verification":"client-timed-session"}'::jsonb),
    ('9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e202', 'memory', 'Memory', 'Match the RadioTEDU cards.', 0.01, 10, TRUE, '{"surface":"mobile","verification":"client-timed-session"}'::jsonb),
    ('9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e203', 'tetris', 'Blocks', 'Clear lines in the RadioTEDU block game.', 0.01, 10, TRUE, '{"surface":"mobile","verification":"client-timed-session"}'::jsonb),
    ('9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e204', 'rhythm-tap', 'Song Guess', 'Guess the song from visual clues.', 0.005, 10, TRUE, '{"surface":"mobile","verification":"client-timed-session"}'::jsonb),
    ('9a6b61e3-9a4e-4f7d-8a15-8b5b1ad7e205', 'word-guess', 'Music IQ', 'Answer music questions from the RadioTEDU catalog.', 0.005, 10, TRUE, '{"surface":"mobile","verification":"client-timed-session"}'::jsonb)
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
