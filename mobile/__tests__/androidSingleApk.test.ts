import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android single APK car distribution', () => {
  const root = path.join(__dirname, '..');

  it('ships phone and car media support from one APK without a separate automotive flavor', () => {
    const buildGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(buildGradle).not.toContain('flavorDimensions');
    expect(buildGradle).not.toContain('productFlavors');
    expect(fs.existsSync(path.join(root, 'android/app/src/automotive/AndroidManifest.xml'))).toBe(false);
    expect(manifest).toContain('<uses-feature android:name="android.hardware.type.automotive" android:required="false" />');
    expect(manifest).toContain('android.media.browse.MediaBrowserService');
    expect(packageJson.scripts['android:auto']).toBe('react-native run-android --mode debug');
  });
});
