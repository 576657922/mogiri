import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ja } from './locales/ja';
import { zhCN } from './locales/zh-CN';

/** 语言列表：标签使用各语言的自称（endonym），不随界面语言翻译 */
export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '简体中文', short: '中' },
  { code: 'ja', label: '日本語', short: '日' },
  { code: 'en', label: 'English', short: 'EN' },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];

const isSupported = (v: string | null): v is SupportedLocale =>
  SUPPORTED_LOCALES.some((l) => l.code === v);

const savedLocale =
  typeof localStorage !== 'undefined' ? localStorage.getItem('mogiri_locale') : null;

/** 同步 <html lang>，让 CSS 的 :lang() 选择正确的中日文字体 */
function syncDocumentLang(locale: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: isSupported(savedLocale) ? savedLocale : 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
});

syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

export function setAppLocale(locale: SupportedLocale): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mogiri_locale', locale);
  }
  void i18n.changeLanguage(locale);
}

export { i18n };
