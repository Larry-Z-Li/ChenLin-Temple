/** 2D (XZ-plane) collision world: boxes + circles in a uniform spatial hash. */

// (`sky`: up on the model gallery's platform, far above the valley; there, only these count, and down here, only the rest)
interface Box { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number; sky?: boolean }
interface Circle { kind: 'circle'; x: number; z: number; r: number; sky?: boolean }
const SKY_Y = 200;
type Collider = Box | Circle;

const CELL = 8;

export class CollisionWorld {
  private grid = new Map<number, Collider[]>();

  private key(cx: number, cz: number) {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  private insert(c: Collider, minX: number, maxX: number, minZ: number, maxZ: number) {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = this.key(cx, cz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
      }
  }

  addBox(minX: number, maxX: number, minZ: number, maxZ: number, sky = false) {
    this.insert({ kind: 'box', minX, maxX, minZ, maxZ, sky }, minX, maxX, minZ, maxZ);
  }

  /** Box from centre + full size. */
  addBoxCentered(x: number, z: number, w: number, d: number, sky = false) {
    this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, sky);
  }

  addCircle(x: number, z: number, r: number, sky = false) {
    this.insert({ kind: 'circle', x, z, r, sky }, x - r, x + r, z - r, z + r);
  }

  /** Push a circle of `radius` at (x,z) out of all colliders. Mutates and returns `p`. */
  resolve(p: { x: number; z: number; y?: number }, radius: number) {
    const sky = Math.abs(p.y ?? 0) > SKY_Y; // (the model gallery: far above, or below, the valley)
    for (let iter = 0; iter < 3; iter++) {
      const list = this.grid.get(this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
      const seen = new Set<Collider>();
      let moved = false;
      // Check the 3x3 neighbourhood
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = dx === 0 && dz === 0 ? list : this.grid.get(this.key(Math.floor(p.x / CELL) + dx, Math.floor(p.z / CELL) + dz));
          if (!cell) continue;
          for (const c of cell) {
            if (seen.has(c)) continue;
            seen.add(c);
            if (!!c.sky !== sky) continue;
            if (c.kind === 'circle') {
              const ddx = p.x - c.x, ddz = p.z - c.z;
              const d = Math.hypot(ddx, ddz), min = c.r + radius;
              if (d < min) {
                const nx = d > 1e-5 ? ddx / d : 1, nz = d > 1e-5 ? ddz / d : 0;
                p.x = c.x + nx * min;
                p.z = c.z + nz * min;
                moved = true;
              }
            } else {
              const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
              const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
              const ddx = p.x - cx, ddz = p.z - cz;
              const d2 = ddx * ddx + ddz * ddz;
              if (d2 > 1e-10) {
                if (d2 < radius * radius) {
                  const d = Math.sqrt(d2);
                  p.x = cx + (ddx / d) * radius;
                  p.z = cz + (ddz / d) * radius;
                  moved = true;
                }
              } else {
                // Centre is inside the box: exit via the shallowest side.
                const l = p.x - c.minX, r = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z;
                const m = Math.min(l, r, b, f);
                if (m === l) p.x = c.minX - radius;
                else if (m === r) p.x = c.maxX + radius;
                else if (m === b) p.z = c.minZ - radius;
                else p.z = c.maxZ + radius;
                moved = true;
              }
            }
          }
        }
      if (!moved) break;
    }
    return p;
  }
}
