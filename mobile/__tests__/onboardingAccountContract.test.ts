import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

const readMobileFile = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('account onboarding contract', () => {
  it('sends birth year and the selected language with mobile registration', () => {
    const registerSource = readMobileFile('src/screens/auth/RegisterScreen.tsx');
    const authSource = readMobileFile('src/context/AuthContext.tsx');

    expect(registerSource).toContain('birthYear');
    expect(registerSource).toContain('preferredLanguage: i18n.language');
    expect(authSource).toContain('birth_year: onboarding.birthYear');
    expect(authSource).toContain('preferred_language: onboarding.preferredLanguage');
  });

  it('translates the Study tab in every shipped language', () => {
    const navigatorSource = readMobileFile('src/navigation/RootNavigator.tsx');
    expect(navigatorSource).toContain("t('tabs.study')");

    for (const language of ['en', 'tr', 'ru', 'ar', 'de', 'nl']) {
      const locale = JSON.parse(readMobileFile(`src/i18n/locales/${language}.json`));
      expect(typeof locale.tabs?.study).toBe('string');
      expect(locale.tabs.study.length).toBeGreaterThan(0);
    }
  });
});
