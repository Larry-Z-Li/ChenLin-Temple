import { saveSettings, settings } from '../config/settings';
import { LOCALES, getLocale, setLocale, t, type I18nKey } from '../i18n';
import type { NetStatus } from '../net/netClient';
import { h } from './dom';

export type Focus = 'none' | 'silence' | 'beads' | 'sutra';

export type SeatAction = 'silence' | 'beads' | 'sutra' | 'stand';

export interface HudCallbacks {
  onMusic(on: boolean): void;
  onSeatAction(action: SeatAction): void;
  onChants(): void;
  onMap(): void;
}

export class Hud {
  readonly root: HTMLElement;
  private status: HTMLElement;
  private prompt: HTMLElement;
  private info: HTMLElement;
  private toasts: HTMLElement;
  private seatBar: HTMLElement;
  private seatBtns: Record<string, HTMLButtonElement> = {};
  private musicBtn: HTMLButtonElement;
  private help: HTMLElement;
  private lastStatus: { s: NetStatus; n: number } = { s: 'connecting', n: 0 };

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    this.status = h('div', { class: 'status' });
    this.musicBtn = h('button', { class: 'icon-btn', i18nTitle: 'hud.music', onclick: () => this.toggleMusic() });
    const lang = h('select', { class: 'lang-select', i18nTitle: 'hud.language' }, ...Object.entries(LOCALES).map(([code, l]) => h('option', { value: code, selected: code === getLocale() }, l.label)));
    lang.addEventListener('change', () => {
      settings.lang = lang.value;
      settings.langChosen = true;
      saveSettings();
      void setLocale(lang.value);
    });
    if (Object.keys(LOCALES).length < 2) lang.disabled = true;

    this.help = h(
      'div',
      { class: 'panel help hidden' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'help.title' }), h('button', { class: 'icon-btn', i18nTitle: 'common.close', onclick: () => this.toggleHelp(false) }, '✕')),
      h('ul', { class: 'help-list' }, ...(['help.move', 'help.run', 'help.look', 'help.interact', 'help.chants', 'help.map', 'help.leave', 'help.seated', 'help.beads'] as I18nKey[]).map((k) => h('li', { i18n: k }))),
    );

    const top = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'title', i18n: 'app.title' }), this.status),
      h('div', { class: 'row' }, h('button', { class: 'icon-btn', i18n: 'hud.chants', onclick: () => cb.onChants() }), this.musicBtn, h('button', { class: 'icon-btn', i18nTitle: 'hud.map', onclick: () => cb.onMap() }, '◫'), h('button', { class: 'icon-btn', i18nTitle: 'hud.help', onclick: () => this.toggleHelp() }, '?'), lang),
    );

    this.info = h('div', { class: 'info hidden' });
    this.prompt = h('div', { class: 'prompt hidden' });
    this.toasts = h('div', { class: 'toasts' });

    const mk = (action: SeatAction, key: string, label: I18nKey) => {
      const b = h('button', { class: 'seat-btn', onclick: () => cb.onSeatAction(action) }, h('kbd', {}, key), h('span', { i18n: label }));
      this.seatBtns[action] = b;
      return b;
    };
    this.seatBar = h(
      'nav',
      { class: 'seatbar hidden' },
      mk('silence', '1', 'seat.silence'),
      mk('beads', '2', 'seat.beads'),
      mk('sutra', '3', 'seat.sutras'),
      mk('stand', 'Esc', 'seat.stand'),
    );

    this.root = h('div', { class: 'hud' }, top, this.info, this.prompt, this.seatBar, this.toasts, this.help);
    parent.append(this.root);
    this.renderMusic();
    this.setStatus('connecting', 0);
  }

  private toggleMusic() {
    this.cb.onMusic(!settings.musicOn);
    this.renderMusic();
  }

  renderMusic(available = true) {
    this.musicBtn.textContent = settings.musicOn ? '♪' : '♪̸';
    this.musicBtn.classList.toggle('off', !settings.musicOn);
    this.musicBtn.title = available ? t('hud.music') : t('hud.noAmbient');
  }

  toggleHelp(v?: boolean) {
    this.help.classList.toggle('hidden', v === undefined ? undefined : !v);
  }

  get helpOpen() {
    return !this.help.classList.contains('hidden');
  }

  setStatus(s: NetStatus, n: number) {
    this.lastStatus = { s, n };
    this.status.textContent = s === 'online' ? t('hud.online', { n }) : s === 'offline' ? t('hud.offline') : t('hud.connecting');
    this.status.dataset.state = s;
  }

  refreshText() {
    this.setStatus(this.lastStatus.s, this.lastStatus.n);
    this.renderMusic();
  }

  setPrompt(text: string | null, busy = false) {
    if (!text) return this.prompt.classList.add('hidden');
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('busy', busy);
    this.prompt.replaceChildren(...(busy ? [] : [h('kbd', {}, 'E')]), h('span', {}, text));
  }

  setInfo(text: string | null) {
    this.info.classList.toggle('hidden', !text);
    if (text) this.info.textContent = text;
  }

  /** Show the seat bar for a cushion (all activities) or bench (sutras only); null hides it. */
  showSeatBar(kind: 'cushion' | 'bench' | null) {
    this.seatBar.classList.toggle('hidden', !kind);
    this.seatBtns.silence.classList.toggle('hidden', kind === 'bench');
    this.seatBtns.beads.classList.toggle('hidden', kind === 'bench');
  }

  setSeatState(focus: Focus) {
    for (const [k, b] of Object.entries(this.seatBtns)) b.classList.toggle('active', k === focus);
  }

  /** Dim chrome while sitting in silence. */
  setQuiet(v: boolean) {
    this.root.classList.toggle('quiet', v);
  }

  toast(msg: string, ms = 2800) {
    const el = h('div', { class: 'toast' }, msg);
    this.toasts.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }
}
