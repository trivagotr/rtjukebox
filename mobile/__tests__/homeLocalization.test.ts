import fs from 'fs';
import path from 'path';

describe('Home screen localization', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');
  const trTranslations = fs.readFileSync(path.join(__dirname, '../src/i18n/locales/tr.json'), 'utf8');

  it('uses the selected language instead of a hard-coded XP heading', () => {
    expect(homeSource).not.toContain('RadioTEDU XP Merkezi');
    expect(homeSource).toContain("t('home.heroTitle')");
  });

  it('keeps the Turkish spendable-points label on one line', () => {
    expect(trTranslations).toContain('"spendable": "Harcanabilir"');
    expect(homeSource).toContain("label={t('home.points.spendable')}");
    expect(homeSource).toContain('numberOfLines={1}');
    expect(homeSource).toContain('adjustsFontSizeToFit');
  });
});
