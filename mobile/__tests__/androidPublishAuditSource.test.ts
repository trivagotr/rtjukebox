import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('android publish audit source', () => {
  const auditSource = () => fs.readFileSync(path.join(__dirname, '../scripts/android-publish-audit.js'), 'utf8');
  const modernReadiness = () => fs.readFileSync(path.join(__dirname, '../docs/ANDROID_MODERN_PUBLISH_READINESS.md'), 'utf8');
  const releaseChecklist = () => fs.readFileSync(path.join(__dirname, '../docs/RELEASE_CHECKLIST.md'), 'utf8');

  it('audits Android 16 QPR, Android 17, Google Maps media controls, and backend contract coverage', () => {
    const source = auditSource();

    expect(source).toContain('Android 16 QPR readiness is documented');
    expect(source).toContain('Android 17 large-screen readiness is documented');
    expect(source).toContain('Google Maps media controls readiness is documented');
    expect(source).toContain('Backend connectivity contract tests are present');
    expect(source).toContain('Single APK distribution has no separate automotive flavor');
    expect(source).toContain('Automotive hardware feature is optional in the single APK');
  });

  it('documents applicable beta/preview surfaces separately from not-applicable platform features', () => {
    expect(modernReadiness()).toContain('RadioTEDU supports all applicable Android beta/preview readiness surfaces');
    expect(modernReadiness()).toContain('SMS OTP protection: not applicable');
    expect(modernReadiness()).toContain('camera/video/pro codec beta features: not applicable');
    expect(releaseChecklist()).toContain('Android 16 QPR beta');
    expect(releaseChecklist()).toContain('Android 17 beta');
    expect(releaseChecklist()).toContain('Google Maps media controls');
    expect(releaseChecklist()).toContain('Single APK car distribution');
    expect(modernReadiness()).toContain('RadioTEDU does not ship a separate Automotive APK');
  });
});
