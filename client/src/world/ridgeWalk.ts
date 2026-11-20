import { BASIN, STUPA_COURT, STUPA_RIDGE, WATERFALL } from '../config/layout';
import { lerp, mulberry32, range, smoothstep } from '../core/math';
import { nearestOnStream, nearestRiver, nearStream } from './stream';
import { rawTerrainHeight } from './terrain';

/**
 * The mountain ridge west of the valley: a string of chörtens on a level terrace with a walk
 * just behind (uphill of) them, like the 108 chörtens of a mountain pass. Planned once from
 * the raw terrain; terrainHeight() then cuts/fills the terrace into the slope.
 */
export interface RidgeStupa { x: number; z: number; yaw: number; s: number }

interface Sample { x: number; z: number; tx: number; tz: number; nx: number; nz: number; h: number }

interface RidgePlan {
  stupas: RidgeStupa[];
  /** The walk, one point behind each stupa. */
  path: [number, number][];
  /** The walk, densely sampled with its levelled height. */
  samples: Sample[];
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Terrace cross-section, metres from the walk's centre line (+ toward the valley, where the stupas
 * stand): the walk on a bench, a short bank down (STEP_DOWN) to the stupas' own level, whose outer
 * edge falls away to the mountainside so the valley stays in view from the walk.
 */
const UPHILL_FLAT = 2.5, UPHILL_BLEND = 9, BANK_FROM = 2.4, BANK_TO = 4.8, STEP_DOWN = 2.5, VALLEY_FLAT = 13.5, VALLEY_BLEND = 19;
const STEP = 2;

let plan: RidgePlan | null = null;

export function ridgePlan(): RidgePlan {
  if (plan) return plan;
  const stupas = placeStupas();
  const c = STUPA_COURT;
  const path = stupas.map((st): [number, number] => {
    const dx = c.x - st.x, dz = c.z - st.z, l = Math.hypot(dx, dz) || 1;
    return [st.x - (dx / l) * (6.5 + 2 * st.s), st.z - (dz / l) * (6.5 + 2 * st.s)];
  });

  // Dense samples along straight legs (the gravel ribbon's curve stays within a hair of them at this spacing).
  const samples: Sample[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / STEP));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      samples.push({ x, z, tx: 0, tz: 0, nx: 0, nz: 0, h: rawTerrainHeight(x, z) });
    }
  }
  // Tangents, and normals pointing toward the valley.
  samples.forEach((s, i) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    s.tx = (b.x - a.x) / l;
    s.tz = (b.z - a.z) / l;
    [s.nx, s.nz] = [-s.tz, s.tx];
    if (s.nx * (c.x - s.x) + s.nz * (c.z - s.z) < 0) [s.nx, s.nz] = [-s.nx, -s.nz];
  });
  // Level the walk: a wide moving average, twice, so it rises and falls gently.
  for (let pass = 0; pass < 2; pass++) {
    const src = samples.map((s) => s.h), W = 10;
    samples.forEach((s, i) => {
      let sum = 0, cnt = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(samples.length - 1, i + W); j++) (sum += src[j]), cnt++;
      s.h = sum / cnt;
    });
  }
  const pad = VALLEY_BLEND + 4;
  const box = {
    minX: Math.min(...samples.map((s) => s.x)) - pad,
    maxX: Math.max(...samples.map((s) => s.x)) + pad,
    minZ: Math.min(...samples.map((s) => s.z)) - pad,
    maxZ: Math.max(...samples.map((s) => s.z)) + pad,
  };
  plan = { stupas, path, samples, box };
  return plan;
}

/** The ridge chörtens: knolls along an arc on the western mountains, irregularly spaced. */
function placeStupas(): RidgeStupa[] {
  const { count, bearingFrom, bearingTo, rMin, rMax, seed } = STUPA_RIDGE;
  const rng = mulberry32(seed);
  const at = (az: number, r: number) => ({ x: BASIN.x + Math.sin(az) * r, z: BASIN.z + Math.cos(az) * r });
  const spots: RidgeStupa[] = [];
  let az = bearingFrom, prevR: number | null = null;
  while (spots.length < count && az < bearingTo) {
    // Best knoll along this bearing: highest point once the general outward rise is discounted.
    let best = -Infinity, bestR = rMin;
    for (let r = rMin; r <= rMax; r += 3) {
      const p = at(az, r), score = rawTerrainHeight(p.x, p.z) - 0.3 * r;
      if (score > best) [best, bestR] = [score, r];
    }
    // Let the string meander instead of jumping between distant knolls.
    const r: number = prevR === null ? bestR : lerp(prevR, bestR, 0.55) + range(rng, -7, 7);
    prevR = r;
    const p = at(az + range(rng, -0.01, 0.01), r);
    // Keep clear of the waterfall and its ravine.
    if (Math.hypot(p.x - WATERFALL.x, p.z - WATERFALL.z) < 32 || nearestRiver(p.x, p.z).d < 16) {
      az += 14 / r;
      continue;
    }
    spots.push({ ...p, yaw: Math.atan2(BASIN.x - p.x, BASIN.z - p.z) + range(rng, -0.25, 0.25), s: range(rng, 0.9, 1.1) });
    // Irregular spacing: mostly 12–26 m, sometimes a close pair, sometimes a longer gap.
    const roll = rng();
    const gap = roll < 0.18 ? range(rng, 7, 10) : roll < 0.85 ? range(rng, 12, 26) : range(rng, 32, 48);
    az += gap / r;
  }
  return spots;
}

/** Where (x,z) sits relative to the walk: nearest sample, signed offset (+ valley-side) and overshoot past the ends. */
function locate(x: number, z: number) {
  const p = ridgePlan();
  if (x < p.box.minX || x > p.box.maxX || z < p.box.minZ || z > p.box.maxZ) return null;
  let bi = 0, bd = Infinity;
  const S = p.samples;
  for (let i = 0; i < S.length; i++) {
    const d = (x - S[i].x) ** 2 + (z - S[i].z) ** 2;
    if (d < bd) [bi, bd] = [i, d];
  }
  const s = S[bi], along = (x - s.x) * s.tx + (z - s.z) * s.tz, off = (x - s.x) * s.nx + (z - s.z) * s.nz;
  // Height between this sample and its neighbour on that side.
  const nb = S[Math.max(0, Math.min(S.length - 1, bi + Math.sign(along)))];
  const h = nb === s ? s.h : lerp(s.h, nb.h, Math.min(1, Math.abs(along) / STEP));
  const over = bi === 0 ? Math.max(0, -along) : bi === S.length - 1 ? Math.max(0, along) : 0;
  return { off, h, over };
}

/** How strongly the terrace replaces the raw ground at (x,z): 1 on the terrace, 0 away from it. */
function terraceWeight(off: number, over: number, x: number, z: number) {
  let w = off >= 0 ? 1 - smoothstep(VALLEY_FLAT, VALLEY_BLEND, off) : 1 - smoothstep(UPHILL_FLAT, UPHILL_BLEND, -off);
  w *= 1 - smoothstep(4, 16, over);
  // Never dam the waterfall's ravine or a river gorge.
  if (w > 0 && nearStream(x, z)) w *= smoothstep(14, 26, nearestOnStream(x, z).d);
  if (w > 0) w *= smoothstep(12, 22, nearestRiver(x, z).d);
  return w;
}

/** terrainHeight's last step: cut and fill the ridge terrace. */
export function shapeRidge(x: number, z: number, h: number) {
  const q = locate(x, z);
  if (!q) return h;
  const w = terraceWeight(q.off, q.over, x, z);
  return w > 0 ? lerp(h, q.h - (q.off > 0 ? STEP_DOWN * smoothstep(BANK_FROM, BANK_TO, q.off) : 0), w) : h;
}

/** True on the flat of the terrace (keep trees off it). */
export function onRidgeTerrace(x: number, z: number) {
  const q = locate(x, z);
  return !!q && q.over < 4 && q.off > -UPHILL_FLAT - 1 && q.off < VALLEY_FLAT + 1;
}
