import { terrainHeight } from '../world/terrain';

/** Walkable surfaces raised above the terrain: hall platforms (pads) and stairs (ramps). */
interface Pad { minX: number; maxX: number; minZ: number; maxZ: number; h: number }
/** Linear ramp along Z: height h0 at z0 → h1 at z1. */
interface Ramp { minX: number; maxX: number; z0: number; z1: number; h0: number; h1: number }

export class Ground {
  private pads: Pad[] = [];
  private ramps: Ramp[] = [];

  addPad(minX: number, maxX: number, minZ: number, maxZ: number, h: number) {
    this.pads.push({ minX, maxX, minZ, maxZ, h });
  }

  addRamp(minX: number, maxX: number, z0: number, z1: number, h0: number, h1: number) {
    this.ramps.push({ minX, maxX, z0, z1, h0, h1 });
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
    return h;
  }
}
