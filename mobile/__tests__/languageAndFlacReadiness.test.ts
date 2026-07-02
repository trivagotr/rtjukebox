import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {RTL_LANGUAGES, SUPPORTED_LANGUAGES} from '../src/i18n';
import {RADIO_CHANNELS} from '../src/data/radioChannels';
import {shouldShowFlacMobileDataWarning} from '../src/services/networkQualityPolicy';

describe('language and FLAC readiness', () => {
  it('ships the supported six-language set with Arabic RTL support', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'tr', 'ru', 'ar', 'de', 'nl']);
    expect(RTL_LANGUAGES).toContain('ar');

    for (const lang of SUPPORTED_LANGUAGES) {
      expect(fs.existsSync(path.join(__dirname, `../src/i18n/locales/${lang}.json`))).toBe(true);
    }
  });

  it('warns before FLAC playback on mobile data while allowing wifi playback', () => {
    const spark = RADIO_CHANNELS.find(channel => channel.id === 'radiotedu-spark')!;

    expect(shouldShowFlacMobileDataWarning(spark, 'flac', 'mobile-data')).toBe(true);
    expect(shouldShowFlacMobileDataWarning(spark, 'flac', 'wifi')).toBe(false);
  });
});
