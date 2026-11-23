import * as THREE from 'three';

/**
 * Mock player characters (dev: /mocks.html): stylised and varied in build and dress — all shaven-headed,
 * no gender, nothing in their hands. Each faces +Z with its feet on y = 0.
 */
const m = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const SKIN = 0xe9c9a8, DARK = 0x2a1d1a;
const mesh = (geo: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mt);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
const ball = (r: number, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 20, 14).scale(sx, sy, sz);
const tube = (r0: number, r1: number, h: number) => new THREE.CylinderGeometry(r1, r0, h, 16).translate(0, h / 2, 0);

/** A face on a head of radius r at (0, y, 0): two eyes and a small smile, looking +Z. */
function face(g: THREE.Group, y: number, r: number, closed = false) {
  const eye = closed ? new THREE.TorusGeometry(r * 0.13, r * 0.025, 4, 8, Math.PI) : ball(r * 0.08, 1, 1.25, 0.6);
  for (const s of [-1, 1]) {
    const e = mesh(eye, m(DARK), s * r * 0.33, y + r * 0.08, r * 0.92);
    if (closed) e.rotation.z = Math.PI;
    g.add(e);
  }
  const smile = mesh(new THREE.TorusGeometry(r * 0.16, r * 0.025, 4, 10, Math.PI), m(0x9a4a3a), 0, y - r * 0.22, r * 0.93);
  smile.rotation.z = Math.PI;
  g.add(smile);
  for (const s of [-1, 1]) g.add(mesh(ball(r * 0.12, 1, 0.7, 0.4), m(0xf0a8a0, { transparent: true, opacity: 0.55 }), s * r * 0.55, y - r * 0.1, r * 0.8)); // blush
}

/** A bald head of radius r at height y, with a face (eyes closed in a smile if `calm`) and small ears. */
function head(g: THREE.Group, y: number, r: number, calm = false, sx = 1) {
  g.add(mesh(ball(r, sx, 1, 1), m(SKIN), 0, y, 0));
  for (const s of [-1, 1]) g.add(mesh(ball(r * 0.22, 0.6, 1, 0.8), m(SKIN), s * r * sx, y, -r * 0.05));
  face(g, y, r, calm);
}
const hands = (g: THREE.Group, y: number, z: number, r = 0.055) => g.add(mesh(ball(r, 1, 0.75, 0.55), m(SKIN), 0, y, z)); // palms together
const feet = (g: THREE.Group, x: number, color = 0x5a3a24, r = 0.07) => {
  for (const s of [-1, 1]) g.add(mesh(ball(r, 1.2, 0.5, 1.6), m(color), s * x, 0.03, 0.06));
};

/** 小沙彌: a little novice, big round head, grey robe. */
export function novice() {
  const g = new THREE.Group(), robe = m(0x8d8f8c);
  g.add(mesh(tube(0.3, 0.18, 0.62), robe), mesh(ball(0.2, 1, 0.8, 0.9), robe, 0, 0.66, 0));
  head(g, 0.98, 0.24);
  hands(g, 0.62, 0.2);
  feet(g, 0.1);
  return g;
}

/** 胖: round as a temple bell, a brown robe and an orange sash across it. */
export function chubby() {
  const g = new THREE.Group(), robe = m(0x8a5a32);
  g.add(mesh(ball(0.46, 1.05, 0.95, 0.95), robe, 0, 0.5, 0));
  const sash = mesh(new THREE.TorusGeometry(0.44, 0.05, 8, 28, Math.PI * 1.2).rotateX(Math.PI / 2), m(0xc46a22), 0, 0.7, 0);
  sash.rotation.set(0.6, 0, 0.5);
  g.add(sash);
  head(g, 1.07, 0.25, true, 1.05);
  for (const s of [-1, 1]) g.add(mesh(ball(0.09, 1, 0.8, 1), m(SKIN), s * 0.4, 0.55, 0.22)); // hands resting on the belly
  feet(g, 0.18, 0x4a3424, 0.09);
  return g;
}

/** 着物: slim, a blue kimono with wide hanging sleeves and a gold obi, geta. */
export function kimono() {
  const g = new THREE.Group(), cloth = m(0x3f5f8f), obi = m(0xd9a441);
  g.add(mesh(tube(0.2, 0.17, 1.05), cloth), mesh(tube(0.21, 0.21, 0.2), obi, 0, 0.72, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.12), m(0xc0392b), 0, 0.82, -0.2));
  g.add(mesh(ball(0.2, 1.2, 0.6, 0.8), cloth, 0, 1.08, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.14, 0.42, 0.2), cloth, s * 0.28, 0.74, 0.02));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.03), m(0xf3eee2), 0, 1.1, 0.17));
  head(g, 1.34, 0.16);
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.09, 0.05, 0.2), m(0x8a6a4a), s * 0.08, 0.02, 0.02));
  return g;
}

/** 長: tall and thin in a long purple robe, a gold kesa panel, white brows. */
export function tall() {
  const g = new THREE.Group(), robe = m(0x5b3a7a);
  g.add(mesh(tube(0.24, 0.15, 1.45), robe), mesh(ball(0.19, 1.1, 0.55, 0.8), robe, 0, 1.45, 0));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.34, 0.03), m(0xd9a441), 0, 1.1, 0.18));
  head(g, 1.7, 0.15, true);
  for (const s of [-1, 1]) g.add(mesh(ball(0.05, 1.6, 0.4, 0.6), m(0xf4f1ea), s * 0.07, 1.78, 0.13));
  hands(g, 1.28, 0.2);
  return g;
}

/** 雲水: a wandering monk in black, white leggings and straw sandals. */
export function unsui() {
  const g = new THREE.Group(), robe = m(0x1d1d1f);
  g.add(mesh(tube(0.22, 0.16, 1.35), robe));
  for (const s of [-1, 1]) g.add(mesh(tube(0.07, 0.065, 0.35), m(0xf1ede4), s * 0.09, 0, 0));
  g.add(mesh(ball(0.18, 1.15, 0.55, 0.8), robe, 0, 1.36, 0));
  head(g, 1.6, 0.15);
  hands(g, 1.12, 0.19);
  feet(g, 0.09, 0xc9a96a, 0.06);
  return g;
}

/** 作務衣: a work suit, indigo jacket over loose trousers. */
export function samue() {
  const g = new THREE.Group(), indigo = m(0x2f3e5c);
  for (const s of [-1, 1]) g.add(mesh(tube(0.1, 0.12, 0.62), indigo, s * 0.11, 0, 0)); // trousers
  g.add(mesh(tube(0.24, 0.22, 0.55), indigo, 0, 0.58, 0)); // jacket
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), m(0x1f2a40), 0.04, 0.62, 0.23)); // its crossed front
  g.add(mesh(ball(0.22, 1.1, 0.5, 0.9), indigo, 0, 1.13, 0));
  for (const s of [-1, 1]) g.add(mesh(tube(0.07, 0.06, 0.48), indigo, s * 0.27, 0.66, 0.02));
  head(g, 1.36, 0.17);
  feet(g, 0.11, 0x2a2a2a);
  return g;
}

/** 羽織: a short coat in persimmon over a pale kimono — small and neat. */
export function haori() {
  const g = new THREE.Group(), under = m(0xe8e0cc), coat = m(0xc8642a);
  g.add(mesh(tube(0.2, 0.16, 0.7), under));
  g.add(mesh(tube(0.24, 0.24, 0.45), coat, 0, 0.42, 0));
  g.add(mesh(ball(0.21, 1.15, 0.55, 0.85), coat, 0, 0.88, 0));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.13, 0.32, 0.18), coat, s * 0.3, 0.56, 0));
  g.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), m(0xf3eee2), 0, 0.78, 0.24)); // the coat's tie
  head(g, 1.1, 0.19, true);
  feet(g, 0.09, 0x8a6a4a);
  return g;
}

/** 豆: tiny and egg-shaped, all saffron, like a little daruma. */
export function bean() {
  const g = new THREE.Group(), robe = m(0xe39b2c);
  g.add(mesh(ball(0.3, 1, 1.15, 0.95), robe, 0, 0.34, 0));
  g.add(mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 24).rotateX(Math.PI / 2), m(0xb5651d), 0, 0.3, 0)); // a band
  head(g, 0.78, 0.2, true);
  hands(g, 0.42, 0.28, 0.05);
  feet(g, 0.12, 0x6b3a1a, 0.06);
  return g;
}

/** 袈裟: a medium build in grey under an ochre kesa draped over the left shoulder. */
export function kesa() {
  const g = new THREE.Group(), robe = m(0x6f6a66), drape = m(0xc28a2e);
  g.add(mesh(tube(0.23, 0.18, 1.2), robe), mesh(ball(0.2, 1.1, 0.55, 0.85), robe, 0, 1.2, 0));
  const band = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.22, 20, 1, true).rotateZ(0.55), m(0xc28a2e, { side: THREE.DoubleSide }), 0, 0.95, 0);
  g.add(band, mesh(tube(0.24, 0.2, 0.55), drape, 0, 0.4, 0));
  head(g, 1.45, 0.16);
  hands(g, 1.02, 0.21);
  return g;
}

export const CHARACTERS: [string, () => THREE.Group][] = [
  ['小沙彌', novice], ['豆', bean], ['胖', chubby], ['羽織', haori], ['作務衣', samue], ['着物', kimono], ['袈裟', kesa], ['雲水', unsui], ['長', tall],
];
