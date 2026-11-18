/**
 * Minimal i18n layer. Traditional Chinese is the default; English is the fallback for missing keys.
 * To add a language:
 *   1. copy locales/zh-Hant.ts → locales/<code>.ts and translate the values
 *   2. add the code to LOCALES below
 * Every UI string goes through t(); DOM nodes with data-i18n="key" re-render on locale change.
 * Content manifests (sutras, chants) use { "en": "...", "zh": "..." } objects → localized().
 */
import en, { type I18nKey } from './locales/en';

export type { I18nKey };
type Dict = Partial<Record<I18nKey, string>>;

export const DEFAULT_LOCALE = 'zh-Hant';

export const LOCALES: Record<string, { label: string; load: () => Promise<Dict> }> = {
  'zh-Hant': { label: '繁體中文', load: () => import('./locales/zh-Hant').then((m) => m.default) },
  en: { label: 'English', load: async () => en },
};

let current = 'en';
let dict: Dict = en;
const listeners = new Set<() => void>();

export function t(key: I18nKey, params?: Record<string, string | number>): string {
  let s = dict[key] ?? en[key] ?? key;
  if (params) for (const k in params) s = s.replaceAll(`{${k}}`, String(params[k]));
  return s;
}

export function getLocale() {
  return current;
}

export async function setLocale(code: string) {
  const resolved = LOCALES[code] ? code : DEFAULT_LOCALE;
  dict = await LOCALES[resolved].load();
  current = resolved;
  document.documentElement.lang = current;
  applyI18n(document.body);
  listeners.forEach((fn) => fn());
}

export function onLocaleChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Horizontal temple inscriptions (匾額) read right-to-left in traditional Chinese and Japanese,
 * so plaques reverse the character order for those languages.
 */
export function inscription(s: string): string {
  return /^(zh|ja)/.test(current) ? Array.from(s).reverse().join('') : s;
}

/** Text for a manifest field that may be a plain string or a per-language map. */
export function localized(v: string | Record<string, string> | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v[current] ?? v.en ?? Object.values(v)[0] ?? '';
}

/** Fill every [data-i18n] / [data-i18n-title] element under root. */
export function applyI18n(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle as I18nKey);
    el.setAttribute('aria-label', el.title);
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as I18nKey);
  });
}
