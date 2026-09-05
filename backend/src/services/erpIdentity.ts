import crypto from 'crypto';
import axios from 'axios';

export type ErpIdentityProfile = {
    sub: string;
    email: string;
    name: string;
    avatar_url?: string | null;
    application: string;
    roles: string[];
    permissions: string[];
    authorization_version: number;
    cache_for?: number;
};

export type ErpTokenResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
};

export type ErpIdentityConfiguration = {
    baseUrl: string;
    clientId: string;
    redirectUri: string;
    defaultReturnUri: string;
    allowedReturnUris: string[];
    encryptionKey: Buffer;
};

export function isErpIdentityEnabled(): boolean {
    return process.env.ERP_LINKING_ENABLED === 'true';
}

function configuredReturnUris(): string[] {
    const configured = process.env.ERP_LOGIN_RETURN_URIS
        || process.env.ERP_LINK_SUCCESS_URI
        || 'radiotedu://auth/erp/linked';

    const websiteReturnUris = [
        'https://radiotedu.com/giris/',
        'https://www.radiotedu.com/giris/',
        'https://radiotedu.com/en/login/',
        'https://www.radiotedu.com/en/login/',
        'https://radiotedu.com/study/auth-callback.html',
        'https://www.radiotedu.com/study/auth-callback.html',
        'https://radiotedu.com/social/auth-callback.html',
        'https://www.radiotedu.com/social/auth-callback.html',
    ];

    return [...new Set([...configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean), ...websiteReturnUris])];
}

function validateReturnUri(value: string): string {
    const url = new URL(value);
    if (!['https:', 'radiotedu:'].includes(url.protocol)) {
        throw new Error('ERP login return URIs must use https or radiotedu');
    }
    return url.toString();
}

export function getErpIdentityConfiguration(): ErpIdentityConfiguration {
    const required = [
        'ERP_SSO_BASE_URL',
        'ERP_SSO_CLIENT_ID',
        'ERP_SSO_REDIRECT_URI',
    ] as const;
    const missing = required.filter((name) => !process.env[name]?.trim());

    if (missing.length > 0) {
        throw new Error(`Missing ERP identity environment variable(s): ${missing.join(', ')}`);
    }

    const explicitEncryptionKey = process.env.ERP_LINK_TOKEN_ENCRYPTION_KEY?.trim();
    const fallbackSecret = process.env.JWT_REFRESH_SECRET?.trim();
    if (!explicitEncryptionKey && !fallbackSecret) {
        throw new Error(
            'ERP_LINK_TOKEN_ENCRYPTION_KEY or JWT_REFRESH_SECRET is required',
        );
    }
    const encryptionKey = explicitEncryptionKey
        ? Buffer.from(explicitEncryptionKey, 'base64')
        : crypto
            .createHash('sha256')
            .update(`radiotedu:erp-identity:${fallbackSecret}`, 'utf8')
            .digest();
    if (encryptionKey.length !== 32) {
        throw new Error('ERP_LINK_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
    }

    const allowedReturnUris = configuredReturnUris().map(validateReturnUri);
    if (allowedReturnUris.length === 0) {
        throw new Error('At least one ERP login return URI is required');
    }

    return {
        baseUrl: process.env.ERP_SSO_BASE_URL!.replace(/\/$/, ''),
        clientId: process.env.ERP_SSO_CLIENT_ID!,
        redirectUri: process.env.ERP_SSO_REDIRECT_URI!,
        defaultReturnUri: allowedReturnUris[0],
        allowedReturnUris,
        encryptionKey,
    };
}

export function assertErpIdentityConfiguration(): void {
    if (isErpIdentityEnabled()) {
        getErpIdentityConfiguration();
    }
}

export function resolveErpReturnUri(requested?: string): string {
    const config = getErpIdentityConfiguration();
    if (!requested) return config.defaultReturnUri;

    const normalized = validateReturnUri(requested);
    if (!config.allowedReturnUris.includes(normalized)) {
        throw new Error('ERP login return URI is not allowed');
    }
    return normalized;
}

export function buildErpResultUri(
    returnUri: string,
    status: 'success' | 'error',
    values: Record<string, string> = {},
): string {
    const url = new URL(resolveErpReturnUri(returnUri));
    url.searchParams.set('erp_status', status);
    for (const [key, value] of Object.entries(values)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

export function createPkcePair(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

export function createOpaqueToken(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function encryptErpToken(
    token: string,
    key = getErpIdentityConfiguration().encryptionKey,
): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext]
        .map((part) => part.toString('base64url'))
        .join('.');
}

export function decryptErpToken(
    value: string,
    key = getErpIdentityConfiguration().encryptionKey,
): string {
    const [ivText, tagText, ciphertextText] = value.split('.');
    if (!ivText || !tagText || !ciphertextText) {
        throw new Error('Invalid encrypted ERP token');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}

export function buildErpAuthorizeUrl(state: string, challenge: string): string {
    const config = getErpIdentityConfiguration();
    const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'sso.identity',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    return `${config.baseUrl}/oauth/authorize?${query.toString()}`;
}

export async function exchangeErpAuthorizationCode(
    code: string,
    verifier: string,
): Promise<ErpTokenResponse> {
    const config = getErpIdentityConfiguration();
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code,
        code_verifier: verifier,
    });
    const response = await axios.post<ErpTokenResponse>(
        `${config.baseUrl}/oauth/token`,
        body.toString(),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10_000,
        },
    );
    return response.data;
}

export async function refreshErpAccessToken(refreshToken: string): Promise<ErpTokenResponse> {
    const config = getErpIdentityConfiguration();
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: refreshToken,
        scope: 'sso.identity',
    });
    const response = await axios.post<ErpTokenResponse>(
        `${config.baseUrl}/oauth/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
    );
    return response.data;
}

export async function fetchErpIdentityProfile(
    accessToken: string,
): Promise<ErpIdentityProfile> {
    const config = getErpIdentityConfiguration();
    const response = await axios.get<ErpIdentityProfile>(
        `${config.baseUrl}/api/sso/v1/me`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10_000,
        },
    );
    if (response.data.application !== 'mobile') {
        throw new Error('ERP token was not issued for the mobile/jukebox application');
    }
    return response.data;
}
