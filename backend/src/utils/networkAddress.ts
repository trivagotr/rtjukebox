import { isIP } from 'node:net';

/**
 * Converts the address selected by Express into a value PostgreSQL INET accepts.
 * IIS/ARR can append the client source port to X-Forwarded-For entries.
 */
export function normalizeClientIp(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const address = value.split(',', 1)[0]?.trim() ?? '';
    if (!address) return null;
    if (isIP(address)) return address;

    const bracketed = address.match(/^\[([^\]]+)](?::\d+)?$/);
    if (bracketed && isIP(bracketed[1])) return bracketed[1];

    const lastColon = address.lastIndexOf(':');
    if (lastColon > 0 && /^\d+$/.test(address.slice(lastColon + 1))) {
        const host = address.slice(0, lastColon);
        if (isIP(host)) return host;
    }

    return null;
}

/**
 * Produces one stable, fail-closed key for IP-based throttles.
 * Invalid proxy values share a single bucket instead of bypassing limits.
 */
export function rateLimitClientIpKey(value: unknown): string {
    return normalizeClientIp(value) ?? 'unknown-client-ip';
}
