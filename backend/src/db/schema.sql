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
    created_at TIMESTAMP DEFAULT NOW()
);

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
