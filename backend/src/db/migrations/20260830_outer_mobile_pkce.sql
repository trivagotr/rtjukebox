BEGIN;

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

COMMIT;
