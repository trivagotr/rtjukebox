import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ValidationError } from '../errors/app-error.js';

const PREFIX = 'enc:v1:';

function keyBytes(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string, encryptionKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string, encryptionKey?: string) {
  if (!value.startsWith(PREFIX)) return value; // Legacy plaintext is read only during migration.
  if (!encryptionKey) throw new ValidationError('SPOTIFY_ENCRYPTION_KEY is required to read stored Spotify credentials');
  const [ivText, tagText, ciphertextText, extra] = value.slice(PREFIX.length).split(':');
  if (!ivText || !tagText || !ciphertextText || extra !== undefined) throw new ValidationError('Stored Spotify credential is invalid');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(encryptionKey), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ValidationError('Stored Spotify credential could not be decrypted');
  }
}
