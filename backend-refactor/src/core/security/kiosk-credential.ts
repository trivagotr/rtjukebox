import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateKioskCredential() {
  return randomBytes(32).toString('base64url');
}

export function generateKioskProvisioningCode() {
  return randomBytes(24).toString('base64url');
}

export function hashKioskSecret(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function kioskSecretMatches(hash: unknown, supplied: string) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash) || !supplied) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashKioskSecret(supplied), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
