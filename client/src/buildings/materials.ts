import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared standard material by colour (+ optional params). */
export function mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts })));
  return m;
}

/** Box mesh whose *bottom* sits at y (more convenient for architecture). */
export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function cylinder(rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Hip roof over a W×D rectangle, rising H, with its base at y=0.
 * Flat-shaded; double-sided so the underside reads as a vaulted ceiling.
 */
export function hipRoofGeometry(W: number, D: number, H: number) {
  const rl = Math.min(W / 2 - 0.5, Math.max(0, (W - D) / 2) + Math.min(W, D) * 0.12);
  const p0 = [-W / 2, 0, D / 2], p1 = [W / 2, 0, D / 2], p2 = [W / 2, 0, -D / 2], p3 = [-W / 2, 0, -D / 2];
  const r0 = [-rl, H, 0], r1 = [rl, H, 0];
  const tris = [p0, p1, r1, p0, r1, r0, p2, p3, r0, p2, r0, r1, p1, p2, r1, p3, p0, r0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return { geometry: g, ridgeHalf: rl };
}
