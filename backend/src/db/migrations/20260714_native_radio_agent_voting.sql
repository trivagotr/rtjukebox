-- Narrow, forward-only production migration for the native radio-agent voting transport.
-- Applied by src/db/migrateVotingAgent.js inside a single transaction.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('radiotedu_next_song_voting_active_round'));

ALTER TABLE next_song_vote_rounds ADD COLUMN IF NOT EXISTS lock_at TIMESTAMPTZ;
ALTER TABLE next_song_vote_rounds ADD COLUMN IF NOT EXISTS resolve_at TIMESTAMPTZ;
ALTER TABLE next_song_vote_candidates ADD COLUMN IF NOT EXISTS album_art_sha256 CHAR(64);

-- A pre-migration active round cannot be resumed safely without its planned
-- lock/resolve schedule. Cancel only those legacy active rows.
UPDATE next_song_vote_rounds
SET status = 'cancelled', updated_at = NOW()
WHERE status IN ('open', 'locked')
  AND (lock_at IS NULL OR resolve_at IS NULL);

-- Defensive cleanup for installations that accumulated more than one active
-- scheduled round before the partial unique index existed.
WITH ranked_active_rounds AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY opened_at DESC, updated_at DESC, id DESC) AS active_rank
  FROM next_song_vote_rounds
  WHERE status IN ('open', 'locked')
)
UPDATE next_song_vote_rounds AS rounds
SET status = 'cancelled', updated_at = NOW()
FROM ranked_active_rounds AS ranked
WHERE rounds.id = ranked.id AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_next_song_vote_rounds_single_active
  ON next_song_vote_rounds ((1))
  WHERE status IN ('open', 'locked');
CREATE INDEX IF NOT EXISTS idx_next_song_vote_rounds_active
  ON next_song_vote_rounds(status, opened_at DESC);

-- Agent URLs are never trusted. Existing missing/external cover values become
-- a backend-owned same-origin fallback; generated assets retain their hashes.
UPDATE next_song_vote_candidates
SET album_art_url = '/uploads/next-song-voting/fallback.png',
    album_art_sha256 = NULL
WHERE album_art_url IS NULL
   OR album_art_url !~ '^/uploads/next-song-voting/(fallback\.png|[a-f0-9]{48}\.webp)$';
