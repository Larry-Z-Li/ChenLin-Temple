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
  private open = false;

  constructor(parent: HTMLElement, private player: ChantPlayer) {
    this.list = h('ul', { class: 'list' });
    this.playBtn = h('button', { class: 'icon-btn', i18nTitle: 'chant.play', onclick: () => player.toggle() }, '▶');
    this.loopBtn = h('button', { class: 'icon-btn', i18nTitle: 'chant.loop', onclick: () => {
      player.loop = !player.loop;
      this.render();
    } }, '↻');
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(settings.chantVolume), i18nTitle: 'chant.volume' }) as HTMLInputElement;
    vol.addEventListener('input', () => player.setVolume(Number(vol.value)));

    this.el = h(
      'aside',
      { class: 'panel chant-panel hidden' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', i18n: 'chant.title' })),
      this.list,
      h(
        'div',
        { class: 'transport' },
        h('button', { class: 'icon-btn', i18nTitle: 'chant.prev', onclick: () => player.prev() }, '⏮'),
        this.playBtn,
        h('button', { class: 'icon-btn', i18nTitle: 'chant.next', onclick: () => player.next() }, '⏭'),
        this.loopBtn,
        vol,
      ),
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

  private render() {
    const p = this.player;
    this.playBtn.textContent = p.playing ? '❚❚' : '▶';
    this.playBtn.title = t(p.playing ? 'chant.pause' : 'chant.play');
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
