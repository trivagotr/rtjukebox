import {describe, expect, it} from '@jest/globals';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const mobilePath = (relativePath: string) =>
  path.join(__dirname, '..', relativePath);

const readSource = (relativePath: string) =>
  fs.readFileSync(mobilePath(relativePath), 'utf8');

const hash = (relativePath: string) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(mobilePath(relativePath)))
    .digest('hex')
    .toUpperCase();

describe('dual-logo splash source contracts', () => {
  it('preserves the supplied brand assets byte-for-byte in both tracked locations', () => {
    expect(hash('src/assets/images/logo-radiotedu-splash.png')).toBe(
      '7B621E98364564A8DF162F0D49BED25EC66918A23629F74A96E1E991B599DF26',
    );
    expect(hash('src/assets/images/logo-rtai-splash.png')).toBe(
      '194C1771AD3905E8DC3D4601D0F6701341BDE7BE9D9A43BCB8C44DA4D246E03F',
    );
    expect(hash('logos/logo-radiotedu-splash.png')).toBe(
      hash('src/assets/images/logo-radiotedu-splash.png'),
    );
    expect(hash('logos/logo-rtai-splash.png')).toBe(
      hash('src/assets/images/logo-rtai-splash.png'),
    );
  });

  it('renders both brand marks accessibly on the warm splash surface', () => {
    const splashSource = readSource('src/screens/SplashScreen.tsx');

    expect(splashSource).toContain(
      "require('../assets/images/logo-radiotedu-splash.png')",
    );
    expect(splashSource).toContain(
      "require('../assets/images/logo-rtai-splash.png')",
    );
    expect(splashSource).toContain('accessibilityLabel="RadioTEDU"');
    expect(splashSource).toContain('accessibilityLabel="RTAI"');
    expect(splashSource).toContain('resizeMode="contain"');
    expect(splashSource).toContain("backgroundColor: '#F7F3EA'");
  });

  it('keeps the splash visible within the declared timing bounds', () => {
    const splashSource = readSource('src/screens/SplashScreen.tsx');
    const appSource = readSource('App.tsx');

    expect(splashSource).toContain(
      'export const SPLASH_MIN_VISIBLE_MS = 1500',
    );
    expect(splashSource).toContain(
      'export const SPLASH_SAFETY_TIMEOUT_MS = 5000',
    );
    expect(appSource).toContain('React.useState(true)');
    expect(appSource).toContain('ready={i18nReady && ready}');
  });

  it('uses a deterministic dark Android startup handoff', () => {
    const stylesSource = readSource(
      'android/app/src/main/res/values/styles.xml',
    );

    expect(stylesSource).toContain(
      '<item name="android:windowDisablePreview">true</item>',
    );
    expect(stylesSource).toContain(
      '<item name="android:windowBackground">@color/startup_background</item>',
    );

    const colorsSource = readSource(
      'android/app/src/main/res/values/colors.xml',
    );
    expect(colorsSource).toContain(
      '<color name="startup_background">#070707</color>',
    );
  });

  it('removes the generated iOS launch-screen branding and system color', () => {
    const storyboardSource = readSource(
      'ios/RadioTEDUMobile/LaunchScreen.storyboard',
    );

    expect(storyboardSource).not.toContain('Powered by React Native');
    expect(storyboardSource).not.toContain('systemBackgroundColor');
  });
});
