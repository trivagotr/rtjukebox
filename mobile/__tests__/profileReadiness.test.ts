import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Profile Android readiness panel', () => {
  it('shows Android 16 QPR, Android 17, Google Maps, XR, adaptive layout, and audio quality statuses', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/screens/ProfileScreen.tsx'), 'utf8');

    expect(source).toContain("'Android 16 QPR': androidReadiness.android16Qpr");
    expect(source).toContain("'Android 17': androidReadiness.android17");
    expect(source).toContain("'Google Maps': androidReadiness.googleMapsMediaControls");
    expect(source).toContain('XR: androidReadiness.xrSafe');
    expect(source).toContain('Adaptive: androidReadiness.adaptiveLayout');
    expect(source).toContain('Audio: androidReadiness.audioQuality');
  });
});
