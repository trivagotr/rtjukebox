import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { z } from 'zod';

const router = Router();
const profilePayloadSchema = z.object({
    favorite_song_title: z.string().max(255).nullable().optional(),
    favorite_song_artist: z.string().max(255).nullable().optional(),
    favorite_song_spotify_uri: z.string().max(120).nullable().optional(),
    favorite_artist_name: z.string().max(255).nullable().optional(),
    favorite_artist_spotify_id: z.string().max(120).nullable().optional(),
    favorite_podcast_id: z.string().max(80).nullable().optional(),
    favorite_podcast_title: z.string().max(500).nullable().optional(),
    profile_headline: z.string().max(180).nullable().optional(),
    featured_badge_id: z.string().max(80).nullable().optional(),
    theme_key: z.string().max(80).nullable().optional(),
}).strict().refine((payload) => Object.keys(payload).length > 0, 'At least one profile field is required');

const profileFields = [
    'favorite_song_title', 'favorite_song_artist', 'favorite_song_spotify_uri',
    'favorite_artist_name', 'favorite_artist_spotify_id', 'favorite_podcast_id',
    'favorite_podcast_title', 'profile_headline', 'featured_badge_id', 'theme_key',
] as const;

type ProfilePayload = Partial<Record<typeof profileFields[number], string | null>>;

function normalizeOptionalString(value: unknown, maxLength: number) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : null;
}

export function normalizeProfileCustomizationPayload(input: Record<string, unknown>): ProfilePayload {
    const result: ProfilePayload = {};
    const maxLengths: Record<typeof profileFields[number], number> = {
        favorite_song_title: 255,
        favorite_song_artist: 255,
        favorite_song_spotify_uri: 120,
        favorite_artist_name: 255,
        favorite_artist_spotify_id: 120,
        favorite_podcast_id: 80,
        favorite_podcast_title: 500,
        profile_headline: 180,
        featured_badge_id: 80,
        theme_key: 80,
    };

    for (const field of profileFields) {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
            result[field] = normalizeOptionalString(input[field], maxLengths[field]);
        }
    }

    return result;
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
        const parsedPayload = profilePayloadSchema.safeParse(req.body ?? {});
        if (!parsedPayload.success) return sendError(res, 'Invalid profile payload', 400, 'INVALID_PROFILE_PAYLOAD');
        const payload = normalizeProfileCustomizationPayload(parsedPayload.data);
        const fields = profileFields.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
        const columns = fields.join(', ');
        const values = fields.map((_, index) => `$${index + 2}`).join(', ');
        const updates = fields.map((field) => `${field} = EXCLUDED.${field}`).join(', ');
        const result = await db.query(
            `INSERT INTO user_profile_customization (user_id, ${columns}, updated_at)
             VALUES ($1, ${values}, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                ${updates},
                updated_at = NOW()
             RETURNING *`,
            [req.user?.id, ...fields.map((field) => payload[field])],
        );

        return sendSuccess(res, { profile: mapProfileRow(result.rows[0]) }, 'Profile updated');
    } catch (error) {
        console.error('Profile update error:', error);
        return sendError(res, 'Failed to update profile', 500);
    }
}

router.use(authMiddleware);
router.get('/me', handleGetMyProfileRequest);
router.patch('/me', handleUpdateMyProfileRequest);
router.patch('/favorites', handleUpdateMyProfileRequest);

export default router;
