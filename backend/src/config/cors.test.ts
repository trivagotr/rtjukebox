import { describe, expect, it } from 'vitest';
import { resolveCorsOrigins } from './cors';

describe('CORS config', () => {
  it('allows wildcard origins outside production when unset', () => {
    expect(resolveCorsOrigins('', { isProduction: false })).toBe('*');
  });

  it('requires explicit origins in production', () => {
    expect(() => resolveCorsOrigins('', { isProduction: true })).toThrow(
      'CORS_ORIGINS is required in production',
    );
  });

  it('normalizes comma-separated origin allowlists', () => {
    expect(
      resolveCorsOrigins(' https://controller.example.com, capacitor://localhost ,, https://kiosk.example.com ', {
        isProduction: true,
      }),
    ).toEqual([
      'https://controller.example.com',
      'capacitor://localhost',
      'https://kiosk.example.com',
    ]);
  });
});
