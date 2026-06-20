import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {I18nManager, NativeModules, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import tr from './locales/tr.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import de from './locales/de.json';
import nl from './locales/nl.json';

export const SUPPORTED_LANGUAGES = ['en', 'tr', 'ru', 'ar', 'de', 'nl'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Languages that render right-to-left.
export const RTL_LANGUAGES: AppLanguage[] = ['ar'];

const STORAGE_KEY = '@radiotedu/language';

const resources = {
  en: {translation: en},
  tr: {translation: tr},
  ru: {translation: ru},
  ar: {translation: ar},
  de: {translation: de},
  nl: {translation: nl},
};

function isSupported(code: string): code is AppLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

/** Best-effort device language from the OS, without a native i18n dependency. */
function getDeviceLanguage(): AppLanguage {
  let locale = 'en';
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      locale =
        settings?.AppleLocale || settings?.AppleLanguages?.[0] || 'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    }
  } catch {
    locale = 'en';
  }
  const code = String(locale).toLowerCase().split(/[-_]/)[0];
  return isSupported(code) ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // replaced by initI18n() at startup
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: {escapeValue: false},
  // RN's Hermes lacks full Intl.PluralRules; v3 JSON keeps plurals simple.
  compatibilityJSON: 'v3',
  returnNull: false,
});

function applyRTL(lang: AppLanguage) {
  const shouldRTL = RTL_LANGUAGES.includes(lang);
  I18nManager.allowRTL(shouldRTL);
  if (I18nManager.isRTL !== shouldRTL) {
    I18nManager.forceRTL(shouldRTL);
    // Note: the layout direction only fully applies after an app reload.
  }
}

/** Resolve the saved/device language and apply it. Call once at startup. */
export async function initI18n(): Promise<AppLanguage> {
  let lang: AppLanguage;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    lang = stored && isSupported(stored) ? stored : getDeviceLanguage();
  } catch {
    lang = getDeviceLanguage();
  }
  await i18n.changeLanguage(lang);
  applyRTL(lang);
  return lang;
}

/**
 * Change and persist the app language. Returns whether the RTL direction
 * changed (the caller should prompt the user to reopen the app if so).
 */
export async function setLanguage(lang: AppLanguage): Promise<boolean> {
  const wasRTL = I18nManager.isRTL;
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  applyRTL(lang);
  return wasRTL !== RTL_LANGUAGES.includes(lang);
}

export function getCurrentLanguage(): AppLanguage {
  const code = (i18n.language || 'en').split(/[-_]/)[0];
  return isSupported(code) ? code : 'en';
}

export default i18n;
