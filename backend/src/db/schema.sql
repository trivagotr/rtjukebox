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
    is_banned BOOLEAN DEFAULT FALSE,
    fcm_token VARCHAR(500),
    push_preferences JSONB DEFAULT '{"podcast": true, "radio": true, "jukebox": true}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

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
