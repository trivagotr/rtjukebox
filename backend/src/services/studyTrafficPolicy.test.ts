import { describe, expect, it } from 'vitest';
import { isStudyPlayerApiPath } from './studyTrafficPolicy';

describe('Study player traffic policy', () => {
    it('recognizes direct and public-base player Study API requests', () => {
        expect(isStudyPlayerApiPath('/api/v1/study')).toBe(true);
        expect(isStudyPlayerApiPath('/api/v1/study/presence/heartbeat')).toBe(true);
        expect(isStudyPlayerApiPath('/jukebox/api/v1/study/chat', '/jukebox')).toBe(true);
        expect(isStudyPlayerApiPath('/jukebox/api/v1/study/home?period=week', 'jukebox/')).toBe(true);
    });

    it('keeps admin, page, and unrelated traffic on the global IP limiter', () => {
        expect(isStudyPlayerApiPath('/api/v1/study/admin/users')).toBe(false);
        expect(isStudyPlayerApiPath('/jukebox/api/v1/study/admin/reports', '/jukebox')).toBe(false);
        expect(isStudyPlayerApiPath('/api/v1/study/pages/admin')).toBe(false);
        expect(isStudyPlayerApiPath('/api/v1/study/health')).toBe(false);
        expect(isStudyPlayerApiPath('/api/v1/studyish/home')).toBe(false);
        expect(isStudyPlayerApiPath('/api/v1/auth/web/session')).toBe(false);
    });
});
