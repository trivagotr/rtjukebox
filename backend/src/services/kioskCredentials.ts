import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function generateKioskCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function generateKioskProvisioningCode(): string {
  return randomBytes(24).toString('base64url');
}

export function hashKioskSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function kioskSecretMatches(hash: unknown, supplied: string): boolean {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash) || !supplied) return false;
  const expectedHash = Buffer.from(hash, 'hex');
  const suppliedHash = Buffer.from(hashKioskSecret(supplied), 'hex');
  return expectedHash.length === suppliedHash.length && timingSafeEqual(expectedHash, suppliedHash);
}
