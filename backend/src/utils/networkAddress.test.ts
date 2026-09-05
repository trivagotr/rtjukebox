import { describe, expect, it } from 'vitest';
import { normalizeClientIp, rateLimitClientIpKey } from './networkAddress';

describe('normalizeClientIp', () => {
    it('removes an IIS/ARR source port from IPv4 addresses', () => {
        expect(normalizeClientIp('178.233.16.223:37530')).toBe('178.233.16.223');
    });

    it('accepts plain IPv4 and IPv6 addresses', () => {
        expect(normalizeClientIp('10.10.210.171')).toBe('10.10.210.171');
        expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('normalizes bracketed and port-suffixed IPv6 addresses', () => {
        expect(normalizeClientIp('[2001:db8::1]:443')).toBe('2001:db8::1');
        expect(normalizeClientIp('::ffff:178.233.16.223:37530')).toBe('::ffff:178.233.16.223');
    });

    it('uses only the address selected before a forwarded chain', () => {
        expect(normalizeClientIp('178.233.16.223:37530, 10.98.98.66')).toBe('178.233.16.223');
    });

    it('returns null for malformed values instead of sending them to INET', () => {
        expect(normalizeClientIp('unknown:1234')).toBeNull();
        expect(normalizeClientIp('')).toBeNull();
        expect(normalizeClientIp(undefined)).toBeNull();
    });

    it('uses a stable fail-closed rate-limit key for proxy addresses', () => {
        expect(rateLimitClientIpKey('178.233.16.223:37530')).toBe('178.233.16.223');
        expect(rateLimitClientIpKey('178.233.16.223:41000')).toBe('178.233.16.223');
        expect(rateLimitClientIpKey('unknown:1234')).toBe('unknown-client-ip');
    });
});
