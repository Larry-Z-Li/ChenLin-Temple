import * as THREE from 'three';
import { mergeGeometries as mergeAll } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture } from '../core/textures';
import { mulberry32 } from '../core/math';
import { groundDetail } from './groundDetail';

const mergeGeometries = (g: THREE.BufferGeometry[]) => (g.length ? mergeAll(g) : new THREE.BufferGeometry());

/**
 * 洞瀑: a waterfall in a gorge cut into the mountain front, with a tall recess behind the falling water. It is the
 * land itself, shaped (the terrain follows `landAt`, and a finer patch of the same ground draws it here, so cliffs,
 * slopes and grass all come from one ground material). A stream comes down a gully from a spring, crosses the rock
 * that roofs the recess and leaps from its lip into a pool; stone steps climb from the right bank to the ledge in the
 * recess, behind the water. Built round the pool, ground level y 0, +z toward the valley.
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

// ---------- the layout (metres) ----------
/** The gorge curves round C; HC the cliff's height at the back; the pool's water; the ledge in the recess. */
const C = { x: 0, z: -3 }, HC = 48, POOL_Y = -0.65, FLOOR_Y = 3.5;
/** The pool's water level (y, in this frame): the stream leaves it at this level (see terrain.ts riverEndMeets). */
export const POOL_LEVEL = POOL_Y;
/** The pool (centre and radius), and the fall: centre line x and half width. */
const POOL = { x: -0.8, z: -6.5, r: 10 };
const XC = 0.4, HW = 4.5;
/** Bearing round the gorge from its back (0), positive to the right. */
const bearing = (x: number, z: number) => Math.atan2(x - C.x, -(z - C.z));
/** 1 for sheer cliff (round the back) … 0 for the slopes where the gorge opens out. */
const cliffness = (a: number) => 1 - sstep(1.0, 1.7, a);
/** How far the foot of the gorge's wall stands from C, wobbling a little; wide open toward the valley. */
const edgeR = (phi: number) => { const a = Math.abs(phi); return 14 + 6 * (a / 1.6) ** 2 + 80 * sstep(2.0, 2.6, a) + 1.3 * sn3(phi * 2.6, 0.5, 0.5) + 0.5 * sn3(phi * 7, 1.5, 0.5); };
/** The foot of the cliff behind the fall. */
const FACE_Z = C.z - edgeR(0);
/** The recess behind the fall (an ellipse in plan, its floor the ledge), and the rock that roofs it. */
const ALC = { x: XC, z: FACE_Z - 4, rx: 6, rz: 5.5 };
/** The stream: its level (climbing back from the lip toward the spring), its line (winding up on the hill) and half width. */
const LIP_Z = FACE_Z + 1.2, SY = HC - 6, SPRING_Z = LIP_Z - 32;
const streamY = (z: number) => SY + Math.max(0, LIP_Z - z) * 0.2;
const streamX = (z: number) => XC + 3.2 * Math.sin(Math.max(0, LIP_Z - z) * 0.085) * sstep(0, 14, LIP_Z - z);
const streamHW = (z: number) => HW + (1.5 - HW) * sstep(1, 13, LIP_Z - z);
/** The fall leaves the lip level and arcs out into the pool. */
const LAND_Z = -9.5, G = 9.8, T_FALL = Math.sqrt((2 * (SY - POOL_Y)) / G), V = (LAND_Z - LIP_Z) / T_FALL;
const arcZ = (y: number) => LIP_Z + V * Math.sqrt((2 * Math.max(0, SY - y)) / G);
/** The ledge reaches out from the recess to just short of the falling water. */
const SHELF_Z = arcZ(FLOOR_Y) - 1.4;

/** The mountain front: HC at the rim, climbing behind, its foot wandering along the valley's edge; a gully carries the stream. */
function hillTop(x: number, z: number) {
  // (round the fall the rim stays as it is, where the stream crosses it; away from it, the hill is broken up)
  const away = sstep(14, 40, Math.abs(x));
  let h = HC + 1.5 * sn3(x * 0.04, 3.3, z * 0.04) + away * (7 * sn3(x * 0.018, 3.3, 1.7) + 3 * sn3(x * 0.05, 8.1, z * 0.05)) + Math.max(0, LIP_Z - z) * 0.22;
  // its front, falling to the valley: spurs and bays, its brow and foot wandering, and down it steps of rock with
  // grassy benches between them
  const spur = away * (9 * sn3(x * 0.021, 1.9, 0.3) + 4 * sn3(x * 0.06, 5.5, 0.9) + 1.5 * sn3(x * 0.17, 2.2, 4.1));
  const f = sstep(-20 + 8 * sn3(x * 0.03, 1.1, 0.4) + spur, 9 + 8 * sn3(x * 0.022, 2.2, 0.7) + spur, z);
  const ph = 0.5 + 0.5 * sn3(x * 0.035, 6.6, 1.2), terr = (g: number) => { const k = Math.floor(g); return k + sstep(0.25, 0.85, g - k); };
  const stepped = (terr(f * 5 + ph) - terr(ph)) / (terr(5 + ph) - terr(ph));
  h *= (1 - sstep(95, 175, Math.abs(x))) * (1 - (f + (stepped - f) * 0.65 * away));
  const hw = streamHW(z), gully = (1 - sstep(hw + 1.2, hw + 5.5, Math.abs(x - streamX(z)))) * sstep(SPRING_Z - 4, SPRING_Z + 3, z);
  return h + (Math.min(h, streamY(z) - 0.8) - h) * gully;
}

// ---------- the stairs: a curving flight from the right bank up to the ledge ----------
const PATH = new THREE.CatmullRomCurve3([new THREE.Vector3(13.5, 0, 1.0), new THREE.Vector3(14.5, 0, -6.0), new THREE.Vector3(12.0, 0, -11.0), new THREE.Vector3(XC + 5.2, 0, SHELF_Z - 2.0)]);
const PATH_PTS = PATH.getSpacedPoints(100), PATH_LEN = PATH.getLength();
const STEPS = Math.round(FLOOR_Y / 0.22), RISE = FLOOR_Y / STEPS;
const PBOX = PATH_PTS.reduce((b, p) => [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)], [1e9, -1e9, 1e9, -1e9]);
/** Nearest point on the stairs' line: distance across, and how far along (0 … 1). */
function onPath(x: number, z: number) {
  if (x < PBOX[0] - 6 || x > PBOX[1] + 6 || z < PBOX[2] - 6 || z > PBOX[3] + 6) return { d: 1e9, s: 0 };
  let best = 1e9, s = 0;
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const a = PATH_PTS[i], b = PATH_PTS[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
    const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / l2)), dx = x - a.x - ex * t, dz = z - a.z - ez * t, d = dx * dx + dz * dz;
    if (d < best) { best = d; s = (i + t) / (PATH_PTS.length - 1); }
  }
  return { d: Math.sqrt(best), s };
}

/** The mock lays its own rolling meadow; in the game the land round about is the terrain's, and the pool has an outlet. */
let meadow = false;
/** The gorge's floor: level, sinking into the pool (and its outlet to the stream, in the game). */
function floorHeight(x: number, z: number) {
  const base = meadow ? 0.2 * sn3(x * 0.05, 0.5, z * 0.05) + 0.08 * sn3(x * 0.17, 2.5, z * 0.17) : 0;
  const dx = x - POOL.x, dz = z - POOL.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const R = POOL.r + 1.4 * sn3(Math.cos(a) * 1.4 + 3, 1.5, Math.sin(a) * 1.4 + 3) + 0.45 * sn3(Math.cos(a) * 4 + 9, 4.5, Math.sin(a) * 4 + 1);
  const g = base - 2.0 * (1 - sstep(R - 3.5, R + 0.4, r));
  return g; // (in the game the stream's own channel is carved by the terrain, from inside the pool's rim)
}

/** How far out from the pool's middle, this way, its floor rises out of the water (where its ring of rocks lies). */
function waterline(a: number) {
  let r = POOL.r - 4;
  while (r < POOL.r + 3 && floorHeight(POOL.x + Math.cos(a) * r, POOL.z + Math.sin(a) * r) < POOL_Y) r += 0.15;
  return r;
}
/**
 * The land (y) here: the hill, cut away into a gorge with sheer cliffs round the back and slopes where it opens out;
 * the recess behind the fall; the ledge, the stairs and the pool on its floor. `cut` is 1 inside the gorge (where the
 * land is lower than the hill would be), so the terrain knows to take this shape rather than the mountains' own.
 */
export function landAt(x: number, z: number) {
  const r = Math.hypot(x - C.x, z - C.z), phi = bearing(x, z), a = Math.abs(phi);
  // the walls are broken up all round (not the face behind the fall, nor over the stairs): big buttresses and bays,
  // ribs and gullies wandering as they go up; scree heaped at their feet; bands of sheer rock and benches (cliffRise)
  const jag = sstep(0.32, 0.6, a) * sstep(2, 6, onPath(x, z).d), raw = r - edgeR(phi), up = Math.max(0, raw) / (0.06 + 0.44 * (1 - cliffness(a)));
  const over = raw - jag * (6 * sn3(x * 0.028, up * 0.02, z * 0.028) + 2.6 * sn3(x * 0.075, up * 0.045, z * 0.075) + 1 * sn3(x * 0.2, up * 0.09, z * 0.2));
  const talus = jag * sstep(1.0, 1.5, a) * Math.max(0, 2.5 + 6 * sn3(x * 0.03, 7.7, z * 0.03)), TW = 1.7; // (its height; out TW m per metre)
  let floor = floorHeight(x, z);
  let wall = over <= -talus * TW ? -Infinity // (the walls rise from the floor: into the pool, where it's there)
    : Math.min(floor, 0) + (over < 0 ? talus * ((over + talus * TW) / (talus * TW)) ** 1.5 : talus + cliffRise(over, x, z, a, jag));
  const al = Math.hypot((x - ALC.x) / ALC.rx, (z - ALC.z) / ALC.rz);
  if (al < 1.4) wall = Math.min(wall, al < 1 ? FLOOR_Y : FLOOR_Y + ((al - 1) * ALC.rx) / 0.035);
  const sh = Math.hypot((x - XC) / 7, (z - FACE_Z) / (SHELF_Z - FACE_Z));
  if (sh < 1.05) floor = Math.max(floor, FLOOR_Y - Math.max(0, sh - 0.97) * 45); // the ledge, its edge dropping sheer to the pool
  const q = onPath(x, z);
  if (q.d < 4) floor = Math.max(floor, q.s * FLOOR_Y - Math.max(0, q.d - 1.15) * 2.2); // the stairs' bank
  const top = hillTop(x, z), y = Math.max(floor, wall);
  return { y: Math.min(top, y), cut: sstep(-0.5, 0.5, top - y) };
}
/**
 * How high the wall stands `over` m beyond its foot: sheer faces and slopes as the gorge opens; on the cliffs (by
 * `jag`), faces of varying steepness in bands, with ledges between them that come and go.
 */
function cliffRise(over: number, x: number, z: number, a: number, jag: number) {
  const cl = cliffness(a), run = 0.035 + 0.465 * (1 - cl); // metres out per metre up
  if (jag <= 0) return over / run;
  const H = 6.5 + 3 * sn3(x * 0.02, 1.3, z * 0.02);
  let o = over, h = 0, r = run;
  for (let k = 0; k < 12; k++) { // band by band up the wall: a face, sheer, leaning back or grassy, then a ledge (or none)
    const n = sn3(x * 0.035, k * 0.7, z * 0.035);
    r = run * (n > 0 ? 1 + 5 * jag * n : 1 + 0.7 * jag * (1 - cl) * n);
    const face = H * r, ledge = jag * Math.max(0, 0.4 + 2.4 * sn3(x * 0.05 + k * 1.7, k * 0.9, z * 0.05));
    if (o <= face) return h + o / r;
    (o -= face), (h += H);
    if (o <= ledge) return h + o * 0.25;
    (o -= ledge), (h += ledge * 0.25);
  }
  return h + o / r;
}
/** Where the land is the waterfall's (1) or the terrain's own (0), for blending at its edges. */
export const footprint = (x: number, z: number) => (1 - sstep(170, 190, Math.abs(x))) * (1 - sstep(60, 72, z)) * (1 - sstep(-92, -110, z));
/** The finer patch of ground drawn over the gorge (the coarse terrain is sunk out of sight under its middle). */
const PATCH = { x0: -40, x1: 40, z0: -46, z1: 18 };
const patchInset = (x: number, z: number) => Math.min(x - PATCH.x0, PATCH.x1 - x, z - PATCH.z0, PATCH.z1 - z);
/** How far under the patch the coarse terrain should sink here (0 near the patch's edge, where they meet). */
export function patchSink(x: number, z: number, h: number, heightAt: (x: number, z: number) => number) {
  const w = sstep(4, 9, patchInset(x, z));
  if (w <= 0) return 0;
  let lo = h; // the lowest land a coarse cell away, so the coarse mesh never pokes out of a cliff
  for (const [dx, dz] of [[-4.5, 0], [4.5, 0], [0, -4.5], [0, 4.5], [-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) lo = Math.min(lo, heightAt(x + dx, z + dz));
  return w * (h - lo + 1.5);
}
const landY = (x: number, z: number) => landAt(x, z).y;

// ---------- water ----------
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

/** The stream and the fall, one ribbon: x across, the time water takes to get there (s), and how far down the fall. */
function ribbonMaterial(time: { value: number }, light: { value: number }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLight: light },
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
      uniform float uTime, uLight;
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
        gl_FragColor = vec4(col * uLight * mix(vec3(0.62, 0.74, 1.0), vec3(1.0), smoothstep(0.34, 0.9, uLight)), a); // (moonlit blue by night)
        #include <fog_fragment>
      }`,
  });
}

function poolMaterial(time: { value: number }, sky: THREE.Color, light: { value: number }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLight: light, uFoot: { value: new THREE.Vector2(XC, LAND_Z) }, uSky: { value: sky } },
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
      uniform float uTime, uLight; uniform vec2 uFoot; uniform vec3 uSky;
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
        vec3 col = mix(vec3(0.17, 0.47, 0.5), vec3(0.3, 0.59, 0.56), 0.3 + 0.3 * n1); // (the rivers' blues)
        col = mix(col, uSky, fres * vShade);
        col += pow(max(0.0, n1 * n2 * 2.2 - 0.95), 2.0) * 1.2 * vShade;    // glints
        float foam = smoothstep(3.2, 0.4, r + (n1 - 0.5) * 2.2) + smoothstep(0.82, 1.0, ring + n2 * 0.25) * smoothstep(6.0, 1.5, r) * 0.4;
        col = mix(col * vShade, vec3(0.93, 0.97, 1.0) * mix(0.55, 1.0, vShade), clamp(foam, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(col * uLight, 0.84);
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

export interface CaveFallsTerrain {
  /** The terrain's height (y) at a world point, as its mesh draws it: the patch meets it at its edges. */
  edge(x: number, z: number): number;
  /** The terrain's colour at a world point (its slope 0 level … 1 sheer). */
  colour(x: number, y: number, z: number, slope: number, c: THREE.Color): void;
  /** The land's height (y) at a world point (the gorge, with the stream's channel carved in it). */
  height(x: number, z: number): number;
}

/**
 * Builds it. In the game, `place` sets it in the world and `terrain` lets its ground meet the terrain's; in the
 * mock it lays a meadow of its own. Returns the group, and an update to call every frame.
 */
export function buildCaveFalls(opts: { sky?: THREE.Color; ground?: boolean; place?: { x: number; y: number; z: number; yaw: number }; terrain?: CaveFallsTerrain; water?: THREE.Material } = {}) {
  const group = new THREE.Group();
  const time = { value: 0 }, light = { value: 1 }, sky = opts.sky?.clone() ?? new THREE.Color(0xd2e6ee);
  meadow = opts.ground !== false;
  const place = opts.place ?? { x: 0, y: 0, z: 0, yaw: 0 }, T = opts.terrain;
  group.position.set(place.x, place.y, place.z);
  group.rotation.y = place.yaw;
  const sy = Math.sin(place.yaw), cy = Math.cos(place.yaw);
  const toWorld = (x: number, z: number): [number, number] => [place.x + x * cy + z * sy, place.z - x * sy + z * cy];
  const rng = mulberry32(7);

  // --- the ground: the land drawn finely, meeting the terrain at the patch's edges and along the stream ---
  {
    const P = T ? PATCH : { x0: -90, x1: 90, z0: -110, z1: 50 }, N = T ? 0.6 : 1.0, W = P.x1 - P.x0, D = P.z1 - P.z0;
    const g = new THREE.PlaneGeometry(W, D, Math.round(W / N), Math.round(D / N)).rotateX(-Math.PI / 2).translate((P.x0 + P.x1) / 2, 0, (P.z0 + P.z1) / 2);
    const pos = g.attributes.position as THREE.BufferAttribute, n = pos.count;
    const meet = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = landY(x, z);
      if (T) { // the terrain's own land (with the stream's channel carved in it), meeting its mesh at the patch's edges
        const [wx, wz] = toWorld(x, z);
        y = T.height(wx, wz) - place.y;
        meet[i] = 1 - sstep(0, 4, patchInset(x, z));
        y += (T.edge(wx, wz) - place.y - y) * meet[i];
      }
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal as THREE.BufferAttribute, col = new Float32Array(n * 3), shade = new Float32Array(n), c = new THREE.Color();
    const grassA = new THREE.Color(0x5f8f3a), grassB = new THREE.Color(0x86a84e), forest = new THREE.Color(0x3f6b33), rock = new THREE.Color(0x7d7a70);
    const sand = new THREE.Color(0x9b8f77), bed = new THREE.Color(0x34443a), soil = new THREE.Color(0x6f6250);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), slope = 1 - nor.getY(i);
      if (T) { const [wx, wz] = toWorld(x, z); T.colour(wx, place.y + y, wz, slope, c); }
      else c.copy(grassA).lerp(grassB, clamp01(0.5 + 0.9 * sn3(x * 0.08, 7.5, z * 0.08))).lerp(forest, sstep(4, 40, y)).lerp(rock, sstep(0.25, 0.55, slope) * 0.85);
      const k = 1 - meet[i];
      const al = Math.hypot((x - ALC.x) / ALC.rx, (z - ALC.z) / ALC.rz);
      c.lerp(soil, (al < 1.1 && y < FLOOR_Y + 0.5 ? 0.7 : 0) * k); // the recess's floor: bare, damp
      c.lerp(sand, (1 - sstep(0.05, 0.45, Math.abs(y - POOL_Y + 0.05))) * k * (1 - sstep(0.3, 0.6, slope)));
      if (y < POOL_Y - 0.1) c.lerp(bed, k).multiplyScalar(1 - 0.4 * sstep(-0.3, -1.6, y));
      col.set([c.r, c.g, c.b], i * 3);
      shade[i] = al < 1.3 ? 0.35 + 0.65 * sstep(FLOOR_Y + 4, HC - 4, y) : 1; // dim in the recess, under its roof
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    const mesh = new THREE.Mesh(g, groundDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { shade: true }));
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!T) group.add(new THREE.Mesh(new THREE.RingGeometry(95, 700, 48, 1).rotateX(-Math.PI / 2).translate(0, -0.2, -30), new THREE.MeshStandardMaterial({ color: 0x6f9a44, roughness: 1 })));
  }

  // --- the rock roofing the recess: the stream crosses it and leaps from its lip ---
  {
    const g = new THREE.SphereGeometry(1, 48, 28), p = g.attributes.position as THREE.BufferAttribute;
    const cx = ALC.x, cz = ALC.z - 0.2, rx = ALC.rx + 1.8, ry = 4.4, rz = ALC.rz + 1.5, cyy = streamY(ALC.z) - 0.7 - 3.0;
    for (let i = 0; i < p.count; i++) {
      let x = cx + p.getX(i) * rx, y = cyy + p.getY(i) * ry, z = cz + p.getZ(i) * rz;
      const k = 0.55 * sn3(x * 0.3, y * 0.3, z * 0.3) + 0.25 * sn3(x * 0.9, y * 0.9, z * 0.9);
      x += p.getX(i) * k; y += p.getY(i) * k * 0.8; z += p.getZ(i) * k;
      y = Math.min(y, streamY(z) - 0.7); // its top: the stream's bed
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal as THREE.BufferAttribute, col = new Float32Array(p.count * 3), shade = new Float32Array(p.count), c = new THREE.Color(0x7d7a70);
    for (let i = 0; i < p.count; i++) { col.set([c.r, c.g, c.b], i * 3); shade[i] = 0.4 + 0.6 * clamp01(nor.getY(i) * 0.6 + 0.6); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    const mesh = new THREE.Mesh(g, groundDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }), { shade: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- rough stone steps up the curve ---
  {
    const parts: THREE.BufferGeometry[] = [], stone = new THREE.Color(0x8a8276), c = new THREE.Color();
    const dz = PATH_LEN / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const u = (i + 0.5) / STEPS, p = PATH.getPointAt(u), t = PATH.getTangentAt(u), top = (i + 1) * RISE;
      const g = new THREE.BoxGeometry(2.0 * (0.9 + 0.12 * rng()), 0.5, dz + 0.12, 2, 1, 2);
      const gp = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < gp.count; k++) gp.setXYZ(k, gp.getX(k) * (1 + 0.06 * sn3(k, i, 1)), gp.getY(k), gp.getZ(k) * (1 + 0.08 * sn3(k, i, 2)));
      g.translate(0, top - 0.25, 0).rotateY(Math.atan2(t.x, t.z) + (rng() - 0.5) * 0.1).translate(p.x + (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.03, p.z);
      parts.push(coloured(g, c.copy(stone).multiplyScalar(0.85 + 0.18 * rng())));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- the pool ---
  {
    // out to its ring of rocks and no further (the stream's own water carries on from inside it)
    // (in the game, in the rivers' own water: deep in the middle, clear at the rocks, rippling out from the foot of
    // the fall and white there)
    const SEGS = 96, RINGS = 8, pos: number[] = [], idx: number[] = [], ruv: number[] = [], foam: number[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2, rr = waterline(a) + 0.3;
      for (let j = 0; j <= RINGS; j++) {
        const x = POOL.x + Math.cos(a) * rr * (j / RINGS), z = POOL.z + Math.sin(a) * rr * (j / RINGS);
        pos.push(x, POOL_Y, z);
        ruv.push(0.5 + 0.5 * (j / RINGS), Math.hypot(x - XC, z - LAND_Z));
        foam.push(1 - sstep(0.5, 4, Math.hypot(Math.max(0, Math.abs(x - XC) - HW * 0.8), z - LAND_Z)));
      }
      if (i < SEGS) for (let j = 0; j < RINGS; j++) { const k = i * (RINGS + 1) + j; idx.push(k, k + RINGS + 1, k + 1, k + 1, k + RINGS + 1, k + RINGS + 2); } // (facing up)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    g.setAttribute('aRiverUv', new THREE.Float32BufferAttribute(ruv, 2));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, opts.water ?? poolMaterial(time, sky, light));
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // --- the stream and the fall: one ribbon from the spring, down the gully, over the lip ---
  {
    const BACK = SPRING_Z, FLOW = 1.8, COLS = 18;
    const rows: { z: number; y: number; tau: number; f: number }[] = [];
    for (let z = BACK; z < LIP_Z; z += 0.6) rows.push({ z, y: streamY(z), tau: (z - BACK) / FLOW, f: 0 });
    const tLip = (LIP_Z - BACK) / FLOW, NF = 70;
    for (let k = 0; k <= NF; k++) {
      const t = T_FALL * (k / NF) ** 1.15;
      rows.push({ z: LIP_Z + V * t, y: SY - 0.5 * G * t * t, tau: tLip + t, f: k ? t / T_FALL : 0 });
    }
    const pos: number[] = [], uv: number[] = [], fall: number[] = [], index: number[] = [];
    rows.forEach((r, j) => {
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS, bow = Math.sin(Math.PI * u) * 0.35 * Math.sin(Math.PI * Math.min(1, r.f * 1.4));
        const sx = r.f ? XC : streamX(r.z), shw = r.f ? HW : streamHW(r.z);
        pos.push(sx - shw + u * shw * 2 + (u - 0.5) * r.f * 0.8, r.y, r.z + bow); // fans out a little as it falls
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
    const mat = ribbonMaterial(time, light);
    mat.fragmentShader = mat.fragmentShader.replace('${TLIP}', tLip.toFixed(3));
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // --- spray: drops falling with the water from the lip and scattering as they go, bursting up and out where they hit
  // the pool and falling back, and a slow drift of fine mist ---
  {
    const N = 760, seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) seed.set([rng(), rng(), rng(), rng()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const F = (v: number) => v.toFixed(3);
    const uScale = { value: (typeof window === 'undefined' ? 900 : window.innerHeight * Math.min(2, window.devicePixelRatio || 1)) * 0.9 };
    if (typeof window !== 'undefined') window.addEventListener('resize', () => (uScale.value = window.innerHeight * Math.min(2, window.devicePixelRatio || 1) * 0.9));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLight: light, uScale },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec4 aSeed; uniform float uTime, uScale; varying float vA;
        void main() {
          float r1 = fract(aSeed.x * 7.31), r2 = fract(aSeed.y * 5.17), r3 = fract(aSeed.z * 3.73);
          vec3 p; float size, a;
          if (aSeed.w < 0.42) {                                    // falling with the water, scattering as it goes
            float life = ${F(T_FALL)}, tau = mod(uTime * (0.9 + 0.2 * r3) + aSeed.x * 17.0, life), k = tau / life;
            vec3 p0 = vec3(${F(XC)} + (aSeed.y - 0.5) * ${F(HW * 1.9)}, ${F(SY)} - 0.2, ${F(LIP_Z)} + 0.1);
            p = p0 + vec3((r1 - 0.5) * 1.6 * tau, -0.5 * ${F(G)} * tau * tau, ${F(V)} * (0.96 + 0.08 * r2) * tau + (r3 - 0.3) * 0.5 * tau);
            size = mix(0.14, 0.3, r2) * (1.0 + k);
            a = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.92, 1.0, k)) * 0.5;
          } else {
            float fine = step(0.8, aSeed.w);                       // (two in ten: fine mist, slow, drifting)
            float life = mix(1.0, 1.8, aSeed.z) * (1.0 + fine * 1.6), tau = mod(uTime + aSeed.x * 17.0, life);
            vec3 p0 = vec3(${F(XC)} + (aSeed.y - 0.5) * ${F(HW * 1.8)}, ${F(POOL_Y)}, ${F(LAND_Z)} + (aSeed.z - 0.5) * 1.4);
            vec3 v = vec3((r1 - 0.5) * 2.6, mix(2.2, 5.5, r2), mix(-0.6, 2.8, r3));
            p = p0 + v * tau * mix(1.0, 0.45, fine) - vec3(0.0, 0.5 * mix(9.8, 1.0, fine) * tau * tau, 0.0);
            p.y = max(p.y, ${F(POOL_Y)});
            size = mix(mix(0.12, 0.26, r2), mix(1.3, 2.4, r2), fine);
            a = sin(3.14159 * tau / life) * mix(0.6, 0.2, fine);
          }
          vA = a;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * uScale / -mvPosition.z;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uLight; varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA;
          gl_FragColor = vec4(vec3(0.95, 0.98, 1.0) * uLight * mix(vec3(0.62, 0.74, 1.0), vec3(1.0), smoothstep(0.34, 0.9, uLight)), a);
          #include <fog_fragment>
        }`,
    }));
    pts.frustumCulled = false;
    group.add(pts);
  }

  // --- mist at the foot ---
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xf4fbff, transparent: true, opacity: 0.2, depthWrite: false }));
    s.position.set(XC + (i - 1) * 2.6, 1.4 + i * 0.6, LAND_Z + 0.8);
    group.add(s);
    mists.push(s);
  }

  // --- plants: trees at the gorge's foot, bushes up its slopes (the terrain's own trees grow on the hill in the game) ---
  {
    const leaves: THREE.BufferGeometry[] = [], bark: THREE.BufferGeometry[] = [];
    const green = () => GREENS[Math.floor(rng() * GREENS.length)].clone().multiplyScalar(0.9 + rng() * 0.2);
    const tree = (x: number, y: number, z: number, h: number) => {
      const trunkH = h * 0.42;
      bark.push(new THREE.CylinderGeometry(h * 0.025, h * 0.042, trunkH + 0.4, 6).translate(x, y - 0.2 + (trunkH + 0.4) / 2, z));
      const k = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < k; i++) {
        const a = rng() * Math.PI * 2, rr = h * 0.18 * Math.sqrt(rng()), s = h * (0.16 + rng() * 0.1);
        leaves.push(coloured(new THREE.IcosahedronGeometry(s, 0).scale(1, 0.85, 1).translate(x + Math.cos(a) * rr, y + trunkH + h * 0.1 + rng() * h * 0.3, z + Math.sin(a) * rr), green()));
      }
    };
    const bush = (x: number, y: number, z: number, s: number) => {
      for (let i = 0; i < 3; i++) leaves.push(coloured(new THREE.IcosahedronGeometry(s * (0.6 + rng() * 0.4), 0).scale(1.2, 0.75, 1.2).translate(x + (rng() - 0.5) * s, y + s * 0.3, z + (rng() - 0.5) * s), green()));
    };
    for (const [x, z, s, t] of [[-15, -5, 1, 1], [-14, 2, 0.9, 0], [-11, 8, 1.2, 0], [17.5, 4, 1, 1], [10, 9, 0.8, 0], [-17, 9, 1, 1], [18.5, -3, 1, 0], [-16, -10, 1, 0]] as const) {
      if (t) tree(x, landY(x, z), z, 5.5 + rng() * 2); else bush(x, landY(x, z), z, s);
    }
    for (let k = 0; k < 160; k++) { // up the gorge's slopes, low to high, where there's footing
      const side = k % 2 ? 1 : -1, phi = side * (1.45 + rng() * 0.65), r = edgeR(phi) + 1 + rng() * 22, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (onPath(x, z).d < 2.5) continue;
      const y = landY(x, z), e = 0.8, steep = Math.max(...[[e, 0], [-e, 0], [0, e], [0, -e]].map(([dx, dz]) => Math.abs(landY(x + dx, z + dz) - y)));
      if (y < 0.5 || steep > 0.9) continue;
      if (rng() < 0.4) tree(x, y, z, 3.5 + rng() * 2.5); else bush(x, y, z, 0.6 + rng() * 0.6);
    }
    for (let k = 0; k < 900; k++) { // on the ledges and benches all round the walls, where a bush or a tree has footing
      const phi = (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 2.2), r = edgeR(phi) - 6 + rng() * 46, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (onPath(x, z).d < 3 || occupied(x, z, 1)) continue;
      const y = landY(x, z), e = 0.7, steep = Math.max(...[[e, 0], [-e, 0], [0, e], [0, -e]].map(([dx, dz]) => Math.abs(landY(x + dx, z + dz) - y)));
      if (y < 5 || y > hillTop(x, z) - 1.5 || steep > 0.45) continue;
      if (rng() < 0.3) tree(x, y, z, 3 + rng() * 2.5); else bush(x, y, z, 0.5 + rng() * 0.7);
    }
    for (let k = 0; k < (meadow ? 70 : 0); k++) { // the mock's hilltop
      const x = (rng() - 0.5) * 120, z = -80 + rng() * 75;
      if (landAt(x, z).cut > 0.5 || Math.abs(x - streamX(z)) < 8) continue;
      if (rng() < 0.55) tree(x, landY(x, z), z, 4.5 + rng() * 3); else bush(x, landY(x, z), z, 0.8 + rng() * 0.6);
    }
    const lm = new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    const bm = new THREE.Mesh(mergeGeometries(bark), new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.95, flatShading: true }));
    lm.castShadow = bm.castShadow = true;
    lm.receiveShadow = true;
    group.add(lm, bm);
  }

  // --- boulders: round the pool, at the cliff's foot, along the stream, and the spring ---
  {
    const parts: THREE.BufferGeometry[] = [], c = new THREE.Color();
    const boulder = (x: number, y: number, z: number, r: number) => {
      const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position as THREE.BufferAttribute, seed = rng() * 100;
      for (let i = 0; i < p.count; i++) { const k = 1 + 0.2 * sn3(p.getX(i) * 1.3 + seed, p.getY(i) * 1.3, p.getZ(i) * 1.3); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.72, p.getZ(i) * k); }
      g.rotateY(rng() * 6.28).scale(r, r, r).translate(x, y + r * 0.2, z);
      g.computeVertexNormals();
      parts.push(coloured(g, c.set(0x6e685f).multiplyScalar(0.8 + rng() * 0.25)));
    };
    // a ring of rocks along the pool's waterline (hiding its edge), heaped up either side of where the stream leaves it
    for (let a = 0; a < Math.PI * 2; a += 0.07 + rng() * 0.06) {
      const toOut = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))); // (the stream leaves at +z)
      const out = 1 - sstep(0.12, 0.5, toOut), rr = waterline(a) + (rng() - 0.6) * 1.3;
      if (toOut < 0.12 && rng() < 0.75) continue; // (the stream's own way out stays open, but for a stone or two in it)
      const x = POOL.x + Math.cos(a) * rr, z = POOL.z + Math.sin(a) * rr;
      if (landY(x, z) > 1.5 || onPath(x, z).d < 1.6) continue;
      boulder(x, Math.max(landY(x, z), POOL_Y - 0.5), z, (0.3 + rng() * 0.6) * (1 + 0.9 * out));
      if (out > 0.3 || rng() < 0.35) { // a second row, here and there (and always by the stream)
        const r2 = rr + 0.9 + rng() * 1.2, x2 = POOL.x + Math.cos(a) * r2, z2 = POOL.z + Math.sin(a) * r2;
        if (landY(x2, z2) < 1.5 && onPath(x2, z2).d > 1.6) boulder(x2, landY(x2, z2), z2, (0.25 + rng() * 0.45) * (1 + 0.6 * out));
      }
    }
    for (let i = 0; i < 30; i++) { // tumbled from the cliffs
      const phi = (rng() - 0.5) * 3.2, r = edgeR(phi) - 0.5 - rng() * 2.5, x = C.x + Math.sin(phi) * r, z = C.z - Math.cos(phi) * r;
      if (Math.abs(phi) < 0.5 || onPath(x, z).d < 2 || landY(x, z) > 1.5 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r) continue;
      boulder(x, landY(x, z), z, 0.5 + rng() * rng() * 2);
    }
    for (let z = SPRING_Z + 4; z < LIP_Z - 12; z += 2.2 + rng() * 2.5) {
      const side = rng() < 0.5 ? -1 : 1, x = streamX(z) + side * (streamHW(z) + 0.4 + rng() * 1.2);
      boulder(x, streamY(z) - 0.5, z, 0.5 + rng() * 1.0);
    }
    for (const [dx, dz, r] of [[-3.2, -1.5, 2.2], [0.6, -3.2, 2.6], [3.9, -1.2, 2.0], [-4.6, 1.8, 1.4], [4.8, 2.4, 1.3], [-1.4, -5.5, 1.8]] as const) {
      const x = streamX(SPRING_Z) + dx, z = SPRING_Z + dz;
      boulder(x, landY(x, z), z, r);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- grass on the gorge's floor and slopes (in the mock, everywhere) ---
  {
    const blade = new THREE.ConeGeometry(0.07, 0.6, 3).translate(0, 0.3, 0);
    const N = 1600, inst = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N), d = new THREE.Object3D(), c = new THREE.Color();
    const lo = new THREE.Color(0x4f8a30), hi = new THREE.Color(0x93b754);
    let k = 0;
    for (let t = 0; t < 30000 && k < N; t++) {
      const x = meadow ? (rng() - 0.5) * 140 : -40 + rng() * 80, z = meadow ? -90 + rng() * 130 : -46 + rng() * 64, y = landY(x, z);
      if (!meadow && landAt(x, z).cut < 0.5) continue; // (the terrain's own grass grows outside the gorge)
      const e = 0.6, steep = Math.max(Math.abs(landY(x + e, z) - y), Math.abs(landY(x, z + e) - y));
      if (!meadow && sn3(x * 0.12, 5.5, z * 0.12) < 0.25) continue; // in clumps, not a lawn
      if (y < POOL_Y + 0.15 || steep > 0.5 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2.5 || onPath(x, z).d < 1.3 || Math.hypot((x - ALC.x) / ALC.rx, (z - ALC.z) / ALC.rz) < 1.1) continue;
      d.position.set(x, y - 0.05, z);
      d.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
      d.scale.set(1, 0.6 + rng() * 1.4, 1);
      d.updateMatrix();
      inst.setMatrixAt(k, d.matrix);
      inst.setColorAt(k, c.copy(lo).lerp(hi, rng()));
      k++;
    }
    inst.count = k;
    group.add(inst);
  }

  /** `lightNow`: 1 by day … ~0.1 by night (the water isn't lit by the scene's lights); `skyNow`: what the pool mirrors. */
  const update = (t: number, lightNow = 1, skyNow?: THREE.Color) => {
    time.value = t;
    light.value = lightNow;
    if (skyNow) sky.copy(skyNow);
    mists.forEach((s, i) => { s.material.opacity = 0.18 * lightNow * (0.75 + 0.25 * Math.sin(t * 0.7 + i)); s.scale.setScalar(10 * (1 + 0.15 * Math.sin(t * 0.5 + i * 1.7))); });
  };
  return { group, update };
}

// ---------- for the game (all in this frame) ----------
/** Circles (x, z, r) wherever the land steps sharply near where people walk (cliffs, the ledge's edge, the stairs' sides), and over the pool. */
export function colliders(): [number, number, number][] {
  const out: [number, number, number][] = [], e = 0.8;
  for (let x = PATCH.x0; x <= PATCH.x1; x += e) for (let z = PATCH.z0; z <= PATCH.z1; z += e) {
    const y0 = landY(x, z);
    for (const [dx, dz] of [[e, 0], [0, e]]) {
      const y1 = landY(x + dx, z + dz);
      if (Math.abs(y1 - y0) < 1.5 || Math.min(y0, y1) > 8) continue;
      const mx = x + dx / 2, mz = z + dz / 2;
      if (onPath(mx, mz).d < 1.1) continue;
      out.push([mx, mz, 0.5]);
    }
  }
  out.push([POOL.x, POOL.z + 3, 7], [POOL.x - 6.7, POOL.z - 1, 3], [POOL.x + 6.8, POOL.z - 1, 3]); // the pool, short of the ledge
  return out;
}
/** Somewhere taken (the gorge, its stream, the pool, the stairs): the terrain's own trees and grass keep off. */
export function occupied(x: number, z: number, margin = 0) {
  const stream = z > SPRING_Z - 8 && z < LIP_Z + 1 && Math.abs(x - streamX(z)) < streamHW(z) + 3.5 + margin;
  const L = landAt(x, z); // (the gorge's floor is kept clear, for the view of the fall; its walls' benches may grow trees)
  return stream || (L.cut > 0.3 && L.y < 10) || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 3 + margin || onPath(x, z).d < 2 + margin;
}
/** On the gorge's floor, the ledge or in the recess, where people may go (beyond the valley's usual edge). */
export function inCut(x: number, z: number) {
  if (z > 20 || Math.hypot(x - C.x, z - C.z) > 60) return false;
  const L = landAt(x, z);
  return L.cut > 0.5 && L.y < FLOOR_Y + 1;
}
