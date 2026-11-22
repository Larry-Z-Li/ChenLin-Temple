import * as THREE from 'three';
import { box, cylinder, mat } from '../buildings/materials';
import { DRAGON_POOL, DRAGON_SPRING, FOOT_BRIDGES, FOOTPATHS, GREAT_STUPA, ORCHARD_SIGN, PICNIC_TABLES, POND_PAVILION, STUPA_COURT } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { inscription, onLocaleChange, t } from '../i18n';
import { smallStupa } from '../buildings/stupas';
import { buildStatueSlot } from '../buildings/statue';
import { ridgePlan } from './ridgeWalk';

const ROCK = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true });

/** Garden rooms: the rock garden, the bamboo path, the tea corner and the pond pavilion. */
export function buildGardens(ctx: WorldContext, models: Record<string, string>) {
  buildFootpaths(ctx);
  buildPavilion(ctx);
  buildFootBridges(ctx);
  buildPicnicTables(ctx);
  buildOrchardSign(ctx);
  buildStupaCourt(ctx, models);
  buildDragonPool(ctx);
  buildDragonSpring(ctx);
}

/**
 * 萬佛塔 and its court: a white-walled square with a gate in each side and a pavilion on each corner;
 * the great stupa on a two-step platform in the middle, Vairocana's altar at its south face.
 */
function buildStupaCourt(ctx: WorldContext, models: Record<string, string>) {
  const { x: cx, z: cz, half, gate } = STUPA_COURT;
  const y = ctx.ground.heightAt(cx, cz);
  const wallMat = mat(THEME.wall, { roughness: 0.9 }), baseMat = mat(THEME.wallBase, { roughness: 0.8 });
  const tiles = mat(THEME.roof, { roughness: 0.75 }), red = mat(THEME.column, { roughness: 0.55 }), gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 });
  const H = 3.2, T = 0.7;
  const wall = (horizontal: boolean, at: number, from: number, to: number) => {
    const len = to - from, mid = (from + to) / 2;
    const [x, z, w, d] = horizontal ? [mid, at, len, T] : [at, mid, T, len];
    ctx.scene.add(box(w, H, d, wallMat, x, y, z), box(w + 0.06, 0.8, d + 0.06, baseMat, x, y, z), box(w + (horizontal ? 0 : 0.7), 0.22, d + (horizontal ? 0.7 : 0), tiles, x, y + H, z));
    ctx.collisions.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  };
  for (const s of [-1, 1]) {
    wall(true, cz + s * half, cx - half, cx - gate / 2);
    wall(true, cz + s * half, cx + gate / 2, cx + half);
    wall(false, cx + s * half, cz - half, cz - gate / 2);
    wall(false, cx + s * half, cz + gate / 2, cz + half);
  }
  // Gateways: two red posts and a little tiled roof over each opening.
  const gateway = (x: number, z: number, alongX: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (!alongX) g.rotation.y = Math.PI / 2;
    ctx.scene.add(g);
    for (const s of [-1, 1]) g.add(cylinder(0.2, 0.22, 4.2, red, s * (gate / 2 + 0.1), 0, 0, 10));
    g.add(box(gate + 1.2, 0.5, 0.9, mat(THEME.beam, { roughness: 0.6 }), 0, 3.9, 0));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, gate + 2.6, 4).rotateZ(Math.PI / 2).scale(1, 0.42, 1), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
    roof.position.y = 4.85;
    g.add(roof);
  };
  gateway(cx, cz - half, true);
  gateway(cx, cz + half, true);
  gateway(cx - half, cz, false);
  gateway(cx + half, cz, false);
  // Corner pavilions
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const px = cx + sx * half, pz = cz + sz * half;
      ctx.scene.add(box(4.2, 0.4, 4.2, mat(THEME.platformStone, { roughness: 0.95 }), px, y, pz));
      for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) ctx.scene.add(cylinder(0.14, 0.15, 3.4, red, px + ox, y + 0.4, pz + oz, 8));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4, 1).rotateY(Math.PI / 4), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
      roof.position.set(px, y + 4.7, pz);
      ctx.scene.add(roof);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), gold);
      tip.position.set(px, y + 5.7, pz);
      ctx.scene.add(tip);
      ctx.collisions.addBoxCentered(px, pz, 4.2, 4.2);
    }

  // The great stupa on its stepped platform
  const S = GREAT_STUPA, b = S.base;
  ctx.scene.add(box(b, 1.2, b, mat(THEME.platformStone, { roughness: 0.95 }), S.x, y, S.z));
  ctx.scene.add(box(b - 5, 1.0, b - 5, mat(0xe9e4d8, { roughness: 0.9 }), S.x, y + 1.2, S.z));
  ctx.scene.add(box(b - 4.6, 0.12, b - 4.6, gold, S.x, y + 2.15, S.z));
  const st = smallStupa(S.height);
  st.position.set(S.x, y + 2.2, S.z);
  ctx.scene.add(st);
  ctx.collisions.addBoxCentered(S.x, S.z, b + 0.4, b + 0.4);
  // Vairocana's altar against the platform's south face
  const az = S.z + b / 2 + 1.0;
  ctx.scene.add(box(4.2, 1.1, 1.8, mat(THEME.altar, { roughness: 0.55 }), S.x, y, az));
  ctx.scene.add(box(4.4, 0.1, 2.0, mat(THEME.altarTrim, { metalness: 0.7, roughness: 0.35 }), S.x, y + 1.1, az));
  ctx.scene.add(buildStatueSlot('vairocana', S.x, y + 1.2, az - 0.1, models.vairocana));
  ctx.collisions.addBoxCentered(S.x, az, 4.4, 2.0);
}

/** 泰山龍池: a small round pool with a stone rim and a tall Taishan rock rising from the back. */
function buildDragonPool(ctx: WorldContext) {
  const { x, z, r } = DRAGON_POOL;
  const y = ctx.ground.heightAt(x, z);
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a7f84, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.8 }));
  water.position.set(x, y + 0.06, z);
  ctx.scene.add(water);
  const rng = mulberry32(5150);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    rock(ctx, x + Math.cos(a) * (r + 0.3), z + Math.sin(a) * (r + 0.3), range(rng, 0.45, 0.75), rng);
  }
  const taishan = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), ROCK);
  taishan.scale.set(1.6, 3.6, 1.2);
  taishan.rotation.set(0.1, 0.6, -0.08);
  taishan.position.set(x + 0.6, y + 2.6, z - r * 0.55);
  taishan.castShadow = true;
  ctx.scene.add(taishan);
  ctx.collisions.addCircle(x, z, r + 0.4);
}

/** 清澈龍泉: a square stone spring basin with a bamboo spout under a little wooden frame. */
function buildDragonSpring(ctx: WorldContext) {
  const { x, z } = DRAGON_SPRING;
  const y = ctx.ground.heightAt(x, z);
  const stone = mat(0x9a958a, { roughness: 1, flatShading: true }), wood = mat(0x6b4a2a, { roughness: 0.8 });
  ctx.scene.add(box(2.6, 0.6, 2.6, stone, x, y, z), box(2.1, 0.02, 2.1, mat(0x6fb3c4, { roughness: 0.05 }), x, y + 0.55, z));
  for (const s of [-1, 1]) ctx.scene.add(box(0.14, 2.4, 0.14, wood, x + s * 1.5, y, z - 1.5));
  ctx.scene.add(box(3.4, 0.14, 0.2, wood, x, y + 2.3, z - 1.5));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.8, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.4, 1), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
  roof.position.set(x, y + 2.65, z - 1.5);
  ctx.scene.add(roof);
  const spout = cylinder(0.04, 0.04, 1.0, mat(0x8fa04a, { roughness: 0.6 }), 0, 0, 0, 6);
  spout.rotation.x = Math.PI / 2 - 0.3;
  spout.position.set(x, y + 1.0, z - 1.1);
  ctx.scene.add(spout);
  ctx.collisions.addBoxCentered(x, z, 2.7, 2.7);
}

/** Flat wooden footbridges with red rails; the deck is a walkable pad with short ramps at each end. */
function buildFootBridges(ctx: WorldContext) {
  const deck = mat(0x7a5434, { roughness: 0.8 }), red = mat(THEME.column, { roughness: 0.55 }), gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });
  const WIDTH = 2.4, H = 0.45;
  for (const b of FOOT_BRIDGES) {
    const g = new THREE.Group();
    const y0 = Math.max(ctx.ground.heightAt(b.x, b.z), ctx.ground.heightAt(b.x + (b.axis === 'x' ? b.length / 2 : 0), b.z + (b.axis === 'z' ? b.length / 2 : 0)), 0);
    g.position.set(b.x, 0, b.z);
    if (b.axis === 'z') g.rotation.y = Math.PI / 2; // built along X
    ctx.scene.add(g);
    g.add(box(b.length, 0.14, WIDTH, deck, 0, y0 + H - 0.14, 0));
    for (const s of [-1, 1]) {
      g.add(box(b.length, 0.2, 0.16, deck, 0, y0 + H - 0.3, s * (WIDTH / 2 - 0.08))); // side stringers
      for (let t = -b.length / 2 + 0.15; t <= b.length / 2; t += (b.length - 0.3) / 4) {
        g.add(cylinder(0.06, 0.07, 1.0, red, t, y0 + H - 0.4, s * (WIDTH / 2 - 0.05), 8));
        g.add(cylinder(0.08, 0.08, 0.06, gold, t, y0 + H + 0.6, s * (WIDTH / 2 - 0.05), 8));
      }
      g.add(box(b.length, 0.08, 0.1, red, 0, y0 + H + 0.5, s * (WIDTH / 2 - 0.05)));
      g.add(box(b.length, 0.05, 0.06, red, 0, y0 + H + 0.22, s * (WIDTH / 2 - 0.05)));
    }
    for (const s of [-1, 1]) g.add(box(0.5, 0.9, WIDTH - 0.2, mat(0x8d8a80, { roughness: 1 }), s * (b.length / 2 - 0.27), y0 - 0.5, 0)); // stone abutments (just inside the deck's ends)
    // walkable deck + ramps, and rails you can't step through
    const half = b.length / 2, hw = WIDTH / 2 - 0.15, top = y0 + H;
    if (b.axis === 'x') {
      ctx.ground.addPad(b.x - half + 0.8, b.x + half - 0.8, b.z - hw, b.z + hw, top);
      ctx.ground.addRampX(b.z - hw, b.z + hw, b.x - half - 0.4, b.x - half + 0.8, y0, top);
      ctx.ground.addRampX(b.z - hw, b.z + hw, b.x + half + 0.4, b.x + half - 0.8, y0, top);
      for (const s of [-1, 1]) ctx.collisions.addBox(b.x - half, b.x + half, b.z + s * (WIDTH / 2) - 0.08, b.z + s * (WIDTH / 2) + 0.08);
    } else {
      ctx.ground.addPad(b.x - hw, b.x + hw, b.z - half + 0.8, b.z + half - 0.8, top);
      ctx.ground.addRamp(b.x - hw, b.x + hw, b.z - half - 0.4, b.z - half + 0.8, y0, top);
      ctx.ground.addRamp(b.x - hw, b.x + hw, b.z + half + 0.4, b.z + half - 0.8, y0, top);
      for (const s of [-1, 1]) ctx.collisions.addBox(b.x + s * (WIDTH / 2) - 0.08, b.x + s * (WIDTH / 2) + 0.08, b.z - half, b.z + half);
    }
  }
}

/** Wooden picnic tables with a bench each side; each bench seats two. */
function buildPicnicTables(ctx: WorldContext) {
  const wood = mat(0x8a6038, { roughness: 0.8 });
  PICNIC_TABLES.forEach((tb, i) => {
    const y = ctx.ground.heightAt(tb.x, tb.z);
    const g = new THREE.Group();
    g.position.set(tb.x, y, tb.z);
    g.rotation.y = tb.yaw;
    ctx.scene.add(g);
    g.add(box(1.9, 0.07, 0.85, wood, 0, 0.72, 0)); // top
    for (const s of [-1, 1]) {
      g.add(box(0.08, 0.72, 0.08, wood, s * 0.75, 0, 0)); // legs
      g.add(box(1.9, 0.06, 0.32, wood, 0, 0.42, s * 0.72)); // bench seats
      g.add(box(0.08, 0.42, 1.6, wood, s * 0.75, 0, 0)); // A-frame foot
    }
    g.traverse((o) => (o.castShadow = o.receiveShadow = true));
    ctx.collisions.addCircle(tb.x, tb.z, 0.75);
    // seats: two per bench, facing the table
    const ax = Math.cos(tb.yaw), az = -Math.sin(tb.yaw); // table's local +X in world
    const fx = Math.sin(tb.yaw), fz = Math.cos(tb.yaw); // local +Z in world
    [-1, 1].forEach((side) =>
      [-0.45, 0.45].forEach((along, k) => {
        const id = `picnic-${i}-${side > 0 ? 'b' : 'a'}${k}`;
        const x = tb.x + ax * along + fx * side * 0.75, z = tb.z + az * along + fz * side * 0.75;
        const face = tb.yaw + (side > 0 ? Math.PI : 0); // sitter faces the table
        ctx.seats.set(id, { id, kind: 'bench', x, y, z, yaw: face + Math.PI, exit: [fx * side * 0.7, fz * side * 0.7], occupiedBy: null });
      }),
    );
  });
}

/** Two-step stone wall along x (horizontal) or z at `at`, from → to; solid to walk into. */
export function steppedWall(ctx: WorldContext, horizontal: boolean, at: number, from: number, to: number, y: number) {
  const len = to - from, mid = (from + to) / 2;
  const [x, z, w, d] = horizontal ? [mid, at, len, 0] : [at, mid, 0, len];
  ctx.scene.add(box(w + 0.8, 0.3, d + 0.8, mat(0x9a958a, { roughness: 1 }), x, y, z), box(w + 0.42, 0.62, d + 0.42, mat(0x8d8a80, { roughness: 1 }), x, y, z));
  ctx.collisions.addBox(x - (w + 0.8) / 2, x + (w + 0.8) / 2, z - (d + 0.8) / 2, z + (d + 0.8) / 2);
}

/** Wooden signboard at the orchard entrance, facing the path from the courtyard (west). */
function buildOrchardSign(ctx: WorldContext) {
  const { x, z } = ORCHARD_SIGN;
  const g = new THREE.Group();
  g.position.set(x, ctx.ground.heightAt(x, z), z);
  g.rotation.y = -Math.PI / 2;
  ctx.scene.add(g);
  const wood = mat(0x4a2214, { roughness: 0.6 });
  for (const s of [-1, 1]) g.add(cylinder(0.06, 0.07, 2.1, wood, s * 0.85, 0, 0, 8));
  g.add(box(1.95, 0.9, 0.08, wood, 0, 1.0, -0.02));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.3, 4).rotateZ(Math.PI / 2).scale(1, 0.4, 1), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
  roof.position.set(0, 2.15, 0);
  g.add(roof);
  const face = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.78), face);
  panel.position.set(0, 1.45, 0.03);
  g.add(panel);
  const draw = () => {
    face.map?.dispose();
    face.map = canvasTexture(640, 278, (c) => {
      c.fillStyle = '#efe3c8';
      c.fillRect(0, 0, 640, 278);
      c.strokeStyle = '#7a1f16';
      c.lineWidth = 10;
      c.strokeRect(8, 8, 624, 262);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#7a1f16';
      c.font = '700 84px "Noto Serif TC", "Songti TC", serif';
      c.fillText(inscription(t('sign.orchard')), 320, 108, 590);
      c.fillStyle = '#3a2416';
      c.font = '500 40px "Noto Serif TC", "Songti TC", serif';
      c.fillText(inscription(t('sign.orchardSub')), 320, 205, 590);
    });
    face.needsUpdate = true;
  };
  draw();
  onLocaleChange(draw);
  ctx.collisions.addCircle(x, z, 0.5);
}

function rock(ctx: WorldContext, x: number, z: number, s: number, rng: () => number) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), ROCK);
  m.scale.set(s * range(rng, 0.9, 1.4), s * range(rng, 0.5, 0.9), s * range(rng, 0.8, 1.2));
  m.rotation.set(rng() * 0.4, rng() * 6, rng() * 0.4);
  m.position.set(x, ctx.ground.heightAt(x, z) + s * 0.2, z);
  m.castShadow = m.receiveShadow = true;
  ctx.scene.add(m);
  return m;
}

/** Gravel ribbons: the path winding through the bamboo, and the footpaths between places. */
function buildFootpaths(ctx: WorldContext) {
  for (const p of FOOTPATHS) gravelRibbon(ctx, p, 0.7);
}

function gravelRibbon(ctx: WorldContext, points: [number, number][], w: number) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const n = Math.ceil(curve.getLength() / 0.6);
  const pos: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), tng = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, p);
    curve.getTangentAt(i / n, tng);
    const nx = -tng.z, nz = tng.x;
    for (const s of [-1, 1]) {
      const x = p.x + nx * w * s, z = p.z + nz * w * s;
      pos.push(x, ctx.ground.heightAt(x, z) + 0.04, z);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ribbon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 1, side: THREE.DoubleSide }));
  ribbon.receiveShadow = true;
  ctx.scene.add(ribbon);
}

/** Octagonal pavilion (亭) on the pond and the covered walkway out to it. */
function buildPavilion(ctx: WorldContext) {
  const P = POND_PAVILION, FLOOR = 0.2;
  const red = mat(THEME.column, { roughness: 0.55 });
  const deck = mat(0x7a5434, { roughness: 0.8 });
  const stone = mat(THEME.platformStone, { roughness: 0.95 });
  const tiles = mat(THEME.roof, { roughness: 0.75, flatShading: true, side: THREE.DoubleSide });
  const gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 });

  // Walkway: deck on stone piers, posts both sides, low rails, gabled roof.
  const wx = (P.walkX0 + P.walkX1) / 2, wl = P.walkX1 - P.walkX0, wz = (P.walkZ0 + P.walkZ1) / 2, ww = P.walkZ1 - P.walkZ0;
  ctx.scene.add(box(wl, 0.12, ww, deck, wx, FLOOR - 0.11, wz)); // 1 cm above the pavilion's stone base where they meet
  for (let x = P.walkX0 + 0.4; x < P.walkX1; x += 2.2) ctx.scene.add(box(0.4, 0.8, ww - 0.4, stone, x, -0.7, wz));
  for (let x = P.walkX0 + 0.2; x <= P.walkX1; x += 1.6)
    for (const z of [P.walkZ0 + 0.1, P.walkZ1 - 0.1]) ctx.scene.add(cylinder(0.08, 0.09, 2.5, red, x, FLOOR, z, 8));
  for (const z of [P.walkZ0 + 0.1, P.walkZ1 - 0.1]) ctx.scene.add(box(wl, 0.08, 0.08, red, wx, FLOOR + 0.55, z));
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(ww * 0.8, ww * 0.8, wl + 0.6, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.45, 1), tiles);
  gable.position.set(wx, FLOOR + 2.5 + ww * 0.8 * 0.45 * 0.5, wz);
  gable.castShadow = true;
  ctx.scene.add(gable);
  ctx.ground.addPad(P.walkX0 - 0.2, P.walkX1, P.walkZ0, P.walkZ1, FLOOR);
  ctx.collisions.addBox(P.walkX0, P.walkX1, P.walkZ0 - 0.15, P.walkZ0 + 0.15);
  ctx.collisions.addBox(P.walkX0, P.walkX1, P.walkZ1 - 0.15, P.walkZ1 + 0.15);

  // Pavilion
  ctx.scene.add(cylinder(P.r + 0.3, P.r + 0.45, 0.85, stone, P.x, FLOOR - 0.85, P.z, 8));
  ctx.scene.add(cylinder(P.r + 0.15, P.r + 0.15, 0.06, deck, P.x, FLOOR - 0.04, P.z, 8));
  ctx.ground.addPad(P.x - P.r, P.x + P.r, P.z - P.r, P.z + P.r, FLOOR);
  const H = 2.7;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const cx = P.x + Math.cos(a) * P.r, cz = P.z + Math.sin(a) * P.r;
    ctx.scene.add(cylinder(0.11, 0.12, H, red, cx, FLOOR, cz, 10));
    // low bench-rail between columns, except the side facing the walkway (east)
    const a2 = a + Math.PI / 4, mid = a + Math.PI / 8;
    if (Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < 0.4) continue;
    const ex = P.x + Math.cos(a2) * P.r, ez = P.z + Math.sin(a2) * P.r;
    const rail = box(Math.hypot(ex - cx, ez - cz), 0.1, 0.32, red, (cx + ex) / 2, FLOOR + 0.42, (cz + ez) / 2);
    rail.rotation.y = -Math.atan2(ez - cz, ex - cx);
    ctx.scene.add(rail);
    for (let t = 0; t <= 1; t += 0.25) ctx.collisions.addCircle(cx + (ex - cx) * t, cz + (ez - cz) * t, 0.3);
  }
  ctx.scene.add(cylinder(P.r + 0.12, P.r + 0.12, 0.3, red, P.x, FLOOR + H - 0.1, P.z, 8));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(P.r + 1.3, 1.9, 8, 1, true).rotateY(Math.PI / 8), tiles);
  roof.position.set(P.x, FLOOR + H + 0.95, P.z);
  roof.castShadow = true;
  ctx.scene.add(roof);
  ctx.scene.add(cylinder(0.06, 0.1, 0.5, gold, P.x, FLOOR + H + 1.8, P.z, 8));
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), gold);
  finial.position.set(P.x, FLOOR + H + 2.4, P.z);
  ctx.scene.add(finial);

  // A small stupa in the middle of the pavilion
  ctx.scene.add(cylinder(0.75, 0.8, 0.25, stone, P.x, FLOOR, P.z, 8));
  const st = smallStupa(1.9);
  st.position.set(P.x, FLOOR + 0.25, P.z);
  ctx.scene.add(st);
  ctx.collisions.addCircle(P.x, P.z, 0.85);
}

/**
 * A walking path along the mountain ridge, just uphill of the line of stupas (the entry
 * screen's monk paces on it). Returns its points.
 */
export function buildRidgePath(ctx: WorldContext): [number, number][] {
  const pts = ridgePlan().path;
  if (pts.length > 1) gravelRibbon(ctx, pts, 0.6);
  return pts;
}
