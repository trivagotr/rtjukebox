import { describe, expect, it } from 'vitest';
import { resolveGoldAdminAuditKey } from './goldAdmin';

describe('Gold admin audit key policy', () => {
    it('prefers a dedicated audit key and otherwise derives a stable domain-separated key', () => {
        expect(resolveGoldAdminAuditKey({ GOLD_ADMIN_AUDIT_HMAC_KEY: 'a'.repeat(32), JWT_SECRET: 'jwt' })).toBe('a'.repeat(32));
        const derived = resolveGoldAdminAuditKey({ JWT_SECRET: 'test-jwt-secret-with-sufficient-entropy' });
        expect(derived).toHaveLength(64);
        expect(derived).toBe(resolveGoldAdminAuditKey({ JWT_SECRET: 'test-jwt-secret-with-sufficient-entropy' }));
        expect(resolveGoldAdminAuditKey({})).toBe('');
    });
});
