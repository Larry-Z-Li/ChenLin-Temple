import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASIN, STUPA_RIDGE, WATERFALL } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { lerp, mulberry32, range } from '../core/math';
import { nearestRiver } from '../world/stream';
import { terrainHeight } from '../world/terrain';

export interface StupaSpot { x: number; z: number; y: number; yaw: number; s: number }
import { mat } from './materials';

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const slab = (w: number, h: number, y: number) => new THREE.BoxGeometry(w, h, w).translate(0, y + h / 2, 0);
const disc = (rt: number, rb: number, h: number, y: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y + h / 2, 0);

/** Tibetan-style chörten, ~10 m: stepped base, vase dome, harmika, 13-ring spire, parasol, finial. */
function stupaGeometries() {
  const stone = merge([slab(6.6, 3, -3)]); // foundation, buried into slopes
  const white = merge([
    slab(6.2, 1.0, 0),
    slab(5.2, 0.8, 1.0),
    slab(4.3, 0.7, 1.8),
    new THREE.LatheGeometry(
      [[1.6, 2.6], [1.9, 3.2], [2.1, 4.0], [2.05, 4.6], [1.7, 5.1], [1.0, 5.45], [0.001, 5.55]].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
    slab(1.5, 0.9, 5.45), // harmika
  ]);
  const accent = merge([slab(4.45, 0.14, 2.5), slab(1.85, 0.16, 6.35)]);
  const rings: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 13; i++) {
    const r = lerp(0.78, 0.32, i / 12);
    rings.push(disc(r * 0.92, r, 0.17, 6.51 + i * 0.19, 16));
  }
  const gold = merge([
    ...rings,
    disc(0.55, 0.78, 0.14, 9.0), // parasol
    new THREE.SphereGeometry(0.22, 14, 10).translate(0, 9.38, 0), // sun / jewel
    new THREE.ConeGeometry(0.12, 0.42, 12).translate(0, 9.78, 0), // finial
  ]);
  return { stone, white, accent, gold };
}

export function buildStupas(ctx: WorldContext) {
  const { count, bearingFrom, bearingTo, rMin, rMax, seed } = STUPA_RIDGE;
  const rng = mulberry32(seed);
  const at = (az: number, r: number) => ({ x: BASIN.x + Math.sin(az) * r, z: BASIN.z + Math.cos(az) * r });

  const spots: StupaSpot[] = [];
  let az = bearingFrom, prevR: number | null = null;
  while (spots.length < count && az < bearingTo) {
    // Best knoll along this bearing: highest point once the general outward rise is discounted.
    let best = -Infinity, bestR = rMin;
    for (let r = rMin; r <= rMax; r += 3) {
      const p = at(az, r), score = terrainHeight(p.x, p.z) - 0.3 * r;
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
    // Sit on the lowest corner so the base never floats; the foundation hides the uphill side.
    let y = Infinity;
    for (const [dx, dz] of [[0, 0], [3, 3], [-3, 3], [3, -3], [-3, -3]]) y = Math.min(y, terrainHeight(p.x + dx, p.z + dz));
    spots.push({ ...p, y: y - 0.2, yaw: Math.atan2(BASIN.x - p.x, BASIN.z - p.z) + range(rng, -0.25, 0.25), s: range(rng, 0.9, 1.1) });
    // Irregular spacing: mostly 12–26 m, sometimes a close pair, sometimes a longer gap.
    const roll = rng();
    const gap = roll < 0.18 ? range(rng, 7, 10) : roll < 0.85 ? range(rng, 12, 26) : range(rng, 32, 48);
    az += gap / r;
  }

  const geos = stupaGeometries();
  const mats = {
    stone: mat(0x8f8a80, { roughness: 1 }),
    white: mat(0xf1ede3, { roughness: 0.85 }),
    accent: mat(0x9c3b22, { roughness: 0.7 }),
    gold: mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 }),
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const key of Object.keys(geos) as (keyof typeof geos)[]) {
    const mesh = new THREE.InstancedMesh(geos[key], mats[key], spots.length);
    spots.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(p.s, p.s, p.s))));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
  }
  return spots;
}
