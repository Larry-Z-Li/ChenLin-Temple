import { saveSettings, settings } from '../config/settings';
import { assetUrl, loadChants, ownServerUrl, type AudioEntry } from '../content/manifest';
import { damp } from '../core/math';
import { audioCtx } from './sfx';

/** Chant playback. Runs alongside silence / beads / sutra reading. */
export class ChantPlayer {
  tracks: AudioEntry[] = [];
  index = -1;
  /** Repeat the current chant (on by default: a mantra goes round and round). */
  loop = true;
  private el = (() => {
    const el = new Audio();
    // (the chants come from the CDN, another site: without this, the browser feeds the Web Audio volume below silence)
    el.crossOrigin = 'anonymous';
    el.addEventListener('error', () => { // (from the CDN and it failed: the same chant from our own server)
      const own = ownServerUrl(el.src), wasPlaying = !el.paused || el.autoplay;
      if (!own) return;
      el.src = own;
      if (wasPlaying) void el.play().catch(() => {});
    });
    return el;
  })();
  private level = 0;
  private fadingOut = false;
  private listeners = new Set<() => void>();
  /** Our own volume, through the shared AudioContext: phones (iOS) ignore an audio element's volume. */
  private gain: GainNode | null = null;
  /** Started silently by the click that enters (so starting it on landing is allowed); not yet heard. */
  private priming = false;

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
    return !this.el.paused && !this.priming;
  }

  /** Once, from a click: the element through a gain of ours (and, on iOS, played like music, silent switch or not). */
  private route() {
    if (this.gain) return;
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
      const ac = audioCtx();
      this.gain = ac.createGain();
      this.gain.gain.value = 0;
      ac.createMediaElementSource(this.el).connect(this.gain).connect(ac.destination);
      // phones suspend audio in the background: wake it on the next touch
      addEventListener('pointerdown', () => ac.state !== 'running' && void ac.resume());
    } catch {
      this.gain = null; // no Web Audio: the element's own volume will have to do
    }
    void audioCtx().resume();
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
    this.route();
    this.index = (i + this.tracks.length) % this.tracks.length;
    const src = assetUrl('chants', this.tracks[this.index].file);
    if (this.priming && this.el.src.endsWith(src)) {
      this.el.currentTime = 0; // already going silently since the click: from the top, fading in
      this.level = 0;
    } else {
      this.el.src = src;
      this.level = settings.chantVolume;
    }
    this.priming = false;
    this.fadingOut = false;
    void this.el.play().catch(() => {});
    this.changed();
  }

  /**
   * From inside a click: start chant `i` at zero volume, so that hearing it later (with no click to hand,
   * e.g. on landing) is allowed — browsers, Safari above all, only let sound start from a click.
   */
  prime(i: number) {
    if (!this.tracks.length || this.index >= 0) return;
    this.route();
    this.el.src = assetUrl('chants', this.tracks[i % this.tracks.length].file);
    this.priming = true;
    this.level = 0;
    if (this.gain) this.gain.gain.value = 0;
    else this.el.volume = 0;
    void this.el.play().catch(() => (this.priming = false));
  }

  toggle() {
    this.route();
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
    const target = this.fadingOut || this.priming ? 0 : settings.chantVolume;
    this.level = damp(this.level, target, this.fadingOut ? 1.5 : 6, dt);
    const v = Math.min(1, Math.max(0, this.level));
    if (this.gain) this.gain.gain.value = v;
    else this.el.volume = v;
    if (this.fadingOut && this.level < 0.01) {
      this.el.pause();
      this.fadingOut = false;
    }
  }
}
