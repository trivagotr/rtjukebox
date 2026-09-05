BEGIN;

ALTER TABLE study_room_presence
    ADD COLUMN IF NOT EXISTS node_id VARCHAR(120) NOT NULL DEFAULT 'spawn';
ALTER TABLE study_room_presence
    ADD COLUMN IF NOT EXISTS instance_id VARCHAR(96);
ALTER TABLE study_room_presence
    ADD COLUMN IF NOT EXISTS client_session_id VARCHAR(128);

UPDATE study_room_presence
SET instance_id = room_id || '-1'
WHERE instance_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_study_room_presence_instance_active
    ON study_room_presence(instance_id, last_heartbeat_at DESC)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_study_room_presence_client_session
    ON study_room_presence(client_session_id, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS study_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(40) NOT NULL CHECK (room_id IN ('library', 'chim-alan')),
    instance_id VARCHAR(96),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_chat_instance_created
    ON study_chat_messages(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_chat_user_created
    ON study_chat_messages(user_id, created_at DESC);

ALTER TABLE points_ledger
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);
ALTER TABLE points_ledger
    ADD COLUMN IF NOT EXISTS balance_after INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_user_idempotency
    ON points_ledger(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMIT;
