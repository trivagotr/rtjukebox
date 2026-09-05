import {createHash, randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {isIP} from 'node:net';
import path from 'node:path';
import sharp from 'sharp';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DECODED_BYTES = 1_572_864;
const MAX_INPUT_PIXELS = 25_000_000;
const MAX_OUTPUT_DIMENSION = 1_600;
const DEFAULT_PUBLIC_PATH_PREFIX = '/uploads/next-song-voting';
const DEFAULT_UPLOADS_DIRECTORY = path.resolve(__dirname, '../../uploads/next-song-voting');
const GENERATED_FILE_PATTERN = /^[a-f0-9]{48}\.webp$/;

export const DEFAULT_VOTING_FALLBACK_COVER_URL = '/uploads/next-song-voting/fallback.png';

type AllowedContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export type VotingCoverAssetInput = {
  contentType: string;
  dataBase64: string;
};

export type StoredVotingCover = {
  publicUrl: string;
  absolutePath: string;
  contentHash: string;
};

export type StoreVotingCoverOptions = {
  uploadsDirectory?: string;
  publicPathPrefix?: string;
  maxDecodedBytes?: number;
  maxInputPixels?: number;
};

export type RemoveStoredVotingCoverOptions = Pick<StoreVotingCoverOptions, 'uploadsDirectory'>;

export class VotingCoverArtError extends Error {
  constructor(readonly code: 'invalid_asset' | 'asset_too_large' | 'invalid_image' | 'storage_error') {
    super(code);
    this.name = 'VotingCoverArtError';
  }
}

function strictDecodeBase64(value: unknown, maxDecodedBytes: number): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('data:')) {
    throw new VotingCoverArtError('invalid_asset');
  }

  const maxEncodedLength = Math.ceil(maxDecodedBytes / 3) * 4;
  if (value.length > maxEncodedLength) {
    throw new VotingCoverArtError('asset_too_large');
  }

  // Node's base64 decoder is deliberately permissive. Require canonical RFC 4648
  // encoding so whitespace, data URLs, paths and partially decoded input cannot pass.
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new VotingCoverArtError('invalid_asset');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.length > maxDecodedBytes) {
    throw new VotingCoverArtError(
      decoded.length > maxDecodedBytes ? 'asset_too_large' : 'invalid_asset',
    );
  }
  if (decoded.toString('base64') !== value) {
    throw new VotingCoverArtError('invalid_asset');
  }
  return decoded;
}

function detectContentType(bytes: Buffer): AllowedContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function effectiveLimit(value: number | undefined, hardLimit: number): number {
  if (value === undefined) return hardLimit;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new VotingCoverArtError('invalid_asset');
  }
  return Math.min(value, hardLimit);
}

function normalizePublicPathPrefix(value: string | undefined): string {
  const prefix = value ?? DEFAULT_PUBLIC_PATH_PREFIX;
  if (
    !prefix.startsWith('/') ||
    prefix.startsWith('//') ||
    prefix.includes('\\') ||
    prefix.includes('..') ||
    /[?#\u0000-\u001f\u007f]/.test(prefix)
  ) {
    throw new VotingCoverArtError('invalid_asset');
  }
  return prefix.replace(/\/+$/, '');
}

async function encodeSafeWebp(bytes: Buffer, maxInputPixels: number): Promise<Buffer> {
  try {
    const image = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: maxInputPixels,
      sequentialRead: true,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > maxInputPixels ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new VotingCoverArtError('invalid_image');
    }

    return await image
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({quality: 84, alphaQuality: 90, effort: 4, smartSubsample: true})
      .toBuffer();
  } catch (error) {
    if (error instanceof VotingCoverArtError) throw error;
    throw new VotingCoverArtError('invalid_image');
  }
}

export async function storeVotingCoverAsset(
  asset: VotingCoverAssetInput,
  options: StoreVotingCoverOptions = {},
): Promise<StoredVotingCover> {
  if (!asset || typeof asset !== 'object' || !ALLOWED_CONTENT_TYPES.has(asset.contentType)) {
    throw new VotingCoverArtError('invalid_asset');
  }

  const maxDecodedBytes = effectiveLimit(options.maxDecodedBytes, MAX_DECODED_BYTES);
  const maxInputPixels = effectiveLimit(options.maxInputPixels, MAX_INPUT_PIXELS);
  const decoded = strictDecodeBase64(asset.dataBase64, maxDecodedBytes);
  if (detectContentType(decoded) !== asset.contentType) {
    throw new VotingCoverArtError('invalid_image');
  }

  const encoded = await encodeSafeWebp(decoded, maxInputPixels);
  const contentHash = createHash('sha256').update(encoded).digest('hex');
  const uploadsDirectory = path.resolve(options.uploadsDirectory ?? DEFAULT_UPLOADS_DIRECTORY);
  const publicPathPrefix = normalizePublicPathPrefix(options.publicPathPrefix);
  await fs.mkdir(uploadsDirectory, {recursive: true});

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fileName = `${randomBytes(24).toString('hex')}.webp`;
    const absolutePath = path.join(uploadsDirectory, fileName);
    try {
      await fs.writeFile(absolutePath, encoded, {flag: 'wx', mode: 0o600});
      return {
        publicUrl: `${publicPathPrefix}/${fileName}`,
        absolutePath,
        contentHash,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') continue;
      throw new VotingCoverArtError('storage_error');
    }
  }

  throw new VotingCoverArtError('storage_error');
}

function resolveStoredCoverPath(
  storedPath: string,
  uploadsDirectory: string,
): string | null {
  let candidate: string;
  if (storedPath.startsWith(`${DEFAULT_PUBLIC_PATH_PREFIX}/`)) {
    candidate = path.join(uploadsDirectory, path.posix.basename(storedPath));
  } else {
    candidate = path.resolve(storedPath);
  }

  const relative = path.relative(uploadsDirectory, candidate);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !GENERATED_FILE_PATTERN.test(path.basename(candidate))
  ) {
    return null;
  }
  return candidate;
}

export async function removeStoredVotingCover(
  storedPath: string | null | undefined,
  options: RemoveStoredVotingCoverOptions = {},
): Promise<void> {
  if (typeof storedPath !== 'string' || storedPath.length === 0) return;
  const uploadsDirectory = path.resolve(options.uploadsDirectory ?? DEFAULT_UPLOADS_DIRECTORY);
  const candidate = resolveStoredCoverPath(storedPath, uploadsDirectory);
  if (!candidate) throw new VotingCoverArtError('invalid_asset');

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.unlink(candidate);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      if ((code === 'EBUSY' || code === 'EPERM') && attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw new VotingCoverArtError('storage_error');
    }
  }
}

function parseIpv6Bytes(value: string): number[] | null {
  if (value.includes('%')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const result: number[] = [];
    const pieces = half.split(':');
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (piece.includes('.')) {
        if (index !== pieces.length - 1) return null;
        const octets = piece.split('.').map(Number);
        if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
          return null;
        }
        result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[a-f0-9]{1,4}$/i.test(piece)) return null;
        result.push(Number.parseInt(piece, 16));
      }
    }
    return result;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array(missing).fill(0), ...right];
  if (words.length !== 8) return null;
  return words.flatMap(word => [(word >> 8) & 0xff, word & 0xff]);
}

function isPublicIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) return false;
  const [a, b] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  ) {
    return false;
  }
  return true;
}

function isPublicIpv6(hostname: string): boolean {
  const bytes = parseIpv6Bytes(hostname);
  if (!bytes) return false;
  const allZero = bytes.every(byte => byte === 0);
  const loopback = bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return false;
  if ((bytes[0] & 0xfe) === 0xfc) return false; // Unique local fc00::/7
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false; // Link-local fe80::/10
  if (bytes[0] === 0xff) return false; // Multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false; // Documentation 2001:db8::/32
  }

  const ipv4Mapped = bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const ipv4Compatible = bytes.slice(0, 12).every(byte => byte === 0);
  if (ipv4Mapped || ipv4Compatible) {
    return isPublicIpv4(bytes.slice(12).join('.'));
  }
  return true;
}

function isPublicHostname(hostname: string): boolean {
  if (!hostname || hostname.endsWith('.') || hostname.includes('%')) return false;
  const normalized = hostname.toLowerCase();
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPublicIpv4(normalized);
  if (ipVersion === 6) return isPublicIpv6(normalized);

  if (!normalized.includes('.') || !/^[a-z0-9.-]+$/.test(normalized)) return false;
  const internalSuffixes = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp'];
  return !internalSuffixes.some(suffix => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

export function sanitizePublicAlbumArtUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return null;
  if (value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return null;
    }
    const hostname = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    if (!isPublicHostname(hostname)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeFallbackPath(value: string): string | null {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[?#\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split('/').includes('..') || decoded.includes('\\')) return null;
  } catch {
    return null;
  }
  return value;
}

export function getVotingFallbackCoverUrl(): string {
  const configured = process.env.VOTING_FALLBACK_COVER_URL?.trim();
  if (!configured) return DEFAULT_VOTING_FALLBACK_COVER_URL;
  return sanitizeFallbackPath(configured) ?? DEFAULT_VOTING_FALLBACK_COVER_URL;
}
