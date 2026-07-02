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
});
