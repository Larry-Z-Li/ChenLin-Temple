import type { Fruit } from '../../../shared/protocol';
import { graphicsLevel, isTouchDevice, saveSettings, settings } from '../config/settings';
import { FRUIT_TYPES } from '../config/theme';
import { LOCALES, getLocale, setLocale, t, type I18nKey } from '../i18n';
import type { NetStatus } from '../net/netClient';
import { refreshSky } from '../world/sky';
import { h } from './dom';
import { icon } from './icons';

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
  /** The great prayer wheel's "get off" button (Q on a keyboard). */
  onWheelOff(): void;
  onBow(): void;
  onBeadStep(dir: 1 | -1): void;
  onGraphics(): void;
}

export class Hud {
  readonly root: HTMLElement;
  private status: HTMLElement;
  private prompt: HTMLElement;
  private wheelOff: HTMLElement;
  private info: HTMLElement;
  private toasts: HTMLElement;
  private seatBar: HTMLElement;
  private seatBtns: Record<string, HTMLButtonElement> = {};
  private standBtns: Record<string, HTMLButtonElement> = {};
  private musicBtn: HTMLButtonElement;
  private help: HTMLElement;
  private settingsPanel: HTMLElement;
  private gfxBtns: Record<'high' | 'low', HTMLButtonElement>;
  private fpsBtns: Record<'on' | 'off', HTMLElement>;
  private fpsEl = h('div', { class: 'fps hidden' });
  private todBtns: Record<'temple' | 'day' | 'night', HTMLButtonElement>;
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
    const tod = (v: 'temple' | 'day' | 'night', key: I18nKey) =>
      h('button', { class: 'seg-btn', i18n: key, onclick: () => {
        settings.timeOfDay = v;
        saveSettings();
        this.renderTimeOfDay();
        refreshSky();
      } });
    this.todBtns = { temple: tod('temple', 'settings.templeTime'), day: tod('day', 'settings.alwaysDay'), night: tod('night', 'settings.alwaysNight') };
    const fps = (on: boolean, key: I18nKey) =>
      h('button', { class: 'seg-btn', i18n: key, onclick: () => {
        settings.showFps = on;
        saveSettings();
        this.renderFps();
      } });
    this.fpsBtns = { on: fps(true, 'settings.show'), off: fps(false, 'settings.hide') };
    const row = (label: I18nKey, ...ctl: HTMLElement[]) => h('label', { class: 'setting-row' }, h('span', { i18n: label }), ...ctl);
    this.settingsPanel = h(
      'div',
      { class: 'panel settings hidden' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'hud.settings' }), close(() => this.toggleSettings(false))),
      h(
        'div',
        { class: 'settings-body' },
        row('settings.graphics', h('div', { class: 'seg' }, this.gfxBtns.high, this.gfxBtns.low)),
        row('settings.timeOfDay', h('div', { class: 'seg' }, this.todBtns.temple, this.todBtns.day, this.todBtns.night)),
        row('settings.fps', h('div', { class: 'seg' }, this.fpsBtns.on, this.fpsBtns.off)),
        row('settings.ambientVolume', slider('musicVolume')),
        row('settings.effectsVolume', slider('sfxVolume')),
        row('hud.language', lang),
      ),
    );

    const top = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'title', i18n: 'app.title' }), this.status, this.fpsEl),
      h(
        'div',
        { class: 'row' },
        this.musicBtn,
        h('button', { class: 'icon-btn', i18nTitle: 'hud.settings', onclick: () => this.toggleSettings() }, icon('gear') as unknown as Node),
        h('button', { class: 'icon-btn', i18nTitle: 'hud.help', onclick: () => this.toggleHelp() }, icon('help') as unknown as Node),
      ),
    );

    this.info = h('div', { class: 'info hidden' });
    this.prompt = h('button', { class: 'prompt hidden', onclick: () => cb.onPrompt() });
    this.wheelOff = h('button', { class: 'prompt wheel-off hidden', onclick: () => cb.onWheelOff() }, h('kbd', {}, 'Q'), h('span', { i18n: 'prompt.gwOff' }));
    this.toasts = h('div', { class: 'toasts' });

    // a line icon over its label (by mouse or touch: no number keys)
    const mk = (action: SeatAction, label: I18nKey, ico: string = action) => {
      const b = h('button', { class: 'seat-btn', onclick: () => cb.onSeatAction(action) }, icon(ico) as unknown as Node, h('span', { i18n: label }));
      this.seatBtns[action] = b;
      return b;
    };
    // Seated: prostrations, beads, chants, sutras, stand up.
    this.seatBar = h(
      'nav',
      { class: 'seatbar hidden' },
      mk('prostrate', 'seat.prostrate'),
      mk('beads', 'seat.beads'),
      (this.chantBtns[0] = h('button', { class: 'seat-btn', onclick: () => cb.onChants() }, icon('chant') as unknown as Node, h('span', { i18n: 'hud.chants' })) as HTMLButtonElement),
      mk('sutra', 'seat.sutras'),
      mk('stand', 'seat.stand'),
    );
    this.beadBtns = h(
      'div',
      { class: 'bead-btns hidden' },
      h('button', { class: 'icon-btn big', i18nTitle: 'beads.prev', onclick: () => cb.onBeadStep(-1) }, '◀'),
      h('button', { class: 'icon-btn big', i18nTitle: 'beads.next', onclick: () => cb.onBeadStep(1) }, '▶'),
    );
    this.inventory = h('div', { class: 'inventory hidden' });
    // Standing: bow, beads, chants, sutras, fast travel.
    // each with a line icon over its label (the label a span of its own: a locale change rewrites only that)
    const act = (name: string, key: I18nKey, onclick: () => void) => h('button', { class: 'icon-btn', onclick }, icon(name) as unknown as Node, h('span', { i18n: key })) as HTMLButtonElement;
    this.standBtns.beads = act('beads', 'seat.beads', () => cb.onStandAction('beads'));
    this.standBtns.sutra = act('sutra', 'seat.sutras', () => cb.onStandAction('sutra'));
    const quick = h(
      'div',
      { class: 'quick-actions' },
      act('bow', 'bow.button', () => cb.onBow()),
      this.standBtns.beads,
      (this.chantBtns[1] = act('chant', 'hud.chants', () => cb.onChants())),
      this.standBtns.sutra,
      act('cloud', 'hud.fastTravel', () => cb.onFastTravel()),
    );

    // 功德: rank and merit. Folded to start with on a portrait phone; it stays in view (above them) while other menus are open.
    let meritOpen = !(isTouchDevice && matchMedia('(orientation: portrait)').matches);
    this.meritN = h('b', {}, '0');
    this.merit = h(
      'div',
      { class: `merit${meritOpen ? ' open' : ''}` },
      h('button', { class: 'merit-toggle', 'aria-expanded': String(meritOpen), onclick: () => {
        meritOpen = !meritOpen;
        this.merit.classList.toggle('open', meritOpen);
        this.merit.firstElementChild!.setAttribute('aria-expanded', String(meritOpen));
      } }, h('span', { i18n: 'merit.title' }), h('span', { class: 'merit-caret', 'aria-hidden': 'true' })),
      h('div', { class: 'merit-body' },
        h('div', { class: 'merit-row' }, h('span', { i18n: 'merit.rank' }), h('b', { i18n: 'merit.novice' })),
        h('div', { class: 'merit-row' }, h('span', { i18n: 'merit.merit' }), this.meritN),
      ),
    );

    this.root = h('div', { class: 'hud' }, top, this.info, this.prompt, this.wheelOff, this.seatBar, this.beadBtns, this.inventory, quick, this.toasts, this.help, this.settingsPanel);
    parent.append(this.root, this.merit); // the drawer outside the HUD layer, so it can sit over the menus' backdrops
    this.renderMusic();
    this.renderFps();
    this.renderGraphics();
    this.renderTimeOfDay();
    this.setStatus('connecting', 0);
  }

  private toggleMusic() {
    this.cb.onMusic(!settings.musicOn);
    this.renderMusic();
  }

  renderMusic(available = true) {
    this.musicBtn.replaceChildren(icon(settings.musicOn ? 'music' : 'musicOff'));
    this.musicBtn.classList.toggle('off', !settings.musicOn);
    this.musicBtn.title = available ? t('hud.music') : t('hud.noAmbient');
  }

  private renderFps() {
    this.fpsBtns.on.classList.toggle('active', settings.showFps);
    this.fpsBtns.off.classList.toggle('active', !settings.showFps);
    this.fpsEl.classList.toggle('hidden', !settings.showFps);
  }

  /** The frame-rate line (only shown when turned on). */
  /** The 梵唄 buttons (seated bar, standing row): lit while a chant is playing. */
  private chantBtns: HTMLButtonElement[] = [];
  setChantPlaying(on: boolean) {
    for (const b of this.chantBtns) b.classList.toggle('chant-on', on);
  }

  private merit!: HTMLElement;
  private meritN!: HTMLElement;
  /** The merit shown. */
  setMerit(n: number) {
    this.meritN.textContent = String(n);
  }

  /** "+n" pops up just beside the 功德 drawer, then slides into it and fades; the total there updates as it lands. */
  meritPop(n: number, total: number) {
    const r = this.merit.getBoundingClientRect();
    if (!r.width) return this.setMerit(total); // not on screen (the opening flight): just count it
    const open = this.merit.classList.contains('open');
    const edge = Math.max(0, r.right); // folded: only its tab shows at the screen's edge
    const n_ = this.meritN.getBoundingClientRect();
    const y = open ? n_.top + n_.height / 2 : r.top + 22;
    const pop = h('div', { class: 'merit-pop' }, `+${n}`);
    this.merit.after(pop);
    const x1 = open ? n_.left + n_.width / 2 : edge - 22, x0 = edge + 40 + pop.offsetWidth / 2; // a little clear of the drawer
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    const a = pop.animate(
      [
        { transform: at(x0 + 6, y - 6, 0.5), opacity: 0 },
        { transform: at(x0, y - 34, 1.15), opacity: 1, offset: 0.12 },
        { transform: at(x0, y - 44, 1), opacity: 1, offset: 0.72, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
        { transform: at(x1, y, 0.6), opacity: 0 },
      ],
      { duration: 2400, fill: 'forwards' },
    );
    a.onfinish = () => {
      pop.remove();
      this.setMerit(total);
      this.merit.classList.remove('bump');
      void this.merit.offsetWidth; // restart the glow
      this.merit.classList.add('bump');
    };
  }

  setFps(fps: number, draws: number) {
    if (settings.showFps) this.fpsEl.textContent = `${Math.round(fps)} fps · ${draws} draws`;
  }

  renderGraphics() {
    const level = graphicsLevel();
    this.gfxBtns.high.classList.toggle('active', level === 'high');
    this.gfxBtns.low.classList.toggle('active', level === 'low');
  }

  private renderTimeOfDay() {
    this.todBtns.temple.classList.toggle('active', settings.timeOfDay === 'temple');
    this.todBtns.day.classList.toggle('active', settings.timeOfDay === 'day');
    this.todBtns.night.classList.toggle('active', settings.timeOfDay === 'night');
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

  /** The great prayer wheel: a button to get off (or leave the queue), for phones. */
  setWheelOff(on: boolean) {
    this.wheelOff.classList.toggle('hidden', !on);
  }

  setInfo(text: string | null) {
    this.info.classList.toggle('hidden', !text);
    if (text) this.info.textContent = text;
  }

  /** Seat bar: cushions offer beads, sutras and prostrations; benches offer beads and sutras. null hides it. */
  showSeatBar(kind: 'cushion' | 'bench' | null) {
    this.seatBar.classList.toggle('hidden', !kind);
    document.body.classList.toggle('seated', !!kind); // phones: no joystick or map button over the bar
    this.seatBtns.prostrate.classList.toggle('hidden', kind === 'bench');
    if (!kind) this.showBeadButtons(false);
  }

  showBeadButtons(v: boolean) {
    this.beadBtns.classList.toggle('hidden', !v);
  }

  /** Light up the buttons for what's in hand (beads and a sutra can be on together). */
  setSeatState(active: Focus[]) {
    for (const [k, b] of Object.entries(this.seatBtns)) b.classList.toggle('active', active.includes(k as Focus));
    for (const [k, b] of Object.entries(this.standBtns)) b.classList.toggle('active', active.includes(k as Focus));
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
