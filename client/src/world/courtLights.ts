import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GREAT_STUPA, PAVED, STUPA_COURT } from '../config/layout';

/** The top of the paving slabs (decor.ts lays them 0.1 m thick, centred 0.02 m up). */
const PAVING_TOP = 0.071;
import type { WorldContext } from '../core/context';
import { mulberry32, smoothstep } from '../core/math';
import { addLamp } from './lightPool';
import { haloPoints, nightGlow } from './nightGlow';

/**
 * The stupa court after dark: well lights set flush in the paving (a round bronze bezel with two screws, a recessed
 * glass lens glowing within), a ring of them round the great stupa's platform and
 * another inside the court's walls. Each lights the paving round it (see lightPool's
 * night light map). Flush, so nothing to trip on. Call before the night lights are built.
 */
export function buildCourtLights(ctx: WorldContext) {
  const rng = mulberry32(77);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5c4630, metalness: 0.65, roughness: 0.42 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.2, emissive: 0xffd49a, emissiveIntensity: 0.15 });
  nightGlow.track((n) => {
    const k = smoothstep(0.15, 0.6, n);
    lensMat.emissiveIntensity = 0.15 + 1.8 * k;
  });
  // one fixture, at its own origin: the bezel turned on a lathe (in at the lens, a low rounded rim, out to a thin
  // edge on the paving), two screw heads in it, and the lens down in the well
  const bezel = mergeGeometries([
    new THREE.LatheGeometry([[0.118, 0.004], [0.122, 0.024], [0.135, 0.03], [0.2, 0.031], [0.228, 0.024], [0.242, 0.01], [0.246, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 12), // (108 of them: 12 sides read as round at 50 cm)
    ...[0.75, 0.75 + Math.PI].map((a) => new THREE.CylinderGeometry(0.011, 0.011, 0.008, 6).translate(Math.cos(a) * 0.19, 0.034, Math.sin(a) * 0.19)),
  ]);
  const lens = new THREE.CircleGeometry(0.118, 12).rotateX(-Math.PI / 2).translate(0, 0.008, 0);

  const bezels: THREE.BufferGeometry[] = [], lenses: THREE.BufferGeometry[] = [], glow: number[] = [], glowCol: number[] = [];
  const rings = [GREAT_STUPA.base / 2 + 3.2, STUPA_COURT.half - 5.5], step = 3.4;
  for (const half of rings) {
    const n = Math.max(4, Math.round((half * 2) / step)); // per side
    for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
      const t = -half + (k * 2 * half) / n, [x, z] = side === 0 ? [t, -half] : side === 1 ? [half, t] : side === 2 ? [-t, half] : [-half, -t];
      const wx = STUPA_COURT.x + x, wz = STUPA_COURT.z + z, ry = rng() * Math.PI * 2;
      // on the paving where there is some (its slabs' tops are 7 cm up: see decor.ts), not under it
      const y = Math.max(ctx.ground.heightAt(wx, wz), PAVED.some((r) => wx > r.minX && wx < r.maxX && wz > r.minZ && wz < r.maxZ) ? PAVING_TOP : -Infinity);
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(wx, y, wz);
      bezels.push(bezel.clone().applyMatrix4(m));
      lenses.push(lens.clone().applyMatrix4(m));
      glow.push(wx, y + 0.1, wz);
      glowCol.push(1, 0.84, 0.58);
      addLamp({ x: wx, y: y + 0.3, z: wz, color: 0xffd09a, intensity: 3.2, range: 5, decay: 1.5, ground: true });
    }
  }
  const rim = new THREE.Mesh(mergeGeometries(bezels), bronze), glass = new THREE.Mesh(mergeGeometries(lenses), lensMat);
  rim.receiveShadow = true;
  ctx.scene.add(rim, glass, haloPoints(glow, glowCol, 0.9, 0.55));
}
