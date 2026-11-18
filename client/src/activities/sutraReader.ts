import { assetUrl, loadSutras, type SutraEntry } from '../content/manifest';
import { getLocale, localized, t } from '../i18n';
import { escapeHtml, h } from '../ui/dom';

/** Minimal Markdown: #/## headings, blank-line paragraphs, single newlines kept (verse). */
function renderText(src: string, isMarkdown: boolean) {
  return src
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      if (isMarkdown) {
        const m = /^(#{1,3})\s+(.*)$/.exec(b);
        if (m) return `<h${m[1].length + 1}>${escapeHtml(m[2])}</h${m[1].length + 1}>`;
      }
      let html = escapeHtml(b).replace(/\n/g, '<br>');
      if (isMarkdown) html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
      return `<p>${html}</p>`;
    })
    .join('');
}

/** Pick the best entry per group for the current language (fallback: English, then any). */
function forLocale(items: SutraEntry[]) {
  const groups = new Map<string, SutraEntry[]>();
  for (const it of items) {
    const g = it.group ?? it.id;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  }
  const lang = getLocale();
  return [...groups.values()].map((list) => list.find((e) => e.lang === lang) ?? list.find((e) => !e.lang || e.lang === 'en') ?? list[0]);
}

export class SutraReader {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private header: HTMLElement;
  private fontSize = 19;
  private open = false;

  constructor(parent: HTMLElement) {
    this.header = h('div', { class: 'panel-title' });
    this.body = h('div', { class: 'sutra-body' });
    const smaller = h('button', { class: 'icon-btn', i18nTitle: 'sutra.smaller', onclick: () => this.zoom(-2) }, 'A−');
    const larger = h('button', { class: 'icon-btn', i18nTitle: 'sutra.larger', onclick: () => this.zoom(2) }, 'A+');
    this.el = h('aside', { class: 'panel sutra-panel hidden' }, h('div', { class: 'panel-head' }, this.header, h('div', { class: 'row' }, smaller, larger)), this.body);
    parent.append(this.el);
  }

  get isOpen() {
    return this.open;
  }

  async show(v: boolean) {
    this.open = v;
    this.el.classList.toggle('hidden', !v);
    document.body.classList.toggle('reading', v);
    if (v) await this.showList();
  }

  private zoom(d: number) {
    this.fontSize = Math.max(14, Math.min(30, this.fontSize + d));
    this.body.style.fontSize = `${this.fontSize}px`;
  }

  private async showList() {
    this.header.textContent = t('sutra.title');
    this.body.replaceChildren(h('p', { class: 'muted' }, t('sutra.loading')));
    const items = forLocale(await loadSutras());
    if (!items.length) {
      this.body.replaceChildren(h('p', { class: 'muted' }, t('sutra.empty')));
      return;
    }
    this.body.replaceChildren(h('ul', { class: 'list' }, ...items.map((it) => h('li', {}, h('button', { class: 'list-btn', onclick: () => this.read(it) }, localized(it.title))))));
  }

  private async read(entry: SutraEntry) {
    this.header.replaceChildren(h('button', { class: 'link-btn', onclick: () => this.showList() }, `← ${t('sutra.back')}`));
    this.body.replaceChildren(h('p', { class: 'muted' }, t('sutra.loading')));
    try {
      const res = await fetch(assetUrl('sutras', entry.file));
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const article = h('article', { class: 'sutra-text', lang: entry.lang ?? 'en' });
      article.innerHTML = `<h1>${escapeHtml(localized(entry.title))}</h1>` + renderText(text, entry.file.endsWith('.md'));
      this.body.replaceChildren(article);
      this.body.scrollTop = 0;
      this.body.style.fontSize = `${this.fontSize}px`;
    } catch {
      this.body.replaceChildren(h('p', { class: 'muted' }, t('sutra.error')));
    }
  }

  /** Arrow/Page keys scroll the text while open. */
  handleKey(e: KeyboardEvent) {
    if (!this.open) return false;
    const page = this.body.clientHeight * 0.85;
    const map: Record<string, number> = { ArrowDown: 60, ArrowUp: -60, PageDown: page, PageUp: -page, Space: page };
    if (e.code in map) {
      this.body.scrollBy({ top: map[e.code], behavior: 'smooth' });
      return true;
    }
    return false;
  }
}
