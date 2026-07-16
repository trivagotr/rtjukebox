import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android publishing configuration', () => {
  const mobileRoot = path.join(__dirname, '..');
  const androidRoot = path.join(mobileRoot, 'android');

  it('uses the API 35-compatible Android build toolchain', () => {
    const buildGradle = fs.readFileSync(
      path.join(androidRoot, 'build.gradle'),
      'utf8',
    );

    expect(buildGradle).toContain(
      'classpath("com.android.tools.build:gradle:8.6.1")',
    );
    expect(buildGradle).toContain('compileSdkVersion = 35');
    expect(buildGradle).toContain('targetSdkVersion = 35');
    expect(buildGradle).toContain('buildToolsVersion = "34.0.0"');

    const snapshotsRestriction = buildGradle.match(
      /repositories\.configureEach\s*\{ repository ->([\s\S]*?)\n    \}/,
    )?.[0];
    expect(snapshotsRestriction).toBeDefined();
    expect(snapshotsRestriction).toContain(
      'oss.sonatype.org/content/repositories/snapshots',
    );
    expect(snapshotsRestriction).toContain(
      'includeGroup("com.facebook.react")',
    );
  });

  it('allows MainActivity to adapt across orientation and large-screen changes', () => {
    const manifest = fs.readFileSync(
      path.join(androidRoot, 'app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    const mainActivity = manifest.match(
      /<activity\s+[^>]*android:name="\.MainActivity"[^>]*>/,
    )?.[0];

    expect(mainActivity).toBeDefined();
    expect(mainActivity).toContain('android:resizeableActivity="true"');
    expect(manifest).not.toContain('android:screenOrientation');
  });

  it('provides byte-identical night launcher overrides for every density', () => {
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      for (const fileName of ['ic_launcher.png', 'ic_launcher_round.png']) {
        const lightPath = path.join(
          androidRoot,
          `app/src/main/res/mipmap-${density}/${fileName}`,
        );
        const nightPath = path.join(
          androidRoot,
          `app/src/main/res/mipmap-night-${density}/${fileName}`,
        );

        expect(fs.existsSync(nightPath)).toBe(true);
        expect(fs.readFileSync(nightPath).equals(fs.readFileSync(lightPath))).toBe(
          true,
        );
      }
    }
  });
});
