import { saveSettings, settings } from '../config/settings';
import { assetUrl, loadChants, type AudioEntry } from '../content/manifest';
import { damp } from '../core/math';

/** Chant playback. Runs alongside silence / beads / sutra reading. */
export class ChantPlayer {
  tracks: AudioEntry[] = [];
  index = -1;
  /** Repeat the current chant (on by default: a mantra goes round and round). */
  loop = true;
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

  /** Where we are in the current chant, and how long it is (seconds; 0 until it's loaded). */
  get time() {
    return this.el.currentTime || 0;
  }
  get duration() {
    return Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }
  seek(seconds: number) {
    if (this.duration) this.el.currentTime = Math.max(0, Math.min(this.duration, seconds));
  }
  /** As it plays (a few times a second), and when a chant's length becomes known. */
  onTime(fn: () => void) {
    for (const ev of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) this.el.addEventListener(ev, fn);
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

  /**
   * From inside a click: load chant `i` and start-and-stop it silently, so that playing it later (with no
   * click to hand, e.g. on landing) is allowed — browsers, Safari above all, only let sound start from a click.
   */
  prime(i: number) {
    if (!this.tracks.length || this.index >= 0) return;
    this.el.src = assetUrl('chants', this.tracks[i % this.tracks.length].file);
    this.el.muted = true;
    void this.el.play().then(() => this.el.pause()).catch(() => {}).finally(() => (this.el.muted = false));
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
