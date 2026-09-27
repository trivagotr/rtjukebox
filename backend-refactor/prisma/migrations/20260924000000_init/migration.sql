-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "is_guest" BOOLEAN DEFAULT false,
    "role" VARCHAR(20) DEFAULT 'user',
    "rank_score" INTEGER DEFAULT 0,
    "vote_weight" DECIMAL(5,2) DEFAULT 1.0,
    "total_songs_added" INTEGER DEFAULT 0,
    "total_upvotes_received" INTEGER DEFAULT 0,
    "total_downvotes_received" INTEGER DEFAULT 0,
    "last_super_vote_at" TIMESTAMP(6),
    "is_banned" BOOLEAN DEFAULT false,
    "user_agent" TEXT,
    "fcm_token" VARCHAR(500),
    "push_preferences" JSONB DEFAULT '{"podcast":true,"radio":true,"jukebox":true}',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_fingerprint" VARCHAR(255),
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_login_attempts" (
    "identifier_hash" CHAR(64) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_login_attempts_pkey" PRIMARY KEY ("identifier_hash")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "location" VARCHAR(200),
    "is_active" BOOLEAN DEFAULT true,
    "current_song_id" UUID,
    "last_heartbeat" TIMESTAMP(6),
    "password" VARCHAR(50),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "radio_profile_id" UUID,
    "override_enabled" BOOLEAN NOT NULL DEFAULT false,
    "override_autoplay_spotify_playlist_uri" VARCHAR(255),
    "override_jingle_every_n_songs" INTEGER,
    "override_ad_break_interval_minutes" INTEGER,
    "last_ad_break_at" TIMESTAMP(6),
    "spotify_playback_device_id" VARCHAR(255),
    "spotify_player_name" VARCHAR(200),
    "spotify_player_connected_at" TIMESTAMP(6),
    "spotify_player_is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_daily_song_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint" VARCHAR(255) NOT NULL,
    "day_key" DATE NOT NULL,
    "songs_added" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_daily_song_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_provisioning_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_by" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_provisioning_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_credentials" (
    "device_id" UUID NOT NULL,
    "credential_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_credentials_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'local',
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "asset_role" VARCHAR(20) NOT NULL DEFAULT 'music',
    "spotify_uri" VARCHAR(100),
    "spotify_id" VARCHAR(50),
    "title" VARCHAR(200) NOT NULL,
    "artist" VARCHAR(200) NOT NULL,
    "artist_id" VARCHAR(50),
    "album" VARCHAR(200),
    "cover_url" VARCHAR(500),
    "file_url" VARCHAR(500),
    "duration_ms" INTEGER,
    "duration_seconds" INTEGER,
    "is_explicit" BOOLEAN DEFAULT false,
    "is_blocked" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "genre" VARCHAR(100),
    "play_count" INTEGER DEFAULT 0,
    "score" INTEGER DEFAULT 0,
    "last_played_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "added_by" UUID NOT NULL,
    "queue_reason" VARCHAR(20) NOT NULL DEFAULT 'user',
    "autoplay_radio_profile_id" UUID,
    "status" VARCHAR(20) DEFAULT 'pending',
    "priority_score" DECIMAL(10,2) DEFAULT 0,
    "upvotes" INTEGER DEFAULT 0,
    "downvotes" INTEGER DEFAULT 0,
    "position" INTEGER,
    "added_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "played_at" TIMESTAMP(6),

    CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "queue_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vote_type" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day_of_week" SMALLINT NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "show_name" VARCHAR(200) NOT NULL,
    "dj_name" VARCHAR(100),
    "description" TEXT,
    "is_live" BOOLEAN DEFAULT true,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "cover_url" TEXT,
    "played_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_feeds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255),
    "feed_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(6),
    "last_sync_error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "podcast_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_episodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feed_id" UUID NOT NULL,
    "guid" TEXT,
    "episode_url" TEXT,
    "audio_url" TEXT,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "published_at" TIMESTAMP(6),
    "author" VARCHAR(255),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "podcast_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "autoplay_spotify_playlist_uri" VARCHAR(255),
    "jingle_every_n_songs" INTEGER,
    "ad_break_interval_minutes" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_profile_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "radio_profile_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "slot_type" VARCHAR(20) NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_profile_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_profile_playlist_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "radio_profile_id" UUID NOT NULL,
    "spotify_uri" VARCHAR(100) NOT NULL,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_profile_playlist_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_app_config" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "client_id" VARCHAR(255) NOT NULL,
    "client_secret" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotify_app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_auth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(6) NOT NULL,
    "scopes" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotify_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_oauth_states" (
    "state_hash" CHAR(64) NOT NULL,
    "state_kind" VARCHAR(16) NOT NULL DEFAULT 'admin',
    "device_id" UUID,
    "return_origin" VARCHAR(2048),
    "code_verifier" VARCHAR(128),
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotify_oauth_states_pkey" PRIMARY KEY ("state_hash")
);

-- CreateTable
CREATE TABLE "spotify_device_auth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "spotify_account_id" VARCHAR(100) NOT NULL,
    "spotify_display_name" VARCHAR(255) NOT NULL,
    "spotify_email" VARCHAR(255),
    "spotify_product" VARCHAR(50),
    "spotify_country" VARCHAR(10),
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(6) NOT NULL,
    "scopes" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotify_device_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_artists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artist_name" VARCHAR(200) NOT NULL,
    "spotify_artist_id" VARCHAR(50),
    "blocked_by" UUID,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_keywords" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "word" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) DEFAULT 'profanity',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_filter_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "lyrics_filter_enabled" BOOLEAN DEFAULT true,
    "block_unverified_obscure_tracks" BOOLEAN DEFAULT true,
    "min_popularity_without_lyrics" INTEGER DEFAULT 15,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_filter_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile_customization" (
    "user_id" UUID NOT NULL,
    "favorite_song_title" VARCHAR(255),
    "favorite_song_artist" VARCHAR(255),
    "favorite_song_spotify_uri" VARCHAR(120),
    "favorite_artist_name" VARCHAR(255),
    "favorite_artist_spotify_id" VARCHAR(120),
    "favorite_podcast_id" UUID,
    "favorite_podcast_title" VARCHAR(500),
    "profile_headline" VARCHAR(180),
    "featured_badge_id" UUID,
    "theme_key" VARCHAR(80),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profile_customization_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" inet,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_rank" ON "users"("rank_score" DESC);

-- CreateIndex
CREATE INDEX "idx_refresh_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_auth_login_attempts_locked_until" ON "auth_login_attempts"("locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_code_key" ON "devices"("device_code");

-- CreateIndex
CREATE INDEX "idx_device_sessions_lookup" ON "device_sessions"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_user_id_device_id_key" ON "device_sessions"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "idx_guest_daily_song_limits_day_key" ON "guest_daily_song_limits"("day_key");

-- CreateIndex
CREATE UNIQUE INDEX "guest_daily_song_limits_fingerprint_day_key_key" ON "guest_daily_song_limits"("fingerprint", "day_key");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_provisioning_codes_code_hash_key" ON "kiosk_provisioning_codes"("code_hash");

-- CreateIndex
CREATE INDEX "idx_kiosk_provisioning_codes_device" ON "kiosk_provisioning_codes"("device_id", "expires_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_credentials_credential_hash_key" ON "kiosk_credentials"("credential_hash");

-- CreateIndex
CREATE UNIQUE INDEX "idx_songs_spotify_uri_unique" ON "songs"("spotify_uri");

-- CreateIndex
CREATE INDEX "idx_queue_device_status" ON "queue_items"("device_id", "status");

-- CreateIndex
CREATE INDEX "idx_votes_queue" ON "votes"("queue_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_queue_item_id_user_id_key" ON "votes"("queue_item_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_schedule_day" ON "radio_schedule"("day_of_week");

-- CreateIndex
CREATE INDEX "idx_song_history_channel_played_at" ON "song_history"("channel_id", "played_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "podcast_feeds_feed_url_key" ON "podcast_feeds"("feed_url");

-- CreateIndex
CREATE INDEX "idx_podcast_episodes_published_at" ON "podcast_episodes"("published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idx_podcast_episodes_feed_guid_unique" ON "podcast_episodes"("feed_id", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "idx_podcast_episodes_feed_audio_url_unique" ON "podcast_episodes"("feed_id", "audio_url");

-- CreateIndex
CREATE UNIQUE INDEX "idx_podcast_episodes_feed_episode_url_unique" ON "podcast_episodes"("feed_id", "episode_url");

-- CreateIndex
CREATE INDEX "idx_radio_profiles_name" ON "radio_profiles"("name");

-- CreateIndex
CREATE INDEX "idx_radio_profiles_active" ON "radio_profiles"("is_active");

-- CreateIndex
CREATE INDEX "idx_radio_profile_assets_lookup" ON "radio_profile_assets"("radio_profile_id", "slot_type");

-- CreateIndex
CREATE UNIQUE INDEX "radio_profile_assets_radio_profile_id_song_id_slot_type_key" ON "radio_profile_assets"("radio_profile_id", "song_id", "slot_type");

-- CreateIndex
CREATE UNIQUE INDEX "radio_profile_playlist_stats_radio_profile_id_spotify_uri_key" ON "radio_profile_playlist_stats"("radio_profile_id", "spotify_uri");

-- CreateIndex
CREATE INDEX "idx_spotify_oauth_states_expires_at" ON "spotify_oauth_states"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_device_auth_device_id_key" ON "spotify_device_auth"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_blocked_artists_spotify_id" ON "blocked_artists"("spotify_artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_keywords_word_key" ON "blocked_keywords"("word");

-- CreateIndex
CREATE INDEX "idx_blocked_keywords_word" ON "blocked_keywords"("word");

-- CreateIndex
CREATE INDEX "idx_audit_user" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_action" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_radio_profile_id_fkey" FOREIGN KEY ("radio_profile_id") REFERENCES "radio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_provisioning_codes" ADD CONSTRAINT "kiosk_provisioning_codes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_provisioning_codes" ADD CONSTRAINT "kiosk_provisioning_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_credentials" ADD CONSTRAINT "kiosk_credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_autoplay_radio_profile_id_fkey" FOREIGN KEY ("autoplay_radio_profile_id") REFERENCES "radio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "podcast_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_profile_assets" ADD CONSTRAINT "radio_profile_assets_radio_profile_id_fkey" FOREIGN KEY ("radio_profile_id") REFERENCES "radio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_profile_assets" ADD CONSTRAINT "radio_profile_assets_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_profile_playlist_stats" ADD CONSTRAINT "radio_profile_playlist_stats_radio_profile_id_fkey" FOREIGN KEY ("radio_profile_id") REFERENCES "radio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_auth" ADD CONSTRAINT "spotify_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_oauth_states" ADD CONSTRAINT "spotify_oauth_states_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_device_auth" ADD CONSTRAINT "spotify_device_auth_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_artists" ADD CONSTRAINT "blocked_artists_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile_customization" ADD CONSTRAINT "user_profile_customization_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
