import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture } from '../core/textures';

let geo: THREE.BufferGeometry | null = null;
let mat: THREE.Material | null = null;

/**
 * Auspicious cloud (祥雲): a cluster of soft puffs with a curling tail, faintly gold-lit.
 * Front is −Z (the rider faces forward), the tail curls behind (+Z). Top sits ~0.4 m above the origin.
 */
export function makeCloud() {
  if (!geo) {
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 0.78], [0.62, 0.05, 0.1, 0.58], [-0.6, 0.02, -0.05, 0.6], [0.2, 0.25, 0.4, 0.5],
      [-0.25, 0.22, -0.4, 0.5], [0.05, 0.1, -0.62, 0.5], [0.1, 0.1, 0.62, 0.52],
      // curling tail
      [-0.2, 0.05, 1.15, 0.36], [-0.55, 0.15, 1.5, 0.27], [-0.9, 0.3, 1.7, 0.19], [-1.15, 0.5, 1.72, 0.12],
    ];
    geo = mergeGeometries(puffs.map(([x, y, z, r]) => new THREE.SphereGeometry(r, 14, 10).translate(x, y, z)));
    geo.scale(1, 0.55, 1);
    mat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xffdc96, emissiveIntensity: 0.45, roughness: 1 });
  }
  const mesh = new THREE.Mesh(geo, mat!);
  mesh.castShadow = true;
  // A soft golden halo so the cloud gently glows.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd98a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(4.2, 2.6, 1);
  halo.position.set(0, 0.05, 0.2);
  mesh.add(halo);
  return mesh;
}

/** Height of the cloud's top above its origin (where a rider's feet go). */
export const CLOUD_TOP = 0.38;
