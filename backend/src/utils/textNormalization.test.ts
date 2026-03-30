import { describe, expect, it } from 'vitest';
import { normalizeDisplayNameInput } from '../routes/auth';
import { normalizeUploadedSongFilename } from '../middleware/upload';
import {
  buildSongFileUrl,
  normalizeFilename,
  normalizeText,
} from './textNormalization';

describe('text normalization', () => {
  it('keeps healthy text unchanged', () => {
    expect(normalizeText('Tuna Özsarı')).toBe('Tuna Özsarı');
  });

  it('repairs known mojibake samples', () => {
    expect(normalizeText('S├╝per Admin')).toBe('Süper Admin');
    expect(normalizeText('R├£YA')).toBe('RÜYA');
    expect(normalizeText('G├Âky├╝z├╝')).toBe('Gökyüzü');
  });

  it('is idempotent after repair', () => {
    const repaired = normalizeText('S├╝per Admin');
    expect(normalizeText(repaired)).toBe(repaired);
  });

  it('normalizes filenames without breaking Turkish characters', () => {
    expect(normalizeFilename('Semicenk - Çıkmaz Bir Sokakta.mp3')).toBe(
      'Semicenk - Çıkmaz Bir Sokakta.mp3',
    );
  });

  it('builds song urls from normalized filenames', () => {
    expect(buildSongFileUrl('Semicenk - Çıkmaz Bir Sokakta.mp3')).toBe(
      '/uploads/songs/Semicenk - Çıkmaz Bir Sokakta.mp3',
    );
  });

  it('normalizes display names before auth writes', () => {
    expect(normalizeDisplayNameInput('  Tuna ├ûzsar─▒  ')).toBe('Tuna Özsarı');
  });

  it('normalizes uploaded song filenames before saving', () => {
    const latin1Filename = Buffer.from(
      'Semicenk - Çıkmaz Bir Sokakta.mp3',
      'utf8',
    ).toString('latin1');

    expect(normalizeUploadedSongFilename(latin1Filename)).toBe(
      'Semicenk - Çıkmaz Bir Sokakta.mp3',
    );
  });
});
