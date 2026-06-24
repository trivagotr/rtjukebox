export type CorsOrigin = string | string[];

export function resolveCorsOrigins(
    rawOrigins: string | undefined,
    options: { isProduction: boolean },
): CorsOrigin {
    const origins = (rawOrigins || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length > 0) {
        return origins;
    }

    if (options.isProduction) {
        throw new Error('CORS_ORIGINS is required in production');
    }

    return '*';
}
