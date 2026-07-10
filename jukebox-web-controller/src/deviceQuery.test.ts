import { describe, expect, it } from 'vitest';
import { parseDeviceCodeFromSearch } from './deviceQuery';

describe('device query parsing', () => {
  it('reads and trims the canonical device parameter', () => {
    expect(parseDeviceCodeFromSearch('?device=%20KIOSK-42%20')).toBe('KIOSK-42');
  });

  it('accepts the legacy code parameter', () => {
    expect(parseDeviceCodeFromSearch('?code=LEGACY-7')).toBe('LEGACY-7');
  });

  it('prefers device when both parameters are present', () => {
    expect(parseDeviceCodeFromSearch('?code=LEGACY-7&device=KIOSK-42')).toBe('KIOSK-42');
  });

  it('treats a present blank device parameter as authoritative', () => {
    expect(parseDeviceCodeFromSearch('?device=%20%20&code=LEGACY-7')).toBeNull();
  });

  it.each(['', '?device=', '?code=%20%20'])('returns null for missing or blank values in %s', (search) => {
    expect(parseDeviceCodeFromSearch(search)).toBeNull();
  });
});
