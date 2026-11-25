import * as THREE from 'three';
import { BASIN, POND, TERRAIN_SIZE } from '../config/layout';
import { fbm, lerp, noise2, smoothstep } from '../core/math';
import { shapeRidge } from './ridgeWalk';
import { RIVERS, type RiverDef } from '../config/layout';
import { nearestOn, nearestOnStream, nearestRiver, nearStream, riverFrame, riverHalfWidth, riverLength } from './stream';

/**
 * Valley floor is flat; the ring of mountains rises beyond BASIN.radius.
 * Mountains are lower to the south so the view behind the spawn opens into a distant valley.
 */
export function terrainHeight(x: number, z: number) {
  const base = baseHeight(x, z), q = nearestRiver(x, z);
  const hw = riverHalfWidth(q.def, q.s);
  return q.d < hw + BANK_OUT ? bankHeight(q.d, hw, waterLevel(q.def, q.s), base) : base;
}

/** The land before the rivers' own banks are cut into it (the valley, the ridge terrace, the swales and the ravine). */
function baseHeight(x: number, z: number) {
  return shapeRidge(x, z, rawTerrainHeight(x, z));
}

// ---- river banks ----
/** The lotus pond's water surface (y). */
export const POND_LEVEL = -0.45;

/**
 * Where a river's end runs into the pond, or into another river, the water there must stand at that level (so it
 * flows in, rather than stopping at a step): the level it meets, or null for an end that meets nothing.
 */
export function riverEndMeets(def: RiverDef, end: 0 | 1): number | null {
  const f = riverFrame(def, end ? riverLength(def) : 0);
  if (Math.hypot(f.x - POND.x, f.z - POND.z) < POND.radius + 3) return POND_LEVEL - 0.03;
  for (const o of RIVERS) {
    if (o === def) continue;
    const q = nearestOn(o, f.x, f.z);
    if (q.d < 4) return waterLevel(o, q.s) - 0.01;
  }
  return null;
}
/** Banks reach this far beyond the water's edge (m); the grass stands this high above the water. */
export const BANK_OUT = 3.2;
const FREEBOARD = 0.45, DEPTH = 0.45;

/** The water's natural level `s` m along a river: below the lowest grass beside it, smoothed along the river. */
const levels = new Map<RiverDef, Float32Array>();
export function waterLevel(def: RiverDef, s: number) {
  let t = levels.get(def);
  if (!t) {
    const L = riverLength(def), n = Math.ceil(L) + 1, raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = riverFrame(def, i), hw = riverHalfWidth(def, i) + 1.2;
      raw[i] = Math.min(baseHeight(f.x, f.z), baseHeight(f.x + f.nx * hw, f.z + f.nz * hw), baseHeight(f.x - f.nx * hw, f.z - f.nz * hw)) - FREEBOARD;
    }
    t = new Float32Array(n);
    for (let i = 0; i < n; i++) { // the lowest nearby (so no bank is ever under water), then averaged (so it runs smoothly)
      let lo = Infinity;
      for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 4); k++) lo = Math.min(lo, raw[k]);
      t[i] = lo;
    }
    const sm = Float32Array.from(t);
    for (let i = 0; i < n; i++) {
      let a = 0, c = 0;
      for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) (a += t[k]), c++;
      sm[i] = Math.min(t[i], a / c);
    }
    levels.set(def, sm); // (in place before the ends are eased, for a river that meets this one)
    ([0, 1] as const).forEach((end) => { // ease each end over its last 15 m to the level it runs into
      const meet = riverEndMeets(def, end);
      if (meet === null) return;
      for (let i = 0; i < n; i++) {
        const k = 1 - smoothstep(0, 15, end ? n - 1 - i : i);
        if (k > 0) sm[i] += (meet - sm[i]) * k;
      }
    });
    t = sm;
  }
  const i = Math.max(0, Math.min(t.length - 1, s)), i0 = Math.floor(i), i1 = Math.min(t.length - 1, i0 + 1);
  return t[i0] + (t[i1] - t[i0]) * (i - i0);
}

/**
 * Across a river, `d` m from its middle: a rounded bed under the water, a bank rising from just under the water's
 * edge to a lip above it, then easing up into the grass (`base`) by BANK_OUT beyond the edge.
 */
function bankHeight(d: number, hw: number, wl: number, base: number) {
  const bed = wl - DEPTH, edge = wl - 0.06, lip = Math.min(wl + 0.38, base);
  if (d < hw) return bed + (edge - bed) * smoothstep(hw * 0.45, hw, d);
  if (d < hw + 1.3) return edge + (lip - edge) * smoothstep(hw, hw + 1.3, d);
  return lip + (base - lip) * smoothstep(hw + 1.3, hw + BANK_OUT, d);
}

/** How far the coarse terrain mesh is sunk under the rivers' fine bank strips (so it never shows through them). */
function trough(x: number, z: number) {
  const q = nearestRiver(x, z), hw = riverHalfWidth(q.def, q.s);
  if (q.s <= 0.05 || q.s >= q.len - 0.05) return 0; // beyond a river's end there's no strip to cover it: no pit
  return q.d < hw + 5.5 ? 1.4 * (1 - smoothstep(hw + 1.5, hw + 5.5, q.d)) : 0;
}

const SEG = 240, CELL = TERRAIN_SIZE / SEG;
/** The coarse terrain mesh's own vertex height (sunk under the river strips). */
const meshHeight = (x: number, z: number) => terrainHeight(x, z) - trough(x, z);
/**
 * The coarse terrain mesh's surface exactly as drawn (its triangles, not the smooth function), so the rivers' bank
 * strips can meet it edge to edge without a crack.
 */
export function coarseHeightAt(x: number, z: number) {
  const fx = (x + TERRAIN_SIZE / 2) / CELL, fz = (z + TERRAIN_SIZE / 2) / CELL, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
  const X = (i: number) => i * CELL - TERRAIN_SIZE / 2, Z = X;
  const a = meshHeight(X(ix), Z(iz)), b = meshHeight(X(ix), Z(iz + 1)), d = meshHeight(X(ix + 1), Z(iz)); // (PlaneGeometry's split: a-b-d, b-c-d)
  if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
  const c = meshHeight(X(ix + 1), Z(iz + 1));
  return c + (b - c) * (1 - u) + (d - c) * (1 - v);
}

/** The ground's colour at a point: meadow greens → forest → rock on steep or high ground; mud in hollows. */
const meadow = new THREE.Color(0x6a9a42), meadowDry = new THREE.Color(0x87a64c), forest = new THREE.Color(0x3f6b33);
const rock = new THREE.Color(0x7d7a70), mud = new THREE.Color(0x5b5038);
export function groundColour(x: number, y: number, z: number, slope: number, c: THREE.Color) {
  const n = noise2(x * 0.04, z * 0.04);
  c.copy(meadow).lerp(meadowDry, n * 0.6);
  c.lerp(forest, smoothstep(4, 40, y));
  c.lerp(rock, smoothstep(0.25, 0.55, slope) * 0.85 + smoothstep(90, 160, y) * 0.5);
  if (y < -0.2) c.lerp(mud, smoothstep(-0.2, -1.0, y));
  return c;
}

/** The ground before the ridge terrace is cut into it (what the stupa ridge is planned on). */
export function rawTerrainHeight(x: number, z: number) {
  const dx = x - BASIN.x, dz = z - BASIN.z;
  const r = Math.hypot(dx, dz);
  let h = 0;

  // Gentle meadow undulation near the rim (buildings are well inside this).
  h += smoothstep(BASIN.radius - 4, BASIN.radius + 8, r) * (noise2(x * 0.06, z * 0.06) - 0.3) * 1.2;

  // Mountains
  const az = Math.atan2(dx, dz); // 0 = south
  const southOpen = 1 - 0.55 * Math.exp(-(az * az) / 0.22);
  const ridge = fbm(x * 0.0065 + 3.1, z * 0.0065 - 7.7, 5);
  const rise = smoothstep(BASIN.radius - 5, BASIN.radius + 95, r);
  h += rise * southOpen * (18 + 120 * ridge * ridge + 30 * ridge);
  h += Math.max(0, r - (BASIN.radius + 95)) * 0.32 * southOpen;

  // Stream from the waterfall down to the pond: a ravine through the western slope
  // (so the falls are visible from the valley), then a shallow swale across the valley floor.
  if (nearStream(x, z)) {
    const q = nearestOnStream(x, z);
    const ravine = 1 - smoothstep(18, 46, q.s);
    const w = 4.5 + ravine * 8;
    const bed = 7.5 * (1 - smoothstep(0, 44, q.s)) - 0.35;
    const k = Math.exp(-(q.d * q.d) / (2 * w * w)) * smoothstep(-6, 0, q.behind);
    if (k > 0.001) h = lerp(h, Math.min(h, bed + noise2(x * 0.1, z * 0.1) * 0.4 * ravine), k);
  }

  // The other rivers: a shallow swale on the valley floor; outside it, a gorge whose bed climbs
  // upstream (water comes down into the valley) or drops downstream (water leaves it).
  const q = nearestRiver(x, z);
  if (!q.def.falls && q.d < 40) {
    const R0 = BASIN.radius - 8;
    const out = Math.max(0, Math.hypot(q.px - BASIN.x, q.pz - BASIN.z) - R0);
    const bed = -0.35 + out * (q.s < q.len * 0.5 ? 0.16 : -0.05);
    const w = 3.6 + smoothstep(0, 45, out) * 9;
    const k = Math.exp(-(q.d * q.d) / (2 * w * w));
    if (k > 0.001) h = lerp(h, Math.min(h, bed + noise2(x * 0.1, z * 0.1) * 0.3 * smoothstep(0, 30, out)), k);
  }

  // Lotus pond depression
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.radius + 3) h -= 1.3 * (1 - smoothstep(POND.radius - 5, POND.radius + 3, pd));

  return h;
}

export function buildTerrain(scene: THREE.Scene) {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // (sunk out of sight under the rivers, where finer bank strips take over: see buildStream)
  for (let i = 0; i < pos.count; i++) pos.setY(i, meshHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  // Vertex colours: meadow greens → forest → rock on steep / high ground.
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    groundColour(pos.getX(i), pos.getY(i), pos.getZ(i), 1 - nrm.getY(i), c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
