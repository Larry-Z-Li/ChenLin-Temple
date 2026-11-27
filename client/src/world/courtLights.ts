import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GREAT_STUPA, STUPA_COURT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, smoothstep } from '../core/math';
import { addLamp } from './lightPool';
import { haloPoints, nightGlow } from './nightGlow';

/**
 * The stupa court after dark: well lights set flush in the paving (a round bronze bezel with two screws, a recessed
 * glass lens glowing within, a bed of dark pebbles round it), a ring of them round the great stupa's platform and
 * another inside the court's walls. Each throws a faint glow upward and lights the paving round it (see lightPool's
 * night light map). Flush, so nothing to trip on. Call before the night lights are built.
 */
export function buildCourtLights(ctx: WorldContext) {
  const rng = mulberry32(77);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5c4630, metalness: 0.65, roughness: 0.42 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.2, emissive: 0xffd49a, emissiveIntensity: 0.15 });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffdcaa, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  nightGlow.track((n) => {
    const k = smoothstep(0.15, 0.6, n);
    lensMat.emissiveIntensity = 0.15 + 1.8 * k;
    beamMat.opacity = 0.05 * k;
  });
  // one fixture, at its own origin: the bezel turned on a lathe (in at the lens, a low rounded rim, out to a thin
  // edge on the paving), two screw heads in it, the lens down in the well, and the faint glow rising out of it
  const bezel = mergeGeometries([
    new THREE.LatheGeometry([[0.118, 0.004], [0.122, 0.024], [0.135, 0.03], [0.2, 0.031], [0.228, 0.024], [0.242, 0.01], [0.246, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 32),
    ...[0.75, 0.75 + Math.PI].map((a) => new THREE.CylinderGeometry(0.011, 0.011, 0.008, 6).translate(Math.cos(a) * 0.19, 0.034, Math.sin(a) * 0.19)),
  ]);
  const lens = new THREE.CircleGeometry(0.118, 24).rotateX(-Math.PI / 2).translate(0, 0.008, 0);
  const beam = new THREE.CylinderGeometry(0.5, 0.11, 2.6, 16, 1, true).translate(0, 1.3 + 0.01, 0);

  const bezels: THREE.BufferGeometry[] = [], lenses: THREE.BufferGeometry[] = [], beams: THREE.BufferGeometry[] = [], glow: number[] = [], glowCol: number[] = [];
  const spots: [number, number, number][] = [];
  const rings = [GREAT_STUPA.base / 2 + 3.2, STUPA_COURT.half - 5.5], step = 3.4;
  for (const half of rings) {
    const n = Math.max(4, Math.round((half * 2) / step)); // per side
    for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
      const t = -half + (k * 2 * half) / n, [x, z] = side === 0 ? [t, -half] : side === 1 ? [half, t] : side === 2 ? [-t, half] : [-half, -t];
      const wx = STUPA_COURT.x + x, wz = STUPA_COURT.z + z, y = ctx.ground.heightAt(wx, wz), ry = rng() * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(wx, y, wz);
      bezels.push(bezel.clone().applyMatrix4(m));
      lenses.push(lens.clone().applyMatrix4(m));
      beams.push(beam.clone().applyMatrix4(m));
      spots.push([wx, y, wz]);
      glow.push(wx, y + 0.1, wz);
      glowCol.push(1, 0.84, 0.58);
      addLamp({ x: wx, y: y + 0.3, z: wz, color: 0xffd09a, intensity: 3.2, range: 5, decay: 1.5, ground: true });
    }
  }
  // the pebble beds: a ring of small dark river stones round each, in one draw
  const PER = 16, pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), spots.length * PER);
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(), ps = new THREE.Vector3(), pp = new THREE.Vector3(), pc = new THREE.Color();
  let i = 0;
  for (const [x, y, z] of spots)
    for (let k = 0; k < PER; k++) {
      const a = (k / PER) * Math.PI * 2 + rng() * 0.3, r = 0.29 + rng() * 0.16, s = 0.03 + rng() * 0.025;
      pp.set(x + Math.cos(a) * r, y + s * 0.25, z + Math.sin(a) * r);
      ps.set(s * (1 + rng() * 0.5), s * 0.6, s);
      pm.compose(pp, pq.setFromEuler(pe.set(0, rng() * 6, 0)), ps);
      pebbles.setMatrixAt(i, pm);
      pebbles.setColorAt(i++, pc.setHSL(0.08 + rng() * 0.04, 0.12 + rng() * 0.1, 0.12 + rng() * 0.16));
    }
  pebbles.receiveShadow = true;
  const rim = new THREE.Mesh(mergeGeometries(bezels), bronze), glass = new THREE.Mesh(mergeGeometries(lenses), lensMat), rays = new THREE.Mesh(mergeGeometries(beams), beamMat);
  rim.receiveShadow = true;
  rays.renderOrder = 2;
  ctx.scene.add(rim, glass, rays, pebbles, haloPoints(glow, glowCol, 0.9, 0.55));
}
