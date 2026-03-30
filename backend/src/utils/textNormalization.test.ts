import { describe, expect, it } from 'vitest';
import {
  buildSongFileUrl,
  normalizeFilename,
  normalizeText,
} from './textNormalization';

describe('text normalization', () => {
  it('keeps healthy text unchanged', () => {
    expect(normalizeText('Tuna \u00D6zsar\u0131')).toBe('Tuna \u00D6zsar\u0131');
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

  it('builds song urls from normalized filenames', () => {
    expect(buildSongFileUrl('Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3')).toBe(
      '/uploads/songs/Semicenk - \u00C7\u0131kmaz Bir Sokakta.mp3',
    );
  });
});
