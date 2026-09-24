import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

type QrRewardTokenPayload = { reward_id: string; expires_at: number; nonce: string };

function signingKey() {
  const secret = process.env.QR_REWARD_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('QR reward signing key is not configured');
  return createHmac('sha256', secret).update('radiotedu:qr-reward:v1').digest();
}

function signature(payload: string) {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function createQrRewardToken(rewardId: string, expiresAt: number) {
  const payload: QrRewardTokenPayload = {
    reward_id: rewardId,
    expires_at: expiresAt,
    nonce: randomBytes(16).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyQrRewardToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)):
  | { valid: true; rewardId: string }
  | { valid: false; reason: 'invalid' | 'expired' } {
  try {
    const [encoded, suppliedSignature, ...rest] = token.split('.');
    if (!encoded || !suppliedSignature || rest.length) return { valid: false, reason: 'invalid' };
    const expected = Buffer.from(signature(encoded), 'base64url');
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { valid: false, reason: 'invalid' };

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<QrRewardTokenPayload>;
    if (typeof payload.reward_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.reward_id)
      || !Number.isSafeInteger(payload.expires_at) || typeof payload.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(payload.nonce)) {
      return { valid: false, reason: 'invalid' };
    }
    if (payload.expires_at! <= nowSeconds) return { valid: false, reason: 'expired' };
    return { valid: true, rewardId: payload.reward_id };
  } catch {
    return { valid: false, reason: 'invalid' };
  }
}
