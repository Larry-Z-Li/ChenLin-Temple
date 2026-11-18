import type { I18nKey } from '../i18n';
import { t } from '../i18n';

type Child = Node | string | null | undefined | false;
interface Props {
  class?: string;
  /** i18n key for textContent (auto-updates on locale change via applyI18n). */
  i18n?: I18nKey;
  /** i18n key for title + aria-label. */
  i18nTitle?: I18nKey;
  onclick?: (e: MouseEvent) => void;
  [attr: string]: unknown;
}

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'i18n') {
      el.dataset.i18n = String(v);
      el.textContent = t(v as I18nKey);
    } else if (k === 'i18nTitle') {
      el.dataset.i18nTitle = String(v);
      el.title = t(v as I18nKey);
      el.setAttribute('aria-label', el.title);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
