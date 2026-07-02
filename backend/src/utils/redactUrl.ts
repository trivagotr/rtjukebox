const SENSITIVE_QUERY_KEYS = new Set([
    'device_pwd',
    'password',
    'access_token',
    'refresh_token',
    'client_secret',
    'token',
]);

export function redactSensitiveUrl(url: string) {
    try {
        const parsed = new URL(url, 'http://local.invalid');
        for (const key of Array.from(parsed.searchParams.keys())) {
            if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
                parsed.searchParams.set(key, '[REDACTED]');
            }
        }

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return url.replace(/((?:device_pwd|password|access_token|refresh_token|client_secret|token)=)[^&\s]*/gi, '$1[REDACTED]');
    }
}
