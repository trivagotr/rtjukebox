type RequestLogInput = {
    method: string;
    path: string;
};

function sanitizeLogToken(value: string, maxLength: number) {
    return value
        .replace(/[\r\n\t]/g, '_')
        .slice(0, maxLength);
}

export function formatRequestLogLine(
    request: RequestLogInput,
    at: Date = new Date(),
) {
    const method = sanitizeLogToken(String(request.method || 'UNKNOWN'), 16);
    const pathname = sanitizeLogToken(
        String(request.path || '/').split(/[?#]/, 1)[0] || '/',
        2048,
    );
    return `[${at.toISOString()}] ${method} ${pathname}`;
}
