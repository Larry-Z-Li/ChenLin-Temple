import * as THREE from 'three';
import { HALLS, PLATFORM_H } from '../config/layout';
import type { WorldContext } from '../core/context';

/** Leaves and petals drifting on the breeze around the visitor (hidden on low graphics). */
export function buildLeaves(ctx: WorldContext, camera: THREE.Camera) {
  const N = 140;
  const geo = new THREE.PlaneGeometry(0.11, 0.07);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), N);
  const palette = [0x6f9a45, 0x8fb04a, 0xd9a43a, 0xd8742a, 0xc8452c, 0xf4b6c8, 0xf7c9d6].map((c) => new THREE.Color(c));
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  ctx.detailMeshes.push(mesh);

  const indoors = (x: number, z: number, y: number) =>
    HALLS.some((h) => Math.abs(x - h.x) < h.width / 2 + 2.5 && Math.abs(z - h.z) < h.depth / 2 + 2.5 && y < PLATFORM_H + h.wallHeight + 6);

  const leaves = Array.from({ length: N }, (_, i) => {
    mesh.setColorAt(i, palette[i % palette.length]);
    return { p: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), phase: Math.random() * 10, alive: false };
  });
  const spawn = (l: (typeof leaves)[number], anywhere: boolean) => {
    for (let tries = 0; tries < 6; tries++) {
      const x = camera.position.x + (Math.random() - 0.5) * 50, z = camera.position.z + (Math.random() - 0.5) * 50;
      const g = ctx.ground.heightAt(x, z);
      const y = g + (anywhere ? Math.random() * 12 : 9 + Math.random() * 5);
      if (indoors(x, z, y)) continue;
      l.p.set(x, y, z);
      l.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      l.spin.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
      l.alive = true;
      return;
    }
    l.alive = false;
  };

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let first = true;
  ctx.updaters.push((dt, time) => {
    if (!mesh.visible) return;
    // A slowly turning breeze.
    const wx = Math.cos(time * 0.05) * 0.9, wz = Math.sin(time * 0.05) * 0.9;
    leaves.forEach((l, i) => {
      if (first || !l.alive) spawn(l, first);
      if (!l.alive) return mesh.setMatrixAt(i, zero);
      l.p.x += (wx + Math.sin(time * 1.7 + l.phase) * 0.45) * dt;
      l.p.z += (wz + Math.cos(time * 1.3 + l.phase) * 0.45) * dt;
      l.p.y -= (0.45 + Math.sin(time * 2.1 + l.phase) * 0.25) * dt;
      l.rot.x += l.spin.x * dt;
      l.rot.y += l.spin.y * dt;
      l.rot.z += l.spin.z * dt;
      const far = Math.hypot(l.p.x - camera.position.x, l.p.z - camera.position.z) > 32;
      if (far || l.p.y < ctx.ground.heightAt(l.p.x, l.p.z) || indoors(l.p.x, l.p.z, l.p.y)) l.alive = false;
      mesh.setMatrixAt(i, m.compose(l.p, q.setFromEuler(l.rot), one));
    });
    first = false;
    mesh.instanceMatrix.needsUpdate = true;
  });
}
