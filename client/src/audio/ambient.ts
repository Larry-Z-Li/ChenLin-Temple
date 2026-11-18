import { saveSettings, settings } from '../config/settings';
import { assetUrl, loadAmbient, type AudioEntry } from '../content/manifest';
import { damp } from '../core/math';

/** Background ambience playlist (shuffled, looping) with fade + ducking under chants. */
export class Ambient {
  private tracks: AudioEntry[] = [];
  private el = new Audio();
  private idx = -1;
  private level = 0;
  /** Multiplier set by other audio (e.g. 0.3 while a chant plays). */
  duck = 1;

  constructor() {
    this.el.preload = 'auto';
    this.el.volume = 0;
    this.el.addEventListener('ended', () => this.next());
  }

  get available() {
    return this.tracks.length > 0;
  }

  async init() {
    this.tracks = (await loadAmbient()).sort(() => Math.random() - 0.5);
    if (settings.musicOn) this.next();
  }

  setOn(on: boolean) {
    settings.musicOn = on;
    saveSettings();
    if (on && this.el.paused) {
      if (this.idx < 0) this.next();
      else void this.el.play().catch(() => {});
    }
  }

  private next() {
    if (!this.tracks.length) return;
    this.idx = (this.idx + 1) % this.tracks.length;
    this.el.src = assetUrl('ambient', this.tracks[this.idx].file);
    void this.el.play().catch(() => {});
  }

  update(dt: number) {
    const target = settings.musicOn ? settings.musicVolume * this.duck : 0;
    this.level = damp(this.level, target, 2, dt);
    this.el.volume = Math.min(1, Math.max(0, this.level));
    if (!settings.musicOn && this.level < 0.005 && !this.el.paused) this.el.pause();
  }
}
