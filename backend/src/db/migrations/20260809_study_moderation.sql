BEGIN;

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

COMMIT;
