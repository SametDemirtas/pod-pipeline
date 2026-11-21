import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { UiLanguage } from '@pod/contracts/client';
import { de } from './locales/de.js';
import { en, type Translation } from './locales/en.js';
import { tr } from './locales/tr.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Translation };
  }
}

export const RESOURCES: Record<UiLanguage, { translation: Translation }> = {
  en: { translation: en },
  tr: { translation: tr },
  de: { translation: de },
};

/** Creates an isolated i18next instance; tests get their own, the app one. */
export async function createI18n(language: UiLanguage): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    resources: RESOURCES,
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return instance;
}
