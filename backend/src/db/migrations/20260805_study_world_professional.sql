BEGIN;

-- Study-only tables. Existing WordPress and shared application tables are not altered.
CREATE TABLE IF NOT EXISTS study_world_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan', 'sports-center', 'auditorium', 'learning-lab')),
    instance_id VARCHAR(96) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_world_chat_instance_created
    ON study_world_chat_messages(room_id, instance_id, created_at DESC);

INSERT INTO study_world_chat_messages (id, room_id, instance_id, user_id, message_text, created_at)
SELECT id, room_id, COALESCE(instance_id, room_id || '-1'), user_id, message_text, created_at
FROM study_chat_messages
WHERE room_id IN ('library', 'chim-alan')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS study_player_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan', 'sports-center', 'auditorium', 'learning-lab')),
    instance_id VARCHAR(96) NOT NULL,
    reason VARCHAR(40) NOT NULL CHECK (reason IN ('harassment', 'spam', 'unsafe-profile', 'other')),
    idempotency_key VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    CHECK (reporter_user_id <> target_user_id),
    UNIQUE (reporter_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_study_player_reports_open
    ON study_player_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS study_seat_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan', 'sports-center', 'auditorium', 'learning-lab')),
    instance_id VARCHAR(96) NOT NULL,
    seat_id VARCHAR(80) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_session_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMP NOT NULL DEFAULT NOW(),
    released_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_seat_reservations_active_seat
    ON study_seat_reservations(room_id, instance_id, seat_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_seat_reservations_active_user
    ON study_seat_reservations(room_id, user_id)
    WHERE is_active = TRUE;

COMMIT;
