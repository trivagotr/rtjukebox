# RadioTEDU - Data Model

## Veritabanı Şeması (PostgreSQL)

### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    rank_score INTEGER DEFAULT 0,
    total_songs_added INTEGER DEFAULT 0,
    total_upvotes_received INTEGER DEFAULT 0,
    total_downvotes_received INTEGER DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    fcm_token VARCHAR(500),
    push_preferences JSONB DEFAULT '{"podcast": true, "radio": true, "jukebox": true}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_rank ON users(rank_score DESC);
CREATE INDEX idx_users_email ON users(email);
```

### devices (Kiosk cihazlar)
```sql
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code VARCHAR(20) UNIQUE NOT NULL, -- QR'da gömülü
    name VARCHAR(100) NOT NULL, -- "Yemekhane-1"
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    current_song_id UUID REFERENCES songs(id),
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### songs (Şarkı kataloğu)
```sql
CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200) NOT NULL,
    album VARCHAR(200),
    duration_seconds INTEGER NOT NULL,
    file_url VARCHAR(500) NOT NULL, -- Sunucudaki mp3 path
    cover_url VARCHAR(500),
    genre VARCHAR(50),
    play_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_songs_search ON songs USING gin(to_tsvector('simple', title || ' ' || artist));
```

### queue_items (Sıradaki şarkılar)
```sql
CREATE TABLE queue_items (
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
CREATE INDEX idx_queue_device_status ON queue_items(device_id, status);
CREATE INDEX idx_queue_priority ON queue_items(device_id, priority_score DESC) WHERE status = 'pending';
```

### votes
```sql
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    vote_type SMALLINT NOT NULL, -- 1 = upvote, -1 = downvote
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(queue_item_id, user_id) -- Kullanıcı başına tek oy
);
CREATE INDEX idx_votes_queue ON votes(queue_item_id);
```

### refresh_tokens
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_fingerprint VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
```

## Entity Relationship Diagram

```
┌─────────┐      ┌─────────────┐      ┌─────────┐
│  users  │──1:N─│ queue_items │──N:1─│  songs  │
└────┬────┘      └──────┬──────┘      └─────────┘
     │                  │
     │            ┌─────▼─────┐
     └────1:N─────│   votes   │
                  └───────────┘

┌─────────┐      ┌─────────────┐
│ devices │──1:N─│ queue_items │
└─────────┘      └─────────────┘
```
