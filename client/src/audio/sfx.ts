import { settings } from '../config/settings';

/** Tiny synthesized sound effects (no asset files needed). Replace with samples later if desired. */
let ac: AudioContext | null = null;
const ctx = () => (ac ??= new AudioContext());
/** Shared AudioContext (created lazily; resumed by unlockAudio on the entry click). */
export const audioCtx = ctx;

export function unlockAudio() {
  void ctx().resume();
}

/** Soft rush of air (cloud take-off / landing). */
export function whoosh(strength = 1, length = 1.6) {
  const a = ctx(), t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * length), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(1400, t + length * 0.45);
  f.frequency.exponentialRampToValueAtTime(380, t + length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * strength * Math.max(0.01, settings.sfxVolume), t + length * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
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
