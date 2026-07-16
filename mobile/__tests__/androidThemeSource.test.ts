import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android app theme startup window', () => {
  it('disables the platform preview window so Android splash cannot black-screen over React Native', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../android/app/src/main/res/values/styles.xml'),
      'utf8',
    );

    expect(source).toContain('<item name="android:windowDisablePreview">true</item>');
    expect(source).toContain('<item name="android:windowIsTranslucent">false</item>');
    expect(source).toContain('<item name="android:windowIsFloating">false</item>');
  });

  it('uses the shared dark startup background for the native handoff', () => {
    const stylesSource = fs.readFileSync(
      path.join(__dirname, '../android/app/src/main/res/values/styles.xml'),
      'utf8',
    );
    const colorsPath = path.join(
      __dirname,
      '../android/app/src/main/res/values/colors.xml',
    );
    const colorsSource = fs.existsSync(colorsPath)
      ? fs.readFileSync(colorsPath, 'utf8')
      : '';

    expect(stylesSource).toContain(
      '<item name="android:windowBackground">@color/startup_background</item>',
    );
    expect(colorsSource).toContain(
      '<color name="startup_background">#070707</color>',
    );
  });
});
