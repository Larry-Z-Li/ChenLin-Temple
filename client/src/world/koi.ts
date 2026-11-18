import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POND } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';

/** Koi gliding in slow loops under the lotus pond's surface. Model faces −Z (head forward). */
export function buildKoi(ctx: WorldContext) {
  const rng = mulberry32(88);
  const parts = [
    new THREE.SphereGeometry(0.1, 12, 8).scale(0.55, 0.38, 1.5),
    new THREE.ConeGeometry(0.075, 0.16, 4).rotateX(-Math.PI / 2).scale(0.25, 1, 1).translate(0, 0, 0.22), // tail
    new THREE.BoxGeometry(0.16, 0.008, 0.05).translate(0, -0.01, -0.03), // fins
  ].map((g) => g.toNonIndexed());
  const geo = mergeGeometries(parts);
  const N = 16;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), N);
  const palette = [0xff7a1a, 0xf4efe6, 0xd8342c, 0xffb43a, 0xf6f2ea, 0xe8561c].map((c) => new THREE.Color(c));
  const fish = Array.from({ length: N }, (_, i) => {
    mesh.setColorAt(i, palette[i % palette.length]);
    return {
      cx: POND.x + range(rng, -4, 4), cz: POND.z + range(rng, -4, 4),
      r: range(rng, 3, POND.radius - 5), w: range(rng, 0.12, 0.3) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * Math.PI * 2, y: range(rng, -0.62, -0.85), s: range(rng, 1.1, 1.8),
    };
  });
  ctx.scene.add(mesh);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  ctx.updaters.push((_dt, time) => {
    fish.forEach((f, i) => {
      const a = f.phase + f.w * time;
      const wob = Math.sin(time * 0.5 + f.phase) * 1.2;
      p.set(f.cx + Math.cos(a) * (f.r + wob), f.y, f.cz + Math.sin(a) * (f.r + wob));
      // Heading along the circle (tangent), plus a little tail-driven wiggle.
      const dx = -Math.sin(a) * Math.sign(f.w), dz = Math.cos(a) * Math.sign(f.w);
      const yaw = Math.atan2(-dx, -dz) + Math.sin(time * 5 + f.phase) * 0.12;
      mesh.setMatrixAt(i, m.compose(p, q.setFromAxisAngle(up, yaw), sc.setScalar(f.s)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}
