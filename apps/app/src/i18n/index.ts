import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ja } from './locales/ja';
import { zhCN } from './locales/zh-CN';

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];

const savedLocale =
  typeof localStorage !== 'undefined' ? localStorage.getItem('mogiri_locale') : null;

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: savedLocale ?? 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
});

export function setAppLocale(locale: SupportedLocale): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mogiri_locale', locale);
  }
  void i18n.changeLanguage(locale);
}

export { i18n };
