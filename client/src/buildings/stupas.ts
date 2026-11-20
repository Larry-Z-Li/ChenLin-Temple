import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { lerp } from '../core/math';
import { ridgePlan } from '../world/ridgeWalk';
import { terrainHeight } from '../world/terrain';

export interface StupaSpot { x: number; z: number; y: number; yaw: number; s: number }
import { mat } from './materials';
import { haloPoints, nightGlow } from '../world/nightGlow';

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const slab = (w: number, h: number, y: number) => new THREE.BoxGeometry(w, h, w).translate(0, y + h / 2, 0);
const disc = (rt: number, rb: number, h: number, y: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y + h / 2, 0);

/** Tibetan-style chörten, ~10 m: stepped base, vase dome, harmika, 13-ring spire, parasol, finial. */
function stupaGeometries() {
  const stone = merge([slab(6.8, 8, -8)]); // stone terrace under the base, deep enough for steep slopes
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

/** A small chörten (`height` metres tall) as a plain group, e.g. for the pond pavilion. */
export function smallStupa(height: number) {
  const geos = stupaGeometries();
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(geos.white, mat(0xf1ede3, { roughness: 0.85 })),
    new THREE.Mesh(geos.accent, mat(0x9c3b22, { roughness: 0.7 })),
    new THREE.Mesh(geos.gold, mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 })),
  );
  g.scale.setScalar(height / 9.9);
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));
  return g;
}

export function buildStupas(ctx: WorldContext) {
  // Placed by the ridge plan; they stand on its level terrace (the stone foundation covers any edge).
  const spots: StupaSpot[] = ridgePlan().stupas.map((p) => {
    let y = terrainHeight(p.x, p.z);
    for (let k = 0; k < 12; k++) y = Math.max(y, terrainHeight(p.x + Math.cos(k * 0.5236) * 3.1 * p.s, p.z + Math.sin(k * 0.5236) * 3.1 * p.s));
    return { ...p, y: y + 0.05 };
  });

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
  // After dark the chörtens are lit: the whitewash glows warm and each wears a soft halo.
  const white = mats.white;
  white.emissive.set(0xffd9a0);
  nightGlow.track((n) => (white.emissiveIntensity = 0.55 * n));
  const pos: number[] = [], col: number[] = [], spark: number[] = [], sparkCol: number[] = [];
  for (const p of spots) {
    pos.push(p.x, p.y + 4 * p.s, p.z);
    col.push(1, 0.82, 0.55);
    spark.push(p.x, p.y + 9.4 * p.s, p.z);
    sparkCol.push(1, 0.9, 0.6);
  }
  ctx.scene.add(haloPoints(pos, col, 16, 0.55), haloPoints(spark, sparkCol, 3.5, 0.9));
  return spots;
}
