type AccountClaims = {
    id?: unknown;
    email?: unknown;
    role?: unknown;
};

export const RADIOTEDU_SUPERADMIN_EMAIL = String(
    process.env.RADIOTEDU_SUPERADMIN_EMAIL ?? 'admin@radiotedu',
).trim().toLowerCase();

export function isRadioTeduSuperadmin(user: AccountClaims | undefined): boolean {
    return Boolean(
        typeof user?.id === 'string'
        && user.id.trim()
        && typeof user.email === 'string'
        && user.email.trim().toLowerCase() === RADIOTEDU_SUPERADMIN_EMAIL
        && user.role === 'admin',
    );
}
