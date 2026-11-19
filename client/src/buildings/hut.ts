import * as THREE from 'three';
import { HUTS } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { buildRedLantern } from './hall';
import { box, cylinder, hipRoofGeometry, mat } from './materials';

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
export function buildHuts(ctx: WorldContext) {
  for (const h of HUTS) buildHut(ctx, h.x, h.z, h.yaw);
  const [sw, e] = HUTS;
  // South-west: a well, a woodpile and water jars.
  buildWell(ctx, sw.x - 6.4, sw.z + 0.6);
  buildWoodpile(ctx, sw.x + 4.1, sw.z + 0.4, Math.PI / 2);
  for (const dx of [-2.2, 2.2]) waterJar(ctx, sw.x + dx, sw.z - 4.3); // flanking the path to the porch
  // East: a fenced vegetable patch and a jar by the door.
  buildVegPatch(ctx, e.x - 10.6, e.x - 5.6, e.z - 5, e.z + 2);
  waterJar(ctx, e.x + 3.9, e.z + 3.2);
}

/** Built facing +Z (south); `yaw` turns it. */
function buildHut(ctx: WorldContext, x: number, z: number, yaw: number) {
  const g = new THREE.Group();
  g.position.set(x, ctx.ground.heightAt(x, z), z);
  g.rotation.y = yaw;
  ctx.scene.add(g);
  const stone = mat(THEME.platformStone, { roughness: 0.95 });
  const red = mat(THEME.column, { roughness: 0.55 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });

  g.add(box(W + 1.2, PL, D + 2.2, stone, 0, 0, 0.5)); // platform with a porch in front
  g.add(box(2, PL * 0.5, 0.6, stone, 0, 0, D / 2 + 1.9)); // step
  g.add(box(W, H, D, mat(THEME.wall, { roughness: 0.9 }), 0, PL, 0));
  g.add(box(W + 0.06, 0.6, D + 0.06, mat(THEME.wallBase, { roughness: 0.8 }), 0, PL, 0));
  g.add(box(W + 0.3, 0.35, D + 0.3, mat(THEME.beam, { roughness: 0.6 }), 0, PL + H - 0.35, 0));
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
  const { geometry, ridgeHalf } = hipRoofGeometry(W + 2.0, D + 3.2, 1.8);
  const roof = new THREE.Mesh(geometry, mat(THEME.roof, { roughness: 0.75, side: THREE.DoubleSide, flatShading: true }));
  roof.position.set(0, PL + H, 0.55);
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  g.add(box(ridgeHalf * 2 + 0.4, 0.22, 0.26, mat(THEME.roofRidge, { roughness: 0.7 }), 0, PL + H + 1.68, 0.55));
  for (const s of [-1, 1]) g.add(box(0.2, 0.45, 0.2, gold, s * (ridgeHalf + 0.15), PL + H + 1.75, 0.55));
  // Two red lanterns under the porch eave
  for (const s of [-1, 1]) {
    const l = buildRedLantern(0.3);
    l.scale.setScalar(0.75);
    l.position.set(s * 1.25, PL + H + 0.05, D / 2 + 1.25);
    g.add(l);
  }
  // Collision: the rotated footprint's bounding box
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const fw = W + 1.2, fd = D + 2.2;
  ctx.collisions.addBoxCentered(x + Math.sin(yaw) * 0.5, z + Math.cos(yaw) * 0.5, c * fw + s * fd, s * fw + c * fd);
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
