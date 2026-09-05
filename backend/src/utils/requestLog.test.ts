import { describe, expect, it } from 'vitest';
import { formatRequestLogLine } from './requestLog';

describe('request logging', () => {
    it('logs only the pathname and never OAuth query credentials', () => {
        const line = formatRequestLogLine({
            method: 'GET',
            path: '/api/v1/auth/erp-link/callback?code=sensitive-code&state=sensitive-state',
        }, new Date('2026-08-30T11:13:20.000Z'));

        expect(line).toBe(
            '[2026-08-30T11:13:20.000Z] GET /api/v1/auth/erp-link/callback',
        );
        expect(line).not.toContain('sensitive-code');
        expect(line).not.toContain('sensitive-state');
    });

    it('neutralizes control characters to prevent log injection', () => {
        const line = formatRequestLogLine({
            method: 'POST\nforged',
            path: '/health\r\nforged-entry',
        }, new Date('2026-08-30T11:13:20.000Z'));

        expect(line).not.toContain('\n');
        expect(line).not.toContain('\r');
        expect(line).toContain('POST_forged /health__forged-entry');
    });
});
