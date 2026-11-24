import type { ChantPlayer } from '../audio/chantPlayer';
import { settings } from '../config/settings';
import { localized, t } from '../i18n';
import { h } from '../ui/dom';

/** Chant list + transport controls. Playback continues while the panel is hidden. */
export class ChantPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private playBtn: HTMLButtonElement;
  private loopBtn: HTMLButtonElement;
  private seekBar: HTMLInputElement;
  private timeEl: HTMLElement;
  private lengthEl: HTMLElement;
  private dragging = false;
  private open = false;

  constructor(parent: HTMLElement, private player: ChantPlayer) {
    this.list = h('ul', { class: 'list' });
    // say what they do: 「▶ 開始」/「❚❚ 停止」, 「↻ 循環」 (lit while on)
    this.playBtn = h('button', { class: 'icon-btn chant-main', onclick: () => player.toggle() }) as HTMLButtonElement;
    this.loopBtn = h('button', { class: 'icon-btn', i18nTitle: 'chant.loop', onclick: () => {
      player.loop = !player.loop;
      this.render();
    } }, `↻ ${t('chant.repeat')}`) as HTMLButtonElement;
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(settings.chantVolume), i18nTitle: 'chant.volume' }) as HTMLInputElement;
    vol.addEventListener('input', () => player.setVolume(Number(vol.value)));
    // progress: where we are, a bar to drag, and the chant's length
    this.seekBar = h('input', { type: 'range', min: '0', max: '1000', step: '1', value: '0', class: 'chant-seek' }) as HTMLInputElement;
    this.seekBar.addEventListener('pointerdown', () => (this.dragging = true));
    this.seekBar.addEventListener('change', () => (this.dragging = false));
    this.seekBar.addEventListener('input', () => {
      player.seek((Number(this.seekBar.value) / 1000) * player.duration);
      this.renderTime();
    });
    this.timeEl = h('span', {}, '0:00');
    this.lengthEl = h('span', {}, '0:00');
    player.onTime(() => this.renderTime());

    this.el = h(
      'aside',
      { class: 'panel chant-panel hidden' },
      // a close button of its own, like the sutra reader's (on a phone there's no Esc key; the chant keeps playing)
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'chant.title' }), h('button', { class: 'icon-btn', i18nTitle: 'common.close', onclick: () => this.show(false) }, '✕')),
      this.list,
      h('div', { class: 'chant-progress' }, this.timeEl, this.seekBar, this.lengthEl),
      h(
        'div',
        { class: 'transport' },
        h('button', { class: 'icon-btn', i18nTitle: 'chant.prev', onclick: () => player.prev() }, '⏮'),
        this.playBtn,
        h('button', { class: 'icon-btn', i18nTitle: 'chant.next', onclick: () => player.next() }, '⏭'),
        this.loopBtn,
      ),
      h('label', { class: 'chant-volume' }, h('span', { 'aria-hidden': 'true' }, '🔈'), vol, h('span', { 'aria-hidden': 'true' }, '🔊')),
    );
    parent.append(this.el);
    player.onChange(() => this.render());
  }

  get isOpen() {
    return this.open;
  }

  show(v: boolean) {
    this.open = v;
    this.el.classList.toggle('hidden', !v);
    this.render();
  }

  private renderTime() {
    const p = this.player, mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    this.timeEl.textContent = mmss(p.time);
    this.lengthEl.textContent = mmss(p.duration);
    this.seekBar.disabled = !p.duration;
    if (!this.dragging) this.seekBar.value = String(p.duration ? Math.round((p.time / p.duration) * 1000) : 0);
  }

  private render() {
    const p = this.player;
    this.playBtn.textContent = p.playing ? `❚❚ ${t('chant.stop')}` : `▶ ${t('chant.start')}`;
    this.loopBtn.textContent = `↻ ${t('chant.repeat')}`;
    this.loopBtn.classList.toggle('active', p.loop);
    if (!p.tracks.length) {
      this.list.replaceChildren(h('li', { class: 'muted' }, t('chant.empty')));
      return;
    }
    this.list.replaceChildren(
      ...p.tracks.map((tr, i) =>
        h('li', {}, h('button', { class: `list-btn${i === p.index ? ' active' : ''}`, onclick: () => p.play(i) }, `${i === p.index && p.playing ? '♪ ' : ''}${localized(tr.title)}`)),
      ),
    );
  }
}
