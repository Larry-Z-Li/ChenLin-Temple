import * as THREE from 'three';
import { HALLS, hallHalf, PLATFORM_H } from '../config/layout';

/**
 * Hall interiors (altars, statues, cushions, furnishings, lanterns) are much of what's left to draw,
 * and from outside, a little way off, you only glimpse them through the door. Everything wholly
 * inside a hall's walls goes on that hall's own render layer, which the camera drops at a distance
 * (shadows follow the camera's layers, so those go too).
 */
const zones = HALLS.map((h, i) => {
  const [ex, ez] = hallHalf(h);
  // up to the top of the walls: the roofs (and a two-tier hall's upper storey, which sits inside the
  // walls' outline) are outside, and must never be hidden with the interior
  return { x: h.x, z: h.z, ex, ez, top: PLATFORM_H + h.wallHeight + 0.05, layer: i + 1 };
});
/** Walls are 0.4 m thick and centred on the hall's edge; anything past their inner face is outside. */
const INNER = 0.25;

/** The hall (its layer number) whose inside the point (x, z) is in, or 0. */
export function hallAt(x: number, z: number) {
  for (const h of zones) if (Math.abs(x - h.x) < h.ex - INNER && Math.abs(z - h.z) < h.ez - INNER) return h.layer;
  return 0;
}
/** Interiors show within this distance of a hall's walls (doubled on high graphics). */
const NEAR = 28;

const box = new THREE.Box3();
const pt = new THREE.Vector3();

/** The hall (layer number) that `o` sits wholly inside, or 0. World matrices must be current. */
export function interiorLayer(o: THREE.Object3D): number {
  const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if ((o as THREE.InstancedMesh).isInstancedMesh) {
    const im = o as THREE.InstancedMesh;
    if (!im.boundingBox) im.computeBoundingBox();
    box.copy(im.boundingBox!).applyMatrix4(o.matrixWorld);
  } else if ((o as THREE.Sprite).isSprite) {
    box.setFromPoints([pt.setFromMatrixPosition(o.matrixWorld)]);
  } else if (g?.attributes?.position && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) {
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox!).applyMatrix4(o.matrixWorld);
  } else return 0;
  if (box.isEmpty()) return 0; // (nothing in it yet, e.g. an instanced mesh still to be filled: an empty box is "inside" every hall)
  for (const z of zones) {
    const ix = z.ex - INNER, iz = z.ez - INNER;
    if (box.max.y <= z.top && box.min.x >= z.x - ix && box.max.x <= z.x + ix && box.min.z >= z.z - iz && box.max.z <= z.z + iz) return z.layer;
  }
  return 0;
}

/**
 * Once the world is built (and merged): put every interior thing on its hall's layer. `skip` holds
 * things that wander (deer, cats) — they must not vanish with a hall they happened to start in.
 */
export function assignInteriors(scene: THREE.Scene, skip: Set<THREE.Object3D>) {
  scene.updateMatrixWorld(true);
  let n = 0;
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || (o as THREE.Light).isLight) return;
    const k = interiorLayer(o);
    if (k) (o.layers.set(k), n++);
    for (const c of o.children) visit(c);
  };
  visit(scene);
  return n;
}

/** Each frame: show the interiors of halls the camera is near or inside. `scale` widens the distance. */
export function updateInteriors(camera: THREE.Camera, scale: number) {
  const p = camera.position, d = NEAR * scale;
  for (const z of zones) {
    const dx = Math.max(0, Math.abs(p.x - z.x) - z.ex), dz = Math.max(0, Math.abs(p.z - z.z) - z.ez);
    if (dx * dx + dz * dz < d * d) camera.layers.enable(z.layer);
    else camera.layers.disable(z.layer);
  }
}
