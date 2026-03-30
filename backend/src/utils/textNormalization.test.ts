import { describe, expect, it } from 'vitest';
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
} from '../routes/jukebox';
import { normalizeItunesSongMetadata } from '../services/metadata';

describe('text normalization', () => {
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

  it('parses normalized song details from filenames for scan-folder ingestion', () => {
    expect(
      parseSongDetailsFromFilename('Semicenk - \u00C3\u0087\u00C4\u00B1kmaz Bir Sokakta.mp3'),
    ).toEqual({
      title: '\u00C7\u0131kmaz Bir Sokakta',
      artist: 'Semicenk',
      fileUrl: '/uploads/songs/Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
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
