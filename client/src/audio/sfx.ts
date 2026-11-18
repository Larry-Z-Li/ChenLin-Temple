import { settings } from '../config/settings';

/** Tiny synthesized sound effects (no asset files needed). Replace with samples later if desired. */
let ac: AudioContext | null = null;
const ctx = () => (ac ??= new AudioContext());
/** Shared AudioContext (created lazily; resumed by unlockAudio on the entry click). */
export const audioCtx = ctx;

export function unlockAudio() {
  void ctx().resume();
}

/** Soft wooden click for a prayer bead. */
export function beadClick() {
  const a = ctx(), t = a.currentTime;
  const osc = a.createOscillator(), gain = a.createGain(), filter = a.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400 + Math.random() * 200, t);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.04);
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  gain.gain.setValueAtTime(0.25 * settings.sfxVolume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(filter).connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** Singing-bowl-like bell: a few inharmonic partials with long decay. */
export function bell(pitch = 220, length = 6) {
  const a = ctx(), t = a.currentTime;
  const master = a.createGain();
  master.gain.value = 0.22 * settings.sfxVolume;
  master.connect(a.destination);
  [1, 2.71, 5.2, 8.4].forEach((ratio, i) => {
    const osc = a.createOscillator(), g = a.createGain();
    osc.frequency.value = pitch * ratio * (1 + (Math.random() - 0.5) * 0.004);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1 / (i + 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length / (1 + i * 0.6));
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + length);
  });
}
