import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDbQuery,
    mockSendSuccess,
    mockSendError,
    mockAuthMiddleware,
    mockPushSendToUser,
    mockRouteHandlers,
    mockRouter,
} = vi.hoisted(() => {
    const handlers: Record<string, Record<string, (...args: any[]) => any>> = {
        get: {},
        post: {},
        put: {},
    };

    const router: any = {};
    router.use = vi.fn(() => router);
    router.get = vi.fn((path: string, handler: (...args: any[]) => any) => {
        handlers.get[path] = handler;
        return router;
    });
    router.post = vi.fn((path: string, handler: (...args: any[]) => any) => {
        handlers.post[path] = handler;
        return router;
    });
    router.put = vi.fn((path: string, handler: (...args: any[]) => any) => {
        handlers.put[path] = handler;
        return router;
    });

    return {
        mockDbQuery: vi.fn(),
        mockSendSuccess: vi.fn(),
        mockSendError: vi.fn(),
        mockAuthMiddleware: vi.fn(),
        mockPushSendToUser: vi.fn(),
        mockRouteHandlers: handlers,
        mockRouter: router,
    };
});

vi.mock('../db', () => ({
    db: {
        query: mockDbQuery,
    },
}));

vi.mock('../middleware/auth', () => ({
    authMiddleware: mockAuthMiddleware,
}));

vi.mock('../utils/response', () => ({
    sendSuccess: mockSendSuccess,
    sendError: mockSendError,
}));

vi.mock('../services/push', () => ({
    pushService: {
        sendToUser: mockPushSendToUser,
    },
}));

vi.mock('express', () => ({
    Router: vi.fn(() => mockRouter),
}));

import {
    buildAdminNotificationPanelPrompt,
    buildAdminNotificationStatisticsPrompt,
    normalizeNotificationPayload,
} from './notifications';

describe('normalizeNotificationPayload', () => {
    it('normalizes production notification payloads for Android system surfaces', () => {
        expect(
            normalizeNotificationPayload({
                title: '  New podcast  ',
                body: '  Latest episode is live  ',
                category: 'podcast',
                deep_link: 'radiotedu://podcasts/latest',
                audience: 'all',
                dry_run: true,
            }),
        ).toEqual({
            title: 'New podcast',
            body: 'Latest episode is live',
            category: 'podcast',
            deepLink: 'radiotedu://podcasts/latest',
            audience: 'all',
            dryRun: true,
        });
    });

    it('rejects blank titles and unsupported categories', () => {
        expect(() => normalizeNotificationPayload({ title: '', body: 'Body', category: 'podcast' })).toThrow('title required');
        expect(() => normalizeNotificationPayload({ title: 'Title', body: 'Body', category: 'debug-only' })).toThrow('unsupported notification category');
    });
});

describe('buildAdminNotificationPanelPrompt', () => {
    it('describes the backend contract Codex should use to build the admin panel', () => {
        const contract = buildAdminNotificationPanelPrompt();

        expect(contract.prompt).toContain('Build a published admin notification panel');
        expect(contract.endpoints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ method: 'POST', path: '/api/v1/notifications/admin/send' }),
                expect.objectContaining({ method: 'GET', path: '/api/v1/notifications/admin/stats' }),
            ]),
        );
        expect(contract.ui_requirements).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Dry-run'),
                expect.stringContaining('FCM delivery stats'),
            ]),
        );
        expect(contract.safety_rules).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Do not render this panel in the mobile app'),
                expect.stringContaining('server/admin'),
            ]),
        );
    });
});

describe('buildAdminNotificationStatisticsPrompt', () => {
    it('describes the notification statistics dashboard Codex should build', () => {
        const contract = buildAdminNotificationStatisticsPrompt();

        expect(contract.prompt).toContain('Build a published notification statistics dashboard');
        expect(contract.endpoint).toEqual(
            expect.objectContaining({ method: 'GET', path: '/api/v1/notifications/admin/stats' }),
        );
        expect(contract.widgets).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Total sends'),
                expect.stringContaining('Failure rate'),
                expect.stringContaining('Recent audit log'),
            ]),
        );
        expect(contract.safety_rules).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Do not render statistics in the mobile app'),
                expect.stringContaining('server/admin'),
            ]),
        );
    });
});

describe('notifications router', () => {
    beforeEach(() => {
        mockDbQuery.mockReset();
        mockSendSuccess.mockReset();
        mockSendError.mockReset();
        mockPushSendToUser.mockReset();
    });

    it('registers the device FCM token for the current user', async () => {
        const handler = mockRouteHandlers.put['/device-token'];
        expect(handler).toBeTypeOf('function');

        mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1', fcm_token: 'token-123' }] });

        await handler({ body: { fcm_token: ' token-123 ' }, user: { id: 'user-1' } }, {});

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE users'),
            ['token-123', 'user-1'],
        );
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            { notifications_ready: true },
            'Notification token registered',
        );
    });

    it('dry-runs an admin notification without sending messages', async () => {
        const handler = mockRouteHandlers.post['/admin/send'];
        expect(handler).toBeTypeOf('function');

        mockDbQuery
            .mockResolvedValueOnce({
                rows: [
                    { id: 'user-1', fcm_token: 'token-1' },
                    { id: 'user-2', fcm_token: 'token-2' },
                ],
            })
            .mockResolvedValueOnce({ rows: [{ id: 24 }] });

        await handler({
            body: {
                title: 'Now playing',
                body: 'Live radio is on',
                category: 'radio',
                audience: 'all',
                dry_run: true,
            },
            user: { id: 'admin-1', role: 'admin' },
        }, {});

        expect(mockPushSendToUser).not.toHaveBeenCalled();
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ dry_run: true, targeted: 2, sent: 0, audit_id: 24 }),
            'Notification dry run complete',
        );
    });

    it('sends admin notifications only to users with a matching preference', async () => {
        const handler = mockRouteHandlers.post['/admin/send'];
        mockDbQuery.mockResolvedValueOnce({
            rows: [
                { id: 'user-1', fcm_token: 'token-1' },
                { id: 'user-2', fcm_token: 'token-2' },
            ],
        });
        mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });
        mockPushSendToUser.mockResolvedValue(undefined);

        await handler({
            body: {
                title: 'Jukebox',
                body: 'Your song is next',
                category: 'jukebox',
                deep_link: 'radiotedu://jukebox/SMOKEQR',
                audience: 'jukebox',
            },
            user: { id: 'admin-1', role: 'admin' },
        }, {});

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining("push_preferences ->> $1"),
            ['jukebox'],
        );
        expect(mockPushSendToUser).toHaveBeenCalledTimes(2);
        expect(mockPushSendToUser).toHaveBeenCalledWith('token-1', 'Jukebox', 'Your song is next', {
            category: 'jukebox',
            deep_link: 'radiotedu://jukebox/SMOKEQR',
        });
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ dry_run: false, targeted: 2, sent: 2, audit_id: 42 }),
            'Notification sent',
        );
    });

    it('persists an audit record with FCM delivery stats after an admin send', async () => {
        const handler = mockRouteHandlers.post['/admin/send'];
        mockDbQuery
            .mockResolvedValueOnce({
                rows: [
                    { id: 'user-1', fcm_token: 'token-1' },
                    { id: 'user-2', fcm_token: 'token-2' },
                ],
            })
            .mockResolvedValueOnce({ rows: [{ id: 777 }] });
        mockPushSendToUser
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('FCM unavailable'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            await handler({
                body: {
                    title: 'Podcast live',
                    body: 'Latest episode is ready',
                    category: 'podcast',
                    audience: 'podcast',
                    deep_link: 'radiotedu://podcasts/latest',
                },
                user: { id: 'admin-1', role: 'admin' },
            }, {});
        } finally {
            errorSpy.mockRestore();
        }

        expect(mockDbQuery).toHaveBeenLastCalledWith(
            expect.stringContaining('INSERT INTO notification_audit_logs'),
            [
                'admin-1',
                'podcast',
                'podcast',
                'radiotedu://podcasts/latest',
                2,
                1,
                1,
                false,
                expect.objectContaining({ title: 'Podcast live', body: 'Latest episode is ready' }),
            ],
        );
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ audit_id: 777, targeted: 2, sent: 1, failed: 1 }),
            'Notification sent',
        );
    });

    it('returns admin notification delivery stats for the smart notification center', async () => {
        const handler = mockRouteHandlers.get['/admin/stats'];
        expect(handler).toBeTypeOf('function');

        mockDbQuery
            .mockResolvedValueOnce({
                rows: [
                    {
                        total_sends: '3',
                        total_targeted: '10',
                        total_sent: '8',
                        total_failed: '2',
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [
                    { id: 9, category: 'jukebox', audience: 'jukebox', targeted: 4, sent: 4, failed: 0, dry_run: false, created_at: '2026-06-24T12:00:00.000Z' },
                ],
            });

        await handler({ user: { id: 'admin-1', role: 'admin' } }, {});

        expect(mockDbQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('COUNT(*) AS total_sends'));
        expect(mockDbQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM notification_audit_logs'));
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            {
                totals: { sends: 3, targeted: 10, sent: 8, failed: 2 },
                recent: [
                    { id: 9, category: 'jukebox', audience: 'jukebox', targeted: 4, sent: 4, failed: 0, dry_run: false, created_at: '2026-06-24T12:00:00.000Z' },
                ],
            },
            'Notification stats ready',
        );
    });

    it('serves a Codex-ready admin panel prompt to admins', async () => {
        const handler = mockRouteHandlers.get['/admin/panel-prompt'];
        expect(handler).toBeTypeOf('function');

        await handler({ user: { id: 'admin-1', role: 'admin' } }, {});

        expect(mockDbQuery).not.toHaveBeenCalled();
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                prompt: expect.stringContaining('Build a published admin notification panel'),
                endpoints: expect.arrayContaining([
                    expect.objectContaining({ path: '/api/v1/notifications/admin/send' }),
                    expect.objectContaining({ path: '/api/v1/notifications/admin/stats' }),
                ]),
            }),
            'Notification admin panel prompt ready',
        );
    });

    it('serves a Codex-ready statistics prompt to admins', async () => {
        const handler = mockRouteHandlers.get['/admin/statistics-prompt'];
        expect(handler).toBeTypeOf('function');

        await handler({ user: { id: 'admin-1', role: 'admin' } }, {});

        expect(mockDbQuery).not.toHaveBeenCalled();
        expect(mockSendSuccess).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                prompt: expect.stringContaining('Build a published notification statistics dashboard'),
                endpoint: expect.objectContaining({ path: '/api/v1/notifications/admin/stats' }),
                widgets: expect.arrayContaining([expect.stringContaining('Failure rate')]),
            }),
            'Notification statistics prompt ready',
        );
    });

    it('blocks non-admin users from notification stats and prompt contracts', async () => {
        for (const path of ['/admin/stats', '/admin/panel-prompt', '/admin/statistics-prompt']) {
            const handler = mockRouteHandlers.get[path];
            expect(handler).toBeTypeOf('function');

            await handler({ user: { id: 'user-1', role: 'user' } }, {});
        }

        expect(mockSendError).toHaveBeenCalledTimes(3);
        expect(mockSendError).toHaveBeenCalledWith({}, 'Unauthorized', 403);
        expect(mockDbQuery).not.toHaveBeenCalled();
        expect(mockSendSuccess).not.toHaveBeenCalled();
    });

    it('blocks non-admin notification sends', async () => {
        const handler = mockRouteHandlers.post['/admin/send'];

        await handler({
            body: { title: 'Nope', body: 'Nope', category: 'radio' },
            user: { id: 'user-1', role: 'user' },
        }, {});

        expect(mockSendError).toHaveBeenCalledWith({}, 'Unauthorized', 403);
        expect(mockDbQuery).not.toHaveBeenCalled();
    });
});
