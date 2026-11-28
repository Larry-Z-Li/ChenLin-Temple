import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { RIVERS, STREAM, type RiverDef } from '../config/layout';

/** Geometry helpers for the stream polyline (waterfall → lotus pond). */
const segs = STREAM.slice(1).map(([x1, z1], i) => {
  const [x0, z0] = STREAM[i];
  return { x0, z0, dx: x1 - x0, dz: z1 - z0, len: Math.hypot(x1 - x0, z1 - z0) };
});
const starts: number[] = [];
segs.reduce((acc, s) => (starts.push(acc), acc + s.len), 0);
export const STREAM_LENGTH = segs.reduce((a, s) => a + s.len, 0);

const PAD = 45;
const box = {
  minX: Math.min(...STREAM.map((p) => p[0])) - PAD,
  maxX: Math.max(...STREAM.map((p) => p[0])) + PAD,
  minZ: Math.min(...STREAM.map((p) => p[1])) - PAD,
  maxZ: Math.max(...STREAM.map((p) => p[1])) + PAD,
};
export const nearStream = (x: number, z: number) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;

/**
 * Closest point on the stream: distance `d`, arc length `s` from the falls, the point itself,
 * and `behind` (< 0 = metres behind the waterfall, i.e. inside the cliff).
 */
export function nearestOnStream(x: number, z: number) {
  let best = { d: Infinity, s: 0, px: 0, pz: 0, behind: 0 };
  segs.forEach((g, i) => {
    const raw = ((x - g.x0) * g.dx + (z - g.z0) * g.dz) / (g.len * g.len);
    const t = Math.min(1, Math.max(0, raw));
    const px = g.x0 + g.dx * t, pz = g.z0 + g.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, s: starts[i] + t * g.len, px, pz, behind: i === 0 ? Math.min(0, raw * g.len) : 0 };
  });
  return best;
}

// ---------------------------------------------------------------- all rivers

/**
 * Each river as the smooth curve its water follows (centripetal Catmull-Rom through its points), sampled every ~2 m.
 * Channel, banks, water, colliders and everything else measure from this one line, so they agree at the bends.
 * Close by, the nearest point comes from a grid of these short pieces; further off (where a metre doesn't matter)
 * from the river's few straight legs.
 */
const RPAD = 30, CELL = 12;
const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
const rivers = RIVERS.map((def) => {
  const curve = new THREE.CatmullRomCurve3(def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const fine = curve.getSpacedPoints(Math.max(2, Math.ceil(curve.getLength() / 2))).map((v) => [v.x, v.z] as [number, number]);
  const legs = (pts: [number, number][]) => {
    const segs = pts.slice(1).map(([x1, z1], i) => {
      const [x0, z0] = pts[i];
      return { x0, z0, dx: x1 - x0, dz: z1 - z0, len: Math.hypot(x1 - x0, z1 - z0), start: 0 };
    });
    segs.reduce((acc, g) => ((g.start = acc), acc + g.len), 0);
    return segs;
  };
  const segs = legs(fine), coarse = legs(def.points);
  const length = segs.reduce((a, g) => a + g.len, 0), coarseLength = coarse.reduce((a, g) => a + g.len, 0);
  const grid = new Map<number, number[]>(); // (cells keyed by a number, not a string: this is asked hundreds of times a frame)
  segs.forEach((g, i) => {
    const cx0 = Math.floor(Math.min(g.x0, g.x0 + g.dx) / CELL), cx1 = Math.floor(Math.max(g.x0, g.x0 + g.dx) / CELL);
    const cz0 = Math.floor(Math.min(g.z0, g.z0 + g.dz) / CELL), cz1 = Math.floor(Math.max(g.z0, g.z0 + g.dz) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const key = cellKey(cx, cz); (grid.get(key) ?? grid.set(key, []).get(key)!).push(i); }
  });
  const xs = def.points.map((p) => p[0]), zs = def.points.map((p) => p[1]);
  return { def, segs, coarse, grid, length, coarseLength, minX: Math.min(...xs) - RPAD, maxX: Math.max(...xs) + RPAD, minZ: Math.min(...zs) - RPAD, maxZ: Math.max(...zs) + RPAD };
});
type Seg = (typeof rivers)[number]['segs'][number];

export const riverLength = (def: RiverDef) => rivers.find((r) => r.def === def)!.length;

/** How wide a river's water is (half-width, m) at `s` metres along it: the falls stream widens into the pond; the others breathe a little. */
export function riverHalfWidth(def: RiverDef, s: number) {
  const L = riverLength(def);
  if (def.falls) return 1.85 + 0.9 * smoothstep(L - 14, L, s);
  return def.halfWidth * (0.85 + 0.3 * Math.sin(s * 0.07 + def.points.length));
}

/** The point `s` metres along a river, and the unit normal across it (to its left, looking downstream). */
export function riverFrame(def: RiverDef, s: number) {
  const r = rivers.find((q) => q.def === def)!;
  s = Math.min(r.length, Math.max(0, s));
  let lo = 0, hi = r.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.segs[mid].start <= s) lo = mid;
    else hi = mid - 1;
  }
  const g = r.segs[lo], t = g.len ? (s - g.start) / g.len : 0;
  return { x: g.x0 + g.dx * t, z: g.z0 + g.dz * t, nx: -g.dz / (g.len || 1), nz: g.dx / (g.len || 1) };
}

/** Closest point on one particular river: distance `d` and how far along it `s`. */
export function nearestOn(def: RiverDef, x: number, z: number) {
  const r = rivers.find((q) => q.def === def)!;
  let best = { d: Infinity, s: 0 };
  for (const g of r.segs) {
    const t = Math.min(1, Math.max(0, ((x - g.x0) * g.dx + (z - g.z0) * g.dz) / (g.len * g.len)));
    const d = Math.hypot(x - g.x0 - g.dx * t, z - g.z0 - g.dz * t);
    if (d < best.d) best = { d, s: g.start + t * g.len };
  }
  return best;
}

/** Closest point on any river (skipping rivers whose bounding box is far away). */
export function nearestRiver(x: number, z: number) {
  let best = { d: Infinity, s: 0, len: 0, px: 0, pz: 0, behind: 0, def: RIVERS[0] };
  const test = (r: (typeof rivers)[number], g: Seg, i: number, scale: number) => {
    const raw = ((x - g.x0) * g.dx + (z - g.z0) * g.dz) / (g.len * g.len);
    const t = Math.min(1, Math.max(0, raw));
    const px = g.x0 + g.dx * t, pz = g.z0 + g.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, s: (g.start + t * g.len) * scale, len: r.length, px, pz, behind: i === 0 ? Math.min(0, raw * g.len) : 0, def: r.def };
  };
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (const r of rivers) {
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const ks = r.grid.get(cellKey(cx + i, cz + j)); if (ks) for (const k of ks) test(r, r.segs[k], k, 1); }
  }
  if (best.d <= CELL) return best;
  for (const r of rivers) { // further off: the straight legs are near enough
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    r.coarse.forEach((g, i) => test(r, g, i, r.length / r.coarseLength));
  }
  return best;
}
