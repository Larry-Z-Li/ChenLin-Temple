import * as THREE from 'three';
import { HALLS, PAVED, PLATFORM_H, WATERFALL } from '../config/layout';
import { settings } from '../config/settings';
import { assetUrl } from '../content/manifest';
import { nearestOnStream, nearStream } from '../world/stream';
import { audioCtx } from './sfx';

interface SfxManifest { waterfall?: string | null; stream?: string | null; birds?: string[]; chimes?: string[]; bell?: string | null }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const CHIME_TONES = [1760, 2093, 2349, 2637];

export type Surface = 'grass' | 'stone' | 'wood' | 'water';
/** Footstep sound: filter type, frequency, Q, decay (s), gain, and an optional low thump (Hz). */
const STEPS: Record<Surface, [BiquadFilterType, number, number, number, number, number]> = {
  grass: ['bandpass', 1700, 0.7, 0.14, 0.22, 0],
  stone: ['highpass', 1800, 0.7, 0.05, 0.16, 150],
  wood: ['lowpass', 1200, 0.9, 0.07, 0.2, 115],
  water: ['bandpass', 850, 0.5, 0.24, 0.2, 0],
};

/**
 * Sound that follows where you are: wind, the waterfall and stream getting louder as you approach,
 * birdsong near trees, an occasional wind chime on the hall eaves, footsteps that match the ground,
 * and a temple bell on the hour.
 * Synthesized by default; any part can be replaced by a recording listed in /assets/sfx/index.json.
 * Uses the ambient on/off toggle and volume.
 */
export class Soundscape {
  private master!: GainNode;
  private fx!: GainNode;
  private wind?: { gain: GainNode; filter: BiquadFilterNode };
  private burst!: AudioBuffer;
  private stride = 0;
  private time = 0;
  private falls?: { gain: GainNode; pan: StereoPannerNode };
  private stream?: { gain: GainNode; pan: StereoPannerNode };
  private files: { birds: AudioBuffer[]; chimes: AudioBuffer[]; bell?: AudioBuffer } = { birds: [], chimes: [] };
  private chimePoints: THREE.Vector3[] = [];
  private nextBird = 4;
  private nextChime = 30 + Math.random() * 40;
  private lastBellHour = -1;
  private level = 0;
  private started = false;
  /** Ducked under chants. */
  duck = 1;

  constructor(private birdPoints: THREE.Vector3[]) {
    // Wind chimes hang at the four eave corners of every hall.
    for (const h of HALLS) {
      const ex = h.width / 2 + (h.kind === 'shrine' ? 1.6 : 2.4), ez = h.depth / 2 + (h.kind === 'shrine' ? 1.6 : 2.4);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.chimePoints.push(new THREE.Vector3(h.x + sx * ex, PLATFORM_H + h.wallHeight, h.z + sz * ez));
    }
  }

  async init() {
    const ac = audioCtx();
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(ac.destination);
    this.fx = ac.createGain();
    this.fx.connect(ac.destination);
    // Short white-noise burst, shaped per surface for footsteps.
    this.burst = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
    const b = this.burst.getChannelData(0);
    for (let i = 0; i < b.length; i++) b[i] = Math.random() * 2 - 1;

    let manifest: SfxManifest = {};
    try {
      const r = await fetch(assetUrl('sfx', 'index.json'));
      if (r.ok) manifest = await r.json();
    } catch {
      /* synth only */
    }
    const load = async (f?: string | null) => {
      if (!f) return undefined;
      try {
        return await ac.decodeAudioData(await (await fetch(assetUrl('sfx', f))).arrayBuffer());
      } catch {
        return undefined;
      }
    };
    const [fallsBuf, streamBuf, bell, birds, chimes] = await Promise.all([
      load(manifest.waterfall),
      load(manifest.stream),
      load(manifest.bell),
      Promise.all((manifest.birds ?? []).map(load)),
      Promise.all((manifest.chimes ?? []).map(load)),
    ]);
    this.files = { bell, birds: birds.filter(Boolean) as AudioBuffer[], chimes: chimes.filter(Boolean) as AudioBuffer[] };
    this.falls = this.loop(fallsBuf ?? this.noise(), fallsBuf ? 20000 : 900);
    this.stream = this.loop(streamBuf ?? this.noise(), streamBuf ? 20000 : 2400);
    // Wind: band-passed noise whose level and colour drift in slow gusts.
    {
      const src = ac.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start(0, Math.random() * 3);
      this.wind = { gain, filter };
    }
    this.lastBellHour = new Date().getHours(); // don't ring immediately on entry
    this.started = true;
  }

  /** Brownish noise: sounds like rushing water once low-passed. */
  private noise() {
    const ac = audioCtx(), len = ac.sampleRate * 4, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private loop(buf: AudioBuffer, cutoff: number) {
    const ac = audioCtx();
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const gain = ac.createGain();
    gain.gain.value = 0;
    const pan = ac.createStereoPanner();
    src.connect(lp).connect(gain).connect(pan).connect(this.master);
    src.start();
    return { gain, pan };
  }

  /** Stereo position of a source relative to where the camera faces. */
  private panFor(listener: THREE.Vector3, camYaw: number, x: number, z: number) {
    const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz) || 1;
    return Math.max(-1, Math.min(1, ((dx / d) * Math.cos(camYaw) - (dz / d) * Math.sin(camYaw)) * 0.8));
  }

  private oneShot(buf: AudioBuffer, gain: number, pan: number) {
    const ac = audioCtx();
    const src = ac.createBufferSource(), g = ac.createGain(), p = ac.createStereoPanner();
    src.buffer = buf;
    g.gain.value = gain;
    p.pan.value = pan;
    src.connect(g).connect(p).connect(this.master);
    src.start();
  }

  private tone(freq: number, at: number, dur: number, gain: number, pan: StereoPannerNode, partials: [number, number][]) {
    const ac = audioCtx();
    for (const [ratio, amp] of partials) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq * ratio;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain * amp, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(pan);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  private chirp(gain: number, panV: number) {
    if (this.files.birds.length) return this.oneShot(this.files.birds[Math.floor(Math.random() * this.files.birds.length)], gain * 3, panV);
    const ac = audioCtx(), pan = ac.createStereoPanner();
    pan.pan.value = panV;
    pan.connect(this.master);
    const base = 2400 + Math.random() * 2000, notes = 2 + Math.floor(Math.random() * 4);
    let t = ac.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const o = ac.createOscillator(), g = ac.createGain(), len = 0.06 + Math.random() * 0.08;
      const f0 = base * (0.9 + Math.random() * 0.25);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.75), t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len + 0.03 + Math.random() * 0.07;
    }
  }

  /** A single soft tinkle (sometimes two), not a tune. */
  private chime(gain: number, panV: number) {
    if (this.files.chimes.length) return this.oneShot(this.files.chimes[Math.floor(Math.random() * this.files.chimes.length)], gain * 3, panV);
    const ac = audioCtx(), pan = ac.createStereoPanner();
    pan.pan.value = panV;
    pan.connect(this.master);
    const t = ac.currentTime + 0.02;
    this.tone(CHIME_TONES[Math.floor(Math.random() * CHIME_TONES.length)], t, 3.2, gain, pan, [[1, 1], [2.76, 0.25]]);
    if (Math.random() < 0.35) this.tone(CHIME_TONES[Math.floor(Math.random() * CHIME_TONES.length)], t + 0.6 + Math.random() * 0.8, 3, gain * 0.6, pan, [[1, 1], [2.76, 0.25]]);
  }

  private step(surface: Surface) {
    const ac = audioCtx(), t = ac.currentTime;
    const [type, freq, q, decay, gain, thump] = STEPS[surface];
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.burst;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type;
    f.frequency.value = freq * (0.85 + Math.random() * 0.3);
    f.Q.value = q;
    const v = gain * (0.75 + Math.random() * 0.4);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t);
    src.stop(t + decay + 0.05);
    if (thump) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = thump * (0.9 + Math.random() * 0.2);
      og.gain.setValueAtTime(v * 0.5, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(og).connect(this.fx);
      o.start(t);
      o.stop(t + 0.08);
    }
  }

  /** What the listener is walking on. */
  surfaceAt(p: THREE.Vector3): Surface {
    if (nearStream(p.x, p.z) && nearestOnStream(p.x, p.z).d < 2.2) return 'water';
    const inHall = HALLS.some((h) => h.kind === 'hall' && Math.abs(p.x - h.x) < h.width / 2 && Math.abs(p.z - h.z) < h.depth / 2);
    if (inHall && p.y > PLATFORM_H * 0.7) return 'wood';
    if (p.y > PLATFORM_H * 0.7) return 'stone'; // platforms and stairs
    if (PAVED.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ)) return 'stone';
    return 'grass';
  }

  /** Big temple bell, three strikes. */
  private templeBell() {
    if (this.files.bell) {
      [0, 7, 14].forEach((s) => setTimeout(() => this.oneShot(this.files.bell!, 0.9, 0), s * 1000));
      return;
    }
    const ac = audioCtx(), pan = ac.createStereoPanner();
    pan.connect(this.master);
    [0, 7, 14].forEach((s) => this.tone(82, ac.currentTime + s, 11, 0.5, pan, [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.15], [8.9, 0.06]]));
  }

  /** `speed`: how fast the listener is walking (m/s), for footsteps. */
  update(dt: number, listener: THREE.Vector3, camYaw: number, speed = 0) {
    if (!this.started) return;
    const ac = audioCtx(), now = ac.currentTime;
    this.time += dt;
    this.level += ((settings.musicOn ? settings.musicVolume * this.duck : 0) - this.level) * Math.min(1, dt * 2);
    this.master.gain.setTargetAtTime(this.level, now, 0.1);
    this.fx.gain.setTargetAtTime(settings.sfxVolume, now, 0.1);

    // Footsteps: one per stride (effects volume, independent of the ambience toggle).
    if (speed > 0.4) {
      this.stride += speed * dt;
      const strideLen = speed > 4 ? 1.1 : 0.75;
      if (this.stride >= strideLen) {
        this.stride -= strideLen;
        this.step(this.surfaceAt(listener));
      }
    } else this.stride = 0.5;

    // Indoors (inside a hall's walls) the outdoors is muffled.
    const indoors = HALLS.some((h) => h.kind === 'hall' && Math.abs(listener.x - h.x) < h.width / 2 && Math.abs(listener.z - h.z) < h.depth / 2);
    const out = indoors ? 0.25 : 1;

    // Wind: slow overlapping gusts, a little stronger up the slopes.
    const tw = this.time;
    const gust = 0.5 + 0.3 * Math.sin(tw * 0.13) + 0.2 * Math.sin(tw * 0.41 + 1.3);
    const height = clamp01(listener.y / 40);
    this.wind!.gain.gain.setTargetAtTime(0.16 * (0.35 + 0.65 * gust) * (1 + height) * (indoors ? 0.3 : 1), now, 0.5);
    this.wind!.filter.frequency.setTargetAtTime(320 + 520 * gust, now, 0.5);

    const df = Math.hypot(listener.x - WATERFALL.x, listener.z - WATERFALL.z);
    this.falls!.gain.gain.setTargetAtTime(0.9 * clamp01(1 - df / 150) ** 2 * out, now, 0.2);
    this.falls!.pan.pan.setTargetAtTime(this.panFor(listener, camYaw, WATERFALL.x, WATERFALL.z), now, 0.2);
    if (nearStream(listener.x, listener.z)) {
      const q = nearestOnStream(listener.x, listener.z);
      this.stream!.gain.gain.setTargetAtTime(0.5 * clamp01(1 - q.d / 30) ** 2 * out, now, 0.2);
      this.stream!.pan.pan.setTargetAtTime(this.panFor(listener, camYaw, q.px, q.pz), now, 0.2);
    } else this.stream!.gain.gain.setTargetAtTime(0, now, 0.3);

    // Birds: a nearby tree, every few seconds (outdoors only).
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 2.5 + Math.random() * 6;
      const near = this.birdPoints.filter((p) => Math.hypot(p.x - listener.x, p.z - listener.z) < 45);
      if (near.length && !indoors) {
        const p = near[Math.floor(Math.random() * near.length)], d = Math.hypot(p.x - listener.x, p.z - listener.z);
        this.chirp(0.07 * clamp01(1 - d / 45), this.panFor(listener, camYaw, p.x, p.z));
      }
    }

    // Wind chimes on the nearest eaves.
    this.nextChime -= dt;
    if (this.nextChime <= 0) {
      this.nextChime = 45 + Math.random() * 75; // ever so often
      let best: THREE.Vector3 | null = null, bd = 32;
      for (const p of this.chimePoints) {
        const d = Math.hypot(p.x - listener.x, p.z - listener.z);
        if (d < bd) [best, bd] = [p, d];
      }
      if (best) this.chime(0.035 * clamp01(1 - bd / 32) * (indoors ? 0.5 : 1), this.panFor(listener, camYaw, best.x, best.z));
    }

    // Temple bell at the top of each hour (local time).
    const date = new Date();
    if (date.getMinutes() === 0 && date.getHours() !== this.lastBellHour) {
      this.lastBellHour = date.getHours();
      this.templeBell();
    }
  }
}

