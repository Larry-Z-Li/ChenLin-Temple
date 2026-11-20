import type { Fruit } from '../../../shared/protocol';
import { graphicsLevel, saveSettings, settings } from '../config/settings';
import { FRUIT_TYPES } from '../config/theme';
import { LOCALES, getLocale, setLocale, t, type I18nKey } from '../i18n';
import type { NetStatus } from '../net/netClient';
import { refreshSky } from '../world/sky';
import { h } from './dom';

export type Focus = 'none' | 'beads' | 'sutra' | 'prostrate';
export type SeatAction = 'beads' | 'sutra' | 'prostrate' | 'stand';

export interface HudCallbacks {
  onMusic(on: boolean): void;
  onSeatAction(action: SeatAction): void;
  /** Beads or a sutra while standing. */
  onStandAction(action: 'beads' | 'sutra'): void;
  onChants(): void;
  onFastTravel(): void;
  onMap(): void;
  /** Tapping the interaction prompt = pressing E (touch-friendly; tap repeatedly for wheels). */
  onPrompt(): void;
  onBow(): void;
  onBeadStep(dir: 1 | -1): void;
  onGraphics(): void;
}

export class Hud {
  readonly root: HTMLElement;
  private status: HTMLElement;
  private prompt: HTMLElement;
  private info: HTMLElement;
  private toasts: HTMLElement;
  private seatBar: HTMLElement;
  private seatBtns: Record<string, HTMLButtonElement> = {};
  private standBtns: Record<string, HTMLButtonElement> = {};
  private musicBtn: HTMLButtonElement;
  private help: HTMLElement;
  private settingsPanel: HTMLElement;
  private gfxBtns: Record<'high' | 'low', HTMLButtonElement>;
  private todBtns: Record<'temple' | 'day', HTMLButtonElement>;
  private inventory: HTMLElement;
  private beadBtns: HTMLElement;
  private lastStatus: { s: NetStatus; n: number } = { s: 'connecting', n: 0 };

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    this.status = h('div', { class: 'status' });
    this.musicBtn = h('button', { class: 'icon-btn', i18nTitle: 'hud.music', onclick: () => this.toggleMusic() });

    const close = (fn: () => void) => h('button', { class: 'icon-btn', i18nTitle: 'common.close', onclick: fn }, '✕');
    this.help = h(
      'div',
      { class: 'panel help hidden' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'help.title' }), close(() => this.toggleHelp(false))),
      h('ul', { class: 'help-list' }, ...(['help.move', 'help.run', 'help.look', 'help.interact', 'help.chants', 'help.bow', 'help.map', 'help.leave', 'help.seated', 'help.beads', 'help.touch'] as I18nKey[]).map((k) => h('li', { i18n: k }))),
    );

    // Settings: graphics, volumes, language.
    const lang = h('select', { class: 'lang-select', i18nTitle: 'hud.language' }, ...Object.entries(LOCALES).map(([code, l]) => h('option', { value: code, selected: code === getLocale() }, l.label)));
    lang.addEventListener('change', () => {
      settings.lang = lang.value;
      settings.langChosen = true;
      saveSettings();
      void setLocale(lang.value);
    });
    const slider = (key: 'musicVolume' | 'sfxVolume') => {
      const el = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(settings[key]) }) as HTMLInputElement;
      el.addEventListener('input', () => {
        settings[key] = Number(el.value);
        saveSettings();
      });
      return el;
    };
    const gfx = (level: 'high' | 'low', key: I18nKey) =>
      h('button', { class: 'seg-btn', i18n: key, onclick: () => {
        settings.graphics = level;
        saveSettings();
        this.renderGraphics();
        cb.onGraphics();
      } });
    this.gfxBtns = { high: gfx('high', 'settings.high'), low: gfx('low', 'settings.low') };
    const tod = (v: 'temple' | 'day', key: I18nKey) =>
      h('button', { class: 'seg-btn', i18n: key, onclick: () => {
        settings.timeOfDay = v;
        saveSettings();
        this.renderTimeOfDay();
        refreshSky();
      } });
    this.todBtns = { temple: tod('temple', 'settings.templeTime'), day: tod('day', 'settings.alwaysDay') };
    const row = (label: I18nKey, ...ctl: HTMLElement[]) => h('label', { class: 'setting-row' }, h('span', { i18n: label }), ...ctl);
    this.settingsPanel = h(
      'div',
      { class: 'panel settings hidden' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'hud.settings' }), close(() => this.toggleSettings(false))),
      h(
        'div',
        { class: 'settings-body' },
        row('settings.graphics', h('div', { class: 'seg' }, this.gfxBtns.high, this.gfxBtns.low)),
        row('settings.timeOfDay', h('div', { class: 'seg' }, this.todBtns.temple, this.todBtns.day)),
        row('settings.ambientVolume', slider('musicVolume')),
        row('settings.effectsVolume', slider('sfxVolume')),
        row('hud.language', lang),
      ),
    );

    const top = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'title', i18n: 'app.title' }), this.status),
      h(
        'div',
        { class: 'row' },
        this.musicBtn,
        h('button', { class: 'icon-btn', i18nTitle: 'hud.map', onclick: () => cb.onMap() }, '◫'),
        h('button', { class: 'icon-btn', i18nTitle: 'hud.settings', onclick: () => this.toggleSettings() }, '⚙'),
        h('button', { class: 'icon-btn', i18nTitle: 'hud.help', onclick: () => this.toggleHelp() }, '?'),
      ),
    );

    this.info = h('div', { class: 'info hidden' });
    this.prompt = h('button', { class: 'prompt hidden', onclick: () => cb.onPrompt() });
    this.toasts = h('div', { class: 'toasts' });

    const mk = (action: SeatAction, key: string, label: I18nKey) => {
      const b = h('button', { class: 'seat-btn', onclick: () => cb.onSeatAction(action) }, h('kbd', {}, key), h('span', { i18n: label }));
      this.seatBtns[action] = b;
      return b;
    };
    // Seated: prostrations, beads, chants, sutras, stand up.
    this.seatBar = h(
      'nav',
      { class: 'seatbar hidden' },
      mk('prostrate', '1', 'seat.prostrate'),
      mk('beads', '2', 'seat.beads'),
      h('button', { class: 'seat-btn', onclick: () => cb.onChants() }, h('kbd', {}, 'C'), h('span', { i18n: 'hud.chants' })),
      mk('sutra', '3', 'seat.sutras'),
      mk('stand', 'Esc', 'seat.stand'),
    );
    this.beadBtns = h(
      'div',
      { class: 'bead-btns hidden' },
      h('button', { class: 'icon-btn big', i18nTitle: 'beads.prev', onclick: () => cb.onBeadStep(-1) }, '◀'),
      h('button', { class: 'icon-btn big', i18nTitle: 'beads.next', onclick: () => cb.onBeadStep(1) }, '▶'),
    );
    this.inventory = h('div', { class: 'inventory hidden' });
    // Standing: bow, beads, chants, sutras, fast travel.
    this.standBtns.beads = h('button', { class: 'icon-btn', i18n: 'seat.beads', onclick: () => cb.onStandAction('beads') }) as HTMLButtonElement;
    this.standBtns.sutra = h('button', { class: 'icon-btn', i18n: 'seat.sutras', onclick: () => cb.onStandAction('sutra') }) as HTMLButtonElement;
    const quick = h(
      'div',
      { class: 'quick-actions' },
      h('button', { class: 'icon-btn', i18n: 'bow.button', onclick: () => cb.onBow() }),
      this.standBtns.beads,
      h('button', { class: 'icon-btn', i18n: 'hud.chants', onclick: () => cb.onChants() }),
      this.standBtns.sutra,
      h('button', { class: 'icon-btn', i18n: 'hud.fastTravel', onclick: () => cb.onFastTravel() }),
    );

    this.root = h('div', { class: 'hud' }, top, this.info, this.prompt, this.seatBar, this.beadBtns, this.inventory, quick, this.toasts, this.help, this.settingsPanel);
    parent.append(this.root);
    this.renderMusic();
    this.renderGraphics();
    this.renderTimeOfDay();
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

  private renderGraphics() {
    const level = graphicsLevel();
    this.gfxBtns.high.classList.toggle('active', level === 'high');
    this.gfxBtns.low.classList.toggle('active', level === 'low');
  }

  private renderTimeOfDay() {
    this.todBtns.temple.classList.toggle('active', settings.timeOfDay === 'temple');
    this.todBtns.day.classList.toggle('active', settings.timeOfDay === 'day');
  }

  toggleHelp(v?: boolean) {
    this.help.classList.toggle('hidden', v === undefined ? undefined : !v);
    if (this.helpOpen) this.toggleSettings(false);
  }

  toggleSettings(v?: boolean) {
    this.settingsPanel.classList.toggle('hidden', v === undefined ? undefined : !v);
    if (!this.settingsPanel.classList.contains('hidden')) this.help.classList.add('hidden');
  }

  get helpOpen() {
    return !this.help.classList.contains('hidden');
  }

  get settingsOpen() {
    return !this.settingsPanel.classList.contains('hidden');
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
    if (this.prompt.dataset.text === `${busy}|${text}`) return; // avoid rebuilding every frame (keeps taps reliable)
    this.prompt.dataset.text = `${busy}|${text}`;
    this.prompt.replaceChildren(...(busy ? [] : [h('kbd', {}, 'E')]), h('span', {}, text));
  }

  setInfo(text: string | null) {
    this.info.classList.toggle('hidden', !text);
    if (text) this.info.textContent = text;
  }

  /** Seat bar: cushions offer beads, sutras and prostrations; benches offer beads and sutras. null hides it. */
  showSeatBar(kind: 'cushion' | 'bench' | null) {
    this.seatBar.classList.toggle('hidden', !kind);
    this.seatBtns.prostrate.classList.toggle('hidden', kind === 'bench');
    if (!kind) this.showBeadButtons(false);
  }

  showBeadButtons(v: boolean) {
    this.beadBtns.classList.toggle('hidden', !v);
  }

  setSeatState(focus: Focus) {
    for (const [k, b] of Object.entries(this.seatBtns)) b.classList.toggle('active', k === focus);
    for (const [k, b] of Object.entries(this.standBtns)) b.classList.toggle('active', k === focus);
  }

  /** Fruit being carried, grouped by kind. */
  setInventory(fruits: Fruit[]) {
    this.inventory.classList.toggle('hidden', !fruits.length);
    const counts = new Map<Fruit, number>();
    for (const f of fruits) counts.set(f, (counts.get(f) ?? 0) + 1);
    this.inventory.replaceChildren(
      ...[...counts].map(([f, n]) =>
        h('span', { class: 'fruit-chip', title: t(FRUIT_TYPES[f].nameKey as I18nKey) }, h('span', { class: 'fruit-dot', style: `background:#${FRUIT_TYPES[f].color.toString(16).padStart(6, '0')}` }), `${t(FRUIT_TYPES[f].nameKey as I18nKey)} ×${n}`),
      ),
    );
  }

  toast(msg: string, ms = 2800) {
    const el = h('div', { class: 'toast' }, msg);
    this.toasts.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }
}
