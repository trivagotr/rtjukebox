import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { detectAvatarExtension, detectSongExtension, validateAvatarUpload, validateSongUpload } from './upload';

vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffprobe: vi.fn((_filePath: string, callback: (error: Error | null, metadata?: any) => void) => {
      callback(null, {
        format: { format_name: 'mov,mp4,m4a', duration: 180 },
        streams: [{ codec_type: 'audio' }],
      });
    }),
  },
}));

const tempDirectories: string[] = [];

async function createUploadFile(filename: string, contents: Buffer) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'radiotedu-upload-'));
  tempDirectories.push(directory);
  const filePath = path.join(directory, filename);
  await writeFile(filePath, contents);
  return filePath;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('upload content validation', () => {
  it('detects supported raster image and audio signatures', () => {
    expect(detectAvatarExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('.jpg');
    expect(detectAvatarExtension(Buffer.from('<svg></svg>'))).toBeNull();
    expect(detectSongExtension(Buffer.from('ID3\x04\x00\x00'))).toBe('.mp3');
    expect(detectSongExtension(Buffer.from('RIFF0000WAVE'))).toBe('.wav');
    expect(detectSongExtension(Buffer.from('0000ftypM4A '))).toBe('.m4a');
  });

  it('rejects files whose body does not match their allowed type', async () => {
    const filePath = await createUploadFile('avatar.png', Buffer.from('<svg onload="alert(1)"></svg>'));
    const req = { file: { path: filePath, originalname: 'avatar.png' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();

    await validateAvatarUpload(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    await expect(readFile(filePath)).rejects.toThrow();
  });

  it('accepts a recognized song body only when its extension matches', async () => {
    const filePath = await createUploadFile('song.m4a', Buffer.from('0000ftypM4A '));
    const req = { file: { path: filePath, originalname: 'song.m4a' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();

    await validateSongUpload(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects malformed media containers and removes the uploaded file', async () => {
    const ffmpeg = await import('fluent-ffmpeg');
    vi.mocked(ffmpeg.default.ffprobe).mockImplementationOnce((_filePath: string, callback: any) => {
      callback(new Error('invalid media'));
      return undefined as any;
    });
    const filePath = await createUploadFile('bad.mp3', Buffer.from('ID3\x04\x00\x00'));
    const req = { file: { path: filePath, originalname: 'bad.mp3' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();

    await validateSongUpload(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    await expect(readFile(filePath)).rejects.toThrow();
  });
});
