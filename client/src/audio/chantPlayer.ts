import { saveSettings, settings } from '../config/settings';
import { assetUrl, loadChants, type AudioEntry } from '../content/manifest';
import { damp } from '../core/math';

/** Chant playback. Runs alongside silence / beads / sutra reading. */
export class ChantPlayer {
  tracks: AudioEntry[] = [];
  index = -1;
  loop = false;
  private el = new Audio();
  private level = 0;
  private fadingOut = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.el.addEventListener('ended', () => (this.loop ? this.play(this.index) : this.next()));
    this.el.addEventListener('play', () => this.changed());
    this.el.addEventListener('pause', () => this.changed());
  }

  async init() {
    this.tracks = await loadChants();
    this.changed();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }
  private changed() {
    this.listeners.forEach((f) => f());
  }

  get playing() {
    return !this.el.paused;
  }

  play(i: number) {
    if (!this.tracks.length) return;
    this.index = (i + this.tracks.length) % this.tracks.length;
    this.el.src = assetUrl('chants', this.tracks[this.index].file);
    this.fadingOut = false;
    this.level = settings.chantVolume;
    void this.el.play().catch(() => {});
    this.changed();
  }

  toggle() {
    if (this.index < 0) return this.play(0);
    if (this.el.paused) {
      this.fadingOut = false;
      void this.el.play().catch(() => {});
    } else this.el.pause();
  }

  next() {
    this.play(this.index + 1);
  }
  prev() {
    this.play(this.index - 1);
  }

  setVolume(v: number) {
    settings.chantVolume = v;
    saveSettings();
  }

  /** Fade out and stop (used when standing up). */
  fadeOut() {
    if (!this.el.paused) this.fadingOut = true;
  }

  update(dt: number) {
    const target = this.fadingOut ? 0 : settings.chantVolume;
    this.level = damp(this.level, target, this.fadingOut ? 1.5 : 6, dt);
    this.el.volume = Math.min(1, Math.max(0, this.level));
    if (this.fadingOut && this.level < 0.01) {
      this.el.pause();
      this.fadingOut = false;
    }
  }
}
