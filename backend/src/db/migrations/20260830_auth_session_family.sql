BEGIN;

-- Nullable keeps pre-session-family refresh rows usable until their existing
-- token/database expiry. All newly issued sessions populate this UUID.
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

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_family_expires
    ON refresh_tokens (user_id, session_family_id, expires_at)
    WHERE session_family_id IS NOT NULL;

COMMIT;
