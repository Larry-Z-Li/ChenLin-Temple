import { hallHalf, ABBOT, BASIN, BENCHES, BODHI_TREE, DORM, DRAGON_POOL, DRAGON_SPRING, FOOT_BRIDGES, FOOTPATHS, PAGODAS, PICNIC_TABLES, POND_PAVILION, STUPA_COURT, WISH_GARDEN, BRIDGE, FLAG_LINES, HALLS, INCENSE_BURNER, LANTERN_CANOPY, MOUNTAIN_GATE, ORCHARD, PAVED, POND, STELE, STONE_LANTERNS, WATERFALL, WHEEL_ROWS, type Rect } from '../config/layout';
import { smoothstep } from '../core/math';
import { nearestOnStream, nearestRiver, nearStream } from './stream';

const POLES = FLAG_LINES.flat().filter((a) => a.pole);

const inRect = (x: number, z: number, r: Rect, m: number) => x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m;

/** True if (x,z) is reserved for buildings, paths, water etc. — keep vegetation out. */
export function isReserved(x: number, z: number, margin = 1.5, includeOrchard = true) {
  for (const h of HALLS) {
    // halls + stairs + porch (whichever way they face)
    const [ex, ez] = hallHalf(h);
    if (inRect(x, z, { minX: h.x - ex - 4, maxX: h.x + ex + 4, minZ: h.z - ez - 4, maxZ: h.z + ez + 4 }, margin)) return true;
  }
  for (const p of PAVED) if (inRect(x, z, p, margin)) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.radius + margin + 2) return true;
  if (includeOrchard && inRect(x, z, ORCHARD, margin + 2)) return true;
  if (Math.hypot(x - BODHI_TREE.x, z - BODHI_TREE.z) < 6 + margin) return true;
  if (Math.abs(x - MOUNTAIN_GATE.x) < MOUNTAIN_GATE.width && Math.abs(z - MOUNTAIN_GATE.z) < 2 + margin) return true;
  for (const b of BENCHES) if (Math.hypot(x - b.x, z - b.z) < 1.4 + margin * 0.5) return true;
  for (const p of POLES) if (Math.hypot(x - p.x, z - p.z) < 0.8 + margin * 0.5) return true;
  for (const [lx, lz] of STONE_LANTERNS) if (Math.hypot(x - lx, z - lz) < 0.9 + margin * 0.5) return true;
  if (inRect(x, z, { minX: BRIDGE.x - BRIDGE.width / 2, maxX: BRIDGE.x + BRIDGE.width / 2, minZ: BRIDGE.z0, maxZ: BRIDGE.z1 }, margin + 1)) return true;
  if (inRect(x, z, WISH_GARDEN, margin)) return true;
  const sc = STUPA_COURT;
  if (Math.abs(x - sc.x) < sc.half + 2 + margin && Math.abs(z - sc.z) < sc.half + 2 + margin) return true;
  for (const p of PAGODAS) if (Math.hypot(x - p.x, z - p.z) < 8 + margin) return true;
  if (Math.hypot(x - ABBOT.x, z - ABBOT.z) < 8 + margin || inRect(x, z, DORM, margin + 1)) return true;
  if (Math.hypot(x - DRAGON_POOL.x, z - DRAGON_POOL.z) < DRAGON_POOL.r + 2.5 + margin || Math.hypot(x - DRAGON_SPRING.x, z - DRAGON_SPRING.z) < 3 + margin) return true;
  if (inRect(x, z, { minX: POND_PAVILION.walkX0 - 3, maxX: POND_PAVILION.walkX1, minZ: POND_PAVILION.z - 4, maxZ: POND_PAVILION.z + 4 }, margin)) return true;
  if (FOOTPATHS.some((p) => distToPolyline(p, x, z) < 1.3 + margin * 0.5)) return true;
  for (const t of PICNIC_TABLES) if (Math.hypot(x - t.x, z - t.z) < 2.2 + margin) return true;
  for (const b of FOOT_BRIDGES) if (Math.hypot(x - b.x, z - b.z) < b.length / 2 + 1 + margin) return true;
  const c = LANTERN_CANOPY;
  if (inRect(x, z, { minX: -c.x - 0.5, maxX: c.x + 0.5, minZ: c.z0 - 0.5, maxZ: c.z1 + 0.5 }, margin)) return true;
  if (Math.hypot(x - INCENSE_BURNER.x, z - INCENSE_BURNER.z) < 3 + margin || Math.hypot(x - STELE.x, z - STELE.z) < 1.5 + margin) return true;
  if (nearestRiver(x, z).d < 2.8 + margin) return true;
  for (const w of WHEEL_ROWS) {
    const z1 = w.zStart + (w.count - 1) * w.spacing;
    if (inRect(x, z, { minX: w.x - 1.5, maxX: w.x + 1.5, minZ: w.zStart - 1, maxZ: z1 + 1 }, margin)) return true;
  }
  return false;
}

/** Keep trees out of the sightline from the temple to the waterfall: along the stream, widening toward the falls. */
export function inStreamVista(x: number, z: number) {
  if (Math.hypot(x - WATERFALL.x, z - WATERFALL.z) < 24) return true;
  if (!nearStream(x, z)) return false;
  const q = nearestOnStream(x, z);
  return q.behind > -2 && q.d < 6 + 12 * (1 - smoothstep(10, 70, q.s));
}

export const basinDist = (x: number, z: number) => Math.hypot(x - BASIN.x, z - BASIN.z);

export function distToPolyline(pts: [number, number][], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
