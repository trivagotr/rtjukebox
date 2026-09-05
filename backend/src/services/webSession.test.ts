import { describe, expect, it, vi } from 'vitest';
import {
    ensureWebCsrfCookie,
    requireWebCsrf,
    setAuthNoStore,
    setWebSessionCookies,
} from './webSession';

function responseStub() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
        append: vi.fn(),
        setHeader: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

describe('web session CSRF middleware', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe %s requests authenticated by cookie', (method) => {
        const next = vi.fn();
        const response = responseStub();
        const request = {
            method,
            webCookieAuth: true,
            headers: {},
            get: vi.fn(() => undefined),
        };

        requireWebCsrf(request as any, response as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(response.status).not.toHaveBeenCalled();
    });

    it('continues to reject unsafe cookie-authenticated requests without origin and CSRF proof', () => {
        const next = vi.fn();
        const response = responseStub();
        const request = {
            method: 'POST',
            webCookieAuth: true,
            headers: {},
            get: vi.fn(() => undefined),
        };

        requireWebCsrf(request as any, response as any, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('accepts an unsafe cookie request only with a trusted origin and matching CSRF proof', () => {
        const next = vi.fn();
        const response = responseStub();
        const request = {
            method: 'POST',
            webCookieAuth: true,
            headers: {cookie: 'rt_csrf=csrf-proof'},
            get: vi.fn((name: string) => {
                if (name.toLowerCase() === 'origin') return 'https://radiotedu.com';
                if (name.toLowerCase() === 'x-radiotedu-csrf') return 'csrf-proof';
                return undefined;
            }),
        };

        requireWebCsrf(request as any, response as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects a matching CSRF token sent from an untrusted origin', () => {
        const next = vi.fn();
        const response = responseStub();
        const request = {
            method: 'POST',
            webCookieAuth: true,
            headers: {cookie: 'rt_csrf=csrf-proof'},
            get: vi.fn((name: string) => name.toLowerCase() === 'origin'
                ? 'https://example.invalid'
                : 'csrf-proof'),
        };

        requireWebCsrf(request as any, response as any, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('does not require browser CSRF proof for native bearer authentication', () => {
        const next = vi.fn();
        const response = responseStub();
        const request = {method: 'POST', webCookieAuth: false, headers: {}, get: vi.fn()};

        requireWebCsrf(request as any, response as any, next);

        expect(next).toHaveBeenCalledOnce();
    });
});

describe('web session response hardening', () => {
    it('repairs an authenticated legacy session that has no CSRF cookie', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const response = responseStub();
        const request = {headers: {cookie: 'rt_access=legacy-access'}};

        let csrfToken = '';
        try {
            csrfToken = ensureWebCsrfCookie(request as any, response as any);
        } finally {
            if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousNodeEnv;
        }

        expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(response.append).toHaveBeenCalledOnce();
        const cookie = String(response.append.mock.calls[0][1]);
        expect(cookie).toContain(`rt_csrf=${csrfToken}`);
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Secure');
        expect(cookie).not.toContain('HttpOnly');
    });

    it('reuses the existing CSRF cookie without appending another cookie', () => {
        const response = responseStub();
        const request = {headers: {cookie: 'rt_access=access; rt_csrf=existing-proof'}};

        const csrfToken = ensureWebCsrfCookie(request as any, response as any);

        expect(csrfToken).toBe('existing-proof');
        expect(response.append).not.toHaveBeenCalled();
    });

    it('always emits Secure session cookies in production even if the opt-out is false', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousSecure = process.env.WEB_COOKIE_SECURE;
        process.env.NODE_ENV = 'production';
        process.env.WEB_COOKIE_SECURE = 'false';
        const response = responseStub();

        try {
            setWebSessionCookies(response as any, {
                access_token: 'access-token',
                refresh_token: 'refresh-token',
            });
        } finally {
            if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousNodeEnv;
            if (previousSecure === undefined) delete process.env.WEB_COOKIE_SECURE;
            else process.env.WEB_COOKIE_SECURE = previousSecure;
        }

        const cookies = response.append.mock.calls.map((call) => String(call[1]));
        expect(cookies).toHaveLength(3);
        expect(cookies.every((cookie) => cookie.includes('Secure'))).toBe(true);
        expect(cookies[0]).toContain('HttpOnly');
        expect(cookies[1]).toContain('HttpOnly');
        expect(cookies[2]).not.toContain('HttpOnly');
        expect(cookies.every((cookie) => cookie.includes('SameSite=Lax'))).toBe(true);
    });

    it('marks every auth response as non-cacheable', () => {
        const next = vi.fn();
        const response = responseStub();

        setAuthNoStore({} as any, response as any, next);

        expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
        expect(response.setHeader).toHaveBeenCalledWith('Expires', '0');
        expect(next).toHaveBeenCalledOnce();
    });
});
