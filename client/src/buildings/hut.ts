import * as THREE from 'three';
import { ABBOT, DORM, TABLE_HUT } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { inscription, onLocaleChange, t } from '../i18n';
import { buildRedLantern } from './hall';
import { addLamp } from '../world/lightPool';
import { box, cylinder, mat } from './materials';
import { irimoyaRoof, roofTexture, shojiTexture } from './japaneseRoof';

/** 方丈 style: natural wood, paper shōji, a curved roof of cypress bark (檜皮葺). */
const HOJO_WOOD = 0x8a6a4a, HOJO_DARK = 0x4a3424, HOJO_ROOF = 0x6b4a33;
function hojoRoof(g: THREE.Object3D, W: number, D: number, H: number, y: number, z = 0) {
  const r = irimoyaRoof(W, D, H, { gable: 0.6, curve: 1.45, upturn: Math.min(0.15, 0.5 / H) });
  r.roof.computeVertexNormals();
  r.gable.computeVertexNormals();
  const roof = new THREE.Mesh(r.roof, new THREE.MeshStandardMaterial({ map: roofTexture('bark', HOJO_ROOF), roughness: 1, side: THREE.DoubleSide }));
  const gable = new THREE.Mesh(r.gable, mat(0xe8e2d2, { roughness: 0.9, side: THREE.DoubleSide }));
  const edge = new THREE.Mesh(r.edge, mat(HOJO_DARK, { roughness: 0.8, side: THREE.DoubleSide }));
  for (const m of [roof, gable, edge]) m.position.set(0, y, z);
  g.add(edge);
  roof.castShadow = roof.receiveShadow = true;
  const xr = W / 2 - 0.3 * D;
  g.add(roof, gable, box(xr * 2 + 0.3, 0.22, 0.3, mat(HOJO_DARK, { roughness: 0.8 }), 0, y + r.ridge - 0.1, z));
}

const W = 5.6, D = 4.2, H = 2.8, PL = 0.35;

let lattice: THREE.Texture | null = null;
const latticeTex = () =>
  (lattice ??= canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f1e6cc';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#8e2b1f';
    g.lineWidth = 7;
    for (let i = 0; i <= 128; i += 21) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
  }));

/** Small decorative huts in the temple style, with homely bits around them. */
/** 住持 (the abbot's quarters) and 僧舍 (the monks' quarters round a courtyard). Decorative. */
export function buildHuts(ctx: WorldContext) {
  const a = ABBOT;
  buildHut(ctx, a.x, a.z, 0, 1.4);
  buildWell(ctx, a.x - 7.6, a.z + 1);
  buildWoodpile(ctx, a.x + 5.6, a.z + 0.5, Math.PI / 2);
  for (const dx of [-3, 3]) waterJar(ctx, a.x + dx, a.z + 6.1);
  buildVegPatch(ctx, a.x - 4, a.x + 4, a.z - 12, a.z - 8);
  buildTableHut(ctx);

  // Monks' quarters: north, east and south wings facing a courtyard that opens to the west.
  const d = DORM, w = d.wing;
  longHouse(ctx, (d.minX + d.maxX) / 2, d.minZ + w / 2, d.maxX - d.minX, w, 0); // north wing faces south
  longHouse(ctx, (d.minX + d.maxX) / 2, d.maxZ - w / 2, d.maxX - d.minX, w, Math.PI); // south wing faces north
  longHouse(ctx, d.maxX - w / 2, (d.minZ + d.maxZ) / 2, d.maxZ - d.minZ - 2 * w - 0.4, w, -Math.PI / 2); // east wing faces west
  for (const [jx, jz] of [[d.minX + 6, d.minZ + w + 1.2], [d.minX + 9, d.maxZ - w - 1.2]]) waterJar(ctx, jx, jz);
  buildWoodpile(ctx, d.maxX - w - 1.4, d.minZ + w + 2, 0);
}

/** A long temple-style building (white walls, red posts and lattice windows along the front, tiled hip roof). Built facing +Z, then turned by `yaw`. */
function longHouse(ctx: WorldContext, x: number, z: number, L: number, Dp: number, yaw: number) {
  const g = new THREE.Group();
  g.position.set(x, ctx.ground.heightAt(x, z), z);
  g.rotation.y = yaw;
  ctx.scene.add(g);
  const red = mat(HOJO_DARK, { roughness: 0.7 }); // (posts: dark wood now)
  const Hh = 3.2, ld = Dp - 1.6; // walls set back behind a front veranda
  g.add(box(L, PL, Dp, mat(THEME.platformStone, { roughness: 0.95 }), 0, 0, 0));
  g.add(box(L - 0.4, Hh, ld, mat(THEME.wall, { roughness: 0.9 }), 0, PL, -0.7));
  g.add(box(L - 0.34, 0.6, ld + 0.06, mat(HOJO_WOOD, { roughness: 0.8 }), 0, PL, -0.7));
  g.add(box(L, 0.3, Dp, mat(HOJO_DARK, { roughness: 0.7 }), 0, PL + Hh - 0.3, 0));
  const n = Math.max(3, Math.round(L / 3.2));
  for (let i = 0; i <= n; i++) g.add(cylinder(0.11, 0.12, Hh, red, -L / 2 + 0.25 + (i * (L - 0.5)) / n, PL, Dp / 2 - 0.3, 8));
  // a run of paper shōji along the front
  const sho = shojiTexture();
  sho.repeat.set((L - 0.6) / 1.6, 1);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.6, Hh - 0.6), new THREE.MeshStandardMaterial({ map: sho, roughness: 0.9 }));
  front.position.set(0, PL + 0.3 + (Hh - 0.6) / 2, -0.7 + ld / 2 + 0.015);
  g.add(front);
  hojoRoof(g, L + 2.2, Dp + 2.2, 2.2, PL + Hh);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  ctx.collisions.addBoxCentered(x, z, c * L + s * Dp, s * L + c * Dp);
}

/** Built facing +Z (south); `yaw` turns it. */
function buildHut(ctx: WorldContext, x: number, z: number, yaw: number, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, ctx.ground.heightAt(x, z), z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);
  ctx.scene.add(g);
  const stone = mat(THEME.platformStone, { roughness: 0.95 });
  const red = mat(HOJO_DARK, { roughness: 0.7 }); // (posts: dark wood now)

  g.add(box(W + 1.2, PL, D + 2.2, stone, 0, 0, 0.5)); // platform with a porch in front
  g.add(box(2, PL * 0.5, 0.6, stone, 0, 0, D / 2 + 1.9)); // step
  g.add(box(W, H, D, mat(THEME.wall, { roughness: 0.9 }), 0, PL, 0));
  g.add(box(W + 0.06, 0.6, D + 0.06, mat(HOJO_WOOD, { roughness: 0.8 }), 0, PL, 0));
  g.add(box(W + 0.3, 0.35, D + 0.3, mat(HOJO_DARK, { roughness: 0.7 }), 0, PL + H - 0.35, 0));
  // Front: lattice door and windows
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.1), new THREE.MeshStandardMaterial({ map: latticeTex(), roughness: 0.8 }));
  door.position.set(0, PL + 1.05, D / 2 + 0.01);
  g.add(door, box(1.5, 0.12, 0.1, red, 0, PL + 2.1, D / 2 + 0.03));
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), new THREE.MeshStandardMaterial({ map: latticeTex(), roughness: 0.8 }));
    win.position.set(s * 1.75, PL + 1.45, D / 2 + 0.01);
    g.add(win);
  }
  // Posts: corners and porch
  for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [-W / 2 + 0.2, D / 2 + 1.25], [W / 2 - 0.2, D / 2 + 1.25]])
    g.add(cylinder(0.12, 0.14, H, red, px, PL, pz, 10));
  // Roof over house and porch
  hojoRoof(g, W + 2.4, D + 3.4, 2.1, PL + H, 0.55);
  // Two red lanterns under the porch eave
  for (const s of [-1, 1]) {
    const l = buildRedLantern(0.3);
    l.scale.setScalar(0.75);
    l.position.set(s * 1.25, PL + H + 0.05, D / 2 + 1.25);
    g.add(l);
  }
  // Collision: the rotated footprint's bounding box
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const fw = (W + 1.2) * scale, fd = (D + 2.2) * scale;
  ctx.collisions.addBoxCentered(x + Math.sin(yaw) * 0.5 * scale, z + Math.cos(yaw) * 0.5 * scale, c * fw + s * fd, s * fw + c * fd);
}

function buildWell(ctx: WorldContext, x: number, z: number) {
  const y = ctx.ground.heightAt(x, z);
  const wood = mat(0x6b4a2a, { roughness: 0.8 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.75, 14, 1, true), mat(0x8d8a80, { roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  ring.position.set(x, y + 0.37, z);
  ctx.scene.add(ring, cylinder(0.84, 0.84, 0.02, mat(0x2f4a52, { roughness: 0.2 }), x, y + 0.35, z, 14));
  for (const s of [-1, 1]) ctx.scene.add(box(0.12, 2.0, 0.12, wood, x + s * 0.95, y, z));
  ctx.scene.add(box(2.1, 0.12, 0.12, wood, x, y + 1.6, z));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.5, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.5, 1), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
  roof.position.set(x, y + 2.2, z);
  ctx.scene.add(roof);
  ctx.scene.add(cylinder(0.16, 0.13, 0.25, wood, x + 0.35, y + 0.78, z + 0.2, 8)); // bucket on the rim
  ctx.collisions.addCircle(x, z, 1.05);
}

function buildWoodpile(ctx: WorldContext, x: number, z: number, yaw: number) {
  const y = ctx.ground.heightAt(x, z);
  const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 7).rotateX(Math.PI / 2), mat(0x7a5634, { roughness: 0.9 }), 24);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 6 - row; k++, i++) {
      const off = (k - (5 - row) / 2) * 0.23;
      p.set(x + Math.cos(yaw) * off, y + 0.11 + row * 0.2, z - Math.sin(yaw) * off);
      logs.setMatrixAt(i, m.compose(p, q, one));
    }
  logs.count = i;
  logs.castShadow = true;
  ctx.scene.add(logs);
  ctx.collisions.addCircle(x, z, 0.7);
}

function waterJar(ctx: WorldContext, x: number, z: number) {
  const y = ctx.ground.heightAt(x, z);
  const jar = new THREE.Mesh(
    new THREE.LatheGeometry([[0.0, 0], [0.22, 0.02], [0.34, 0.2], [0.36, 0.42], [0.28, 0.62], [0.26, 0.66]].map(([r, h]) => new THREE.Vector2(r, h)), 16),
    mat(0x5a3a28, { roughness: 0.5 }),
  );
  jar.position.set(x, y, z);
  jar.castShadow = true;
  ctx.scene.add(jar, cylinder(0.25, 0.25, 0.01, mat(0x2f4a52, { roughness: 0.15 }), x, y + 0.6, z, 14));
  ctx.collisions.addCircle(x, z, 0.38);
}

/** Rows of greens in dark soil behind a low bamboo fence. */
function buildVegPatch(ctx: WorldContext, x0: number, x1: number, z0: number, z1: number) {
  const y = ctx.ground.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
  const w = x1 - x0, d = z1 - z0;
  ctx.scene.add(box(w, 0.12, d, mat(0x4a3424, { roughness: 1 }), (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2, false));
  const rng = mulberry32(77);
  const n = Math.floor(w / 0.8) * Math.floor(d / 0.55);
  const greens = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 0).scale(1, 0.7, 1), mat(0x5f9a3a, { roughness: 0.8, flatShading: true }), n);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let px = x0 + 0.5; px < x1 - 0.3 && i < n; px += 0.8)
    for (let pz = z0 + 0.4; pz < z1 - 0.2 && i < n; pz += 0.55, i++) {
      const s = range(rng, 0.7, 1.2);
      greens.setMatrixAt(i, m.makeScale(s, s, s).setPosition(px + range(rng, -0.08, 0.08), y + 0.12, pz));
    }
  greens.count = i;
  ctx.scene.add(greens);
  // Bamboo fence: posts and two rails all round, open on the side facing the hut path (east).
  const cane = mat(0xb9a35a, { roughness: 0.7 });
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), r = new THREE.Group();
    for (const hy of [0.35, 0.7]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5).rotateZ(Math.PI / 2), cane);
      bar.position.y = hy;
      r.add(bar);
    }
    r.position.set((ax + bx) / 2, y, (az + bz) / 2);
    r.rotation.y = -Math.atan2(bz - az, bx - ax);
    for (let t = 0; t <= len; t += 1.1) ctx.scene.add(cylinder(0.035, 0.035, 0.9, cane, ax + ((bx - ax) * t) / len, y, az + ((bz - az) * t) / len, 6));
    ctx.scene.add(r);
    ctx.collisions.addBox(Math.min(ax, bx) - 0.05, Math.max(ax, bx) + 0.05, Math.min(az, bz) - 0.05, Math.max(az, bz) + 0.05);
  };
  const m0 = 0.3;
  rail(x0 - m0, z0 - m0, x1 + m0, z0 - m0);
  rail(x0 - m0, z1 + m0, x1 + m0, z1 + m0);
  rail(x0 - m0, z0 - m0, x0 - m0, z1 + m0);
  rail(x1 + m0, z0 - m0, x1 + m0, (z0 + z1) / 2 - 0.8);
}

/**
 * 茶亭: a 4 × 4 m hut open along its front, in the abbot's-quarters style (white walls over a wood band, dark posts and
 * beams, lattice windows, bark roof), on a low stone plinth with a step. A table, a bench and two stools stand inside
 * (all seats you can sit on). Built facing +Z in its own frame, then turned by TABLE_HUT.yaw (a multiple of π/2).
 */
function buildTableHut(ctx: WorldContext) {
  const { x, z, yaw } = TABLE_HUT;
  const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
  const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const aabb = (x0: number, x1: number, z0: number, z1: number) => {
    const [ax, az] = toWorld(x0, z0), [bx, bz] = toWorld(x1, z1);
    return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  };
  // The floor is level with the highest ground under the plinth; the plinth's skirt runs down to the lowest.
  let hi = -Infinity, lo = Infinity;
  for (const lx of [-2.6, 0, 2.6]) for (const lz of [-2.4, 0, 2.8]) { const h = ctx.ground.heightAt(...toWorld(lx, lz)); hi = Math.max(hi, h); lo = Math.min(lo, h); }
  const PLH = 0.3, y0 = hi + PLH;
  const g = new THREE.Group();
  g.position.set(x, hi, z);
  g.rotation.y = yaw;
  ctx.scene.add(g);
  const stone = mat(THEME.platformStone, { roughness: 0.95 });
  const dark = mat(HOJO_DARK, { roughness: 0.7 });
  const furn = mat(0x8a6038, { roughness: 0.8 }); // the picnic tables' wood
  const Hh = 2.6, half = 2;

  // Plinth (skirted down to the lowest ground), step in front
  g.add(box(4.8, PLH + (hi - lo), 5.2, stone, 0, -(hi - lo), 0.2));
  g.add(box(2.4, PLH * 0.5, 0.5, stone, 0, 0, 3.05));
  g.add(box(3.8, 0.03, 3.8, mat(0x8a5a36, { roughness: 0.85 }), 0, PLH, 0)); // timber floor (the picnic tables' deck wood tone)
  // Open on all sides: just its four posts, the beams round the top and the roof
  g.add(box(4.5, 0.32, 0.3, dark, 0, PLH + Hh - 0.32, -half + 0.1)); // beams round the top
  g.add(box(0.3, 0.32, 4.3, dark, -half, PLH + Hh - 0.32, 0), box(0.3, 0.32, 4.3, dark, half, PLH + Hh - 0.32, 0));
  g.add(box(4.5, 0.32, 0.3, dark, 0, PLH + Hh - 0.32, half)); // the front lintel: open below it
  for (const [px, pz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) g.add(cylinder(0.12, 0.14, Hh, dark, px, PLH, pz, 10));
  hojoRoof(g, 6.4, 6.0, 1.9, PLH + Hh, 0);
  // red lanterns hung at the four corners of the eave, lighting the floor and the grass round it after dark
  for (const [lx, lz] of [[-2.55, 2.55], [2.55, 2.55], [-2.55, -2.55], [2.55, -2.55]]) {
    const l = buildRedLantern(0.3, false); // (no tassel: just the round lantern)
    l.scale.setScalar(0.75);
    l.position.set(lx, PLH + Hh + 0.05, lz);
    g.add(l);
    const [wx, wz] = toWorld(lx, lz);
    addLamp({ x: wx, y: hi + PLH + Hh - 0.75, z: wz, color: 0xff9a60, intensity: 1.6, range: 6.5, decay: 1.4 }); // (a soft glow round the hut, not a floodlight)
  }

  // Furniture: a table against the back, a bench in front of it, a stool at each end
  const tz = -0.7;
  g.add(box(1.9, 0.07, 0.85, furn, 0, 0.72 + PLH, tz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, 0.72, 0.08, furn, sx * 0.82, PLH, tz + sz * 0.34));
  g.add(box(1.7, 0.06, 0.06, furn, 0, PLH + 0.4, tz - 0.34), box(1.7, 0.06, 0.06, furn, 0, PLH + 0.4, tz + 0.34));
  g.add(box(1.9, 0.06, 0.32, furn, 0, 0.42 + PLH, tz + 0.82)); // bench seat
  for (const sx of [-1, 1]) g.add(box(0.08, 0.42, 0.28, furn, sx * 0.8, PLH, tz + 0.82));
  for (const sx of [-1, 1]) { // stools
    g.add(cylinder(0.2, 0.2, 0.06, furn, sx * 1.35, PLH + 0.4, tz, 12));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.05, 0.4, 0.05, furn, sx * 1.35 + dx * 0.11, PLH, tz + dz * 0.11));
  }
  // On the table: folded prayer flags in stacks (blue, white, red, green, yellow, as they're strung), a short string
  // of them laid out, and pens (a cup of them and two lying loose)
  const top = PLH + 0.79, FLAG = [0x2a5ad8, 0xf2f2f2, 0xd8322a, 0x2f9a4a, 0xf2c524].map((c) => mat(c, { roughness: 0.9 }));
  for (const [sx, sz, n] of [[-0.62, tz - 0.12, 3], [-0.3, tz - 0.16, 2]] as const)
    for (let r = 0; r < n; r++) for (let k = 0; k < 5; k++) { const f = box(0.22, 0.012, 0.16, FLAG[k], sx + (r % 2 ? 0.004 : -0.004), top + (r * 5 + k) * 0.012, sz); f.rotation.y = 0.08 * (k - 2); g.add(f); }
  for (let k = 0; k < 9; k++) { // the string, laid across the table
    const fx = -0.05 + k * 0.1, fz = tz + 0.12 + Math.sin(k * 0.9) * 0.03;
    g.add(box(0.085, 0.004, 0.11, FLAG[k % 5], fx, top, fz));
  }
  g.add(box(0.9, 0.003, 0.006, mat(0xd8d0c0, { roughness: 0.9 }), 0.35, top + 0.004, tz + 0.07));
  const penBody = [mat(0x1d2433, { roughness: 0.5 }), mat(0x9a1f1a, { roughness: 0.5 }), mat(0x1f4fa0, { roughness: 0.5 })], penCap = mat(0xd9a520, { metalness: 0.7, roughness: 0.35 });
  g.add(cylinder(0.045, 0.04, 0.1, mat(0x6b4a2a, { roughness: 0.8 }), 0.72, top, tz - 0.18, 12)); // the pen cup
  [[-0.02, 0.012], [0.015, -0.01], [0.0, 0.02]].forEach(([dx, dz], k) => {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), penBody[k]);
    pen.position.set(0.72 + dx, top + 0.11, tz - 0.18 + dz);
    pen.rotation.set(dz * 6, 0, -dx * 6);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6), penCap);
    cap.position.y = 0.065;
    pen.add(cap);
    g.add(pen);
  });
  for (const [px, pz, ry, k] of [[0.45, tz + 0.28, 0.4, 0], [0.62, tz + 0.3, -0.25, 2]] as const) { // two lying loose
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6).rotateZ(Math.PI / 2), penBody[k]);
    pen.position.set(px, top + 0.006, pz);
    pen.rotation.y = ry;
    g.add(pen);
  }
  // A big signboard along the hut's left side (as you face it), post to post, hung just under the side beam and
  // facing out: 掛風馬旗
  const face = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const bw = 2 * half - 0.3, bh = 0.8, cord = 0.06, by = PLH + Hh - 0.32 - cord - bh / 2, bx = -half - 0.2;
  g.add(box(0.05, bh + 0.1, bw + 0.1, dark, bx + 0.03, by - (bh + 0.1) / 2, 0));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh).rotateY(-Math.PI / 2), face);
  board.position.set(bx, by, 0);
  g.add(board);
  for (const sz of [-1, 1]) g.add(cylinder(0.01, 0.01, cord + 0.05, mat(0x2a1a12, { roughness: 0.9 }), bx + 0.03, by + bh / 2 + 0.04, sz * bw * 0.4, 4));
  const draw = () => {
    face.map?.dispose();
    face.map = canvasTexture(1024, 220, (c) => {
      c.fillStyle = '#efe3c8';
      c.fillRect(0, 0, 1024, 220);
      c.strokeStyle = '#7a1f16';
      c.lineWidth = 12;
      c.strokeRect(10, 10, 1004, 200);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#7a1f16';
      c.font = '700 132px "Noto Serif TC", "Songti TC", serif';
      c.fillText(inscription(t('sign.flagHut')), 512, 116, 940);
    });
    face.needsUpdate = true;
  };
  draw();
  onLocaleChange(draw);
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));

  // Ground: the floor and a ramp up the step
  const fl = aabb(-half, half, -half, half + 0.7);
  ctx.ground.addPad(fl.minX, fl.maxX, fl.minZ, fl.maxZ, y0);
  const st = aabb(-1.2, 1.2, 2.7, 3.5);
  if (s === 0) ctx.ground.addRamp(st.minX, st.maxX, c > 0 ? st.minZ : st.maxZ, c > 0 ? st.maxZ : st.minZ, y0, hi);
  else ctx.ground.addRampX(st.minZ, st.maxZ, s > 0 ? st.minX : st.maxX, s > 0 ? st.maxX : st.minX, y0, hi);
  // Collision: the four posts (open between them), the table and the seats
  const wallBox = (x0: number, x1: number, z0: number, z1: number) => { const b = aabb(x0, x1, z0, z1); ctx.collisions.addBox(b.minX, b.maxX, b.minZ, b.maxZ); };
  for (const [px, pz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) { const [wx, wz] = toWorld(px, pz); ctx.collisions.addCircle(wx, wz, 0.2); }
  wallBox(-half - 0.25, -half + 0.05, -half, half); // (the sign closes the left side)
  wallBox(-0.98, 0.98, tz - 0.45, tz + 0.45);
  wallBox(-0.98, 0.98, tz + 0.64, tz + 1.0);
  for (const sx of [-1, 1]) { const [wx, wz] = toWorld(sx * 1.35, tz); ctx.collisions.addCircle(wx, wz, 0.28); }
  // Seats: two on the bench (facing the table), one on each stool (facing in)
  const seat = (id: string, lx: number, lz: number, faceLocal: number, exitLx: number, exitLz: number) => {
    const [wx, wz] = toWorld(lx, lz), [ex, ez] = [exitLx * c + exitLz * s, -exitLx * s + exitLz * c];
    ctx.seats.set(id, { id, kind: 'bench', x: wx, y: y0, z: wz, yaw: yaw + faceLocal + Math.PI, exit: [ex * 0.8, ez * 0.8], occupiedBy: null });
  };
  void seat; // (no sitting here: the table is for writing prayer flags)
}
