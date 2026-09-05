import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbQuery } = vi.hoisted(() => ({ mockDbQuery: vi.fn() }));

vi.mock('../db', () => ({
    db: { query: mockDbQuery },
}));

import { enforceStudyAccess } from './studyModerationAccess';

describe('Study ban access gate', () => {
    const request = { user: { id: '22222222-2222-4222-8222-222222222222' } } as any;

    beforeEach(() => {
        mockDbQuery.mockReset();
    });

    function response() {
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        return { value: { status } as any, status, json };
    }

    it('returns 403 STUDY_BANNED and does not enter a Study route for an active ban', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        const res = response();
        const next = vi.fn();

        await enforceStudyAccess(request, res.value, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'STUDY_BANNED' }));
    });

    it('allows an unbanned account into the existing Study route', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [] });
        const res = response();
        const next = vi.fn();

        await enforceStudyAccess(request, res.value, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('fails closed without exposing a database error', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('sensitive database failure'));
        const res = response();
        const next = vi.fn();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await enforceStudyAccess(request, res.value, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'STUDY_ACCESS_UNAVAILABLE',
            error: 'Social access could not be verified.',
        }));
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('sensitive database failure');
        errorSpy.mockRestore();
    });
});
