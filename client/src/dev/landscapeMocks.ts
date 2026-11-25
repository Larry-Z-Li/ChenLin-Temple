import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math';

/**
 * Mock (dev: /landscape-mocks.html): three landscape styles round a flat ~150 m temple plateau —
 * A terraced hills, B karst peaks in mist, C Himalayan alpine meadow. A wide on top, B and C below.
 * Placeholder buildings only (boxes + hipped roofs + a pagoda) for scale. Click a view to look round it.
 */

// ---- noise ----
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const sm = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = sm(x - ix), fz = sm(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x: number, z: number, o = 4) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * noise(x * f + i * 17, z * f - i * 9); a *= 0.5; f *= 2; } return s / 0.9375; };
const ss = (v: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

type HFn = (x: number, z: number) => number;
const PLATEAU_IN = 78, PLATEAU_OUT = 175;
const plateau = (x: number, z: number) => ss(Math.hypot(x, z), PLATEAU_IN, PLATEAU_OUT); // 0 on the plateau, 1 outside

// ---- terrain mesh ----
function terrain(size: number, seg: number, h: HFn, color: (x: number, z: number, y: number, slope: number, c: THREE.Color) => void) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color(), e = 3;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const x = (i / seg - 0.5) * size, z = (j / seg - 0.5) * size, y = h(x, z);
    pos.push(x, y, z);
    const slope = Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
    color(x, z, y, slope, c);
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i;
    idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
}

// ---- instanced trees ----
const paint = (g: THREE.BufferGeometry, hex: number) => {
  const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const part = (g: THREE.BufferGeometry, hex: number, y: number) => paint(g.translate(0, y, 0).toNonIndexed(), hex);
const pineGeo = () => mergeGeometries([
  part(new THREE.CylinderGeometry(0.25, 0.35, 2, 5), 0x5a4030, 1),
  part(new THREE.ConeGeometry(2.2, 4.2, 6), 0x3d6b3a, 3.2),
  part(new THREE.ConeGeometry(1.7, 3.4, 6), 0x437442, 5.4),
  part(new THREE.ConeGeometry(1.1, 2.8, 6), 0x4a7d48, 7.4),
])!;
const broadGeo = () => mergeGeometries([
  part(new THREE.CylinderGeometry(0.3, 0.4, 3, 5), 0x6a4c34, 1.5),
  part(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1), 0x6d9a45, 4.6),
])!;
const bambooGeo = () => mergeGeometries([
  part(new THREE.ConeGeometry(0.9, 11, 5), 0x8fb352, 5.5),
  part(new THREE.ConeGeometry(0.8, 9, 5).translate(1.1, 0, 0.6), 0x7ea848, 4.5),
  part(new THREE.ConeGeometry(0.7, 10, 5).translate(-0.9, 0, 0.9), 0x9bbd5c, 5),
  part(new THREE.ConeGeometry(0.7, 8, 5).translate(0.2, 0, -1.1), 0x88b04e, 4),
])!;

interface Spot { x: number; y: number; z: number; s: number }
/** rejection-sample n spots on the terrain; accept returns a scale (0 = reject) */
function scatter(n: number, size: number, h: HFn, rng: () => number, accept: (x: number, z: number, y: number, slope: number) => number, tries = n * 40): Spot[] {
  const out: Spot[] = [];
  for (let t = 0; t < tries && out.length < n; t++) {
    const x = (rng() - 0.5) * size, z = (rng() - 0.5) * size, y = h(x, z);
    const slope = Math.hypot(h(x + 2, z) - h(x - 2, z), h(x, z + 2) - h(x, z - 2)) / 4;
    const s = accept(x, z, y, slope);
    if (s > 0) out.push({ x, y, z, s });
  }
  return out;
}
function instance(geo: THREE.BufferGeometry, spots: Spot[], rng: () => number, tint: (rng: () => number) => THREE.Color, sink = 0.4) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), Math.max(1, spots.length));
  const o = new THREE.Object3D();
  spots.forEach((p, i) => {
    o.position.set(p.x, p.y - sink * p.s, p.z);
    o.rotation.set(0, rng() * 6.28, 0);
    o.scale.set(p.s * (0.85 + rng() * 0.3), p.s * (0.85 + rng() * 0.4), p.s * (0.85 + rng() * 0.3));
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, tint(rng));
  });
  m.count = spots.length;
  return m;
}
const tintOf = (base: number, spread = 0.25) => (rng: () => number) => new THREE.Color(base).multiplyScalar(1 - spread / 2 + rng() * spread);

// ---- placeholder temple (boxes + hipped roofs + a pagoda), plateau at y = 0 ----
const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 1, flatShading: true });
const wall = new THREE.MeshStandardMaterial({ color: 0xa8402f, roughness: 1, flatShading: true });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x33343b, roughness: 0.9, flatShading: true });
const gold = new THREE.MeshStandardMaterial({ color: 0xd8a640, roughness: 0.5, metalness: 0.4, flatShading: true });
function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
}
function roof(g: THREE.Group, w: number, d: number, h: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), roofMat);
  m.scale.set(w / Math.SQRT2, h, d / Math.SQRT2);
  m.position.set(x, y + h / 2, z);
  g.add(m);
}
function temple() {
  const g = new THREE.Group();
  box(g, 130, 0.8, 100, 0, 0, 0, stone);
  // main hall, two roofs
  box(g, 34, 10, 22, 0, 0.8, 12, wall);
  roof(g, 46, 32, 7, 0, 10.8, 12);
  box(g, 22, 5, 14, 0, 10.8, 12, wall);
  roof(g, 32, 24, 7, 0, 15.8, 12);
  box(g, 1.2, 3, 1.2, 0, 22.8, 12, gold);
  // side halls, gate
  for (const sx of [-1, 1]) {
    box(g, 14, 6, 22, sx * 38, 0.8, 8, wall);
    roof(g, 20, 28, 5, sx * 38, 6.8, 8);
  }
  box(g, 18, 6, 6, 0, 0.8, -38, wall);
  roof(g, 24, 12, 5, 0, 6.8, -38);
  // pagoda
  let y = 0.8;
  const px = 52, pz = 26;
  for (let i = 0; i < 5; i++) {
    const w = 9 - i * 1.1;
    box(g, w, 5, w, px, y, pz, wall);
    roof(g, w + 4, w + 4, 2.6, px, y + 5, pz);
    y += 6.6;
  }
  box(g, 0.6, 6, 0.6, px, y, pz, gold);
  return g;
}

// ---- scene bits ----
function skyTex(top: string, mid: string, bot: string) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const puff = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const updaters: ((dt: number, t: number) => void)[] = [];

interface Built { scene: THREE.Scene; home: THREE.Vector3; target: THREE.Vector3 }
function baseScene(sky: [string, string, string], fogHex: number, fogNear: number, fogFar: number, hemi: [number, number, number], sun: [number, number]): THREE.Scene {
  const s = new THREE.Scene();
  s.background = skyTex(...sky);
  s.fog = new THREE.Fog(fogHex, fogNear, fogFar);
  s.add(new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2]));
  const d = new THREE.DirectionalLight(sun[0], sun[1]);
  d.position.set(-120, 160, -60);
  s.add(d);
  s.add(temple());
  return s;
}
const SIZE = 1100, SEG = 180;
const awayFromTemple = (x: number, z: number, m = 4) => Math.hypot(x, z) > PLATEAU_IN + m;

// ---- A: terraced hills ----
function terraced(): Built {
  const rng = mulberry32(11), STEP = 7;
  const base: HFn = (x, z) => {
    const r = Math.hypot(x, z), back = 0.55 + 0.45 * ss(z, -100, 220);
    const hills = (fbm(x / 170 + 4, z / 170) * 50 + fbm(x / 60, z / 60) * 8) * ss(r, 90, 300);
    const ridge = (120 + fbm(x / 230 + 9, z / 230) * 190) * ss(r, 360, 560) * back;
    return (hills * back + ridge) * plateau(x, z) + 4 * 0;
  };
  const h: HFn = (x, z) => {
    const y = base(x, z), r = Math.hypot(x, z);
    if (r > 470) return y; // the far mountains stay smooth
    const t = y / STEP, f = Math.floor(t), fr = t - f, k = ss(r, 440, 470);
    const stepped = (f + ss(fr, 0.72, 1)) * STEP;
    return stepped + (y - stepped) * k;
  };
  const sc = scene3(0xbfd9d2);
  function scene3(fog: number) { return baseScene(['#8fb8d8', '#c8e0e4', '#eaf1e2'], fog, 220, 1000, [0xf0f6ff, 0x5f7a48, 1.5], [0xfff1d8, 2.1]); }
  const col = new THREE.Color();
  sc.add(terrain(SIZE, SEG, h, (x, z, y, slope, c) => {
    const band = Math.floor(y / STEP + 0.02), fr = y / STEP - Math.floor(y / STEP), n = noise(x / 25, z / 25), r = Math.hypot(x, z);
    if (r < PLATEAU_IN + 8) c.setHex(0x8fb15c);
    else {
      const flooded = (band * 7 + Math.floor(n * 3)) % 4 === 0;
      c.setHex(flooded ? 0x9fc27a : n > 0.55 ? 0x7fae4c : 0x6a9c43);
      c.lerp(col.setHex(0x3f6b3a), ss(y, 50, 140) * 0.8);
      if (fr > 0.05 && slope > 0.35) c.lerp(col.setHex(0x7a6a44), 0.65); // earthen riser
      if (r > 400) c.lerp(col.setHex(0x8fa9b0), ss(r, 400, 560) * 0.8); // distant haze-blue
    }
    c.multiplyScalar(0.94 + hash(x, z) * 0.12);
  }));
  const bamboo = scatter(90, SIZE, h, rng, (x, z, _y, s) => (awayFromTemple(x, z, 10) && Math.hypot(x, z) < 450 && noise(x / 40 + 3, z / 40) > 0.58 && s < 0.5 ? 1.1 + rng() * 0.5 : 0), 9000);
  const broad = scatter(380, SIZE, h, rng, (x, z, y) => (awayFromTemple(x, z, 6) && Math.hypot(x, z) < 450 && noise(x / 55, z / 55) > 0.5 && (y > 20 || rng() < 0.3) ? 0.8 + rng() * 0.7 : 0), 14000);
  const pines = scatter(400, SIZE, h, rng, (x, z, y) => (awayFromTemple(x, z, 6) && Math.hypot(x, z) < 450 && y > 60 && rng() < 0.5 ? 1 + rng() * 0.8 : 0), 14000);
  sc.add(instance(bambooGeo(), bamboo, rng, tintOf(0xffffff, 0.2)), instance(broadGeo(), broad, rng, tintOf(0xffffff, 0.3)), instance(pineGeo(), pines, rng, tintOf(0xffffff, 0.3)));
  return { scene: sc, home: new THREE.Vector3(-50, 100, -230), target: new THREE.Vector3(0, 50, 200) };
}

// ---- B: karst peaks ----
function karst(): Built {
  const rng = mulberry32(23);
  const peaks: { x: number; z: number; H: number; R: number; k: number }[] = [];
  for (let i = 0; i < 130; i++) {
    const far = i > 45, a = rng() * 6.283, r = far ? 230 + rng() * 170 : 100 + rng() * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * (a > 3.14 ? 0.7 : 1);
    if (Math.hypot(x, z) < 110 || z < -140 || (z < 0 && Math.abs(x) < 120) || Math.abs(x) > SIZE / 2 || Math.abs(z) > SIZE / 2) continue;
    peaks.push({ x, z, H: far ? 160 + rng() * 170 : 70 + rng() * 130, R: far ? 38 + rng() * 40 : 20 + rng() * 26, k: rng() * 9 });
  }
  const h: HFn = (x, z) => {
    let y = (noise(x / 60, z / 60) - 0.5) * 6 * plateau(x, z);
    let top = 0;
    for (const p of peaks) {
      const q = Math.hypot(x - p.x, z - p.z) / p.R;
      if (q >= 1) continue;
      const v = p.H * Math.pow(1 - Math.pow(q, 2.6), 0.42) * (0.9 + 0.2 * noise(x / 14 + p.k, z / 14));
      top = Math.max(top, v);
    }
    return y + top * plateau(x, z);
  };
  const sc = baseScene(['#9fb4b8', '#dfe5e0', '#f0eee4'], 0xe3e8e2, 0, 0, [0xf2f6f4, 0x7a8a78, 1.45], [0xfff4e4, 1.4]);
  sc.fog = new THREE.Fog(0xe3e8e2, 110, 560);
  const col = new THREE.Color();
  sc.add(terrain(SIZE, SEG, h, (x, z, y, slope, c) => {
    const n = noise(x / 9, y / 12 + z / 40);
    if (y < 3 && slope < 0.4) c.setHex(noise(x / 30, z / 30) > 0.5 ? 0x93b36a : 0x82a85e);
    else {
      c.setHex(0xb9b5a6).lerp(col.setHex(0x6f6e68), n * 0.6); // pale limestone with dark weathering streaks
      const green = ss(0.9 - slope, 0.05, 0.4) * ss(y, 4, 30) * 0.9; // vegetation where it is not sheer
      c.lerp(col.setHex(0x5f8a52), green);
      if (y < 12) c.lerp(col.setHex(0x86a863), 1 - ss(y, 3, 12));
    }
    c.multiplyScalar(0.92 + hash(x, z) * 0.14);
  }));
  const pines = scatter(420, SIZE, h, rng, (x, z, y, s) => (Math.hypot(x, z) < 340 && awayFromTemple(x, z, 6) && y > 6 && s < 0.85 && s > 0.1 ? 0.9 + rng() * 0.9 : 0), 40000);
  const low = scatter(140, SIZE, h, rng, (x, z, y, s) => (y < 6 && awayFromTemple(x, z, 8) && Math.hypot(x, z) < 300 && s < 0.4 ? 0.8 + rng() * 0.6 : 0), 6000);
  sc.add(instance(pineGeo(), pines, rng, tintOf(0xffffff, 0.35), 0.6), instance(broadGeo(), low, rng, tintOf(0xffffff, 0.3)));
  // mist bands drifting
  const mats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.38, color: 0xf2f4f0, fog: false });
    mats.push(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m);
    const y0 = 8 + (i % 4) * 22 + rng() * 6, x0 = (rng() - 0.5) * 500, z0 = 60 + rng() * 280;
    p.scale.set(260 + rng() * 140, 1, 70 + rng() * 40);
    p.position.set(x0, y0, z0);
    p.renderOrder = 5;
    sc.add(p);
    updaters.push((_, t) => { p.position.x = x0 + Math.sin(t * 0.06 + i) * 40 + t * 1.2 % 1 * 0; });
  }
  return { scene: sc, home: new THREE.Vector3(-30, 85, -230), target: new THREE.Vector3(0, 40, 90) };
}

// ---- C: Himalayan alpine ----
function alpine(): Built {
  const rng = mulberry32(37);
  const h: HFn = (x, z) => {
    const r = Math.hypot(x, z), back = 0.4 + 0.6 * ss(z, -120, 160);
    const ridged = 1 - Math.abs(fbm(x / 210 + 5, z / 210 + 2) * 2 - 1);
    const mount = (80 + Math.pow(ridged, 1.4) * 420) * ss(r, 270, 580) * back + fbm(x / 70, z / 70) * 22 * ss(r, 100, 250);
    return ((noise(x / 35, z / 35) - 0.5) * 5 + mount) * plateau(x, z);
  };
  const sc = baseScene(['#4f86c2', '#9cc3e2', '#e8eef0'], 0xcfdde6, 0, 0, [0xe8f2ff, 0x7a6e50, 1.5], [0xfff0d6, 2.6]);
  sc.fog = new THREE.Fog(0xd6e3ee, 350, 1400);
  const col = new THREE.Color();
  sc.add(terrain(SIZE, SEG, h, (x, z, y, slope, c) => {
    const n = noise(x / 22, z / 22), r = Math.hypot(x, z);
    c.setHex(n > 0.55 ? 0x8a8a4a : 0x7a6e44).lerp(col.setHex(0x6d7a3e), ss(0.5 - n, 0, 0.4) * 0.6); // olive and brown grass
    if (r < PLATEAU_IN + 10) c.setHex(0x8c8d52);
    c.lerp(col.setHex(0x7b766d), ss(slope, 1.0, 2.0) * 0.8); // bare rock on steeps
    const snowLine = 80 + (noise(x / 40, z / 40) - 0.5) * 60;
    c.lerp(col.setHex(0xf4f7fb), ss(y, snowLine, snowLine + 25) * (1 - ss(slope, 1.6, 2.6) * 0.5)); // snow by height, less on cliffs
    c.multiplyScalar(0.94 + hash(x, z) * 0.12);
  }));
  const boulders = scatter(170, SIZE, h, rng, (x, z, y) => (awayFromTemple(x, z, 6) && Math.hypot(x, z) < 450 && y < 130 ? 1 + rng() * rng() * 4 : 0), 5000);
  const bm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 1, flatShading: true }), boulders.length);
  const o = new THREE.Object3D();
  boulders.forEach((p, i) => {
    o.position.set(p.x, p.y + p.s * 0.1, p.z);
    o.rotation.set(rng() * 3, rng() * 6, rng() * 3);
    o.scale.set(p.s * 1.2, p.s * 0.75, p.s);
    o.updateMatrix();
    bm.setMatrixAt(i, o.matrix);
    bm.setColorAt(i, new THREE.Color(0xffffff).multiplyScalar(0.7 + rng() * 0.4));
  });
  sc.add(bm);
  // a few hardy pines low on the sheltered slopes
  const pines = scatter(90, SIZE, h, rng, (x, z, y, s) => (awayFromTemple(x, z, 12) && Math.hypot(x, z) < 250 && s > 0.2 && y < 90 && noise(x / 50, z / 50) > 0.6 ? 0.8 + rng() * 0.6 : 0), 8000);
  sc.add(instance(pineGeo(), pines, rng, tintOf(0xb8c8b0, 0.3)));
  // prayer flags: strings between poles round the plateau, flags in the five colours
  const poles: THREE.Vector3[] = [];
  const pm = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1, flatShading: true });
  const ring = 66;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283 + 0.2, p = new THREE.Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring);
    poles.push(p);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 16, 5), pm);
    m.position.set(p.x, 8, p.z);
    sc.add(m);
  }
  const flagCols = [0x2f6fd0, 0xf2f2f2, 0xd33a2f, 0x3a9a4a, 0xf0c230];
  const fl = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide }), 8 * 24);
  let k = 0;
  const q = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    const a = poles[i], b = poles[(i + 1) % 8];
    for (let j = 0; j < 24; j++) {
      const t = (j + 0.5) / 24, sag = 4 * 3.2 * t * (1 - t);
      q.position.set(a.x + (b.x - a.x) * t, 15.5 - sag - 0.55, a.z + (b.z - a.z) * t);
      q.rotation.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), 0);
      q.scale.setScalar(1);
      q.updateMatrix();
      fl.setMatrixAt(k, q.matrix);
      fl.setColorAt(k++, new THREE.Color(flagCols[j % 5]));
    }
  }
  sc.add(fl);
  updaters.push((_, t) => { fl.position.y = Math.sin(t * 2) * 0.05; });
  return { scene: sc, home: new THREE.Vector3(-45, 95, -230), target: new THREE.Vector3(0, 60, 200) };
}

// ---- views ----
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const labels = [...document.querySelectorAll<HTMLElement>('.label')];
const views = [terraced, karst, alpine].map((build) => {
  const b = build();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  camera.position.copy(b.home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(b.target);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  return { ...b, camera, controls };
});

let open = -1;
const cell = (i: number) => {
  const w = innerWidth, h = innerHeight;
  if (open >= 0) return { x: 0, y: 0, w, h };
  if (i === 0) return { x: 0, y: 0, w, h: h / 2 };
  return { x: (i - 1) * (w / 2), y: h / 2, w: w / 2, h: h / 2 };
};
function show(i: number) {
  open = i;
  views.forEach((v, j) => {
    v.controls.enabled = j === i;
    if (i < 0) { v.camera.position.copy(v.home); v.controls.target.copy(v.target); }
  });
  labels.forEach((l, j) => l.classList.toggle('hidden', i >= 0 && j !== i));
  document.body.classList.toggle('open', i >= 0);
  layoutLabels();
}
function layoutLabels() {
  labels.forEach((l, i) => { const c = cell(i); l.style.left = `${c.x + 12}px`; l.style.top = `${c.y + 12}px`; });
}
let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  if (open >= 0) return show(-1);
  show(e.clientY < innerHeight / 2 ? 0 : e.clientX < innerWidth / 2 ? 1 : 2);
});
addEventListener('keydown', (e) => e.key === 'Escape' && show(-1));
function resize() { renderer.setSize(innerWidth, innerHeight, false); layoutLabels(); }
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setScissorTest(true);
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  for (const u of updaters) u(dt, t);
  views.forEach((v, i) => {
    if (open >= 0 && i !== open) return;
    const c = cell(i), y = innerHeight - c.y - c.h;
    if (open < 0) v.camera.position.x = v.home.x + Math.sin(t * 0.12 + i) * 8;
    else v.controls.update();
    v.camera.aspect = c.w / c.h;
    v.camera.fov = c.w / c.h > 2.2 ? 34 : 42;
    v.camera.updateProjectionMatrix();
    if (open < 0) v.camera.lookAt(v.target);
    renderer.setViewport(c.x, y, c.w, c.h);
    renderer.setScissor(c.x, y, c.w, c.h);
    renderer.render(v.scene, v.camera);
  });
});
