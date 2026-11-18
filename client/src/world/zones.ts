import { BASIN, BENCHES, BODHI_TREE, BRIDGE, FLAG_LINES, HALLS, INCENSE_BURNER, LANTERN_CANOPY, MOUNTAIN_GATE, ORCHARD, PAVED, POND, STELE, STONE_LANTERNS, WATERFALL, WHEEL_ROWS, type Rect } from '../config/layout';
import { smoothstep } from '../core/math';
import { nearestOnStream, nearStream } from './stream';

const POLES = FLAG_LINES.flat().filter((a) => a.pole);

const inRect = (x: number, z: number, r: Rect, m: number) => x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m;

/** True if (x,z) is reserved for buildings, paths, water etc. — keep vegetation out. */
export function isReserved(x: number, z: number, margin = 1.5, includeOrchard = true) {
  for (const h of HALLS) {
    // halls + stairs + porch
    if (inRect(x, z, { minX: h.x - h.width / 2, maxX: h.x + h.width / 2, minZ: h.z - h.depth / 2 - 2, maxZ: h.z + h.depth / 2 + 4 }, margin + 2)) return true;
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
  const c = LANTERN_CANOPY;
  if (inRect(x, z, { minX: -c.x - 0.5, maxX: c.x + 0.5, minZ: c.z0 - 0.5, maxZ: c.z1 + 0.5 }, margin)) return true;
  if (Math.hypot(x - INCENSE_BURNER.x, z - INCENSE_BURNER.z) < 3 + margin || Math.hypot(x - STELE.x, z - STELE.z) < 1.5 + margin) return true;
  if (nearStream(x, z) && nearestOnStream(x, z).d < 2.6 + margin) return true;
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
