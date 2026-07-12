import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ROLES } from '../middleware/rbac';
import { pushService } from '../services/push';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

const NOTIFICATION_CATEGORIES = ['podcast', 'radio', 'jukebox', 'events', 'system'] as const;
const NOTIFICATION_AUDIENCES = ['all', 'podcast', 'radio', 'jukebox', 'events'] as const;
const PREFERENCE_KEYS = ['podcast', 'radio', 'jukebox', 'events'] as const;

type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
type NotificationAudience = typeof NOTIFICATION_AUDIENCES[number];

type NotificationPayload = {
    title: string;
    body: string;
    category: NotificationCategory;
    deepLink: string | null;
    audience: NotificationAudience;
    dryRun: boolean;
};

type NotificationAuditInput = {
    adminId: string | undefined;
    payload: NotificationPayload;
    targeted: number;
    sent: number;
    failed: number;
};

type AdminPanelEndpoint = {
    method: 'GET' | 'POST' | 'PUT';
    path: string;
    auth: 'admin-bearer' | 'user-bearer';
    purpose: string;
    request?: Record<string, unknown>;
    response: Record<string, unknown>;
};

type AdminPanelPromptContract = {
    title: string;
    prompt: string;
    endpoints: AdminPanelEndpoint[];
    categories: readonly NotificationCategory[];
    audiences: readonly NotificationAudience[];
    ui_requirements: string[];
    safety_rules: string[];
};

type StatisticsPromptContract = {
    title: string;
    prompt: string;
    endpoint: AdminPanelEndpoint;
    widgets: string[];
    calculations: string[];
    empty_state: string;
    safety_rules: string[];
};

function normalizeString(value: unknown, maxLength: number) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().slice(0, maxLength);
}

function isNotificationCategory(value: string): value is NotificationCategory {
    return NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);
}

function isNotificationAudience(value: string): value is NotificationAudience {
    return NOTIFICATION_AUDIENCES.includes(value as NotificationAudience);
}

export function normalizeNotificationPayload(input: Record<string, unknown>): NotificationPayload {
    const title = normalizeString(input.title, 120);
    if (!title) {
        throw new Error('title required');
    }

    const body = normalizeString(input.body, 500);
    if (!body) {
        throw new Error('body required');
    }

    const categoryInput = normalizeString(input.category, 40) || 'system';
    if (!isNotificationCategory(categoryInput)) {
        throw new Error('unsupported notification category');
    }

    const audienceInput = normalizeString(input.audience, 40) || 'all';
    if (!isNotificationAudience(audienceInput)) {
        throw new Error('unsupported notification audience');
    }

    const deepLink = normalizeString(input.deep_link ?? input.deepLink, 500);

    return {
        title,
        body,
        category: categoryInput,
        deepLink: deepLink || null,
        audience: audienceInput,
        dryRun: (input.dry_run ?? input.dryRun) === true,
    };
}

function normalizeFcmToken(value: unknown) {
    const token = normalizeString(value, 500);
    if (!token) {
        throw new Error('fcm_token required');
    }
    return token;
}

function normalizePreferences(input: Record<string, unknown>) {
    const preferences: Record<string, boolean> = {};

    for (const key of PREFERENCE_KEYS) {
        if (typeof input[key] === 'boolean') {
            preferences[key] = input[key] as boolean;
        }
    }

    return preferences;
}

function requireAdmin(req: AuthRequest, res: Response) {
    if (req.user?.role !== ROLES.ADMIN) {
        sendError(res, 'Unauthorized', 403);
        return false;
    }

    return true;
}

async function loadNotificationTargets(preferenceKey: string) {
    const result = await db.query(
        `SELECT id, fcm_token
         FROM users
         WHERE fcm_token IS NOT NULL
           AND fcm_token <> ''
           AND is_banned = false
           AND COALESCE((push_preferences ->> $1)::boolean, true) = true`,
        [preferenceKey],
    );

    return result.rows;
}

async function recordNotificationAudit(input: NotificationAuditInput) {
    const result = await db.query(
        `INSERT INTO notification_audit_logs
            (admin_user_id, category, audience, deep_link, targeted, sent, failed, dry_run, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id`,
        [
            input.adminId,
            input.payload.category,
            input.payload.audience,
            input.payload.deepLink,
            input.targeted,
            input.sent,
            input.failed,
            input.payload.dryRun,
            {
                title: input.payload.title,
                body: input.payload.body,
            },
        ],
    );

    return result.rows[0]?.id ?? null;
}

function toNumber(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAdminNotificationPanelPrompt(): AdminPanelPromptContract {
    return {
        title: 'RadioTEDU notification admin panel contract',
        prompt: [
            'Build a published admin notification panel for RadioTEDU using the backend contract below.',
            'Use bearer auth from the logged-in admin session.',
            'The panel must support dry-run preview first, real send, audience targeting, deep links, delivery stats, and recent audit log rows.',
            'Do not invent internal-only or debug-only controls; every control should be safe for a published admin surface.',
        ].join('\n'),
        endpoints: [
            {
                method: 'POST',
                path: '/api/v1/notifications/admin/preview',
                auth: 'admin-bearer',
                purpose: 'Preview target count and normalized payload without sending FCM messages.',
                request: {
                    title: 'string, required, max 120 chars',
                    body: 'string, required, max 500 chars',
                    category: NOTIFICATION_CATEGORIES,
                    audience: NOTIFICATION_AUDIENCES,
                    deep_link: 'optional radiotedu:// deep link',
                    dry_run: true,
                },
                response: {
                    dry_run: true,
                    targeted: 'number',
                    payload: 'normalized notification payload',
                },
            },
            {
                method: 'POST',
                path: '/api/v1/notifications/admin/send',
                auth: 'admin-bearer',
                purpose: 'Dry-run or send a notification and persist audit/delivery stats.',
                request: {
                    title: 'string, required, max 120 chars',
                    body: 'string, required, max 500 chars',
                    category: NOTIFICATION_CATEGORIES,
                    audience: NOTIFICATION_AUDIENCES,
                    deep_link: 'optional radiotedu:// deep link',
                    dry_run: 'boolean; true for preview-style audit, false for real FCM send',
                },
                response: {
                    audit_id: 'number',
                    dry_run: 'boolean',
                    targeted: 'number',
                    sent: 'number',
                    failed: 'number',
                    payload: 'normalized notification payload',
                },
            },
            {
                method: 'GET',
                path: '/api/v1/notifications/admin/stats',
                auth: 'admin-bearer',
                purpose: 'Load total FCM delivery stats and recent notification audit rows.',
                response: {
                    totals: { sends: 'number', targeted: 'number', sent: 'number', failed: 'number' },
                    recent: [
                        {
                            id: 'number',
                            category: 'podcast|radio|jukebox|events|system',
                            audience: 'all|podcast|radio|jukebox|events',
                            targeted: 'number',
                            sent: 'number',
                            failed: 'number',
                            dry_run: 'boolean',
                            created_at: 'ISO timestamp',
                        },
                    ],
                },
            },
            {
                method: 'PUT',
                path: '/api/v1/notifications/preferences',
                auth: 'user-bearer',
                purpose: 'Optional user-facing preference save path for podcast/radio/jukebox/events toggles.',
                request: {
                    preferences: { podcast: 'boolean', radio: 'boolean', jukebox: 'boolean', events: 'boolean' },
                },
                response: {
                    preferences: 'saved preference object',
                },
            },
        ],
        categories: NOTIFICATION_CATEGORIES,
        audiences: NOTIFICATION_AUDIENCES,
        ui_requirements: [
            'Dry-run is the default action and must show targeted device count before real send.',
            'Real send requires an explicit Send button state separate from dry-run.',
            'Show FCM delivery stats: total sends, targeted, sent, failed, failure rate, and last run.',
            'Show recent audit rows with category, audience, dry-run/sent state, delivered count, failed count, and timestamp.',
            'Provide deep-link presets for latest podcast, live radio, jukebox device code, and event detail.',
            'Use compact admin UI suitable for repeated operations on a server/admin page.',
        ],
        safety_rules: [
            'Only call admin endpoints with an admin bearer token.',
            'Build this only in the server/admin page behind admin auth.',
            'Do not render this panel in the mobile app or public consumer app.',
            'Never expose FCM tokens in the panel.',
            'Never send automatically on page load.',
            'Validate title/body before calling the backend.',
            'Render backend errors clearly and keep the last successful stats visible.',
        ],
    };
}

export function buildAdminNotificationStatisticsPrompt(): StatisticsPromptContract {
    return {
        title: 'RadioTEDU notification statistics dashboard contract',
        prompt: [
            'Build a published notification statistics dashboard for the RadioTEDU server/admin page.',
            'Use the existing notification stats endpoint and do not query the database directly from the frontend.',
            'Keep the dashboard compact, refreshable, and useful for checking FCM delivery health after dry-runs and real sends.',
        ].join('\n'),
        endpoint: {
            method: 'GET',
            path: '/api/v1/notifications/admin/stats',
            auth: 'admin-bearer',
            purpose: 'Load aggregate FCM delivery stats and recent notification audit rows.',
            response: {
                totals: {
                    sends: 'number of dry-run and real-send audit records',
                    targeted: 'sum of targeted device tokens',
                    sent: 'sum of successful FCM sends',
                    failed: 'sum of failed FCM sends',
                },
                recent: [
                    {
                        id: 'audit id',
                        category: 'podcast|radio|jukebox|events|system',
                        audience: 'all|podcast|radio|jukebox|events',
                        targeted: 'number',
                        sent: 'number',
                        failed: 'number',
                        dry_run: 'boolean',
                        created_at: 'ISO timestamp',
                    },
                ],
            },
        },
        widgets: [
            'Total sends card: totals.sends',
            'Targeted devices card: totals.targeted',
            'Delivered card: totals.sent',
            'Failed card: totals.failed',
            'Failure rate card: totals.failed / max(totals.targeted, 1)',
            'Last run summary from recent[0]',
            'Recent audit log table with dry-run/sent state',
        ],
        calculations: [
            'failureRatePercent = totals.targeted > 0 ? round((totals.failed / totals.targeted) * 100) : 0',
            'deliveryRatePercent = totals.targeted > 0 ? round((totals.sent / totals.targeted) * 100) : 0',
            'lastRun = recent[0] when present, otherwise show the empty state',
        ],
        empty_state: 'No notification sends or dry-runs have been recorded yet.',
        safety_rules: [
            'Only call with an admin bearer token.',
            'Build statistics only in the server/admin page behind admin auth.',
            'Do not render statistics in the mobile app or public consumer app.',
            'Do not show FCM tokens or user identifiers.',
            'Keep the previous stats visible if a refresh fails.',
            'Do not send notifications from this statistics-only dashboard.',
        ],
    };
}

export async function handleRegisterDeviceToken(req: AuthRequest, res: Response) {
    try {
        const token = normalizeFcmToken(req.body?.fcm_token ?? req.body?.fcmToken);
        await db.query(
            'UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2 RETURNING id, fcm_token',
            [token, req.user?.id],
        );

        return sendSuccess(res, { notifications_ready: true }, 'Notification token registered');
    } catch (error) {
        return sendError(res, error instanceof Error ? error.message : 'Notification token registration failed', 400);
    }
}

export async function handleUpdateNotificationPreferences(req: AuthRequest, res: Response) {
    try {
        const preferences = normalizePreferences(req.body?.preferences ?? req.body ?? {});
        const result = await db.query(
            `UPDATE users
             SET push_preferences = COALESCE(push_preferences, '{}'::jsonb) || $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING push_preferences`,
            [JSON.stringify(preferences), req.user?.id],
        );

        return sendSuccess(
            res,
            { preferences: result.rows[0]?.push_preferences ?? preferences },
            'Notification preferences updated',
        );
    } catch (error) {
        console.error('Notification preferences update error:', error);
        return sendError(res, 'Failed to update notification preferences', 500);
    }
}

export async function handleAdminNotificationPreview(req: AuthRequest, res: Response) {
    if (!requireAdmin(req, res)) {
        return undefined;
    }

    try {
        const payload = normalizeNotificationPayload({ ...req.body, dry_run: true });
        const preferenceKey = payload.audience === 'all' ? payload.category : payload.audience;
        const targets = await loadNotificationTargets(preferenceKey);

        return sendSuccess(
            res,
            {
                dry_run: true,
                targeted: targets.length,
                payload,
            },
            'Notification preview ready',
        );
    } catch (error) {
        return sendError(res, error instanceof Error ? error.message : 'Notification preview failed', 400);
    }
}

export async function handleAdminNotificationSend(req: AuthRequest, res: Response) {
    if (!requireAdmin(req, res)) {
        return undefined;
    }

    try {
        const payload = normalizeNotificationPayload(req.body ?? {});
        const preferenceKey = payload.audience === 'all' ? payload.category : payload.audience;
        const targets = await loadNotificationTargets(preferenceKey);

        if (payload.dryRun) {
            const auditId = await recordNotificationAudit({
                adminId: req.user?.id,
                payload,
                targeted: targets.length,
                sent: 0,
                failed: 0,
            });

            return sendSuccess(
                res,
                {
                    audit_id: auditId,
                    dry_run: true,
                    targeted: targets.length,
                    sent: 0,
                    failed: 0,
                    payload,
                },
                'Notification dry run complete',
            );
        }

        let sent = 0;
        let failed = 0;
        const data = {
            category: payload.category,
            ...(payload.deepLink ? { deep_link: payload.deepLink } : {}),
        };

        for (const target of targets) {
            try {
                await pushService.sendToUser(target.fcm_token, payload.title, payload.body, data);
                sent += 1;
            } catch (error) {
                failed += 1;
                console.error('Admin notification send failed:', error);
            }
        }

        const auditId = await recordNotificationAudit({
            adminId: req.user?.id,
            payload,
            targeted: targets.length,
            sent,
            failed,
        });

        return sendSuccess(
            res,
            {
                audit_id: auditId,
                dry_run: false,
                targeted: targets.length,
                sent,
                failed,
                payload,
            },
            'Notification sent',
        );
    } catch (error) {
        return sendError(res, error instanceof Error ? error.message : 'Notification send failed', 400);
    }
}

export async function handleAdminNotificationStats(req: AuthRequest, res: Response) {
    if (!requireAdmin(req, res)) {
        return undefined;
    }

    try {
        const totals = await db.query(
            `SELECT
                COUNT(*) AS total_sends,
                COALESCE(SUM(targeted), 0) AS total_targeted,
                COALESCE(SUM(sent), 0) AS total_sent,
                COALESCE(SUM(failed), 0) AS total_failed
             FROM notification_audit_logs`,
        );
        const recent = await db.query(
            `SELECT id, category, audience, targeted, sent, failed, dry_run, created_at
             FROM notification_audit_logs
             ORDER BY created_at DESC
             LIMIT 10`,
        );
        const row = totals.rows[0] ?? {};

        return sendSuccess(
            res,
            {
                totals: {
                    sends: toNumber(row.total_sends),
                    targeted: toNumber(row.total_targeted),
                    sent: toNumber(row.total_sent),
                    failed: toNumber(row.total_failed),
                },
                recent: recent.rows,
            },
            'Notification stats ready',
        );
    } catch (error) {
        return sendError(res, error instanceof Error ? error.message : 'Notification stats failed', 400);
    }
}

export async function handleAdminNotificationPanelPrompt(req: AuthRequest, res: Response) {
    if (!requireAdmin(req, res)) {
        return undefined;
    }

    return sendSuccess(
        res,
        buildAdminNotificationPanelPrompt(),
        'Notification admin panel prompt ready',
    );
}

export async function handleAdminNotificationStatisticsPrompt(req: AuthRequest, res: Response) {
    if (!requireAdmin(req, res)) {
        return undefined;
    }

    return sendSuccess(
        res,
        buildAdminNotificationStatisticsPrompt(),
        'Notification statistics prompt ready',
    );
}

router.use(authMiddleware);
router.put('/device-token', handleRegisterDeviceToken);
router.put('/preferences', handleUpdateNotificationPreferences);
router.get('/admin/panel-prompt', handleAdminNotificationPanelPrompt);
router.get('/admin/statistics-prompt', handleAdminNotificationStatisticsPrompt);
router.get('/admin/stats', handleAdminNotificationStats);
router.post('/admin/preview', handleAdminNotificationPreview);
router.post('/admin/send', handleAdminNotificationSend);

export default router;
