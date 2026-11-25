import * as THREE from 'three';
import { mergeGeometries as mergeAll } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const mergeGeometries = (g: THREE.BufferGeometry[]) => (g.length ? mergeAll(g) : new THREE.BufferGeometry());
import { glowTexture } from '../core/textures';
import { mulberry32 } from '../core/math';

/**
 * 洞瀑: a waterfall with a cave behind it. A curved cliff wraps round a pool; a stream runs across the clifftop,
 * spills through a notch and arcs down into the pool. Behind the falling water an arched cave opens in the cliff, its
 * floor a ledge a few metres above the water, and rough stone steps climb the foot of the cliff to it. Trees and
 * bushes on the clifftop and on small ledges up the sides; greenery hangs from the lip.
 *
 * The rock is one solid, defined as a signed distance (negative inside) and meshed with surface nets, then shaded by
 * how much sky each spot sees, so the cave goes dark inside. Built round the pool, ground level y 0, +z toward the
 * viewer.
 */

// ---------- noise ----------
function h3(x: number, y: number, z: number) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = h3(ix, iy, iz), b = h3(ix + 1, iy, iz), c = h3(ix, iy + 1, iz), d = h3(ix + 1, iy + 1, iz);
  const e = h3(ix, iy, iz + 1), f = h3(ix + 1, iy, iz + 1), g = h3(ix, iy + 1, iz + 1), k = h3(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (k - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
const sn3 = (x: number, y: number, z: number) => vn3(x, y, z) * 2 - 1;

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
/** A rough ellipsoid distance (good enough near its surface). */
const ellipsoid = (x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) =>
  (Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz) - 1) * Math.min(rx, ry, rz);

// ---------- the layout (metres) ----------
/** The cliff curves round this point; its height at the back; the pool's water; the cave's floor. */
const C = { x: 0, z: -2 }, HC = 19, POOL_Y = -0.3, FLOOR_Y = 3.0;
/** The pool (centre and radius) and the stream / fall: centre line x and half width. */
const POOL = { x: -0.8, z: -2, r: 7.0 };
const XC = 0.4, HW = 2.1;

/** Bearing round the cliff from its back (0), positive to the right. */
const bearing = (x: number, z: number) => Math.atan2(x - C.x, -(z - C.z));
/** How far the cliff's face stands from C at a bearing and height: widening toward the sides, overhanging at the top. */
function faceR(phi: number, y: number) {
  const a = Math.abs(phi), cliff = 1 - sstep(0.4, 1.15, a); // 1 behind the fall … 0 round the sides, where it's a hillside
  return 9 + 3.2 * (a / 1.6) ** 2 + 0.9 * sn3(phi * 2.3, y * 0.07, 0.5) - 0.9 * sstep(0.6, 1, y / HC) * cliff + 1.1 * (1 - sstep(0, 2.5, y)) + y * 1.15 * (1 - cliff);
}
/** The clifftop: highest at the back, sinking into the meadow round the front; the stream's channel down the middle. */
function topY(x: number, z: number) {
  const a = Math.abs(bearing(x, z));
  let h = (HC + 1.0 * sn3(x * 0.08, 3.3, z * 0.08)) * (1 - sstep(1.1, 2.05, a)) - 1.5 * sstep(1.4, 2.05, a);
  h += 0.04 * Math.max(0, -(z + 14)) * 4 * (1 - sstep(1.1, 2.05, a)); // rising gently into the hills behind
  const ch = 1 - sstep(HW - 0.2, HW + 1.6, Math.abs(x - XC));
  return h - 1.3 * ch * (z < C.z - 6 ? 1 : 0);
}
/** The lip the water leaves from, its surface on the clifftop, and where it lands. */
const LIP_Z = C.z - faceR(0, HC) + 0.3, SY = HC - 0.85, LAND_Z = -6.4;
const G = 9.8, T_FALL = Math.sqrt((2 * (SY - POOL_Y)) / G), V = (LAND_Z - LIP_Z) / T_FALL;
const arcZ = (y: number) => LIP_Z + V * Math.sqrt((2 * Math.max(0, SY - y)) / G);
/** The cave: its mouth and chamber; the ledge in front of the mouth reaches out to SHELF_Z. */
const FACE_Z = C.z - faceR(0, FLOOR_Y + 3);
const MOUTH = [XC, FLOOR_Y + 3.3, FACE_Z + 0.6, 4.3, 4.6, 3.4] as const, CHAMBER = [XC + 0.6, FLOOR_Y + 3.0, FACE_Z - 5.2, 6.6, 5.2, 6.0] as const;
const SHELF_Z = LAND_Z - 1.35;

// ---------- the stairs: a curving flight from the right bank up to the cave's ledge ----------
const PATH = new THREE.CatmullRomCurve3([new THREE.Vector3(8.4, 0, -0.6), new THREE.Vector3(8.3, 0, -4.9), new THREE.Vector3(6.6, 0, -7.9), new THREE.Vector3(XC + 3.6, 0, SHELF_Z - 1.4)]);
const PATH_PTS = PATH.getSpacedPoints(80), PATH_LEN = PATH.getLength();
const STEPS = 13, RISE = FLOOR_Y / STEPS;
const PBOX = PATH_PTS.reduce((b, p) => [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)], [1e9, -1e9, 1e9, -1e9]);
/** Nearest point on the stairs' line: distance across, and how far along (0 … 1). */
function onPath(x: number, z: number) {
  let best = 1e9, s = 0;
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const a = PATH_PTS[i], b = PATH_PTS[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
    const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / l2)), dx = x - a.x - ex * t, dz = z - a.z - ez * t, d = dx * dx + dz * dz;
    if (d < best) { best = d; s = (i + t) / (PATH_PTS.length - 1); }
  }
  return { d: Math.sqrt(best), s };
}
function stairRock(x: number, y: number, z: number) {
  if (x < PBOX[0] - 5 || x > PBOX[1] + 5 || z < PBOX[2] - 5 || z > PBOX[3] + 5) return 1e9;
  const { d, s } = onPath(x, z), h = s * FLOOR_Y, flare = Math.max(0, h - y) * 0.35;
  const r = Math.max(d - 0.95 - flare, (y - h + 0.28) * 0.8, -2 - y);
  if (r > 2.5) return r;
  return r + (0.4 * sn3(x * 0.5, y * 0.5, z * 0.5) + 0.18 * sn3(x * 1.2, y * 1.2, z * 1.2)) * sstep(0.1, 0.9, h - y + 0.3);
}

// ---------- the rock ----------
/** Small shelves on the cliff's face (bearing, height), for plants. */
const LEDGES: [number, number][] = [[-0.62, 14.5], [-0.7, 8], [0.62, 13.5], [0.72, 7.5]];
const LEDGE_AT = LEDGES.map(([phi, y]) => { const r = faceR(phi, y) - 0.6; return [C.x + Math.sin(phi) * r, y, C.z - Math.cos(phi) * r, phi] as const; });
/** Where people walk, the rock stays fairly even. */
function walkMask(x: number, y: number, z: number) {
  const cave = sstep(7.6, 5.6, Math.hypot((x - XC) / 1.0, (z - (FACE_Z - 3)) / 1.2)) * Math.exp(-(((y - FLOOR_Y) / 0.9) ** 2));
  return 1 - 0.85 * cave;
}
/** Room for the water: a channel across the top and a slot round the falling arc. */
function waterRoom(x: number, y: number, z: number) {
  const ax = Math.abs(x - XC);
  const channel = Math.max(ax - HW - 0.25, SY - 0.55 - y, z - LIP_Z - 0.3);
  const fall = Math.max(ax - HW - 0.45, Math.abs(z - arcZ(y)) - 0.9, y - SY - 0.6);
  return Math.min(channel, fall);
}
/** The rock's shape: `fine` adds the surface detail (leave it off to trace light cheaply). */
function shape(x: number, y: number, z: number, fine: boolean) {
  const r = Math.hypot(x - C.x, z - C.z), phi = bearing(x, z);
  let d = smax(faceR(phi, y) - r, y - topY(x, z), 1.8); // beyond the face and under the top
  d = smax(d, Math.max(Math.abs(x) - 25, -(z + 29)), 2.5); // the block's far ends
  // the cave's ledge, reaching out under the mouth
  const shelf = Math.max(ellipsoid(x, FLOOR_Y - 2.5, z, XC, FLOOR_Y - 2.5, FACE_Z, 5.8, 9, SHELF_Z - FACE_Z), y - FLOOR_Y, -3 - y);
  d = smin(d, shelf, 1.2);
  for (const [lx, ly, lz] of LEDGE_AT) d = smin(d, Math.max(ellipsoid(x, y, z, lx, ly - 0.5, lz, 1.9, 1.0, 1.9), y - ly), 0.9);
  if (fine && d > -3.2 && d < 3.2) {
    const wx = x + 1.5 * sn3(x * 0.06, y * 0.06 + 3.1, z * 0.06), wy = y + 0.8 * sn3(x * 0.06 + 7.7, y * 0.06, z * 0.06 + 1.3), wz = z + 1.5 * sn3(x * 0.06 + 2.9, y * 0.06 + 5.3, z * 0.06);
    let n = 1.0 * sn3(wx * 0.14, wy * 0.14, wz * 0.14) + 0.45 * sn3(wx * 0.33, wy * 0.33, wz * 0.33);
    n += 0.4 * (1 - 2 * Math.abs(sn3(wx * 0.42, wy * 0.11, wz * 0.42))) - 0.08; // ribs and fissures, running up and down
    n += 0.14 * sn3(x * 1.3, y * 1.3, z * 1.3);
    d += n * walkMask(x, y, z);
  }
  // the cave: hollow above its floor
  const hollow = Math.max(smin(ellipsoid(x, y, z, ...MOUTH), ellipsoid(x, y, z, ...CHAMBER), 2.2) + (fine ? 0.5 * sn3(x * 0.3, y * 0.3, z * 0.3) : 0), FLOOR_Y - y);
  d = smax(d, -hollow, 0.8);
  d = smin(d, fine ? stairRock(x, y, z) : 1e9, 0.8);
  return smax(d, -waterRoom(x, y, z), 0.3);
}
export const rockDistance = (x: number, y: number, z: number) => shape(x, y, z, true);
/** The rock without its fine detail (and without the stairs): cheap. */
const roughRock = (x: number, y: number, z: number) => shape(x, y, z, false);
const roughDistance = (x: number, y: number, z: number) => Math.min(roughRock(x, y, z), y + 0.3);

/** The ground round about: a meadow, sinking into the pool. */
export function groundHeight(x: number, z: number) {
  const base = 0.2 * sn3(x * 0.05, 0.5, z * 0.05) + 0.08 * sn3(x * 0.17, 2.5, z * 0.17);
  const dx = x - POOL.x, dz = z - POOL.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const R = POOL.r + 1.1 * sn3(Math.cos(a) * 1.4 + 3, 1.5, Math.sin(a) * 1.4 + 3) + 0.35 * sn3(Math.cos(a) * 4 + 9, 4.5, Math.sin(a) * 4 + 1);
  return base - 1.8 * (1 - sstep(R - 3.2, R + 0.4, r));
}
const sceneDistance = (x: number, y: number, z: number) => Math.min(rockDistance(x, y, z), y - groundHeight(x, z));

// ---------- surface nets ----------
function surfaceNets(f: (x: number, y: number, z: number) => number, min: [number, number, number], max: [number, number, number], c: number) {
  const nx = Math.ceil((max[0] - min[0]) / c) + 1, ny = Math.ceil((max[1] - min[1]) / c) + 1, nz = Math.ceil((max[2] - min[2]) / c) + 1;
  const n = [nx, ny, nz];
  const vals = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[id(i, j, k)] = f(min[0] + i * c, min[1] + j * c, min[2] + k * c);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const corner = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => [m & 1, (m >> 1) & 1, (m >> 2) & 1]);
  const edges: [number, number][] = [];
  for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) edges.push([a, a | bit]);
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let m = 0; m < 8; m++) { v[m] = vals[id(i + corner[m][0], j + corner[m][1], k + corner[m][2])]; if (v[m] < 0) mask |= 1 << m; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
      sy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
      sz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
      cnt++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / cnt) * c, min[1] + (j + sy / cnt) * c, min[2] + (k + sz / cnt) * c);
  }
  const index: number[] = [];
  const p = [0, 0, 0];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = vals[id(i, j, k)];
    p[0] = i; p[1] = j; p[2] = k;
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3, e = (a + 2) % 3;
      if (p[a] >= n[a] - 1 || p[b] < 1 || p[e] < 1 || p[b] >= n[b] - 1 || p[e] >= n[e] - 1) continue;
      const q = [p[0], p[1], p[2]];
      q[a]++;
      const v1 = vals[id(q[0], q[1], q[2])];
      if ((v0 < 0) === (v1 < 0)) continue;
      const at = (db: number, de: number) => { const r = [p[0], p[1], p[2]]; r[b] += db; r[e] += de; return cell[cid(r[0], r[1], r[2])]; };
      const q00 = at(-1, -1), q10 = at(0, -1), q11 = at(0, 0), q01 = at(-1, 0);
      if (q00 < 0 || q10 < 0 || q11 < 0 || q01 < 0) continue;
      if (v0 < 0) index.push(q00, q10, q11, q00, q11, q01); // solid below: faces +a
      else index.push(q00, q11, q10, q00, q01, q11);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Evens out the grid's stair-steps: relax each vertex toward its neighbours, then put it back on the surface. */
function relax(geo: THREE.BufferGeometry, f: (x: number, y: number, z: number) => number) {
  const pos = geo.attributes.position as THREE.BufferAttribute, idx = geo.index!.array, n = pos.count;
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { const a = idx[i + k], b = idx[i + ((k + 1) % 3)]; nb[a].add(b); nb[b].add(a); }
  const p = new Float32Array(pos.array as Float32Array);
  for (let i = 0; i < n; i++) {
    if (!nb[i].size) continue;
    let sx = 0, sy = 0, sz = 0;
    for (const j of nb[i]) { sx += p[j * 3]; sy += p[j * 3 + 1]; sz += p[j * 3 + 2]; }
    const m = nb[i].size;
    let x = p[i * 3] * 0.4 + (sx / m) * 0.6, y = p[i * 3 + 1] * 0.4 + (sy / m) * 0.6, z = p[i * 3 + 2] * 0.4 + (sz / m) * 0.6;
    const e = 0.08, d = f(x, y, z);
    const gx = (f(x + e, y, z) - d) / e, gy = (f(x, y + e, z) - d) / e, gz = (f(x, y, z + e) - d) / e, g2 = gx * gx + gy * gy + gz * gz;
    if (g2 > 1e-4 && Math.abs(d) < 0.6) { x -= (d * gx) / g2; y -= (d * gy) / g2; z -= (d * gz) / g2; }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
}

// ---------- light ----------
/** Directions over the sky (a Fibonacci hemisphere). */
const SKY_DIRS = Array.from({ length: 14 }, (_, i) => {
  const y = 0.08 + 0.92 * ((i + 0.5) / 14), r = Math.sqrt(1 - y * y), a = i * 2.39996;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});
/** How much sky a spot sees, 0 … 1: deep in the cave, almost none. */
function skyView(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
  const ox = x + nx * 1.2, oy = y + ny * 1.2, oz = z + nz * 1.2;
  let seen = 0, all = 0;
  for (const [dx, dy, dz] of SKY_DIRS) {
    const w = dx * nx + dy * ny + dz * nz + 0.25;
    if (w <= 0) continue;
    all += w;
    let t = 0, hit = false;
    while (t < 26) {
      const d = roughDistance(ox + dx * t, oy + dy * t, oz + dz * t);
      if (d < 0.15) { hit = true; break; }
      t += Math.max(d, 0.35);
    }
    if (!hit) seen += w;
  }
  return all ? seen / all : 1;
}
/** Shade for a spot on the rock: nooks close by, and how much sky it sees (1 open … ~0.06 deep in the cave). */
function openness(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
  let occ = 0;
  for (const d of [0.4, 1.0, 2.2]) occ += 0.3 * clamp01((d - sceneDistance(x + nx * d, y + ny * d, z + nz * d)) / d);
  return Math.max(0.05, (1 - occ) * (0.08 + 0.92 * Math.pow(skyView(x, y, z, nx, ny, nz), 0.9)));
}
/** Shade on flat ground or water: rock overhead darkens it. */
function under(x: number, y: number, z: number) {
  let o = 1;
  for (const h of [1.2, 3, 6, 10]) if (roughRock(x, y + h, z) < 0) o -= 0.22;
  return Math.max(0.1, o);
}

// ---------- water ----------
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

/** The stream and the fall, one ribbon: x across, the time water takes to get there (s), and how far down the fall. */
function ribbonMaterial(time: { value: number }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aFall;
      varying vec2 vUv; varying float vFall;
      void main() {
        vUv = uv; vFall = aFall;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv; varying float vFall;
      ${NOISE_GLSL}
      void main() {
        float x = vUv.x, f = vFall, flow = vUv.y - uTime;   // the pattern rides with the water, stretching as it speeds up
        vec2 p = vec2(x * 11.0, flow * 2.2);
        float s = noise(p) * 0.55 + noise(p * vec2(2.3, 2.1) + 7.3) * 0.3 + noise(p * vec2(5.0, 4.3) + 1.7) * 0.15;
        float streak = smoothstep(0.42, 0.8, s);
        float falling = step(0.0005, f);
        float lip = falling * (1.0 - smoothstep(0.0, 0.07, f)) + (1.0 - falling) * smoothstep(-1.2, 0.0, vUv.y - ${'${TLIP}'}) * 0.5;
        float foot = smoothstep(0.86, 1.0, f);
        // the stream: clear green-blue with moving glints; the fall: white streaks over thin water, ragged at the sides
        vec3 stream = mix(vec3(0.13, 0.38, 0.40), vec3(0.75, 0.9, 0.92), streak * 0.35);
        vec3 fallC = mix(vec3(0.62, 0.77, 0.84), vec3(1.0), clamp(streak * 0.9 + lip + foot, 0.0, 1.0));
        vec3 col = mix(stream, fallC, falling);
        col = mix(col, vec3(1.0), lip * 0.6);
        float rag = noise(vec2(x * 9.0, flow * 3.0));
        float edge = min(x, 1.0 - x) / mix(0.06, 0.14, falling) - rag * 0.7 * falling + 0.1;
        float a = mix(0.82, 0.42 + streak * 0.55, falling) + lip * 0.3 + foot * 0.4;
        a = clamp(a, 0.0, 0.97) * clamp(edge, 0.0, 1.0) * smoothstep(0.0, 1.5, vUv.y);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
}

function poolMaterial(time: { value: number }, sky: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uFoot: { value: new THREE.Vector2(XC, LAND_Z) }, uSky: { value: sky } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aShade;
      varying vec3 vW; varying float vShade;
      void main() {
        vShade = aShade;
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec2 uFoot; uniform vec3 uSky;
      varying vec3 vW; varying float vShade;
      ${NOISE_GLSL}
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec2 q = vW.xz - uFoot; q.x *= 0.8;
        float r = length(q), t = uTime;
        float n1 = noise(vW.xz * 0.8 + vec2(t * 0.22, t * 0.09)), n2 = noise(vW.xz * 2.2 - vec2(t * 0.17, t * 0.3));
        float ring = sin(r * 2.4 - t * 2.6 + n1 * 2.0) * exp(-r * 0.2);
        float wav = (n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.4 + ring * 0.5;
        float fres = 0.06 + 0.7 * pow(1.0 - clamp(V.y + wav * 0.14, 0.0, 1.0), 3.0);
        vec3 col = mix(vec3(0.04, 0.22, 0.25), vec3(0.12, 0.42, 0.42), 0.35 + 0.3 * n1);
        col = mix(col, uSky, fres * vShade);
        col += pow(max(0.0, n1 * n2 * 2.2 - 0.95), 2.0) * 1.2 * vShade;    // glints
        float foam = smoothstep(3.2, 0.4, r + (n1 - 0.5) * 2.2) + smoothstep(0.82, 1.0, ring + n2 * 0.25) * smoothstep(6.0, 1.5, r) * 0.4;
        col = mix(col * vShade, vec3(0.93, 0.97, 1.0) * mix(0.55, 1.0, vShade), clamp(foam, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(col, 0.9);
        #include <fog_fragment>
      }`,
  });
}

// ---------- plants ----------
const GREENS = [0x4f7f37, 0x5d8f3c, 0x3f6e33, 0x6f9a45, 0x557d3a, 0x466f30].map((c) => new THREE.Color(c));
function coloured(g: THREE.BufferGeometry, c: THREE.Color) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const n = ng.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return ng;
}

/**
 * Builds the whole thing. `sky` is the colour the pool reflects. Returns the group to add, and an update to call
 * every frame with the time in seconds.
 */
export function buildCaveFalls(opts: { sky?: THREE.Color; ground?: boolean } = {}) {
  const group = new THREE.Group();
  const time = { value: 0 };
  const rng = mulberry32(7);

  // --- the rock ---
  {
    const rock = surfaceNets(rockDistance, [-27, -3.5, -31], [27, 24, 8], 0.5);
    relax(rock, rockDistance);
    const pos = rock.attributes.position as THREE.BufferAttribute, nor = rock.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const A = new THREE.Color(0x938b80), B = new THREE.Color(0x7c7366), c = new THREE.Color(), gc = new THREE.Color();
    const grassA = new THREE.Color(0x5f8f3a), grassB = new THREE.Color(0x86a84e), soil = new THREE.Color(0x6f6250);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), up = nor.getY(i);
      const o = openness(x, y, z, nor.getX(i), up, nor.getZ(i));
      const byWater = Math.max(0, 1 - Math.max(Math.abs(x - XC) - HW, 0) / 1.2) * (z < LIP_Z + 1.5 && y > SY - 2.5 ? 1 : 0);
      const grassy = sstep(0.5, 0.74, up + 0.12 * sn3(x * 0.3, y * 0.3, z * 0.3)) * sstep(0.35, 0.6, o) * (1 - (1 - walkMask(x, y, z)) / 0.85) * (1 - byWater);
      c.copy(A).lerp(B, clamp01(0.5 + 0.9 * sn3(x * 0.08, y * 0.05, z * 0.08)));
      c.multiplyScalar(0.92 + 0.1 * sn3(x * 0.5, y * 0.12, z * 0.5)); // faint streaks down the face
      const nearFall = Math.max(0, 1 - Math.max(Math.abs(x - XC) - HW, 0) / 2.2) * Math.max(0, 1 - Math.abs(z - arcZ(y)) / 3.5) * (y < SY ? 1 : 0);
      const wet = Math.max(nearFall, Math.max(0, 1 - (y - POOL_Y) / 0.8) * 0.8);
      c.multiplyScalar(1 - 0.35 * clamp01(wet));
      c.lerp(soil, sstep(0.25, 0.55, up) * 0.45 * (1 - byWater)); // earth caught on the shelves
      gc.copy(grassA).lerp(grassB, clamp01(0.5 + 0.9 * sn3(x * 0.08, 7.5 + y * 0.02, z * 0.08)));
      c.lerp(gc, grassy).multiplyScalar(grassy > 0.5 ? 0.45 + 0.55 * o : o);
      col.set([c.r, c.g, c.b], i * 3);
    }
    rock.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- rough stone steps up the curve ---
  {
    const parts: THREE.BufferGeometry[] = [], stone = new THREE.Color(0x8a8276), c = new THREE.Color();
    const dz = PATH_LEN / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const u = (i + 0.5) / STEPS, p = PATH.getPointAt(u), t = PATH.getTangentAt(u), top = (i + 1) * RISE;
      const g = new THREE.BoxGeometry(1.75 * (0.9 + 0.15 * rng()), 0.5, dz + 0.12, 2, 1, 2);
      const gp = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < gp.count; k++) gp.setXYZ(k, gp.getX(k) * (1 + 0.06 * sn3(k, i, 1)), gp.getY(k), gp.getZ(k) * (1 + 0.08 * sn3(k, i, 2)));
      g.translate(0, top - 0.25, 0).rotateY(Math.atan2(t.x, t.z) + (rng() - 0.5) * 0.1).translate(p.x + (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.03, p.z);
      parts.push(coloured(g, c.copy(stone).multiplyScalar(0.85 + 0.18 * rng())));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- the ground and the pool ---
  if (opts.ground !== false) {
    const W = 120, D = 100, N = 0.8;
    const g = new THREE.PlaneGeometry(W, D, Math.round(W / N), Math.round(D / N)).rotateX(-Math.PI / 2).translate(0, 0, 8);
    const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const grass = [new THREE.Color(0x5f8f3a), new THREE.Color(0x86a84e)], soil = new THREE.Color(0x6f6250), sand = new THREE.Color(0x9b8f77), bed = new THREE.Color(0x34443a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = groundHeight(x, z);
      pos.setY(i, y);
      c.copy(grass[0]).lerp(grass[1], clamp01(0.5 + 0.9 * sn3(x * 0.08, 7.5, z * 0.08)));
      const nearRock = 1 - sstep(0.3, 2.2, roughRock(x, y + 0.3, z));
      c.lerp(soil, nearRock * 0.8);
      c.lerp(sand, 1 - sstep(0.05, 0.45, Math.abs(y - POOL_Y + 0.05)));
      if (y < POOL_Y - 0.1) c.copy(bed).multiplyScalar(1 - 0.4 * sstep(-0.3, -1.6, y));
      c.multiplyScalar(under(x, y, z));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    group.add(mesh);
    group.add(new THREE.Mesh(new THREE.RingGeometry(45, 600, 48, 1).rotateX(-Math.PI / 2).translate(0, -0.2, 8), new THREE.MeshStandardMaterial({ color: 0x6f9a44, roughness: 1 })));
  }
  {
    const R = POOL.r + 3;
    const g = new THREE.PlaneGeometry(R * 2, R * 2, 40, 40).rotateX(-Math.PI / 2).translate(POOL.x, POOL_Y, POOL.z);
    const pos = g.attributes.position as THREE.BufferAttribute, shade = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) shade[i] = under(pos.getX(i), POOL_Y, pos.getZ(i));
    g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    const mesh = new THREE.Mesh(g, poolMaterial(time, opts.sky ?? new THREE.Color(0xd2e6ee)));
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // --- the stream and the fall: one ribbon that bends over the lip ---
  {
    const BACK = -27, FLOW = 1.6, COLS = 16;
    const rows: { z: number; y: number; tau: number; f: number }[] = [];
    for (let z = BACK; z < LIP_Z; z += 0.5) rows.push({ z, y: SY, tau: (z - BACK) / FLOW, f: 0 });
    const tLip = (LIP_Z - BACK) / FLOW, NF = 56;
    for (let k = 0; k <= NF; k++) {
      const t = T_FALL * (k / NF) ** 1.15;
      rows.push({ z: LIP_Z + V * t, y: SY - 0.5 * G * t * t, tau: tLip + t, f: k ? t / T_FALL : 0 });
    }
    const pos: number[] = [], uv: number[] = [], fall: number[] = [], index: number[] = [];
    rows.forEach((r, j) => {
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS, bow = Math.sin(Math.PI * u) * 0.35 * Math.sin(Math.PI * Math.min(1, r.f * 1.4));
        pos.push(XC - HW + u * HW * 2 + (u - 0.5) * r.f * 0.8, r.y, r.z + bow); // fans out a little as it falls
        uv.push(u, r.tau);
        fall.push(r.f);
        if (j && i) { const a = (j - 1) * (COLS + 1) + i - 1, b = a + 1, c = a + COLS + 1, d = c + 1; index.push(a, c, b, b, c, d); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 1));
    g.setIndex(index);
    const mat = ribbonMaterial(time);
    mat.fragmentShader = mat.fragmentShader.replace('${TLIP}', tLip.toFixed(3));
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // --- mist at the foot ---
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xf4fbff, transparent: true, opacity: 0.2, depthWrite: false }));
    s.position.set(XC + (i - 1) * 1.6, 1.0 + i * 0.4, LAND_Z + 0.5);
    group.add(s);
    mists.push(s);
  }

  // --- plants ---
  const surfaceY = (x: number, z: number, from = 26) => {
    for (let y = from; y > -3; y -= 0.1) if (sceneDistance(x, y, z) < 0) return y + 0.05;
    return groundHeight(x, z);
  };
  {
    const leaves: THREE.BufferGeometry[] = [], bark: THREE.BufferGeometry[] = [];
    const green = (k = 1) => GREENS[Math.floor(rng() * GREENS.length)].clone().multiplyScalar((0.9 + rng() * 0.2) * k);
    const tree = (x: number, y: number, z: number, h: number) => {
      const trunkH = h * 0.42;
      bark.push(new THREE.CylinderGeometry(h * 0.025, h * 0.042, trunkH + 0.4, 6).translate(x, y - 0.2 + (trunkH + 0.4) / 2, z));
      const n = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = h * 0.18 * Math.sqrt(rng()), s = h * (0.16 + rng() * 0.1);
        leaves.push(coloured(new THREE.IcosahedronGeometry(s, 0).scale(1, 0.85, 1).translate(x + Math.cos(a) * rr, y + trunkH + h * 0.1 + rng() * h * 0.3, z + Math.sin(a) * rr), green()));
      }
    };
    const bush = (x: number, y: number, z: number, s: number) => {
      for (let i = 0; i < 3; i++) leaves.push(coloured(new THREE.IcosahedronGeometry(s * (0.6 + rng() * 0.4), 0).scale(1.2, 0.75, 1.2).translate(x + (rng() - 0.5) * s, y + s * 0.3, z + (rng() - 0.5) * s), green()));
    };
    // on the clifftop: a row of trees back from the rim, thinning toward the low ends
    for (let k = 0; k < 26; k++) {
      const phi = (rng() - 0.5) * 3.1, r = faceR(phi, HC) + 1.5 + rng() * 9, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (Math.abs(x - XC) < HW + 1.5 || Math.abs(x) > 23 || z < -28) continue;
      const y = surfaceY(x, z);
      if (y < 1) continue;
      if (rng() < 0.55) tree(x, y, z, 4.5 + rng() * 3); else bush(x, y, z, 0.8 + rng() * 0.6);
    }
    // up the hillsides either side of the cliff, low to high
    for (let k = 0; k < 60; k++) {
      const side = k % 2 ? 1 : -1, phi = side * (0.75 + rng() * 1.1), y0 = rng() * HC * 0.85, r = faceR(phi, y0) + 0.6, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (Math.abs(x) > 23 || onPath(x, z).d < 2) continue;
      const y = surfaceY(x, z);
      if (y < 0.5) continue;
      if (rng() < 0.4) tree(x, y, z, 3.5 + rng() * 2.5); else bush(x, y, z, 0.6 + rng() * 0.6);
    }
    // up the cliff: on each ledge a small tree or bushes
    LEDGE_AT.forEach(([lx, ly, lz, phi], i) => {
      const ox = -Math.sin(phi) * 0.6, oz = Math.cos(phi) * 0.6; // a little out from the face
      if (i % 2) tree(lx + ox, ly, lz + oz, 3 + rng() * 1.2);
      bush(lx + ox * 1.6 + 0.5, ly, lz + oz * 1.6, 0.6 + rng() * 0.3);
      bush(lx + ox * 1.2 - 0.6, ly, lz + oz * 1.2 + 0.3, 0.5 + rng() * 0.3);
    });
    // at the cliff's foot, round the pool, and beside the stairs
    for (const [x, z, s, t] of [[-11.5, -3, 1, 1], [-10.5, 1.5, 0.9, 0], [-8.6, 4.8, 1.2, 0], [11.2, -2.2, 1, 0], [10.6, -6.4, 0.9, 0], [12.8, 1.5, 1, 1], [-12.5, 6, 1, 1], [7.4, 3.6, 0.8, 0]] as const) {
      const y = groundHeight(x, z);
      if (t) tree(x, y, z, 5.5 + rng() * 2); else bush(x, y, z, s);
    }
    const lm = new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    const bm = new THREE.Mesh(mergeGeometries(bark), new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.95, flatShading: true }));
    lm.castShadow = bm.castShadow = true;
    lm.receiveShadow = true;
    group.add(lm, bm);
  }
  // greenery hanging from the lip and the ledges
  {
    const parts: THREE.BufferGeometry[] = [], c = new THREE.Color();
    for (let k = 0; k < 90; k++) {
      const phi = (rng() - 0.5) * 1.7, y0 = topY(C.x + Math.sin(phi) * 9, C.z - Math.cos(phi) * 9) - 0.3;
      const r = faceR(phi, y0) - 0.15, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (Math.abs(x - XC) < HW + 1.2 || y0 < 4) continue;
      const len = 1 + rng() * 3.2;
      parts.push(coloured(new THREE.ConeGeometry(0.12 + rng() * 0.12, len, 4).translate(0, -len / 2, 0).rotateY(rng() * 3).translate(x, y0, z), c.set(GREENS[k % GREENS.length]).multiplyScalar(0.75 + rng() * 0.25)));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    mesh.castShadow = true;
    group.add(mesh);
  }

  // --- boulders round the pool ---
  {
    const parts: THREE.BufferGeometry[] = [], c = new THREE.Color();
    const boulder = (x: number, z: number, r: number) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position as THREE.BufferAttribute, seed = rng() * 100;
      for (let i = 0; i < p.count; i++) { const k = 1 + 0.2 * sn3(p.getX(i) * 1.3 + seed, p.getY(i) * 1.3, p.getZ(i) * 1.3); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
      g.rotateY(rng() * 6.28).scale(r, r, r).translate(x, groundHeight(x, z) + r * 0.2, z);
      g.computeVertexNormals();
      parts.push(coloured(g, c.set(0x8c8579).multiplyScalar(0.78 + rng() * 0.2)));
    };
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, x = POOL.x + Math.cos(a) * (POOL.r + 0.6 + rng() * 1.2), z = POOL.z + Math.sin(a) * (POOL.r + 0.6 + rng() * 1.2);
      if (roughRock(x, 0.5, z) < 1 || onPath(x, z).d < 1.6) continue; // not in the rock, not on the stairs
      boulder(x, z, 0.35 + rng() * 0.8);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- grass on the meadow and the clifftop ---
  if (opts.ground !== false) {
    const blade = new THREE.ConeGeometry(0.07, 0.6, 3).translate(0, 0.3, 0);
    const N = 9000, inst = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N), d = new THREE.Object3D(), c = new THREE.Color();
    const lo = new THREE.Color(0x4f8a30), hi = new THREE.Color(0x93b754);
    let k = 0;
    const put = (x: number, y: number, z: number, h: number) => {
      d.position.set(x, y - 0.05, z);
      d.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      inst.setMatrixAt(k, d.matrix);
      inst.setColorAt(k, c.copy(lo).lerp(hi, rng()));
      k++;
    };
    for (let t = 0; t < 16000 && k < N - 1200; t++) {
      const x = (rng() - 0.5) * 100, z = -8 + rng() * 52, y = groundHeight(x, z);
      if (y < POOL_Y + 0.12 || roughRock(x, y + 0.3, z) < 1.2 || onPath(x, z).d < 1.3) continue;
      put(x, y, z, 0.6 + rng() * 1.5);
    }
    for (let t = 0; t < 9000 && k < N; t++) {
      const x = (rng() - 0.5) * 52, z = -28 + rng() * 34, y = surfaceY(x, z);
      if (y < 3 || rockDistance(x, y + 0.6, z) < 0.45 || Math.abs(x - XC) < HW + 0.6) continue;
      put(x, y, z, 0.5 + rng() * 1.0);
    }
    inst.count = k;
    group.add(inst);
  }

  const update = (t: number) => {
    time.value = t;
    mists.forEach((s, i) => { s.material.opacity = 0.18 * (0.75 + 0.25 * Math.sin(t * 0.7 + i)); s.scale.setScalar(6.5 * (1 + 0.15 * Math.sin(t * 0.5 + i * 1.7))); });
  };
  return { group, update };
}
