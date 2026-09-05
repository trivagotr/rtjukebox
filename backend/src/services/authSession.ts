import { db } from '../db';

export type AuthSessionQueryClient = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

const SESSION_FAMILY_UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionFamilyId(value: unknown): value is string {
    return typeof value === 'string' && SESSION_FAMILY_UUID_PATTERN.test(value);
}

/**
 * A sid-bearing access token is valid only while its refresh-token family is
 * still present and unexpired. Tokens issued before sid existed deliberately
 * bypass this lookup in the caller and retain their original JWT expiry.
 */
export async function isAuthSessionFamilyActive(
    userId: string,
    sessionFamilyId: string,
    expectedRole: string,
    queryClient: AuthSessionQueryClient = db,
): Promise<boolean> {
    if (!userId.trim() || !expectedRole.trim() || !isSessionFamilyId(sessionFamilyId)) return false;

    const result = await queryClient.query(
        `SELECT 1
         FROM refresh_tokens rt
         INNER JOIN users u ON u.id = rt.user_id
         WHERE rt.user_id = $1
           AND rt.session_family_id = $2::uuid
           AND rt.expires_at > NOW()
           AND COALESCE(u.is_banned, FALSE) = FALSE
           AND u.role = $3
         LIMIT 1`,
        [userId, sessionFamilyId, expectedRole],
    );
    return result.rows.length > 0;
}
