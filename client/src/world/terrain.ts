import * as THREE from 'three';
import { BASIN, CAVE_FALLS, DRAGON_POOL, POND, TERRAIN_SIZE, caveFallsAt, caveFallsLocal } from '../config/layout';
import { fbm, lerp, noise2, smoothstep } from '../core/math';
import { shapeRidge } from './ridgeWalk';
import { groundDetail } from './groundDetail';
import { footprint as caveFallsFootprint, landAt as caveFallsLand, patchSink } from './caveFalls';
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
  if (Math.hypot(f.x - DRAGON_POOL.x, f.z - DRAGON_POOL.z) < DRAGON_POOL.r + 3) return POND_LEVEL - 0.03; // (the dragon pool stands at the same level)
  for (const o of RIVERS) {
    if (o === def) continue;
    const q = nearestOn(o, f.x, f.z);
    if (q.d < 4) return waterLevel(o, q.s) - 0.01;
  }
  return null;
}
/** Where a river runs into or out of a pool it steps over a stone lip this far (m) from its end, falling this much. */
export const MOUTH = 3, MOUTH_STEP = 0.28;
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
    if (def.falls || riverEndMeets(def, 0) !== null) // out of a pool, over a stone lip MOUTH m on, and a step lower for a while (see water.ts)
      for (let i = MOUTH + 1; i < n; i++) sm[i] -= MOUTH_STEP * (1 - smoothstep(1, 25, i - MOUTH));
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

const SEG = 240, CELL = TERRAIN_SIZE / SEG, K = 5, FINE = CELL / K;
/** The terrain mesh's own vertex height: the land, sunk out of sight under the cave waterfall's finer patch. */
const meshHeight = (x: number, z: number) => {
  const h = terrainHeight(x, z), [cx, cz] = caveFallsLocal(x, z);
  return h - patchSink(cx, cz, h, (a, b) => terrainHeight(...caveFallsAt(a, b)));
};
/**
 * The mesh's squares along the rivers are drawn K×K finer, so the banks and beds are carved into the terrain itself
 * (one mesh, one surface: nothing laid over it to show a seam).
 */
let fineCells: Uint8Array | null = null;
function isFine(i: number, j: number) {
  if (i < 0 || j < 0 || i >= SEG || j >= SEG) return false;
  if (!fineCells) {
    fineCells = new Uint8Array(SEG * SEG);
    for (let a = 0; a < SEG; a++) for (let b = 0; b < SEG; b++) {
      const x = (a + 0.5) * CELL - TERRAIN_SIZE / 2, z = (b + 0.5) * CELL - TERRAIN_SIZE / 2, q = nearestRiver(x, z);
      if (q.d < riverHalfWidth(q.def, q.s) + BANK_OUT + 1 + CELL * 0.71) fineCells[a * SEG + b] = 1;
    }
  }
  return fineCells[i * SEG + j] === 1;
}
const latX = (I: number) => I * FINE - TERRAIN_SIZE / 2;
/**
 * The height of the mesh at a point of the fine lattice. On the edge of a fine square next to a plain one, it lies on
 * that square's straight edge (so there's no crack between them).
 */
function latticeHeight(I: number, J: number) {
  const oi = I % K === 0, oj = J % K === 0;
  if (oi && !oj) {
    const j = Math.floor(J / K);
    if (!isFine(I / K - 1, j) || !isFine(I / K, j)) return lerp(meshHeight(latX(I), latX(j * K)), meshHeight(latX(I), latX(j * K + K)), (J - j * K) / K);
  } else if (oj && !oi) {
    const i = Math.floor(I / K);
    if (!isFine(i, J / K - 1) || !isFine(i, J / K)) return lerp(meshHeight(latX(i * K), latX(J)), meshHeight(latX(i * K + K), latX(J)), (I - i * K) / K);
  }
  return meshHeight(latX(I), latX(J));
}
/**
 * The terrain mesh's surface exactly as drawn (its triangles, not the smooth function), so the waterfall's finer
 * patch of ground can meet it edge to edge without a crack.
 */
export function coarseHeightAt(x: number, z: number) {
  const fx = (x + TERRAIN_SIZE / 2) / CELL, fz = (z + TERRAIN_SIZE / 2) / CELL, ix = Math.floor(fx), iz = Math.floor(fz);
  const fine = isFine(ix, iz), st = fine ? 1 : K;
  const gx = fine ? (x + TERRAIN_SIZE / 2) / FINE : fx * K, gz = fine ? (z + TERRAIN_SIZE / 2) / FINE : fz * K;
  const I = fine ? Math.floor(gx) : ix * K, J = fine ? Math.floor(gz) : iz * K, u = (gx - I) / st, v = (gz - J) / st;
  const H = (a: number, b: number) => latticeHeight(a, b);
  const a = H(I, J), b = H(I, J + st), d = H(I + st, J); // (each square split a-b-d, b-c-d)
  if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
  const c = H(I + st, J + st);
  return c + (b - c) * (1 - u) + (d - c) * (1 - v);
}

/**
 * By a river: damp grass, a bare earthen bank here and there (in places the grass runs right down to the water), wet
 * pebbles at the edge, a pebbly bed under the water. Laid over the ground's own colour, and gone a few metres off.
 */
const dampGrass = new THREE.Color(0x4d7034), bankEarth = new THREE.Color(0x76694a), pebble = new THREE.Color(0x8f8877), bedTone = new THREE.Color(0x5c5844);
export function riverBankTint(x: number, y: number, z: number, c: THREE.Color) {
  const q = nearestRiver(x, z), hw = riverHalfWidth(q.def, q.s);
  if (q.d > hw + 3.2) return c;
  const f = riverFrame(q.def, q.s), side = (x - f.x) * f.nx + (z - f.z) * f.nz > 0, wl = waterLevel(q.def, q.s);
  const above = y - wl + (noise2(x * 0.9, z * 0.9) - 0.5) * 0.3 + (noise2(x * 0.23, z * 0.23) - 0.5) * 0.4;
  const bare = 0.25 + 0.75 * smoothstep(0.3, 0.7, noise2(q.s * 0.045, side ? 3.7 : 9.1));
  const near = 1 - smoothstep(hw + 1, hw + 3, q.d);
  c.lerp(dampGrass, (1 - smoothstep(0.1, 0.6, above)) * 0.18 * near);
  c.lerp(bankEarth, (1 - smoothstep(0.05, 0.3 * bare + 0.05, above)) * bare * (0.55 + 0.35 * noise2(x * 2.3, z * 2.3)) * near);
  c.lerp(pebble, (1 - smoothstep(0, 0.12, Math.abs(above - 0.03))) * 0.55 * near);
  if (above < 0) c.lerp(bedTone, smoothstep(0, -0.2, above)).lerp(pebble, noise2(x * 4.1, z * 4.1) * 0.35);
  return c.multiplyScalar(1 + (noise2(x * 3.3, z * 3.3) - 0.5) * 0.24 * near);
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

  // The cave waterfall (洞瀑): a gorge cut into the mountain front, its pool, stairs and ledge (see caveFalls.ts)
  const [cx, cz] = caveFallsLocal(x, z), fw = caveFallsFootprint(cx, cz);
  if (fw > 0) {
    const L = caveFallsLand(cx, cz), y = CAVE_FALLS.y + L.y;
    h = lerp(h, lerp(Math.max(h, y), y, L.cut), fw);
  }

  // Lotus pond depression
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.radius + 3) h -= 1.3 * (1 - smoothstep(POND.radius - 5, POND.radius + 3, pd));

  // Dragon pool basin: a flat bed under its water (the brook runs in, its outflow out)
  const dd = Math.hypot(x - DRAGON_POOL.x, z - DRAGON_POOL.z);
  if (dd < DRAGON_POOL.r + 1.5) h = lerp(h, Math.min(h, -1.0), 1 - smoothstep(DRAGON_POOL.r - 0.8, DRAGON_POOL.r + 1.5, dd));

  return h;
}

export function buildTerrain(scene: THREE.Scene) {
  // One mesh: plain squares, and K×K finer ones along the rivers (their banks carved in it); see isFine.
  const W = SEG * K + 1, verts = new Map<number, number>(), pos: number[] = [], lat: number[] = [], idx: number[] = [];
  const V = (I: number, J: number) => {
    const key = I * W + J;
    let v = verts.get(key);
    if (v === undefined) verts.set(key, (v = pos.length / 3)), pos.push(latX(I), latticeHeight(I, J), latX(J)), lat.push(I, J);
    return v;
  };
  const quad = (I: number, J: number, st: number) => { const a = V(I, J), b = V(I, J + st), c = V(I + st, J + st), d = V(I + st, J); idx.push(a, b, d, b, c, d); };
  for (let i = 0; i < SEG; i++) for (let j = 0; j < SEG; j++) {
    if (!isFine(i, j)) quad(i * K, j * K, K);
    else for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) quad(i * K + a, j * K + b, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if ((geo.attributes.normal as THREE.BufferAttribute).getY(0) < 0) geo.setIndex(idx.reverse()), geo.computeVertexNormals(); // face up

  // Vertex colours: meadow greens → forest → rock on steep / high ground, and the rivers' banks. Read from the land
  // itself, not the mesh (sunk out of sight under the waterfall's patch).
  const n = pos.length / 3, colors = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 2], y = terrainHeight(x, z), e = lat[i * 2] % K || lat[i * 2 + 1] % K ? 1 : 2;
    const gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e), gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    riverBankTint(x, y, z, groundColour(x, y, z, 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz), c));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, groundDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
