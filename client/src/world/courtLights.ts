import * as THREE from 'three';
import { GREAT_STUPA, STUPA_COURT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addLamp } from './lightPool';
import { haloPoints, nightGlow } from './nightGlow';

/**
 * The stupa court after dark: small lights set flush in the ground, a ring of them round the great stupa's platform
 * and another inside the court's walls, each a warm glowing disc that lights the paving round it (see lightPool's
 * night light map). Call before the night lights are built.
 */
export function buildCourtLights(ctx: WorldContext) {
  const rings = [GREAT_STUPA.base / 2 + 3.2, STUPA_COURT.half - 5.5], step = 3.4;
  const discs: THREE.BufferGeometry[] = [], rims: THREE.BufferGeometry[] = [], glow: number[] = [], glowCol: number[] = [];
  for (const half of rings) {
    const n = Math.max(4, Math.round((half * 2) / step)); // per side
    for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
      const t = -half + (k * 2 * half) / n, [x, z] = side === 0 ? [t, -half] : side === 1 ? [half, t] : side === 2 ? [-t, half] : [-half, -t];
      const wx = STUPA_COURT.x + x, wz = STUPA_COURT.z + z, y = ctx.ground.heightAt(wx, wz);
      discs.push(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12).translate(wx, y + 0.02, wz));
      rims.push(new THREE.CylinderGeometry(0.18, 0.19, 0.025, 12).translate(wx, y + 0.0125, wz));
      glow.push(wx, y + 0.12, wz);
      glowCol.push(1, 0.82, 0.55);
      addLamp({ x: wx, y: y + 0.1, z: wz, color: 0xffd09a, intensity: 4, range: 5, decay: 1.6, ground: true });
    }
  }
  const lens = new THREE.Mesh(mergeGeometries(discs), nightGlow.stoneWindow);
  const rim = new THREE.Mesh(mergeGeometries(rims), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, metalness: 0.6, roughness: 0.4 }));
  lens.receiveShadow = rim.receiveShadow = true;
  ctx.scene.add(rim, lens, haloPoints(glow, glowCol, 0.9, 0.55));
}
