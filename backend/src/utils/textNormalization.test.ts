import { db } from '../db';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSongFileUrl,
  looksMojibake,
  normalizeFilename,
  normalizeText,
} from './textNormalization';
import { normalizeDisplayNameInput } from '../routes/auth';
import { normalizeUploadedSongFilename } from '../middleware/upload';
import {
  normalizeDeviceAdminInput,
  parseSongDetailsFromFilename,
  processScanFolderSongFile,
} from '../routes/jukebox';
import { normalizeItunesSongMetadata } from '../services/metadata';

describe('text normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps healthy text unchanged', () => {
    expect(normalizeText('Tuna \u00D6zsar\u0131')).toBe('Tuna \u00D6zsar\u0131');
  });

  it('keeps healthy non-Turkish unicode unchanged', () => {
    expect(normalizeText('\u6771\u4EAC')).toBe('\u6771\u4EAC');
  });

  it('detects mojibake strings', () => {
    expect(looksMojibake('S\u251C\u255Dper Admin')).toBe(true);
    expect(looksMojibake('Tuna \u00D6zsar\u0131')).toBe(false);
    expect(looksMojibake('\u6771\u4EAC')).toBe(false);
  });

  it('repairs S├╝per Admin to Süper Admin', () => {
    expect(normalizeText('S\u251C\u255Dper Admin')).toBe('S\u00FCper Admin');
  });

  it('repairs R├£YA to RÜYA', () => {
    expect(normalizeText('R\u251C\u00A3YA')).toBe('R\u00DCYA');
  });

  it('repairs G├Âky├╝z├╝ to Gökyüzü', () => {
    expect(normalizeText('G\u251C\u00C2ky\u251C\u255Dz\u251C\u255D')).toBe(
      'G\u00F6ky\u00FCz\u00FC',
    );
  });

  it('is idempotent after repair', () => {
    const repaired = normalizeText('S\u251C\u255Dper Admin');
    expect(normalizeText(repaired)).toBe(repaired);
  });

  it('normalizes filenames without breaking Turkish characters', () => {
    expect(normalizeFilename('Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3')).toBe(
      'Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
  });

  it('normalizes path separators safely in filenames', () => {
    expect(normalizeFilename('..\u005CSemicenk/\u00C7\u0131kmaz Bir Sokakta.mp3')).toBe(
      'Semicenk \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
  });

  it('does not mangle healthy unicode text', () => {
    expect(normalizeText('Bj\u00F6rk')).toBe('Bj\u00F6rk');
    expect(normalizeText('\u6771\u4EAC')).toBe('\u6771\u4EAC');
  });

  it('normalizes display names before persistence', () => {
    expect(normalizeDisplayNameInput('S\u251C\u255Dper Admin')).toBe('S\u00FCper Admin');
  });

  it('normalizes uploaded song filenames without stripping Turkish characters', () => {
    expect(normalizeUploadedSongFilename('Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3')).toBe(
      'Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
    expect(normalizeUploadedSongFilename('Semicenk - \u00C3\u0087\u00C4\u00B1kmaz Bir Sokakta.mp3')).toBe(
      'Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
  });

  it('repairs latin1-style mojibake in uploaded song filenames', () => {
    expect(normalizeUploadedSongFilename('\u00C3\u0087\u00C4\u00B1kmaz.mp3')).toBe(
      '\u00C7\u0131kmaz.mp3',
    );
  });

  it('builds song urls from normalized filenames', () => {
    expect(buildSongFileUrl('Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3')).toBe(
      '/uploads/songs/Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
  });

  it('normalizes device admin input', () => {
    expect(
      normalizeDeviceAdminInput({
        name: 'Radyo St\u251C\u255Ddyosu',
        location: 'Merkez Kamp\u251C\u255Ds',
      }),
    ).toEqual({
      name: 'Radyo St\u00FCdyosu',
      location: 'Merkez Kamp\u00FCs',
    });
  });

  it('allows clearing device location with empty admin input', () => {
    expect(
      normalizeDeviceAdminInput({
        name: 'Radyo St\u251C\u255Ddyosu',
        location: '',
      }),
    ).toEqual({
      name: 'Radyo St\u00FCdyosu',
      location: '',
    });
  });

  it('keeps scan-folder filenames and file urls aligned for mojibake names', () => {
    const filename = 'manifest - R\u251C\u00A3YA.mp3';

    expect(normalizeUploadedSongFilename(filename)).toBe('manifest - R\u00DCYA.mp3');
    expect(
      parseSongDetailsFromFilename(filename),
    ).toEqual({
      title: 'R\u00DCYA',
      artist: 'manifest',
      fileUrl: '/uploads/songs/manifest - R\u00DCYA.mp3',
    });
  });

  it('preserves punctuation when parsing song details from filenames', () => {
    expect(
      parseSongDetailsFromFilename('P!nk - Raise Your Glass (Live).mp3'),
    ).toEqual({
      title: 'Raise Your Glass (Live)',
      artist: 'P!nk',
      fileUrl: '/uploads/songs/Pnk - Raise Your Glass Live.mp3',
    });
  });

  it('updates a legacy scan-folder row in place after renaming the file', async () => {
    const uploadsPath = 'C:/music/uploads/songs';
    const originalFile = 'manifest - R\u251C\u00A3YA.mp3';
    const normalizedFile = 'manifest - R\u00DCYA.mp3';
    const originalPath = path.join(uploadsPath, originalFile);
    const normalizedPath = path.join(uploadsPath, normalizedFile);
    const originalUrl = `/uploads/songs/${originalFile}`;
    const normalizedUrl = `/uploads/songs/${normalizedFile}`;

    const rows = {
      [originalUrl]: [{ id: 'song-1', is_active: false, file_url: originalUrl }],
      [normalizedUrl]: [],
    } as Record<string, Array<{ id: string; is_active: boolean; file_url: string }>>;
    const renameCalls: Array<[string, string]> = [];
    const updateCalls: Array<[string, unknown[]]> = [];

    const result = await processScanFolderSongFile({
      file: originalFile,
      uploadsPath,
      dbClient: {
        async query(sql: string, params: unknown[]) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [] };
          }

          if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
            return { rows: rows[String(params[0])] ?? [] };
          }

          if (sql.includes('UPDATE songs SET file_url = $1, is_active = true WHERE id = $2 RETURNING *')) {
            updateCalls.push([sql, params]);
            rows[originalUrl] = [];
            rows[normalizedUrl] = [{ id: 'song-1', is_active: true, file_url: normalizedUrl }];
            return { rows: [{ id: 'song-1', is_active: true, file_url: normalizedUrl }] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        },
      },
      fsImpl: {
        existsSync(filePath: string) {
          return filePath === originalPath;
        },
        renameSync(from: string, to: string) {
          renameCalls.push([from, to]);
        },
      },
    });

    expect(renameCalls).toEqual([[originalPath, normalizedPath]]);
    expect(updateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      action: 'updated',
      fileUrl: normalizedUrl,
      title: 'R\u00DCYA',
      artist: 'manifest',
    });
  });

  it('reconciles both legacy and normalized scan-folder rows without leaving the legacy row active', async () => {
    const uploadsPath = 'C:/music/uploads/songs';
    const originalFile = 'manifest - R\u251C\u00A3YA.mp3';
    const normalizedFile = 'manifest - R\u00DCYA.mp3';
    const originalPath = path.join(uploadsPath, originalFile);
    const normalizedPath = path.join(uploadsPath, normalizedFile);
    const originalUrl = `/uploads/songs/${originalFile}`;
    const normalizedUrl = `/uploads/songs/${normalizedFile}`;
    const queryLog: string[] = [];
    const updateCalls: Array<[string, unknown[]]> = [];

    const result = await processScanFolderSongFile({
      file: originalFile,
      uploadsPath,
      dbClient: {
        async query(sql: string, params: unknown[]) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            queryLog.push(sql);
            return { rows: [] };
          }

          queryLog.push(`${sql} :: ${String(params[0])}`);

          if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
            if (String(params[0]) === normalizedUrl) {
              return { rows: [{ id: 'song-new', is_active: true, file_url: normalizedUrl }] };
            }
            if (String(params[0]) === originalUrl) {
              return { rows: [{ id: 'song-old', is_active: true, file_url: originalUrl }] };
            }
            return { rows: [] };
          }

          if (sql.includes('UPDATE songs SET is_active = false WHERE id = $1 RETURNING *')) {
            updateCalls.push([sql, params]);
            return { rows: [{ id: String(params[0]), is_active: false, file_url: String(params[0]) === 'song-old' ? originalUrl : normalizedUrl }] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        },
      },
      fsImpl: {
        existsSync(filePath: string) {
          return filePath === originalPath;
        },
        renameSync() {},
      },
    });

    expect(queryLog).toEqual(
      expect.arrayContaining([
        expect.stringContaining(normalizedUrl),
        expect.stringContaining(originalUrl),
        'BEGIN',
        'COMMIT',
      ]),
    );
    expect(updateCalls).toHaveLength(1);
    expect(result).toMatchObject({
      action: 'reconciled',
      fileUrl: normalizedUrl,
      title: 'R\u00DCYA',
      artist: 'manifest',
    });
  });

  it('rolls back the rename if a later scan-folder database write fails', async () => {
    const uploadsPath = 'C:/music/uploads/songs';
    const originalFile = 'manifest - R\u251C\u00A3YA.mp3';
    const normalizedFile = 'manifest - R\u00DCYA.mp3';
    const originalPath = path.join(uploadsPath, originalFile);
    const normalizedPath = path.join(uploadsPath, normalizedFile);
    const originalUrl = `/uploads/songs/${originalFile}`;
    const renameCalls: Array<[string, string]> = [];

    await expect(
      processScanFolderSongFile({
        file: originalFile,
        uploadsPath,
        dbClient: {
          async query(sql: string, params: unknown[]) {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
              return { rows: [] };
            }

            if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
              if (String(params[0]) === originalUrl) {
                return { rows: [{ id: 'song-old', is_active: false, file_url: originalUrl }] };
              }
              return { rows: [] };
            }

            if (sql.includes('UPDATE songs SET file_url = $1, is_active = true WHERE id = $2 RETURNING *')) {
              throw new Error('db write failed');
            }

            throw new Error(`Unexpected query: ${sql}`);
          },
        },
        fsImpl: {
          existsSync(filePath: string) {
            return filePath === originalPath;
          },
          renameSync(from: string, to: string) {
            renameCalls.push([from, to]);
          },
        },
      }),
    ).rejects.toThrow('db write failed');

    expect(renameCalls).toEqual([
      [originalPath, normalizedPath],
      [normalizedPath, originalPath],
    ]);
  });

  it('uses a dedicated pooled client for the default scan-folder transaction path', async () => {
    const connectSpy = vi.spyOn(db.pool, 'connect');
    const querySpy = vi.spyOn(db, 'query').mockImplementation(async () => {
      throw new Error('default path should not use db.query');
    });
    const releaseSpy = vi.fn();
    const queryLog: string[] = [];

    connectSpy.mockResolvedValue({
      query: async (sql: string, params: unknown[]) => {
        queryLog.push(`${sql} :: ${String(params[0])}`);

        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }

        if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
          return { rows: [] };
        }

        if (sql.includes('INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *')) {
          return { rows: [{ id: 'song-default', is_active: true, file_url: String(params[3]) }] };
        }

        throw new Error(`Unexpected query: ${sql}`);
      },
      release: releaseSpy,
    } as any);

    const result = await processScanFolderSongFile({
      file: 'New Track - Artist.mp3',
      uploadsPath: 'C:/music/uploads/songs',
      fsImpl: {
        existsSync() {
          return false;
        },
        renameSync() {
          throw new Error('should not rename');
        },
      },
    });

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(querySpy).not.toHaveBeenCalled();
    expect(queryLog).toEqual(
      expect.arrayContaining([
        'BEGIN :: undefined',
        'COMMIT :: undefined',
      ]),
    );
    expect(result).toMatchObject({
      action: 'inserted',
      fileUrl: '/uploads/songs/New Track - Artist.mp3',
      title: 'Artist',
      artist: 'New Track',
    });
  });

  it('releases the pooled client when the initial scan-folder select throws', async () => {
    const connectSpy = vi.spyOn(db.pool, 'connect');
    const releaseSpy = vi.fn();
    connectSpy.mockResolvedValue({
      query: async (sql: string) => {
        if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
          throw new Error('initial select failed');
        }

        throw new Error(`Unexpected query: ${sql}`);
      },
      release: releaseSpy,
    } as any);

    await expect(
      processScanFolderSongFile({
        file: 'Broken Track.mp3',
        uploadsPath: 'C:/music/uploads/songs',
        fsImpl: {
          existsSync() {
            return false;
          },
          renameSync() {
            throw new Error('should not rename');
          },
        },
      }),
    ).rejects.toThrow('initial select failed');

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a collision case on the original file url without overwriting the target', async () => {
    const uploadsPath = 'C:/music/uploads/songs';
    const file = 'P!nk - Raise Your Glass (Live).mp3';
    const originalPath = path.join(uploadsPath, file);
    const originalUrl = `/uploads/songs/${file}`;
    const normalizedUrl = '/uploads/songs/Pnk - Raise Your Glass Live.mp3';
    const insertCalls: Array<unknown[]> = [];
    const renameCalls: Array<[string, string]> = [];

    const result = await processScanFolderSongFile({
      file,
      uploadsPath,
      dbClient: {
        async query(sql: string, params: unknown[]) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [] };
          }

          if (sql.includes('SELECT id, is_active, file_url FROM songs WHERE file_url = $1')) {
            if (String(params[0]) === originalUrl) {
              return { rows: [] };
            }
            if (String(params[0]) === normalizedUrl) {
              return { rows: [] };
            }
          }

          if (sql.includes('INSERT INTO songs (title, artist, duration_seconds, file_url) VALUES ($1, $2, $3, $4) RETURNING *')) {
            insertCalls.push(params);
            return { rows: [{ id: 'song-2', is_active: true, file_url: String(params[3]) }] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        },
      },
      fsImpl: {
        existsSync(filePath: string) {
          return filePath === originalPath || filePath === path.join(uploadsPath, 'Pnk - Raise Your Glass Live.mp3');
        },
        renameSync(from: string, to: string) {
          renameCalls.push([from, to]);
        },
      },
    });

    expect(renameCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual(['Raise Your Glass (Live)', 'P!nk', 180, originalUrl]);
    expect(result).toMatchObject({
      action: 'inserted',
      fileUrl: originalUrl,
      title: 'Raise Your Glass (Live)',
      artist: 'P!nk',
    });
  });

  it('normalizes synced iTunes metadata before persistence', () => {
    expect(
      normalizeItunesSongMetadata({
        title: 'R\u251C\u00A3YA',
        artist: 'Avrupa M\u251C\u255Dzik',
        album: 'R\u251C\u00A3YA - Single',
      }),
    ).toEqual({
      title: 'R\u00DCYA',
      artist: 'Avrupa M\u00FCzik',
      album: 'R\u00DCYA - Single',
    });
  });
});
