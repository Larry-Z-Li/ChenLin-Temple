import type * as THREE from 'three';

/**
 * Small moving things (deer, cats) stop being drawn beyond a distance: at that range they're a few
 * pixels, but each costs dozens of draw calls. Checked a few times a second.
 */
const items: { obj: THREE.Object3D; dist: number }[] = [];
let acc = 1;

export function cullFar(obj: THREE.Object3D, dist: number) {
  items.push({ obj, dist });
}

/** `scale` widens the distances (e.g. 2 on high graphics). */
export function updateFarCull(dt: number, eye: THREE.Vector3, scale: number) {
  if ((acc += dt) < 0.3) return;
  acc = 0;
  for (const it of items) {
    const p = it.obj.position, d = it.dist * scale;
    it.obj.visible = (p.x - eye.x) ** 2 + (p.z - eye.z) ** 2 < d * d;
  }
}
