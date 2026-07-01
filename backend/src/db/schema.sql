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
    playback_provider VARCHAR(50),
    playback_agent_socket_id VARCHAR(120),
    playback_agent_connected_at TIMESTAMP,
    playback_agent_last_seen_at TIMESTAMP,
    playback_state VARCHAR(40),
    playback_state_source VARCHAR(60),
    playback_last_event VARCHAR(60),
    playback_last_event_at TIMESTAMP,
    playback_last_error TEXT,
    playback_debug JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_playback_provider ON devices(playback_provider);

-- Songs Table
CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200) NOT NULL,
    album VARCHAR(200),
    duration_seconds INTEGER NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    cover_url VARCHAR(500),
    genre VARCHAR(50),
    play_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_songs_search ON songs USING gin(to_tsvector('simple', title || ' ' || artist));

-- Add FK to devices.current_song_id now that songs exists
ALTER TABLE devices DROP CONSTRAINT IF EXISTS fk_devices_current_song;
ALTER TABLE devices ADD CONSTRAINT fk_devices_current_song FOREIGN KEY (current_song_id) REFERENCES songs(id);

-- Queue Items Table
CREATE TABLE IF NOT EXISTS queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id),
    song_id UUID NOT NULL REFERENCES songs(id),
    added_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, playing, played, skipped
    priority_score DECIMAL(10,2) DEFAULT 0,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    position INTEGER,
    added_at TIMESTAMP DEFAULT NOW(),
    played_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_queue_device_status ON queue_items(device_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(device_id, priority_score DESC) WHERE status = 'pending';

-- Votes Table
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    vote_type SMALLINT NOT NULL, -- 1 = upvote, -1 = downvote
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(queue_item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_queue ON votes(queue_item_id);

-- Next Song Voting Tables (separate from Jukebox queue voting)
CREATE TABLE IF NOT EXISTS next_song_vote_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    prompt VARCHAR(300),
    agent_id VARCHAR(120),
    started_at TIMESTAMP DEFAULT NOW(),
    locked_at TIMESTAMP,
    resolved_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    expires_at TIMESTAMP,
    winning_candidate_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_next_song_vote_round_status CHECK (status IN ('active', 'locked', 'resolved', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_next_song_vote_rounds_active ON next_song_vote_rounds(device_id, started_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_next_song_vote_rounds_status ON next_song_vote_rounds(status, started_at DESC);

CREATE TABLE IF NOT EXISTS next_song_vote_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
    external_id VARCHAR(200),
    song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    album VARCHAR(200),
    duration_seconds INTEGER,
    artwork_url VARCHAR(1000),
    preview_url VARCHAR(1000),
    stream_url VARCHAR(1000),
    metadata JSONB DEFAULT '{}'::jsonb,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_next_song_vote_candidates_round ON next_song_vote_candidates(round_id, position);

ALTER TABLE next_song_vote_rounds DROP CONSTRAINT IF EXISTS fk_next_song_vote_winner;
ALTER TABLE next_song_vote_rounds
    ADD CONSTRAINT fk_next_song_vote_winner
    FOREIGN KEY (winning_candidate_id) REFERENCES next_song_vote_candidates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS next_song_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES next_song_vote_candidates(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_fingerprint VARCHAR(128),
    ip_hash VARCHAR(128),
    user_agent_hash VARCHAR(128),
    vote_weight DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_user_once ON next_song_votes(round_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_guest_once ON next_song_votes(round_id, guest_fingerprint) WHERE user_id IS NULL AND guest_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_next_song_votes_guest_ip_ua_once ON next_song_votes(round_id, ip_hash, user_agent_hash) WHERE user_id IS NULL AND ip_hash IS NOT NULL AND user_agent_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_next_song_votes_candidate ON next_song_votes(candidate_id);

CREATE TABLE IF NOT EXISTS next_song_vote_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES next_song_vote_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_type VARCHAR(40) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(round_id, user_id, reward_type)
);
CREATE INDEX IF NOT EXISTS idx_next_song_vote_rewards_user ON next_song_vote_rewards(user_id, created_at DESC);

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
