import { describe, it, expect } from 'vitest';
import { normalizeText, checkProfanityText } from './profanityFilter';

describe('profanityFilter', () => {
  describe('normalizeText', () => {
    it('normalizes Turkish characters correctly', () => {
      expect(normalizeText('ÇŞĞÜÖİçşğüöı')).toBe('csguoi' + 'csguoi');
    });

    it('normalizes leetspeak numbers and symbols', () => {
      expect(normalizeText('0r0$pu')).toBe('orospu');
      expect(normalizeText('s1kt1r')).toBe('siktir');
      expect(normalizeText('f**k')).toBe('f k');
    });

    it('collapses repeated letters', () => {
      expect(normalizeText('siiiik')).toBe('sik');
      expect(normalizeText('amkkkk')).toBe('amk');
      expect(normalizeText('orooospu')).toBe('orospu');
    });
  });

  describe('checkProfanityText', () => {
    it('detects Turkish profanity', () => {
      expect(checkProfanityText('bu bir orospu çocuğu şarkısı').isProfane).toBe(true);
      expect(checkProfanityText('siktir git buradan').isProfane).toBe(true);
      expect(checkProfanityText('ananı sikeyim').isProfane).toBe(true);
      expect(checkProfanityText('böyle işin amk').isProfane).toBe(true);
      expect(checkProfanityText('tam bir piçsin').isProfane).toBe(true);
      expect(checkProfanityText('sen bir yavşak ve gavat').isProfane).toBe(true);
      expect(checkProfanityText('yarrak kafalı').isProfane).toBe(true);
      expect(checkProfanityText('taşak geçme').isProfane).toBe(true);
    });

    it('detects English profanity', () => {
      expect(checkProfanityText('what the fuck is this').isProfane).toBe(true);
      expect(checkProfanityText('holy shit').isProfane).toBe(true);
      expect(checkProfanityText('you bitch').isProfane).toBe(true);
      expect(checkProfanityText('motherfucker rap').isProfane).toBe(true);
      expect(checkProfanityText('what an asshole').isProfane).toBe(true);
    });

    it('does NOT trigger false positives for common clean words', () => {
      expect(checkProfanityText('sık sık görüşürüz').isProfane).toBe(false);
      expect(checkProfanityText('bisiklet sürdüm').isProfane).toBe(false);
      expect(checkProfanityText('klasik müzik dinliyorum').isProfane).toBe(false);
      expect(checkProfanityText('piknik alanı çok güzel').isProfane).toBe(false);
      expect(checkProfanityText('sıcak bir yaz günü').isProfane).toBe(false);
      expect(checkProfanityText('analiz sonuçları').isProfane).toBe(false);
      expect(checkProfanityText('passionate love song').isProfane).toBe(false);
      expect(checkProfanityText('amsterdam sokakları').isProfane).toBe(false);
    });

    it('detects custom blacklist words', () => {
      const customList = ['yasaklikelime', 'ozelargo'];
      expect(checkProfanityText('bu metin yasaklikelime içeriyor', customList).isProfane).toBe(true);
      expect(checkProfanityText('burada ozelargo var', customList).isProfane).toBe(true);
      expect(checkProfanityText('burada temiz bir metin var', customList).isProfane).toBe(false);
    });
  });
});
