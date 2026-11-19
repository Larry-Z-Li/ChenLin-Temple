import * as THREE from 'three';
import { box, cylinder, hipRoofGeometry, mat } from '../buildings/materials';
import { BAMBOO_PATH, COURTYARD_STUPA, ORCHARD_SIGN, FOOT_BRIDGES, FOOTPATHS, PICNIC_TABLES, POND_PAVILION, TEA_CORNER, ZEN_GARDEN } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { inscription, onLocaleChange, t } from '../i18n';
import { smallStupa } from '../buildings/stupas';

const ROCK = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true });
const MOSS = new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1 });

/** Garden rooms: the rock garden, the bamboo path, the tea corner and the pond pavilion. */
export function buildGardens(ctx: WorldContext) {
  buildZenGarden(ctx);
  buildBambooPath(ctx);
  buildTeaCorner(ctx);
  buildPavilion(ctx);
  buildFootBridges(ctx);
  buildCourtyardStupa(ctx);
  buildPicnicTables(ctx);
  buildOrchardSign(ctx);
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
    for (const s of [-1, 1]) g.add(box(0.5, 0.9, WIDTH - 0.2, mat(0x8d8a80, { roughness: 1 }), s * (b.length / 2 - 0.25), y0 - 0.5, 0)); // stone abutments
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

/** A stupa in the middle of the courtyard, on an octagonal plinth you can walk around. */
function buildCourtyardStupa(ctx: WorldContext) {
  const { x, z } = COURTYARD_STUPA;
  const y = ctx.ground.heightAt(x, z);
  const stone = mat(THEME.platformStone, { roughness: 0.95 });
  ctx.scene.add(cylinder(2.9, 3.1, 0.35, stone, x, y, z, 8));
  ctx.scene.add(cylinder(2.6, 2.6, 0.06, mat(THEME.goldLeaf, { metalness: 0.6, roughness: 0.4 }), x, y + 0.35, z, 8));
  const st = smallStupa(6.2);
  st.position.set(x, y + 0.41, z);
  ctx.scene.add(st);
  ctx.collisions.addCircle(x, z, 3.1);
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

/** 枯山水: raked gravel with ripples around three rock islands, framed by a stone curb. */
function buildZenGarden(ctx: WorldContext) {
  const { minX, maxX, minZ, maxZ } = ZEN_GARDEN;
  const W = maxX - minX, D = maxZ - minZ, y = ctx.ground.heightAt((minX + maxX) / 2, (minZ + maxZ) / 2);
  const islands = [
    { x: minX + W * 0.3, z: minZ + D * 0.28, r: 1.6 },
    { x: minX + W * 0.68, z: minZ + D * 0.52, r: 2.1 },
    { x: minX + W * 0.35, z: minZ + D * 0.78, r: 1.3 },
  ];
  const PX = 40; // texture pixels per metre
  const tex = canvasTexture(Math.round(W * PX), Math.round(D * PX), (g) => {
    g.fillStyle = '#ddd7c9';
    g.fillRect(0, 0, W * PX, D * PX);
    g.strokeStyle = 'rgba(150,140,122,0.55)';
    g.lineWidth = 3;
    for (let v = 6; v < D * PX; v += 12) {
      g.beginPath();
      g.moveTo(0, v);
      g.lineTo(W * PX, v);
      g.stroke();
    }
    for (const isl of islands) {
      const cx = (isl.x - minX) * PX, cy = (isl.z - minZ) * PX, R = (isl.r + 1.4) * PX;
      g.fillStyle = '#ddd7c9';
      g.beginPath();
      g.arc(cx, cy, R + 4, 0, Math.PI * 2);
      g.fill();
      for (let r = isl.r * PX; r < R; r += 12) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  gravel.position.set((minX + maxX) / 2, y + 0.03, (minZ + maxZ) / 2);
  gravel.receiveShadow = true;
  ctx.scene.add(gravel);
  // texture is drawn north-up in z; the plane maps v=0 to the far (−z) edge, which matches minZ
  // Closed stepped stone border: look, don't walk on the gravel.
  steppedWall(ctx, true, minZ, minX, maxX, y);
  steppedWall(ctx, true, maxZ, minX, maxX, y);
  steppedWall(ctx, false, minX, minZ, maxZ, y);
  steppedWall(ctx, false, maxX, minZ, maxZ, y);

  const rng = mulberry32(88);
  for (const isl of islands) {
    const moss = new THREE.Mesh(new THREE.CircleGeometry(isl.r, 20).rotateX(-Math.PI / 2), MOSS);
    moss.position.set(isl.x, y + 0.045, isl.z);
    ctx.scene.add(moss);
    rock(ctx, isl.x, isl.z, isl.r * 0.55, rng);
    for (let k = 0; k < 2; k++) rock(ctx, isl.x + range(rng, -0.8, 0.8) * isl.r, isl.z + range(rng, -0.8, 0.8) * isl.r, isl.r * range(rng, 0.2, 0.32), rng);
  }
}

/** Gravel ribbons: the path winding through the bamboo, and the footpaths between places. */
function buildBambooPath(ctx: WorldContext) {
  gravelRibbon(ctx, BAMBOO_PATH, 0.85);
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

/** Moss garden under maples, a little thatched tea hut, stepping stones and a stone water basin. */
function buildTeaCorner(ctx: WorldContext) {
  const { x, z, r, hut } = TEA_CORNER;
  const y = ctx.ground.heightAt(x, z);
  const moss = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), MOSS);
  moss.position.set(x, y + 0.025, z);
  moss.receiveShadow = true;
  ctx.scene.add(moss);

  // Stepping stones from the north path to the hut.
  const stoneGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.1, 9);
  const stoneMat = mat(0x9a958a, { roughness: 1, flatShading: true });
  const from = new THREE.Vector2(-40, -22), to = new THREE.Vector2(hut.x + 2.4, hut.z + 0.4);
  const steps = Math.round(from.distanceTo(to) / 0.95);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, sx = from.x + (to.x - from.x) * t + Math.sin(i * 1.7) * 0.25, sz = from.y + (to.y - from.y) * t + Math.cos(i * 1.3) * 0.25;
    const s = new THREE.Mesh(stoneGeo, stoneMat);
    s.position.set(sx, ctx.ground.heightAt(sx, sz) + 0.03, sz);
    s.rotation.y = i;
    ctx.scene.add(s);
  }

  // Hut: raised floor, posts, plaster back and sides, open to the east, thatched hip roof.
  const g = new THREE.Group();
  g.position.set(hut.x, y, hut.z);
  ctx.scene.add(g);
  const wood = mat(0x6b4a2a, { roughness: 0.8 });
  g.add(box(3.2, 0.45, 3.2, wood, 0, 0, 0));
  g.add(box(3.0, 0.04, 3.0, mat(0xc9bb7a, { roughness: 0.9 }), 0, 0.45, 0)); // tatami
  for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.add(box(0.14, 2.6, 0.14, wood, px, 0, pz));
  const plaster = mat(0xd8cdb4, { roughness: 0.95 });
  g.add(box(0.08, 1.9, 3.0, plaster, -1.5, 0.5, 0)); // west (back) wall
  g.add(box(3.0, 1.9, 0.08, plaster, 0, 0.5, -1.5), box(3.0, 1.9, 0.08, plaster, 0, 0.5, 1.5));
  const { geometry } = hipRoofGeometry(4.4, 4.4, 1.5);
  const roof = new THREE.Mesh(geometry, mat(0x8a7444, { roughness: 1, flatShading: true, side: THREE.DoubleSide }));
  roof.position.y = 2.55;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(0.9, 0.22, 0.6, mat(0x3a2416, { roughness: 0.6 }), 0.2, 0.49, 0)); // low tea table
  g.add(cylinder(0.08, 0.09, 0.12, mat(0x2f3a3a, { roughness: 0.5 }), 0.15, 0.71, 0, 10));
  for (const cz of [-0.18, 0.18]) g.add(cylinder(0.035, 0.03, 0.05, mat(0xe8e0d0), 0.45, 0.71, cz, 8));
  ctx.collisions.addBoxCentered(hut.x, hut.z, 3.3, 3.3);

  // Stone water basin (蹲踞) with a bamboo spout, beside the stepping stones.
  const bx = hut.x + 3.6, bz = hut.z + 2.6, by = ctx.ground.heightAt(bx, bz);
  ctx.scene.add(cylinder(0.42, 0.5, 0.5, stoneMat, bx, by, bz, 10));
  ctx.scene.add(cylinder(0.3, 0.3, 0.02, mat(0x5f8f9a, { roughness: 0.1 }), bx, by + 0.46, bz, 14));
  const spout = cylinder(0.035, 0.035, 0.9, mat(0x8fa04a, { roughness: 0.6 }), 0, 0, 0, 6);
  spout.rotation.z = Math.PI / 2 - 0.25;
  spout.position.set(bx - 0.65, by + 0.75, bz);
  ctx.scene.add(spout);
  ctx.collisions.addCircle(bx, bz, 0.55);
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
  ctx.scene.add(box(wl, 0.12, ww, deck, wx, FLOOR - 0.12, wz));
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
