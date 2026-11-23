import * as THREE from 'three';
import { ABBOT, DORM } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { buildRedLantern } from './hall';
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
