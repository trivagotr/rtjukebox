import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

type ProfilePayload = {
    favorite_song_title: string | null;
    favorite_song_artist: string | null;
    favorite_song_spotify_uri: string | null;
    favorite_artist_name: string | null;
    favorite_artist_spotify_id: string | null;
    favorite_podcast_id: string | null;
    favorite_podcast_title: string | null;
    profile_headline: string | null;
    featured_badge_id: string | null;
    theme_key: string | null;
};

function normalizeOptionalString(value: unknown, maxLength: number) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
}

export function normalizeProfileCustomizationPayload(input: Record<string, unknown>): ProfilePayload {
    return {
        favorite_song_title: normalizeOptionalString(input.favorite_song_title, 255),
        favorite_song_artist: normalizeOptionalString(input.favorite_song_artist, 255),
        favorite_song_spotify_uri: normalizeOptionalString(input.favorite_song_spotify_uri, 120),
        favorite_artist_name: normalizeOptionalString(input.favorite_artist_name, 255),
        favorite_artist_spotify_id: normalizeOptionalString(input.favorite_artist_spotify_id, 120),
        favorite_podcast_id: normalizeOptionalString(input.favorite_podcast_id, 80),
        favorite_podcast_title: normalizeOptionalString(input.favorite_podcast_title, 500),
        profile_headline: normalizeOptionalString(input.profile_headline, 180),
        featured_badge_id: normalizeOptionalString(input.featured_badge_id, 80),
        theme_key: normalizeOptionalString(input.theme_key, 80),
    };
}

function mapProfileRow(row: Record<string, unknown>) {
    return {
        user_id: row.user_id,
        display_name: row.display_name ?? null,
        avatar_url: row.avatar_url ?? null,
        favorite_song_title: row.favorite_song_title ?? null,
        favorite_song_artist: row.favorite_song_artist ?? null,
        favorite_song_spotify_uri: row.favorite_song_spotify_uri ?? null,
        favorite_artist_name: row.favorite_artist_name ?? null,
        favorite_artist_spotify_id: row.favorite_artist_spotify_id ?? null,
        favorite_podcast_id: row.favorite_podcast_id ?? null,
        favorite_podcast_title: row.favorite_podcast_title ?? null,
        profile_headline: row.profile_headline ?? null,
        featured_badge_id: row.featured_badge_id ?? null,
        theme_key: row.theme_key ?? null,
        updated_at: row.updated_at ?? null,
    };
}

async function loadUserBadges(userId: string) {
    const result = await db.query(
        `SELECT b.id, b.slug, b.title, b.description, b.icon, b.category, ub.awarded_at
         FROM user_badges ub
         JOIN badges b ON b.id = ub.badge_id
         WHERE ub.user_id = $1 AND b.is_active = true
         ORDER BY ub.awarded_at DESC`,
        [userId],
    );

    return result.rows;
}

export async function handleGetMyProfileRequest(req: AuthRequest, res: Response) {
    try {
        const result = await db.query(
            `SELECT u.id AS user_id,
                    u.display_name,
                    u.avatar_url,
                    upc.favorite_song_title,
                    upc.favorite_song_artist,
                    upc.favorite_song_spotify_uri,
                    upc.favorite_artist_name,
                    upc.favorite_artist_spotify_id,
                    upc.favorite_podcast_id,
                    upc.favorite_podcast_title,
                    upc.profile_headline,
                    upc.featured_badge_id,
                    upc.theme_key,
                    upc.updated_at
             FROM users u
             LEFT JOIN user_profile_customization upc ON upc.user_id = u.id
             WHERE u.id = $1`,
            [req.user?.id],
        );

        if (!result.rows[0]) {
            return sendError(res, 'User not found', 404);
        }

        const badges = await loadUserBadges(req.user!.id);
        return sendSuccess(res, { profile: mapProfileRow(result.rows[0]), badges }, 'Profile fetched');
    } catch (error) {
        console.error('Profile fetch error:', error);
        return sendError(res, 'Failed to fetch profile', 500);
    }
}

export async function handleUpdateMyProfileRequest(req: AuthRequest, res: Response) {
    if (req.user?.role === 'guest') {
        return sendError(res, 'Account required', 403);
    }

    try {
        const payload = normalizeProfileCustomizationPayload(req.body ?? {});
        const result = await db.query(
            `INSERT INTO user_profile_customization (
                user_id,
                favorite_song_title,
                favorite_song_artist,
                favorite_song_spotify_uri,
                favorite_artist_name,
                favorite_artist_spotify_id,
                favorite_podcast_id,
                favorite_podcast_title,
                profile_headline,
                featured_badge_id,
                theme_key,
                updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                favorite_song_title = EXCLUDED.favorite_song_title,
                favorite_song_artist = EXCLUDED.favorite_song_artist,
                favorite_song_spotify_uri = EXCLUDED.favorite_song_spotify_uri,
                favorite_artist_name = EXCLUDED.favorite_artist_name,
                favorite_artist_spotify_id = EXCLUDED.favorite_artist_spotify_id,
                favorite_podcast_id = EXCLUDED.favorite_podcast_id,
                favorite_podcast_title = EXCLUDED.favorite_podcast_title,
                profile_headline = EXCLUDED.profile_headline,
                featured_badge_id = EXCLUDED.featured_badge_id,
                theme_key = EXCLUDED.theme_key,
                updated_at = NOW()
             RETURNING *`,
            [
                req.user?.id,
                payload.favorite_song_title,
                payload.favorite_song_artist,
                payload.favorite_song_spotify_uri,
                payload.favorite_artist_name,
                payload.favorite_artist_spotify_id,
                payload.favorite_podcast_id,
                payload.favorite_podcast_title,
                payload.profile_headline,
                payload.featured_badge_id,
                payload.theme_key,
            ],
        );

        return sendSuccess(res, { profile: mapProfileRow(result.rows[0]) }, 'Profile updated');
    } catch (error) {
        console.error('Profile update error:', error);
        return sendError(res, 'Failed to update profile', 500);
    }
}

router.use(authMiddleware);
router.get('/me', handleGetMyProfileRequest);
router.put('/me', handleUpdateMyProfileRequest);
router.put('/favorites', handleUpdateMyProfileRequest);

export default router;
