import * as THREE from 'three';
import { bellWindow, irimoyaRoof, shojiTexture } from '../buildings/japaneseRoof';

/**
 * Mock temple exteriors in Japanese styles (dev: /mocks.html):
 *  zen    — 禅宗様: two roofs (main + 裳階 skirt), steep flared eaves, dark wood, white plaster, bell windows (花頭窓)
 *  wayo   — 和様: broad, gently curved 入母屋 roof, vermilion posts, raised floor with a railed veranda, porch roof
 *  hojo   — 方丈: long, low, cypress-bark roof, paper shōji, a wide veranda over raked white gravel
 */

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
};
const roofed = (g: THREE.Group, W: number, D: number, H: number, y: number, roofMat: THREE.Material, gableMat: THREE.Material, opts: Parameters<typeof irimoyaRoof>[3], z = 0) => {
  const part = new THREE.Group();
  part.position.z = z;
  g.add(part);
  const r = irimoyaRoof(W, D, H, opts);
  r.roof.computeVertexNormals();
  r.gable.computeVertexNormals();
  const roof = new THREE.Mesh(r.roof, roofMat), gable = new THREE.Mesh(r.gable, gableMat);
  roof.position.y = gable.position.y = y;
  part.add(roof, gable);
  // ridge beam with 鴟尾-like end pieces
  part.add(box(W * 0.42, 0.28, 0.32, mat(0x2b2b2e), 0, y + r.ridge - 0.08, 0));
  for (const s of [-1, 1]) part.add(box(0.3, 0.55, 0.36, mat(0x2b2b2e), s * W * 0.21, y + r.ridge - 0.08, 0));
  return r;
};

export function zenHall() {
  const g = new THREE.Group(), wood = mat(0x5a3b26), plaster = mat(0xefe9dc), stone = mat(0x9a958a, { roughness: 0.95 }), roofM = mat(0x3d3a36, { side: THREE.DoubleSide, flatShading: true });
  const W = 10, D = 8, H = 4.2, F = 0.6;
  g.add(box(W + 2, F, D + 2, stone, 0, 0, 0));
  g.add(box(3, F * 0.5, 1.2, stone, 0, 0, D / 2 + 1.6)); // step
  g.add(box(W, H, D, plaster, 0, F, 0));
  // posts and tie beams (dark wood over plaster)
  for (const x of [-W / 2, -W / 6, W / 6, W / 2]) for (const z of [-D / 2, D / 2]) g.add(box(0.32, H, 0.32, wood, x, F, z));
  for (const z of [-D / 2, D / 2]) for (const y of [F + H - 0.35, F + 1.0]) g.add(box(W + 0.1, 0.24, 0.36, wood, 0, y, z));
  // the middle bay's doors, bell windows either side
  g.add(box(2.6, 2.6, 0.12, wood, 0, F, D / 2 + 0.04));
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(bellWindow(1.4, 1.7), mat(0x2a1d14));
    win.position.set(s * (W / 3), F + 1.3, D / 2 + 0.11);
    g.add(win);
  }
  // 裳階 skirt roof, then the main roof
  roofed(g, W + 2.4, D + 2.4, 1.5, F + 2.75, roofM, plaster, { gable: 0.999, curve: 1.2, upturn: 0.35 });
  roofed(g, W + 3.6, D + 3.4, 4.2, F + H + 0.2, roofM, plaster, { gable: 0.55, curve: 1.7, upturn: 0.55 });
  return g;
}

export function wayoHall() {
  const g = new THREE.Group(), red = mat(0xb23a2a), plaster = mat(0xf2ede2), wood = mat(0x6b4a33), stone = mat(0xa7a296, { roughness: 0.95 }), roofM = mat(0x4b5056, { side: THREE.DoubleSide, flatShading: true });
  const W = 12, D = 8, H = 3.6, F = 1.1;
  g.add(box(W + 3.2, 0.3, D + 3.2, stone, 0, 0, 0));
  // raised floor on posts, a veranda (縁) round it with a railing
  g.add(box(W + 2.4, 0.2, D + 2.4, wood, 0, F - 0.2, 0));
  for (const x of [-W / 2 - 1, W / 2 + 1]) for (const z of [-D / 2 - 1, D / 2 + 1]) g.add(box(0.22, F - 0.2, 0.22, wood, x, 0.3, z));
  for (const [w, d, x, z] of [[W + 2.4, 0.08, 0, D / 2 + 1.15], [W + 2.4, 0.08, 0, -D / 2 - 1.15], [0.08, D + 2.4, W / 2 + 1.15, 0], [0.08, D + 2.4, -W / 2 - 1.15, 0]]) {
    if (z > 0) for (const s of [-1, 1]) g.add(box((w - 3) / 2, 0.08, d, red, s * ((w - 3) / 4 + 1.5), F + 0.55, z)); // leave the steps open
    else g.add(box(w, 0.08, d, red, x, F + 0.55, z));
  }
  // steps up the front, under a small porch roof (向拝)
  for (let i = 0; i < 4; i++) g.add(box(3, ((i + 1) * F) / 4, 0.4, wood, 0, 0, D / 2 + 2.6 - i * 0.4));
  g.add(box(W, H, D, plaster, 0, F, 0));
  for (let i = 0; i <= 5; i++) for (const z of [-D / 2, D / 2]) g.add(box(0.26, H, 0.26, red, -W / 2 + (i * W) / 5, F, z));
  for (const z of [-D / 2, D / 2]) g.add(box(W + 0.2, 0.3, 0.32, red, 0, F + H - 0.3, z));
  for (let i = 0; i < 5; i++) g.add(box(W / 5 - 0.5, H - 0.8, 0.1, mat(0x8a5a3a), -W / 2 + W / 10 + (i * W) / 5, F + 0.2, D / 2 + 0.06)); // board doors
  for (const s of [-1, 1]) g.add(box(0.22, 2.6, 0.22, red, s * 1.4, 0.3, D / 2 + 2.7));
  roofed(g, 3.6, 2.4, 1.0, 2.9, roofM, plaster, { gable: 0.999, curve: 1.3, upturn: 0.2, seg: 12 }, D / 2 + 2.4);
  roofed(g, W + 5, D + 5, 4.6, F + H, roofM, plaster, { gable: 0.5, curve: 1.35, upturn: 0.3 });
  return g;
}

export function hojoHall() {
  const g = new THREE.Group(), wood = mat(0x8a6a4a), dark = mat(0x4a3424), roofM = mat(0x6b4a33, { side: THREE.DoubleSide, flatShading: true, roughness: 1 });
  const W = 16, D = 7, H = 2.8, F = 0.7;
  g.add(box(W + 8, 0.06, D + 7, mat(0xe9e6dc, { roughness: 1 }), 0, 0, 1.2)); // raked white gravel
  for (const [x, z, r] of [[-6, D / 2 + 3.6, 0.7], [-4.6, D / 2 + 4.2, 0.45], [5.5, D / 2 + 3.9, 0.9]]) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0).scale(1.3, 0.7, 1), mat(0x6f6c66, { flatShading: true }));
    rock.position.set(x, r * 0.35, z);
    g.add(rock);
  }
  g.add(box(W + 2.6, 0.18, D + 2.6, wood, 0, F - 0.18, 0)); // floor and wide veranda
  for (let i = 0; i <= 8; i++) for (const z of [-D / 2 - 1.2, D / 2 + 1.2]) g.add(box(0.16, F - 0.18, 0.16, dark, -W / 2 - 1.2 + (i * (W + 2.4)) / 8, 0, z));
  g.add(box(W, H, D, mat(0xe8e2d2), 0, F, 0));
  const tex = shojiTexture();
  tex.repeat.set(W / 1.6, 1);
  const shoji = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, H - 0.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  shoji.position.set(0, F + (H - 0.25) / 2, D / 2 + 0.02);
  g.add(shoji);
  for (let i = 0; i <= 8; i++) g.add(box(0.18, H, 0.18, dark, -W / 2 + (i * W) / 8, F, D / 2 + 0.06));
  g.add(box(W + 0.2, 0.22, 0.24, dark, 0, F + H - 0.22, D / 2 + 0.08));
  roofed(g, W + 5, D + 5.2, 3.4, F + H, roofM, mat(0xe8e2d2), { gable: 0.6, curve: 1.45, upturn: 0.15 });
  return g;
}
