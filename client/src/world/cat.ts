import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A procedural cat, sculpted from overlapping ellipsoids. Its coat is painted into the vertex colours
 * (tabby stripes, white bibs and socks, calico patches, a little mottling), and it has a skinned tail
 * that bends, eyes with slit pupils that blink, ears that twitch, and whiskers. Two poses, lying
 * ("loaf") and sitting; five coats. Built facing +Z with its feet on y = 0, about 0.45 m nose to rump.
 *
 * Behaviour (see `update`): asleep until someone comes near, then it lifts its head, opens its eyes and
 * watches them; petted, it squints happily and rubs its head about. About 8 draw calls.
 */
export type CatCoat = 'ginger' | 'silver' | 'tuxedo' | 'calico' | 'brown';
export type CatPose = 'loaf' | 'sit';

interface Coat {
  base: number;
  stripe: number;
  light: number;
  nose: number;
  iris: number;
  tabby: boolean;
  /** 0 none · 1 chin, chest and belly · 2 tuxedo (also paws and lower face) · 3 calico (white with patches) */
  white: 0 | 1 | 2 | 3;
}

const COATS: Record<CatCoat, Coat> = {
  ginger: { base: 0xd8873c, stripe: 0xa24f1d, light: 0xf3dcb4, nose: 0xd98c88, iris: 0xd6a12a, tabby: true, white: 1 },
  silver: { base: 0xa4a4a1, stripe: 0x48484b, light: 0xe8e5de, nose: 0xc98f92, iris: 0x86b84c, tabby: true, white: 1 },
  tuxedo: { base: 0x2a2826, stripe: 0x1d1c1b, light: 0xf4f1ea, nose: 0x3b2b2b, iris: 0xd8b22c, tabby: false, white: 2 },
  calico: { base: 0xf4efe6, stripe: 0x2b2725, light: 0xf7f3ec, nose: 0xe3a3a3, iris: 0xc2972c, tabby: false, white: 3 },
  brown: { base: 0x8d6b48, stripe: 0x37281b, light: 0xeadfc8, nose: 0xb9726c, iris: 0xa4b83c, tabby: true, white: 1 },
};
const CALICO_ORANGE = new THREE.Color(0xd9873e), CALICO_BLACK = new THREE.Color(0x2b2725);

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash3(x: number, y: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1). */
function noise3(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, s);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/**
 * Fur colour at a point. `stripe`: a coordinate the tabby stripes run across (bands of equal value),
 * `k` how strongly they show there; `w1` the chin/chest/belly white every coat with white has, `w2`
 * the extra white of a tuxedo or calico (paws, belly, lower face).
 */
interface Fur { stripe?: number; k?: number; dark?: number; w1?: number; w2?: number }
type Painter = (p: THREE.Vector3, f: Fur) => THREE.Color;

function painter(coat: Coat, seed: number): Painter {
  const base = new THREE.Color(coat.base), stripe = new THREE.Color(coat.stripe), light = new THREE.Color(coat.light);
  const c = new THREE.Color();
  return (p, f) => {
    c.copy(base);
    if (coat.white === 3) {
      const m = noise3(p.x * 8 + 11, p.y * 8, p.z * 8, seed + 5);
      c.lerp(CALICO_ORANGE, ss(0.56, 0.62, m)).lerp(CALICO_BLACK, ss(0.38, 0.32, m));
    }
    if (coat.tabby && f.stripe !== undefined) {
      const wave = Math.sin(f.stripe + (noise3(p.x * 14, p.y * 14, p.z * 14, seed + 2) - 0.5) * 3.2);
      c.lerp(stripe, ss(0.2, 0.75, wave) * 0.85 * (f.k ?? 1));
      c.lerp(stripe, (f.dark ?? 0) * 0.6);
    }
    const white = coat.white === 0 ? 0 : coat.white === 1 ? (f.w1 ?? 0) : Math.max(f.w1 ?? 0, f.w2 ?? 0);
    c.lerp(light, Math.min(1, white));
    return c.multiplyScalar(0.92 + 0.15 * noise3(p.x * 38, p.y * 38, p.z * 38, seed)); // mottled, not plastic
  };
}

/** One smooth ellipsoid: centre, radii, optional rotation and reshaping (in unit-sphere space), painted per vertex. */
interface Blob {
  c: [number, number, number];
  r: [number, number, number];
  rot?: [number, number, number];
  seg?: [number, number];
  deform?: (u: THREE.Vector3) => void;
  paint: (p: THREE.Vector3, u: THREE.Vector3) => THREE.Color;
}

function blob(s: Blob) {
  const [ws, hs] = s.seg ?? [18, 12];
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(s.rot ?? [0, 0, 0])));
  const centre = new THREE.Vector3(...s.c), u = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i);
    d.copy(u);
    s.deform?.(d);
    p.set(d.x * s.r[0], d.y * s.r[1], d.z * s.r[2]).applyQuaternion(q).add(centre);
    pos.setXYZ(i, p.x, p.y, p.z);
    const c = s.paint(p, u);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = mergeVertices(g, 1e-6); // weld the sphere's seam so the shading is smooth across it
  m.computeVertexNormals();
  return m;
}

const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;

// ------------------------------------------------------------------ head (local: head centre at origin)

/** Face markings by position in head space (so the overlapping parts agree where they meet). */
function headMarks(p: THREE.Vector3): Fur {
  const fore = ss(0.018, 0.04, p.y) * ss(-0.01, 0.03, p.z);
  const cheek = ss(0.03, 0.045, Math.abs(p.x)) * ss(0.022, 0.004, Math.abs(p.y + 0.006));
  const muzzle = ss(-0.006, -0.016, p.y) * ss(0.022, 0.036, p.z);
  return {
    stripe: fore >= cheek ? p.x * 150 : p.y * 170,
    k: Math.max(fore, cheek * 0.8) * (1 - muzzle),
    w1: Math.max(muzzle, ss(-0.022, -0.034, p.y) * 0.9),
    w2: Math.max(ss(0.002, -0.012, p.y) * ss(0.012, 0.032, p.z), ss(0.008, 0.003, Math.abs(p.x)) * ss(0.028, 0.044, p.z) * ss(0.03, 0, p.y)),
  };
}

function headGeometry(P: Painter, coat: Coat) {
  const nose = new THREE.Color(coat.nose), dark = new THREE.Color(0x2a1d1a), fur = (p: THREE.Vector3) => P(p, headMarks(p));
  return merge([
    blob({ c: [0, 0.006, 0], r: [0.05, 0.045, 0.047], seg: [24, 16], paint: fur }), // cranium
    ...[-1, 1].map((s) => blob({ c: [s * 0.026, -0.014, 0.016], r: [0.032, 0.029, 0.032], paint: fur })), // cheeks: the wide lower face
    blob({ c: [0, 0.002, 0.032], r: [0.015, 0.017, 0.02], paint: fur }), // bridge of the nose
    ...[-1, 1].map((s) => blob({ c: [s * 0.0115, -0.0175, 0.04], r: [0.0125, 0.0098, 0.0105], paint: fur })), // muzzle pads
    blob({ c: [0, -0.027, 0.033], r: [0.012, 0.0085, 0.01], paint: fur }), // chin
    blob({ c: [0, -0.006, 0.0505], r: [0.0075, 0.005, 0.0055], rot: [-0.45, 0, 0], seg: [12, 8], paint: () => nose }), // nose
    blob({ c: [0, -0.0165, 0.045], r: [0.0014, 0.0055, 0.0016], seg: [6, 6], paint: () => dark }), // the line down to the mouth
  ]);
}

/** A cat's ear: a little three-sided pyramid with a pink, slightly hollow inside. Base at the origin, tip up, open side +Z. */
function earGeometry(P: Painter) {
  const w = 0.042, h = 0.046, d = 0.022;
  const A = new THREE.Vector3(0, h, 0), BL = new THREE.Vector3(-w / 2, 0, 0), BR = new THREE.Vector3(w / 2, 0, 0), B = new THREE.Vector3(0, 0.002, -d);
  const iA = new THREE.Vector3(0, h * 0.78, -0.004), iBL = new THREE.Vector3(-w * 0.32, h * 0.08, -0.004), iBR = new THREE.Vector3(w * 0.32, h * 0.08, -0.004);
  const pink = new THREE.Color(0xe7a6a2), pos: number[] = [], col: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: (v: THREE.Vector3) => THREE.Color) => {
    for (const v of [a, b, c]) {
      pos.push(v.x, v.y, v.z);
      const k = colour(v);
      col.push(k.r, k.g, k.b);
    }
  };
  const fur = (v: THREE.Vector3) => P(v, { stripe: 0, k: ss(0.5 * h, h, v.y) * 0.7, w2: 0 }); // tabby ears darken toward the tip
  tri(BL, BR, iBR, fur);
  tri(BL, iBR, iBL, fur);
  tri(BR, A, iA, fur);
  tri(BR, iA, iBR, fur);
  tri(A, BL, iBL, fur);
  tri(A, iBL, iA, fur);
  tri(iBL, iBR, iA, (v) => pink.clone().lerp(new THREE.Color(0xf3e6dc), ss(0.5 * h, 0.1 * h, v.y) * 0.5));
  tri(A, B, BL, fur);
  tri(A, BR, B, fur);
  tri(BL, B, BR, fur);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const EYE_Y = 0.012, EYE_X = 0.021;

/** Both open eyes: amber/green irises with slit pupils and a catch-light. Centred on the eyes' height (so a y-squash blinks). */
function eyesGeometry(coat: Coat) {
  const iris = new THREE.Color(coat.iris), rim = iris.clone().multiplyScalar(0.55), black = new THREE.Color(0x0a0806), shine = new THREE.Color(0xffffff);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, s * 0.36, 0));
    const c = new THREE.Vector3(s * EYE_X, 0, 0.039);
    const at = (x: number, y: number, z: number): [number, number, number] => {
      const v = new THREE.Vector3(x, y, z).applyQuaternion(q).add(c);
      return [v.x, v.y, v.z];
    };
    const rot = new THREE.Euler().setFromQuaternion(q);
    parts.push(
      blob({ c: at(0, 0, 0), r: [0.0125, 0.0105, 0.0075], rot: [rot.x, rot.y, rot.z], seg: [16, 12], paint: (_p, u) => iris.clone().lerp(rim, ss(0.55, 0.95, Math.hypot(u.x, u.y))) }),
      blob({ c: at(0, 0, 0.0062), r: [0.0026, 0.0086, 0.0022], rot: [rot.x, rot.y, rot.z], seg: [8, 8], paint: () => black }), // slit pupil
      blob({ c: at(0.0042, 0.0046, 0.0071), r: [0.0019, 0.0019, 0.0012], rot: [rot.x, rot.y, rot.z], seg: [6, 6], paint: () => shine }),
    );
  }
  return merge(parts);
}

/** Closed eyes: two dark curves (︶, or ^ when flipped for a happy squint). */
function lidsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const arc = Math.PI * 0.7;
    const g = new THREE.TorusGeometry(0.0105, 0.0016, 5, 12, arc);
    g.deleteAttribute('uv');
    g.rotateZ(Math.PI + (Math.PI - arc) / 2); // the arc's middle at the bottom
    g.rotateX(-0.08);
    g.rotateY(s * 0.36);
    g.translate(s * EYE_X, 0, 0.0445);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0.12), 3));
    parts.push(g);
  }
  return merge(parts);
}

function whiskerGeometry() {
  const pts: number[] = [];
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      let x = s * 0.022, y = -0.014 - k * 0.0045, z = 0.05;
      const dx = s * 0.024, dz = 0.008 - k * 0.002;
      for (let seg = 0; seg < 3; seg++) {
        const nx = x + dx, ny = y - 0.002 - k * 0.0018 - seg * 0.0016, nz = z + dz - seg * 0.004;
        pts.push(x, y, z, nx, ny, nz);
        [x, y, z] = [nx, ny, nz];
      }
    }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}

// ------------------------------------------------------------------ bodies (cat space: feet on y = 0, facing +Z)

interface PoseDef {
  body: (P: Painter) => THREE.BufferGeometry[];
  /** Where the neck meets the head, and the head's centre from there. */
  pivot: [number, number, number];
  headOffset: [number, number, number];
  /** Head pitch asleep and awake (+ = nose down). */
  asleep: number;
  awake: number;
  tail: { at: [number, number, number]; yaw: number; bend: number[]; lift: number[] };
}

/** Body markings by position in cat space, so overlapping parts agree where they meet. */
function loafMarks(p: THREE.Vector3): Fur {
  const bib = ss(0.07, 0.15, p.z) * ss(0.16, 0.085, p.y) * ss(0.075, 0.03, Math.abs(p.x));
  return {
    stripe: p.z * 72,
    k: ss(0.025, 0.07, p.y) * (1 - bib),
    dark: ss(0.025, 0.006, Math.abs(p.x)) * ss(0.12, 0.15, p.y) * ss(0.11, 0.06, p.z),
    w1: Math.max(bib, ss(0.03, 0.02, p.y) * 0.35),
    w2: Math.max(ss(0.03, 0.12, p.z) * ss(0.19, 0.1, p.y), ss(0.04, 0.026, p.y)),
  };
}
function sitMarks(p: THREE.Vector3): Fur {
  const bib = ss(0.02, 0.075, p.z) * ss(0.26, 0.17, p.y) * ss(0.062, 0.028, Math.abs(p.x));
  const belly = ss(0.05, 0.1, p.z) * ss(0.13, 0.06, p.y);
  return {
    stripe: p.y * 70 - p.z * 25,
    k: ss(0.02, 0.05, p.y) * (1 - bib) * (1 - belly),
    dark: ss(0.02, 0.006, Math.abs(p.x)) * ss(-0.03, -0.09, p.z) * 0.8,
    w1: Math.max(bib, belly * 0.85, ss(0.03, 0.018, p.y) * 0.35),
    w2: Math.max(ss(0, 0.07, p.z) * ss(0.29, 0.12, p.y), ss(0.045, 0.028, p.y), ss(0.055, 0.085, p.z) * ss(0.16, 0.1, p.y)),
  };
}

const POSES: Record<CatPose, PoseDef> = {
  loaf: {
    body: (P) => {
      const fur = (p: THREE.Vector3) => P(p, loafMarks(p));
      return [
        blob({ // torso, flattened where it rests and a little fuller over the haunches
          c: [0, 0.064, -0.03], r: [0.09, 0.09, 0.185], seg: [28, 18], paint: fur,
          deform: (u) => {
            if (u.y < -0.5) u.y = -0.5 + (u.y + 0.5) * 0.3;
            u.x *= 1 + 0.12 * ss(0.1, -0.8, u.z) - 0.08 * ss(0.3, 0.9, u.z);
            u.y *= 1 + 0.06 * ss(0, -0.8, u.z);
          },
        }),
        ...[-1, 1].map((s) => blob({ c: [s * 0.072, 0.062, -0.105], r: [0.05, 0.058, 0.082], rot: [0, s * 0.15, 0], paint: fur })), // folded hind legs
        ...[-1, 1].map((s) => blob({ c: [s * 0.082, 0.016, -0.02], r: [0.022, 0.016, 0.046], paint: fur })), // hind feet
        blob({ c: [0, 0.084, 0.105], r: [0.066, 0.07, 0.066], paint: fur }), // chest
        ...[-1, 1].map((s) => blob({ c: [s * 0.03, 0.015, 0.158], r: [0.022, 0.015, 0.03], paint: fur })), // front paws, tucked
        blob({ c: [0, 0.128, 0.098], r: [0.055, 0.052, 0.058], paint: fur }), // neck and shoulders
      ];
    },
    pivot: [0, 0.15, 0.115],
    headOffset: [0, 0.035, 0.03],
    asleep: 0.42,
    awake: -0.06,
    // from the left of the rump, round and forward along the flank
    tail: { at: [-0.04, 0.03, -0.195], yaw: 1.07, bend: [0.45, 0.5, 0.45, 0.3, 0.2, 0.1, 0.05, 0.02], lift: [] },
  },
  sit: {
    body: (P) => {
      const fur = (p: THREE.Vector3) => P(p, sitMarks(p));
      const leg = (p: THREE.Vector3) => {
        const m = sitMarks(p);
        return P(p, { ...m, stripe: p.y * 95, k: (m.k ?? 0) * ss(0.075, 0.05, p.z) });
      };
      return [
        blob({ // pear-shaped torso, leaning back from the chest
          c: [0, 0.1, -0.03], r: [0.075, 0.12, 0.085], rot: [0.3, 0, 0], seg: [26, 20], paint: fur,
          deform: (u) => {
            u.x *= 1 + 0.28 * ss(0.2, -0.9, u.y);
            u.z *= 1 + 0.15 * ss(0, -0.9, u.y);
            if (u.y < -0.75) u.y = -0.75 + (u.y + 0.75) * 0.3;
          },
        }),
        ...[-1, 1].map((s) => blob({ c: [s * 0.06, 0.05, -0.05], r: [0.048, 0.055, 0.075], rot: [0.2, 0, 0], paint: fur })), // haunches
        ...[-1, 1].map((s) => blob({ c: [s * 0.05, 0.014, 0.035], r: [0.022, 0.014, 0.048], paint: fur })), // hind feet
        blob({ c: [0, 0.165, 0.045], r: [0.06, 0.07, 0.055], rot: [0.3, 0, 0], paint: fur }), // chest
        ...[-1, 1].map((s) => blob({ c: [s * 0.028, 0.075, 0.07], r: [0.02, 0.075, 0.022], rot: [-0.08, 0, 0], paint: leg })), // front legs
        ...[-1, 1].map((s) => blob({ c: [s * 0.028, 0.013, 0.085], r: [0.023, 0.014, 0.03], paint: fur })), // front paws
        blob({ c: [0, 0.215, 0.04], r: [0.045, 0.05, 0.045], paint: fur }), // neck
      ];
    },
    pivot: [0, 0.235, 0.045],
    headOffset: [0, 0.035, 0.025],
    asleep: 0.18,
    awake: -0.05,
    // from the right of the rump, round the haunch and across in front of the paws
    tail: { at: [0.04, 0.026, -0.115], yaw: -1.07, bend: [-0.45, -0.5, -0.45, -0.2, -0.1, -0.25, -0.35, -0.37], lift: [] },
  },
};

// ------------------------------------------------------------------ tail (skinned, so it bends smoothly)

const TAIL_BONES = 8, TAIL_LEN = 0.3;

function tailMesh(P: Painter, coat: Coat, material: THREE.Material) {
  const g = new THREE.CylinderGeometry(0.0105, 0.019, TAIL_LEN, 10, TAIL_BONES * 3);
  g.deleteAttribute('uv');
  g.translate(0, TAIL_LEN / 2, 0);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), idx: number[] = [], wt: number[] = [];
  const p = new THREE.Vector3(), seg = TAIL_LEN / TAIL_BONES;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const along = p.y / TAIL_LEN;
    const c = P(p, { stripe: p.y * 62, k: 1 }).clone();
    if (coat.tabby) c.lerp(new THREE.Color(coat.stripe), ss(0.82, 0.95, along) * 0.8); // dark tip
    col.set([c.r, c.g, c.b], i * 3);
    const f = Math.min(TAIL_BONES - 1e-4, Math.max(0, p.y / seg)), b = Math.floor(f);
    idx.push(b, b + 1, 0, 0);
    wt.push(1 - (f - b), f - b, 0, 0);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  const bones: THREE.Bone[] = [];
  for (let i = 0; i <= TAIL_BONES; i++) {
    const b = new THREE.Bone();
    if (i) {
      b.position.y = seg;
      bones[i - 1].add(b);
    }
    bones.push(b);
  }
  const mesh = new THREE.SkinnedMesh(g, material);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false; // its bound box is the straight tail; the cat is culled as a whole anyway
  return { mesh, bones };
}

// ------------------------------------------------------------------ the cat

export interface Cat {
  root: THREE.Group;
  /** Each frame, with where the nearest person is (world space), or null when nobody's close. */
  update(dt: number, time: number, near: THREE.Vector3 | null): void;
  /** Stroked: a happy squint and a head rub for a few seconds. */
  pet(): void;
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createCat(opts: { coat: CatCoat; pose: CatPose; seed?: number; scale?: number }): Cat {
  const coat = COATS[opts.coat], pose = POSES[opts.pose], seed = opts.seed ?? 1;
  const P = painter(coat, seed);
  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const root = new THREE.Group();
  root.scale.setScalar(opts.scale ?? 1);
  root.name = 'cat';

  const shadowed = <T extends THREE.Object3D>(m: T) => ((m.castShadow = m.receiveShadow = true), m);
  const body = shadowed(new THREE.Mesh(merge(pose.body(P)), furMat));
  root.add(body);

  const head = new THREE.Group();
  head.position.set(...pose.pivot);
  root.add(head);
  const face = new THREE.Group(); // the head itself, offset from the neck pivot
  face.position.set(...pose.headOffset);
  head.add(face);
  face.add(shadowed(new THREE.Mesh(headGeometry(P, coat), furMat)));
  const ears = [-1, 1].map((s) => {
    const ear = shadowed(new THREE.Mesh(earGeometry(P), furMat));
    ear.position.set(s * 0.03, 0.036, -0.004);
    ear.rotation.set(-0.18, s * 0.38, s * -0.28);
    face.add(ear);
    return ear;
  });
  const eyes = new THREE.Mesh(eyesGeometry(coat), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18 }));
  eyes.position.y = EYE_Y;
  face.add(eyes);
  const lids = new THREE.Mesh(lidsGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  lids.position.y = EYE_Y;
  face.add(lids);
  face.add(new THREE.LineSegments(whiskerGeometry(), new THREE.LineBasicMaterial({ color: 0xf4f0e6, transparent: true, opacity: 0.8 })));

  const tail = tailMesh(P, coat, furMat);
  const tailRoot = new THREE.Group();
  tailRoot.rotation.set(-Math.PI / 2, 0, 0); // along the ground, pointing back; bones bend about their own z (sideways) and x (up)
  const tailYaw = new THREE.Group(); // where it leaves the body, and which way it sets off
  tailYaw.position.set(...pose.tail.at);
  tailYaw.rotation.y = pose.tail.yaw;
  tailYaw.add(tailRoot);
  tailRoot.add(shadowed(tail.mesh));
  root.add(tailYaw);
  const rest = tail.bones.map((_, i) => ({ z: pose.tail.bend[i] ?? 0, x: pose.tail.lift[i] ?? 0 }));

  // ---- behaviour
  const rand = (() => {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  })();
  let awake = 0, petted = 0, blinkIn = 2 + rand() * 3, blink = 0, twitchIn = 3 + rand() * 6, twitch = 0, twitchEar = 0, flickIn = 2, flick = 0;
  let yaw = 0, pitch = pose.asleep, roll = 0;
  const local = new THREE.Vector3();

  const update = (dt: number, time: number, near: THREE.Vector3 | null) => {
    if (!root.visible) return;
    petted = Math.max(0, petted - dt);
    awake = damp(awake, near || petted > 0 ? 1 : 0, near ? 2.2 : 0.6, dt);
    const happy = petted > 0;

    // breathing (slower when asleep), with a purr's flutter while being stroked
    const br = Math.sin(time * (awake > 0.5 ? 2.2 : 1.4) + seed) * (happy ? 0.02 : 0.028) + (happy ? Math.sin(time * 26) * 0.004 : 0);
    body.scale.set(1 + br * 0.6, 1 + br, 1);

    // where to look: at the person (clamped), or down onto the paws to sleep
    let tYaw = 0, tPitch = pose.asleep + (pose.awake - pose.asleep) * awake;
    if (near && awake > 0.3) {
      local.copy(near);
      root.worldToLocal(local);
      const dx = local.x - pose.pivot[0], dz = local.z - pose.pivot[2], dist = Math.hypot(dx, dz);
      tYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(dx, dz)));
      if (Math.abs(Math.atan2(dx, dz)) > 2.2) tYaw = 0; // right behind: don't wring its neck
      tPitch = Math.max(-0.5, Math.min(0.1, pose.awake - Math.atan2(1.4, Math.max(0.6, dist)) * 0.45));
    }
    const tRoll = happy ? Math.sin(time * 3.2) * 0.28 : 0;
    yaw = damp(yaw, tYaw * awake, 3, dt);
    pitch = damp(pitch, tPitch, 2.5, dt);
    roll = damp(roll, tRoll, 4, dt);
    head.rotation.set(pitch, yaw, roll, 'YXZ');

    // eyes: shut asleep; open and blinking when awake; a happy upturned squint while stroked
    if ((blinkIn -= dt) < 0) {
      blink = 0.16;
      blinkIn = 2 + rand() * 4;
    }
    blink = Math.max(0, blink - dt);
    const open = happy ? 0 : awake > 0.55 ? (blink > 0 ? 0.08 : 1) : 0;
    eyes.visible = open > 0.05;
    eyes.scale.y = Math.max(0.08, open);
    lids.visible = !eyes.visible;
    lids.scale.y = happy ? -1 : 1;

    // ears: perk up toward a visitor, flatten a touch asleep, and the odd twitch
    if ((twitchIn -= dt) < 0) {
      twitch = 0.25;
      twitchEar = rand() < 0.5 ? 0 : 1;
      twitchIn = 2.5 + rand() * 7;
    }
    twitch = Math.max(0, twitch - dt);
    ears.forEach((ear, i) => {
      const s = i ? 1 : -1, tw = i === twitchEar && twitch > 0 ? Math.sin((0.25 - twitch) * 40) * 0.35 : 0;
      ear.rotation.set(-0.18 - 0.12 * (1 - awake) + tw * 0.5, s * (0.38 + 0.1 * (1 - awake)), s * (-0.28 - tw));
    });

    // tail: a slow sway, a flick now and then (more often when watching someone), swishing when stroked
    if ((flickIn -= dt) < 0) {
      flick = 0.6;
      flickIn = (awake > 0.5 ? 1.2 : 4) + rand() * 4;
    }
    flick = Math.max(0, flick - dt);
    tail.bones.forEach((b, i) => {
      const t = i / TAIL_BONES, f = flick > 0 ? Math.sin((0.6 - flick) * 14) * Math.sin(((0.6 - flick) / 0.6) * Math.PI) * 0.5 * t * t : 0;
      const sway = Math.sin(time * 0.9 + i * 0.5 + seed) * 0.03 * t + (happy ? Math.sin(time * 4 + i * 0.6) * 0.12 * t : 0);
      b.rotation.set(rest[i].x + (happy ? 0.05 * t : 0), 0, rest[i].z + sway + f);
    });
  };

  return { root, update, pet: () => (petted = 3.2) };
}
