import { terrainHeight } from '../world/terrain';

/** Walkable surfaces raised above the terrain: hall platforms (pads) and stairs (ramps). */
interface Pad { minX: number; maxX: number; minZ: number; maxZ: number; h: number }
/** Linear ramp along Z: height h0 at z0 → h1 at z1. */
interface Ramp { minX: number; maxX: number; z0: number; z1: number; h0: number; h1: number }

export class Ground {
  private pads: Pad[] = [];
  private ramps: Ramp[] = [];
  private rampsX: { minZ: number; maxZ: number; x0: number; x1: number; h0: number; h1: number }[] = [];
  private surfaces: { minX: number; maxX: number; minZ: number; maxZ: number; f: (x: number, z: number) => number | null }[] = [];

  /** Any walkable shape within a box: `f` gives the height there, or null where it has none. */
  addSurface(minX: number, maxX: number, minZ: number, maxZ: number, f: (x: number, z: number) => number | null) {
    this.surfaces.push({ minX, maxX, minZ, maxZ, f });
  }

  addPad(minX: number, maxX: number, minZ: number, maxZ: number, h: number) {
    this.pads.push({ minX, maxX, minZ, maxZ, h });
  }

  addRamp(minX: number, maxX: number, z0: number, z1: number, h0: number, h1: number) {
    this.ramps.push({ minX, maxX, z0, z1, h0, h1 });
  }

  /** Linear ramp along X: height h0 at x0 → h1 at x1. */
  addRampX(minZ: number, maxZ: number, x0: number, x1: number, h0: number, h1: number) {
    this.rampsX.push({ minZ, maxZ, x0, x1, h0, h1 });
  }

  heightAt(x: number, z: number) {
    let h = terrainHeight(x, z);
    for (const p of this.pads) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) h = Math.max(h, p.h);
    for (const r of this.ramps) {
      const lo = Math.min(r.z0, r.z1), hi = Math.max(r.z0, r.z1);
      if (x >= r.minX && x <= r.maxX && z >= lo && z <= hi) {
        const t = (z - r.z0) / (r.z1 - r.z0);
        h = Math.max(h, r.h0 + (r.h1 - r.h0) * t);
      }
    }
    for (const r of this.rampsX) {
      const lo = Math.min(r.x0, r.x1), hi = Math.max(r.x0, r.x1);
      if (z >= r.minZ && z <= r.maxZ && x >= lo && x <= hi) h = Math.max(h, r.h0 + ((r.h1 - r.h0) * (x - r.x0)) / (r.x1 - r.x0));
    }
    for (const s of this.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const v = s.f(x, z);
      if (v !== null) h = Math.max(h, v);
    }
    return h;
  }
}
