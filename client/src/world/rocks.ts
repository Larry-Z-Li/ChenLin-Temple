import * as THREE from 'three';
import { BASIN } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, noise2 } from '../core/math';
import { nearestRiver } from './stream';
import { terrainHeight } from './terrain';
import { isReserved } from './zones';

/**
 * Boulders and outcrops over the land: thick on the mountainsides and the steep ground, scattered sparsely over the
 * meadows, in clusters rather than evenly. A few shapes, instanced, half sunk into the ground.
 */
export function buildRocks(ctx: WorldContext) {
  const rng = mulberry32(51);
  const shapes = [0, 1, 2].map((s) => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.24 * (noise2(x * 1.4 + s * 7, z * 1.4 + y) - 0.5) * 2;
      p.setXYZ(i, x * k, y * k * (0.55 + s * 0.12), z * k * (0.8 + s * 0.15)); // flattish, each its own way
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const per: THREE.Matrix4[][] = [[], [], []], cols: THREE.Color[][] = [[], [], []];
  const d = new THREE.Object3D();
  const put = (x: number, z: number, size: number) => {
    const e = 1.5, y = terrainHeight(x, z);
    const slope = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    d.position.set(x, y - size * 0.3, z);
    d.rotation.set((rng() - 0.5) * 0.4 + slope * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
    d.scale.setScalar(size);
    d.updateMatrix();
    const s = Math.floor(rng() * 3);
    per[s].push(d.matrix.clone());
    cols[s].push(new THREE.Color().setHSL(0.09 + rng() * 0.04, 0.06 + rng() * 0.05, 0.2 + rng() * 0.08));
  };
  let placed = 0;
  for (let t = 0; t < 30000 && placed < 350; t++) {
    const a = rng() * Math.PI * 2, r = 60 + Math.sqrt(rng()) * 400, x = BASIN.x + Math.sin(a) * r, z = BASIN.z + Math.cos(a) * r;
    const cluster = noise2(x * 0.018, z * 0.018); // rocks gather in some places, not others
    const e = 2, slope = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    const mountain = r > BASIN.radius - 5;
    const want = (mountain ? 0.08 + Math.min(0.4, slope * 0.5) : 0.008) * Math.max(0, cluster * 1.8 - 0.55);
    if (rng() > want) continue;
    if (isReserved(x, z, 3) || nearestRiver(x, z).d < 6) continue;
    const size = (mountain ? 0.6 + rng() * rng() * 3.2 : 0.35 + rng() * 0.8) * (1 + slope * 0.4);
    put(x, z, size);
    placed++;
    // a few smaller ones tumbled round the big ones
    if (size > 2.2) for (let k = 0; k < 2; k++) { const b = rng() * 6.28, q = size * (1.3 + rng()); if (!isReserved(x + Math.cos(b) * q, z + Math.sin(b) * q, 2)) put(x + Math.cos(b) * q, z + Math.sin(b) * q, size * (0.25 + rng() * 0.3)); }
  }
  per.forEach((ms, s) => {
    if (!ms.length) return;
    const im = new THREE.InstancedMesh(shapes[s], mat, ms.length);
    ms.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[s][i]); });
    im.receiveShadow = true;
    im.computeBoundingSphere();
    ctx.scene.add(im);
  });
}
