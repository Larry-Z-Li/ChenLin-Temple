import * as THREE from 'three';

/**
 * The world's things (buildings, trees, rocks, benches…) are drawn only within a fixed distance of the camera; the
 * lights (glows: sprites and points) aren't things and stay drawn from anywhere, so far off the temple is its lamps,
 * like a city at night. Each thing's world bounds are measured once; checked a few times a second.
 */
const items: { obj: THREE.Object3D; c: THREE.Vector3; r: number }[] = [];
let acc = 1;

/**
 * Take on everything already in the scene that stays put: meshes (instanced too) whose bounds are known, that aren't
 * huge (the ground, water and sky go on regardless), that manage their own visibility (frustumCulled off: things that
 * follow you about), that move (`userData.dynamic`) or that are culled elsewhere (`skip`: deer, cats).
 */
export function registerDrawDistance(scene: THREE.Scene, skip: Set<THREE.Object3D>) {
  scene.updateMatrixWorld(true);
  const s = new THREE.Sphere();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.frustumCulled || m.userData.dynamic || skip.has(m)) return;
    for (let a: THREE.Object3D | null = m; a; a = a.parent) if (skip.has(a) || a.userData.dynamic) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      const im = m as THREE.InstancedMesh;
      if (!im.boundingSphere) im.computeBoundingSphere();
      if (!im.boundingSphere || im.count === 0) return;
      s.copy(im.boundingSphere);
    } else {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      s.copy(g.boundingSphere);
    }
    s.applyMatrix4(m.matrixWorld);
    if (!(s.radius < 160)) return;
    items.push({ obj: m, c: s.center.clone(), r: s.radius });
  });
  return items.length;
}

/** Show what's within `dist` metres of `eye` (its nearest edge), hide the rest. */
export function updateDrawDistance(dt: number, eye: THREE.Vector3, dist: number) {
  if ((acc += dt) < 0.25) return;
  acc = 0;
  for (const it of items) {
    const d = Math.hypot(it.c.x - eye.x, it.c.y - eye.y, it.c.z - eye.z) - it.r;
    it.obj.visible = d < dist;
  }
}
