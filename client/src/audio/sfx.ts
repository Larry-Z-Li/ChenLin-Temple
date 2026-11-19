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
export function bell(pitch = 220, length = 6, vol = 1) {
  const a = ctx(), t = a.currentTime;
  const master = a.createGain();
  master.gain.value = 0.22 * settings.sfxVolume * vol;
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

/** Hollow knock of a wooden fish (木魚): a short resonant body tone plus a click. */
export function woodFish(vol = 1) {
  const a = ctx(), t = a.currentTime;
  const out = a.createGain();
  out.gain.value = 0.5 * settings.sfxVolume * vol;
  out.connect(a.destination);
  for (const [f, g0, d] of [[330, 1, 0.16], [760, 0.35, 0.06]] as const) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(f * 1.06, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(g0, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  noiseBurst(a, out, 2600, 0.025, 0.25);
}

/** Low boom of the big temple drum (法鼓). */
export function drum(vol = 1) {
  const a = ctx(), t = a.currentTime;
  const out = a.createGain();
  out.gain.value = 0.7 * settings.sfxVolume * vol;
  out.connect(a.destination);
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 1.7);
  noiseBurst(a, out, 500, 0.12, 0.5);
}

/** A contented purr, and now and then a sleepy little mew. */
export function purr(vol = 1) {
  const a = ctx(), t = a.currentTime, len = 1.6;
  const out = a.createGain();
  out.gain.value = 0.5 * settings.sfxVolume * vol;
  out.connect(a.destination);
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), lp = a.createBiquadFilter(), g = a.createGain(), am = a.createGain(), lfo = a.createOscillator(), depth = a.createGain();
  src.buffer = buf;
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  am.gain.value = 0.5;
  lfo.frequency.value = 24;
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);
  src.connect(lp).connect(g).connect(am).connect(out);
  src.start(t);
  lfo.start(t);
  lfo.stop(t + len);
  if (Math.random() < 0.4) {
    const o = a.createOscillator(), bp = a.createBiquadFilter(), mg = a.createGain(), t0 = t + 0.5;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t0);
    o.frequency.linearRampToValueAtTime(820, t0 + 0.12);
    o.frequency.linearRampToValueAtTime(520, t0 + 0.4);
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 2;
    mg.gain.setValueAtTime(0.0001, t0);
    mg.gain.exponentialRampToValueAtTime(0.35, t0 + 0.04);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    o.connect(bp).connect(mg).connect(out);
    o.start(t0);
    o.stop(t0 + 0.45);
  }
}

function noiseBurst(a: AudioContext, out: AudioNode, freq: number, length: number, level: number) {
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * length), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  g.gain.value = level;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}
