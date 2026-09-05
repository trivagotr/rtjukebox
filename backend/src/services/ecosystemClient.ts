import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';

export type MobileTicket = {
    id: number;
    event_id: number;
    code: string;
    holder_name: string;
    payment_status: 'ucretsiz' | 'odend';
    checked_in: boolean;
    title: string;
    date: string;
    starts_at?: string | null;
    ends_at?: string | null;
    location: string;
    image_url?: string | null;
    detail_url: string;
    qr_payload: string;
};

export function getEcosystemSecret(): string {
    const direct = process.env.ECOSYSTEM_SHARED_SECRET?.trim();
    if (direct) return direct;

    const file = process.env.ECOSYSTEM_SHARED_SECRET_FILE
        || 'C:/inetpub/wwwroot/erp_app/storage/app/ecosystem-secret';
    const secret = fs.readFileSync(file, 'utf8').trim();
    if (!secret) throw new Error('Ecosystem shared secret is empty');
    return secret;
}

export function createEcosystemSignature(
    method: string,
    path: string,
    body = '',
    timestamp = Math.floor(Date.now() / 1000).toString(),
    secret = getEcosystemSecret(),
): { timestamp: string; signature: string } {
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonical = [timestamp, method.toUpperCase(), path, bodyHash].join('\n');
    const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    return { timestamp, signature };
}

export async function fetchTicketsByEmail(email: string): Promise<MobileTicket[]> {
    const endpoint = new URL(
        process.env.BILET_MOBILE_TICKETS_URL
            || 'https://radiotedu.com/bilet/api/mobile-tickets.php',
    );
    const signed = createEcosystemSignature('GET', endpoint.pathname);
    const response = await axios.get<{ data: MobileTicket[] }>(endpoint.toString(), {
        params: { email },
        headers: {
            'X-RT-Timestamp': signed.timestamp,
            'X-RT-Signature': signed.signature,
        },
        timeout: 10_000,
    });
    return Array.isArray(response.data.data) ? response.data.data : [];
}
