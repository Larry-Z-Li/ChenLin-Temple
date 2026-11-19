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


const RPAD = 30;
const rivers = RIVERS.map((def) => {
  const pts = def.points;
  const rs = pts.slice(1).map(([x1, z1], i) => {
    const [x0, z0] = pts[i];
    return { x0, z0, dx: x1 - x0, dz: z1 - z0, len: Math.hypot(x1 - x0, z1 - z0) };
  });
  const st: number[] = [];
  const length = rs.reduce((acc, g) => (st.push(acc), acc + g.len), 0);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { def, segs: rs, starts: st, length, minX: Math.min(...xs) - RPAD, maxX: Math.max(...xs) + RPAD, minZ: Math.min(...zs) - RPAD, maxZ: Math.max(...zs) + RPAD };
});

export const riverLength = (def: RiverDef) => rivers.find((r) => r.def === def)!.length;

/** Closest point on any river (skipping rivers whose bounding box is far away). */
export function nearestRiver(x: number, z: number) {
  let best = { d: Infinity, s: 0, len: 0, px: 0, pz: 0, behind: 0, def: RIVERS[0] };
  for (const r of rivers) {
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    r.segs.forEach((g, i) => {
      const raw = ((x - g.x0) * g.dx + (z - g.z0) * g.dz) / (g.len * g.len);
      const t = Math.min(1, Math.max(0, raw));
      const px = g.x0 + g.dx * t, pz = g.z0 + g.dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, s: r.starts[i] + t * g.len, len: r.length, px, pz, behind: i === 0 ? Math.min(0, raw * g.len) : 0, def: r.def };
    });
  }
  return best;
}
