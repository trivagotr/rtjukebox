import {createHash} from 'node:crypto';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {afterEach, describe, expect, it} from 'vitest';
import {
  DEFAULT_VOTING_FALLBACK_COVER_URL,
  getVotingFallbackCoverUrl,
  removeStoredVotingCover,
  sanitizePublicAlbumArtUrl,
  storeVotingCoverAsset,
} from './votingCoverArt';

const MAX_DECODED_BYTES = 1_572_864;
const temporaryRoots: string[] = [];
const originalFallbackCover = process.env.VOTING_FALLBACK_COVER_URL;

async function makeUploadsDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'voting-cover-art-'));
  temporaryRoots.push(root);
  return path.join(root, 'next-song-voting');
}

async function makePng(width = 4, height = 3): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {r: 28, g: 67, b: 92, alpha: 1},
    },
  }).png().toBuffer();
}

afterEach(async () => {
  if (originalFallbackCover === undefined) {
    delete process.env.VOTING_FALLBACK_COVER_URL;
  } else {
    process.env.VOTING_FALLBACK_COVER_URL = originalFallbackCover;
  }
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, {recursive: true, force: true})));
});

describe('storeVotingCoverAsset', () => {
  it('decodes, validates and safely re-encodes an uploaded cover as WebP', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const input = await makePng();

    const stored = await storeVotingCoverAsset(
      {contentType: 'image/png', dataBase64: input.toString('base64')},
      {uploadsDirectory},
    );

    expect(stored.publicUrl).toMatch(/^\/uploads\/next-song-voting\/[a-f0-9]{48}\.webp$/);
    expect(path.dirname(stored.absolutePath)).toBe(path.resolve(uploadsDirectory));
    const storedBytes = await readFile(stored.absolutePath);
    expect(stored.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.contentHash).toBe(createHash('sha256').update(storedBytes).digest('hex'));
    const metadata = await sharp(storedBytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(3);

    const duplicate = await storeVotingCoverAsset(
      {contentType: 'image/png', dataBase64: input.toString('base64')},
      {uploadsDirectory},
    );
    expect(duplicate.absolutePath).not.toBe(stored.absolutePath);
    expect(duplicate.contentHash).toBe(stored.contentHash);

    await removeStoredVotingCover(stored.absolutePath, {uploadsDirectory});
    await removeStoredVotingCover(duplicate.absolutePath, {uploadsDirectory});
    await expect(access(stored.absolutePath)).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('rejects unsupported MIME types and MIME/magic-byte mismatches', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const png = await makePng();

    await expect(storeVotingCoverAsset(
      {contentType: 'image/gif', dataBase64: png.toString('base64')},
      {uploadsDirectory},
    )).rejects.toMatchObject({code: 'invalid_asset'});

    await expect(storeVotingCoverAsset(
      {contentType: 'image/jpeg', dataBase64: png.toString('base64')},
      {uploadsDirectory},
    )).rejects.toMatchObject({code: 'invalid_image'});
  });

  it('requires canonical base64 and rejects data URLs and local paths', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const invalidValues = [
      'data:image/png;base64,AAAA',
      '../private/cover.png',
      'C:\\private\\cover.png',
      'not base64',
      'YWJjZA',
    ];

    for (const dataBase64 of invalidValues) {
      await expect(storeVotingCoverAsset(
        {contentType: 'image/png', dataBase64},
        {uploadsDirectory},
      )).rejects.toBeInstanceOf(Error);
    }
  });

  it('rejects decoded payloads larger than 1.5 MB before image decoding', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const oversized = Buffer.alloc(MAX_DECODED_BYTES + 1).toString('base64');

    await expect(storeVotingCoverAsset(
      {contentType: 'image/jpeg', dataBase64: oversized},
      {uploadsDirectory},
    )).rejects.toMatchObject({code: 'asset_too_large'});
  });

  it('enforces the decoder pixel limit', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const png = await makePng(101, 100);

    await expect(storeVotingCoverAsset(
      {contentType: 'image/png', dataBase64: png.toString('base64')},
      {uploadsDirectory, maxInputPixels: 10_000},
    )).rejects.toMatchObject({code: 'invalid_image'});
  });

  it('will not remove a traversal path outside the voting cover directory', async () => {
    const uploadsDirectory = await makeUploadsDirectory();
    const outside = path.resolve(uploadsDirectory, '..', `${'a'.repeat(48)}.webp`);

    await expect(removeStoredVotingCover(outside, {uploadsDirectory}))
      .rejects.toMatchObject({code: 'invalid_asset'});
  });
});

describe('sanitizePublicAlbumArtUrl', () => {
  it('allows public HTTPS URLs and removes fragments', () => {
    expect(sanitizePublicAlbumArtUrl('https://cdn.example.com/covers/song.webp?size=large#client'))
      .toBe('https://cdn.example.com/covers/song.webp?size=large');
    expect(sanitizePublicAlbumArtUrl('https://8.8.8.8/cover.jpg'))
      .toBe('https://8.8.8.8/cover.jpg');
  });

  it.each([
    'http://cdn.example.com/cover.jpg',
    'https://user:password@cdn.example.com/cover.jpg',
    'https://localhost/cover.jpg',
    'https://covers.service.local/cover.jpg',
    'https://127.0.0.1/cover.jpg',
    'https://10.0.0.8/cover.jpg',
    'https://169.254.12.4/cover.jpg',
    'https://192.168.1.5/cover.jpg',
    'https://[::1]/cover.jpg',
    'https://[fe80::1]/cover.jpg',
    'file:///private/cover.jpg',
    '/uploads/private/cover.jpg',
    '../private/cover.jpg',
  ])('rejects non-public or unsafe album art URL %s', value => {
    expect(sanitizePublicAlbumArtUrl(value)).toBeNull();
  });
});

describe('getVotingFallbackCoverUrl', () => {
  it('uses the RadioTEDU logo by default and ignores unsafe overrides', () => {
    delete process.env.VOTING_FALLBACK_COVER_URL;
    expect(getVotingFallbackCoverUrl()).toBe(DEFAULT_VOTING_FALLBACK_COVER_URL);

    process.env.VOTING_FALLBACK_COVER_URL = 'https://127.0.0.1/private.png';
    expect(getVotingFallbackCoverUrl()).toBe(DEFAULT_VOTING_FALLBACK_COVER_URL);

    process.env.VOTING_FALLBACK_COVER_URL = '/assets/logo.png?token=secret';
    expect(getVotingFallbackCoverUrl()).toBe(DEFAULT_VOTING_FALLBACK_COVER_URL);

    process.env.VOTING_FALLBACK_COVER_URL = '/assets/logo.png#fragment';
    expect(getVotingFallbackCoverUrl()).toBe(DEFAULT_VOTING_FALLBACK_COVER_URL);
  });

  it('accepts only a safe same-origin root-relative override', () => {
    process.env.VOTING_FALLBACK_COVER_URL = '/assets/radiotedu-voting.png';
    expect(getVotingFallbackCoverUrl()).toBe('/assets/radiotedu-voting.png');

    process.env.VOTING_FALLBACK_COVER_URL = 'https://cdn.example.com/radiotedu-voting.png';
    expect(getVotingFallbackCoverUrl()).toBe(DEFAULT_VOTING_FALLBACK_COVER_URL);
  });
});
