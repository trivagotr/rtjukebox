import { describe, expect, it } from 'vitest';
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
});
