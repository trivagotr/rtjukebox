import {describe, expect, it} from '@jest/globals';

import {getQrRewardCodeFromRouteParams} from '../src/services/qrLinking';

describe('qr deep linking', () => {
  it('extracts and decodes QR reward codes from route params', () => {
    expect(getQrRewardCodeFromRouteParams({qrCode: 'TEDU-QR-01'})).toBe('TEDU-QR-01');
    expect(getQrRewardCodeFromRouteParams({qrCode: 'TEDU%20QR%2002'})).toBe('TEDU QR 02');
  });

  it('ignores empty or unsupported route params', () => {
    expect(getQrRewardCodeFromRouteParams({qrCode: '   '})).toBeNull();
    expect(getQrRewardCodeFromRouteParams({qrCode: ['TEDU-QR-01']})).toBeNull();
    expect(getQrRewardCodeFromRouteParams(null)).toBeNull();
  });
});
