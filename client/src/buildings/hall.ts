import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEITIES } from '../config/deities';
import { PLATFORM_H, type HallDef } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { ceilingTexture, textTexture, verticalTextTexture } from '../core/textures';
import type { ThangkaEntry } from '../content/manifest';
import { inscription, onLocaleChange, t, type I18nKey } from '../i18n';
import { clamp } from '../core/math';
import { buildBoar } from './boar';
import { furnishHall, type CushionBlock } from './hallFurnishings';
import { box, cylinder, hipRoofGeometry, mat } from './materials';
import { buildOfferingTable } from './offeringTable';
import { buildStatueSlot } from './statue';
import { nightGlow } from '../world/nightGlow';
import { buildThangka } from './thangka';

const T = 0.4; // wall thickness
const PORCH = 1.6; // platform margin around the walls
const DOOR_H = 3.9;

export function buildHall(ctx: WorldContext, def: HallDef, models: Record<string, string>, thangkas: ThangkaEntry[]) {
  const g = new THREE.Group();
  g.name = `hall-${def.id}`;
  ctx.scene.add(g);

  const { x: hx, z: hz, width, depth, wallHeight: H } = def;
  const hw = width / 2, hd = depth / 2;
  const F = PLATFORM_H;
  const front = hz + hd, back = hz - hd;
  const isShrine = def.kind === 'shrine';

  // ---- Platform + stairs ----
  g.add(box(width + PORCH * 2, F, depth + PORCH * 2, mat(THEME.platformStone, { roughness: 0.95 }), hx, 0, hz));
  ctx.ground.addPad(hx - hw - PORCH, hx + hw + PORCH, back - PORCH, front + PORCH, F);
  const stairs = (dir: 1 | -1, w: number) => {
    const edge = dir > 0 ? front + PORCH : back - PORCH;
    for (let i = 0; i < 3; i++) {
      const h = (F * (3 - i)) / 3;
      g.add(box(w, h, 0.7, mat(THEME.platformStone, { roughness: 0.95 }), hx, 0, edge + dir * (0.35 + i * 0.7)));
    }
    ctx.ground.addRamp(hx - w / 2, hx + w / 2, edge, edge + dir * 2.1, F, 0);
  };
  stairs(1, isShrine ? 4 : 7);
  if (def.backDoor) stairs(-1, 5);

  // ---- Floor ----
  g.add(box(width, 0.04, depth, mat(THEME.floor, { roughness: 0.7 }), hx, F, hz, false));

  // ---- Walls (halls) or open columns (shrine) ----
  const blocker = (m: THREE.Mesh) => {
    ctx.cameraBlockers.push(m);
    return m;
  };
  const wallMat = mat(THEME.wall, { roughness: 0.9 });
  const baseMat = mat(THEME.wallBase, { roughness: 0.8 });
  const wallX = (x0: number, x1: number, z: number) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    g.add(blocker(box(w, H, T, wallMat, cx, F, z)));
    g.add(box(w, 1.0, T + 0.06, baseMat, cx, F, z));
    ctx.collisions.addBox(x0, x1, z - T / 2, z + T / 2);
  };
  const wallZ = (z0: number, z1: number, x: number) => {
    const d = z1 - z0, cz = (z0 + z1) / 2;
    g.add(blocker(box(T, H, d, wallMat, x, F, cz)));
    g.add(box(T + 0.06, 1.0, d, baseMat, x, F, cz));
    ctx.collisions.addBox(x - T / 2, x + T / 2, z0, z1);
  };
  const lintel = (dw: number, z: number) => g.add(blocker(box(dw, H - DOOR_H, T, wallMat, hx, F + DOOR_H, z)));

  const fd = width > 40 ? 7 : 5; // front door width
  if (!isShrine) {
    wallX(hx - hw, hx - fd / 2, front);
    wallX(hx + fd / 2, hx + hw, front);
    lintel(fd, front);
    if (def.backDoor) {
      wallX(hx - hw, hx - 2, back);
      wallX(hx + 2, hx + hw, back);
      lintel(4, back);
    } else wallX(hx - hw, hx + hw, back);
    wallZ(back, front, hx - hw);
    wallZ(back, front, hx + hw);

    // Ceiling
    // Painted coffered ceiling
    const ceilTex = ceilingTexture().clone();
    ceilTex.repeat.set(width / 2.4, depth / 2.4);
    ceilTex.needsUpdate = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.8, side: THREE.DoubleSide }));
    ceil.position.set(hx, F + H - 0.02, hz);
    g.add(blocker(ceil));
  }

  // Painted beam band under the eaves
  const beamMat = mat(THEME.beam, { roughness: 0.6 });
  const bandY = F + H - 0.7;
  g.add(box(width + 0.6, 0.7, 0.3, beamMat, hx, bandY, front + 0.1));
  g.add(box(width + 0.6, 0.7, 0.3, beamMat, hx, bandY, back - 0.1));
  g.add(box(0.3, 0.7, depth + 0.6, beamMat, hx - hw - 0.1, bandY, hz));
  g.add(box(0.3, 0.7, depth + 0.6, beamMat, hx + hw + 0.1, bandY, hz));
  g.add(box(width + 0.7, 0.18, 0.34, mat(THEME.beamAccent), hx, bandY - 0.18, front + 0.1));

  // Porch columns (front), or corner columns for the open shrine
  const colMat = mat(THEME.column, { roughness: 0.55 });
  const colZs = isShrine ? [front - 0.4, back + 0.4] : [front + 1.0];
  const nCols = isShrine ? 2 : Math.max(4, 2 * Math.round(width / 8));
  for (const cz of colZs)
    for (let i = 0; i < nCols; i++) {
      const cx = hx - hw + 0.4 + (i * (width - 0.8)) / (nCols - 1);
      g.add(cylinder(0.24, 0.27, H, colMat, cx, F, cz, 12));
      ctx.collisions.addCircle(cx, cz, 0.3);
    }

  // Column couplets (楹聯) on the two columns flanking the door: 上聯 right (east), 下聯 left (west).
  if (def.couplet && !isShrine) {
    const xs = Array.from({ length: nCols }, (_, i) => hx - hw + 0.4 + (i * (width - 0.8)) / (nCols - 1));
    const right = Math.min(...xs.filter((v) => v > hx)), left = Math.max(...xs.filter((v) => v < hx));
    def.couplet.forEach((text, i) => {
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 2.9),
        new THREE.MeshStandardMaterial({ map: verticalTextTexture(text, { bg: '#2a120c', border: '#c9a24a' }), roughness: 0.55 }),
      );
      board.position.set(i === 0 ? right : left, F + 2.35, front + 1.0 + 0.29);
      g.add(board);
    });
  }

  // ---- Roof ----
  const eave = isShrine ? 1.6 : 2.4;
  const roofMat = mat(THEME.roof, { roughness: 0.75, side: THREE.DoubleSide, flatShading: true });
  const ridgeMat = mat(THEME.roofRidge, { roughness: 0.7 });
  const addRoof = (W: number, D: number, RH: number, y: number) => {
    const { geometry, ridgeHalf } = hipRoofGeometry(W, D, RH);
    const roof = new THREE.Mesh(geometry, roofMat);
    roof.position.set(hx, y, hz);
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    if (ridgeHalf > 0.3) g.add(box(ridgeHalf * 2 + 0.6, 0.45, 0.5, ridgeMat, hx, y + RH - 0.15, hz));
    // gilded finials at the ridge ends
    for (const s of [-1, 1]) g.add(box(0.35, 0.9, 0.35, mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 }), hx + s * (ridgeHalf + 0.2), y + RH, hz));
  };
  const W = width + eave * 2, D = depth + eave * 2;
  if (def.roofTiers === 2) {
    const RH = D * 0.38;
    addRoof(W, D, RH * 0.5, F + H);
    const cy = F + H + RH * 0.3;
    g.add(box(width * 0.74, 2.4, depth * 0.62, wallMat, hx, cy - 0.6, hz));
    g.add(box(width * 0.74 + 0.3, 0.6, depth * 0.62 + 0.3, beamMat, hx, cy + 1.2, hz));
    addRoof(width * 0.74 + eave * 2, depth * 0.62 + eave * 2, RH * 0.55, cy + 1.8);
  } else addRoof(W, D, D * (isShrine ? 0.42 : 0.4), F + H);

  // ---- Red lanterns under the front eave, wind bells at the eave corners (gently swaying) ----
  const swaying: { obj: THREE.Object3D; amp: number; speed: number; phase: number }[] = [];
  const lanternXs = isShrine ? [-2.4, 2.4] : width > 40 ? [-20, -12, -4, 4, 12, 20] : [-8.6, -4.2, 4.2, 8.6];
  for (const lx of lanternXs) {
    const l = buildRedLantern();
    l.position.set(hx + lx, F + H - 0.1, isShrine ? front + 0.9 : front + 1.85);
    g.add(l);
    swaying.push({ obj: l, amp: 0.04, speed: 1.1, phase: lx });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b = buildWindBell();
    b.position.set(hx + sx * (hw + eave - 0.3), F + H - 0.02, hz + sz * (hd + eave - 0.3));
    g.add(b);
    swaying.push({ obj: b, amp: 0.14, speed: 2.3, phase: sx * 3 + sz });
  }
  ctx.updaters.push((_dt, time) => {
    for (const s of swaying) {
      s.obj.rotation.z = Math.sin(time * s.speed + s.phase) * s.amp;
      s.obj.rotation.x = Math.sin(time * s.speed * 0.7 + s.phase * 1.3) * s.amp * 0.6;
    }
  });

  // ---- Name plaque over the door (re-rendered on language change) ----
  const plaqueMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const drawPlaque = () => {
    plaqueMat.map?.dispose();
    plaqueMat.map = textTexture(inscription(t(def.nameKey as I18nKey)), { bg: '#1d2b4a', color: '#e8c76a', border: '#c9a24a', w: 1024, h: 192 });
    plaqueMat.needsUpdate = true;
  };
  drawPlaque();
  onLocaleChange(drawPlaque);
  const plaqueW = Math.min(width * 0.6, 7);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(plaqueW, plaqueW * 0.1875, 0.12), [mat(0x1d2b4a), mat(0x1d2b4a), mat(0x1d2b4a), mat(0x1d2b4a), plaqueMat, mat(0x1d2b4a)]);
  plaque.position.set(hx, isShrine ? F + H - 0.25 : F + DOOR_H + (H - DOOR_H) / 2 - 0.2, (isShrine ? front - 0.2 : front) + T / 2 + 0.2);
  g.add(plaque);

  // ---- Altar + statue slots ----
  const n = def.deities.length;
  const altarW = isShrine ? 3 : Math.max(5, n * 4.4);
  const altarD = isShrine ? 2 : 2.6;
  const altarH = isShrine ? 0.9 : 1.1;
  const walkway = def.backDoor ? 3.2 : 0.8;
  const altarZ = back + T / 2 + walkway + altarD / 2 + (isShrine ? 0.6 : 0);
  g.add(box(altarW, altarH, altarD, mat(THEME.altar, { roughness: 0.55 }), hx, F, altarZ));
  g.add(box(altarW + 0.2, 0.1, altarD + 0.2, mat(THEME.altarTrim, { metalness: 0.7, roughness: 0.35 }), hx, F + altarH, altarZ));
  ctx.collisions.addBoxCentered(hx, altarZ, altarW + 0.2, altarD + 0.2);

  // Offering water bowls: seven in a row before each statue.
  const bowlMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.055, 0.07, 14).translate(0, 0.035, 0), mat(0xc9a24a, { metalness: 0.8, roughness: 0.3 }), n * 7);
  const waterMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.066, 14).rotateX(-Math.PI / 2), mat(0x9fd3e8, { roughness: 0.1 }), n * 7);
  const bm = new THREE.Matrix4();

  def.deities.forEach((id, i) => {
    const sx = hx - altarW / 2 + (i + 0.5) * (altarW / n);
    g.add(buildStatueSlot(id, sx, F + altarH + 0.1, altarZ - 0.2, models[id]));
    for (let k = 0; k < 7; k++) {
      const bx = sx + (k - 3) * 0.27, by = F + altarH + 0.1, bz = altarZ + 0.95;
      bowlMesh.setMatrixAt(i * 7 + k, bm.makeTranslation(bx, by, bz));
      waterMesh.setMatrixAt(i * 7 + k, bm.makeTranslation(bx, by + 0.06, bz));
    }
    // Hanging canopy (華蓋) above the statue.
    if (!isShrine) {
      const c = buildCanopy();
      c.position.set(sx, F + H - 1.1, altarZ - 0.2);
      g.add(c);
    }
    // Name plate on the altar front
    const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const drawPlate = () => {
      plateMat.map?.dispose();
      plateMat.map = textTexture(inscription(t(DEITIES[id].nameKey as I18nKey)), { bg: '#5a1a12', color: '#e8c76a', w: 512, h: 128 });
      plateMat.needsUpdate = true;
    };
    drawPlate();
    onLocaleChange(drawPlate);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), plateMat);
    plate.position.set(sx, F + altarH * 0.55, altarZ + altarD / 2 + 0.01);
    g.add(plate);
  });

  g.add(bowlMesh, waterMesh);

  // Marīcī's boar sleeps on the floor beside her altar (east side), head toward the visitors.
  if (def.deities.includes('marici')) buildBoar(ctx, g, `${def.id}-boar`, hx + altarW / 2 + 1.3, F + 0.04, altarZ + 0.15, -0.3);

  // ---- Offering table ----
  const tableZ = altarZ + altarD / 2 + (isShrine ? 0.9 : 1.4);
  const tableLen = isShrine ? 2.2 : n > 1 ? Math.min(altarW - 1, 19) : 5;
  const table = buildOfferingTable(ctx, def.id, hx, F, tableZ, tableLen, n);
  g.add(table);

  // ---- Interior light ----
  const lamp = new THREE.PointLight(0xffc887, isShrine ? 6 : n > 1 ? 30 : 18, isShrine ? 10 : n > 1 ? 40 : 26, 1.2);
  lamp.position.set(hx, F + (isShrine ? 2.6 : 3.6), tableZ + 1.5);
  g.add(lamp);
  const lampBase = lamp.intensity;
  nightGlow.track((night) => (lamp.intensity = lampBase * (1 + 0.9 * night))); // lamplight carries further after dark

  // ---- Kneeling cushions, then the furnishings around them ----
  const thangkaZs = Array.from({ length: def.thangkas }, (_, i) => back + 4 + (i * (depth - 8)) / Math.max(1, def.thangkas - 1));
  if (def.seats > 0) {
    const block = buildCushions(ctx, g, def, hx, F, tableZ + 2.6, front - T / 2);
    if (!isShrine) {
      furnishHall(ctx, g, { def, hx, hz, hw, F, H, front, back, frontInner: front - T / 2, altarZ, altarW, tableZ, tableLen, thangkaZs }, block);
    }
  }

  // ---- Thangkas on the side walls (and back wall when there's no back door) ----
  if (!isShrine && def.thangkas > 0) {
    const pool = thangkas.filter((e) => !e.hall || e.hall === def.id);
    let k = 0;
    const next = () => (pool.length ? pool[k++ % pool.length] : null);
    const ty = F + 4.0;
    for (const tz of thangkaZs) {
      const west = buildThangka(next());
      west.position.set(hx - hw + T / 2 + 0.04, ty, tz);
      west.rotation.y = Math.PI / 2;
      const east = buildThangka(next());
      east.position.set(hx + hw - T / 2 - 0.04, ty, tz);
      east.rotation.y = -Math.PI / 2;
      g.add(west, east);
    }
    if (!def.backDoor) {
      for (const s of [-1, 1]) {
        const bx = hx + s * (altarW / 2 + 2.2);
        if (Math.abs(bx - hx) > hw - 1.2) continue;
        const th = buildThangka(next());
        th.position.set(bx, ty + 0.3, back + T / 2 + 0.04);
        g.add(th);
      }
    }
  }
  return g;
}

const CUSHION_R = 0.5;
/** Plump round kneeling cushion (蒲團), base at y = 0. */
const CUSHION_PROFILE = [[0, 0], [0.44, 0], [0.49, 0.04], [0.5, 0.1], [0.485, 0.16], [0.44, 0.205], [0.3, 0.228], [0, 0.235]];

/**
 * Kneeling cushions in a grid filling the floor in front of the offering table, split by a centre
 * aisle (and, in the wide Center Hall, a side aisle on each half). Returns the grid's footprint.
 */
function buildCushions(ctx: WorldContext, g: THREE.Group, def: HallDef, hx: number, F: number, startZ: number, frontInner: number): CushionBlock {
  const wide = def.width > 40;
  const cols = wide ? 6 : 4; // per side of the centre aisle
  const rows = Math.ceil(def.seats / (cols * 2));
  const sx = wide ? 2.2 : 2.0;
  const aisle = wide ? 2.0 : 1.6; // half-width of the centre aisle
  const sideAisle = wide ? 1.6 : 0; // extra gap after the third column
  const sz = clamp((frontInner - 4.5 - startZ) / Math.max(1, rows - 1), 2.0, 2.5);
  const xs = Array.from({ length: cols }, (_, c) => aisle + 1.0 + c * sx + (c >= 3 ? sideAisle : 0));

  const body = new THREE.InstancedMesh(
    new THREE.LatheGeometry(CUSHION_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 28),
    mat(THEME.cushion, { roughness: 0.95 }),
    def.seats,
  );
  const top = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.018, 6, 28).rotateX(Math.PI / 2), mat(THEME.cushionTop, { roughness: 0.7 }), def.seats);
  const m = new THREE.Matrix4();
  const y = F + 0.056; // on the rug
  let i = 0;
  for (let r = 0; r < rows && i < def.seats; r++)
    for (let side = -1; side <= 1 && i < def.seats; side += 2)
      for (let c = 0; c < cols && i < def.seats; c++, i++) {
        const x = hx + side * xs[c], z = startZ + r * sz;
        body.setMatrixAt(i, m.makeTranslation(x, y, z));
        top.setMatrixAt(i, m.makeTranslation(x, y + 0.222, z));
        const id = `${def.id}-c${i}`;
        ctx.seats.set(id, { id, kind: 'cushion', hallId: def.id, x, y: y + 0.17, z, yaw: 0, exit: [0, 0.95], occupiedBy: null });
      }
  body.receiveShadow = top.receiveShadow = true;
  g.add(body, top);
  return { aisle, outer: xs[cols - 1] + CUSHION_R, z0: startZ, z1: startZ + (rows - 1) * sz };
}

/** Red silk lantern hanging from a cord; origin at the top of the cord (pivot for swaying). */
export function buildRedLantern(cord = 0.55) {
  const g = new THREE.Group();
  const gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });
  g.add(cylinder(0.012, 0.012, cord, mat(0x2a1a10), 0, -cord, 0, 5));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12).scale(1, 1.12, 1), nightGlow.lanternBody);
  body.position.y = -cord - 0.38;
  g.add(body);
  const halo = new THREE.Sprite(nightGlow.lanternHalo); // glows after dark
  halo.scale.setScalar(1.9);
  halo.position.y = -cord - 0.38;
  g.add(halo);
  g.add(cylinder(0.15, 0.15, 0.07, gold, 0, -cord - 0.05, 0, 14));
  g.add(cylinder(0.15, 0.15, 0.07, gold, 0, -cord - 0.78, 0, 14));
  g.add(cylinder(0.025, 0.05, 0.32, mat(0xb81d18, { roughness: 0.9 }), 0, -cord - 1.12, 0, 8));
  return g;
}

/** Bronze wind bell (風鈴) with a clapper and wind-catcher plate; origin at the hook. */
function buildWindBell() {
  const g = new THREE.Group();
  const bronze = mat(0x5f7a5a, { metalness: 0.6, roughness: 0.45 });
  g.add(cylinder(0.008, 0.008, 0.22, mat(0x2a1a10), 0, -0.22, 0, 4));
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry([[0.001, 0], [0.05, -0.01], [0.075, -0.06], [0.1, -0.16], [0.12, -0.22]].map(([r, y]) => new THREE.Vector2(r, y)), 16),
    bronze,
  );
  (bell.material as THREE.Material).side = THREE.DoubleSide;
  bell.position.y = -0.22;
  g.add(bell);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.008), bronze);
  plate.position.y = -0.58;
  g.add(plate);
  g.add(cylinder(0.005, 0.005, 0.2, mat(0x2a1a10), 0, -0.5, 0, 4));
  return g;
}

/** Hanging canopy (華蓋): gilded top, red skirt with fringe, on a rod from the ceiling. */
function buildCanopy() {
  const g = new THREE.Group();
  const gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 });
  g.add(cylinder(0.02, 0.02, 1.1, gold, 0, 0.3, 0, 6)); // rod to the ceiling
  g.add(cylinder(0.25, 1.1, 0.3, gold, 0, 0.05, 0, 24)); // domed top
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.42, 32, 1, true), mat(0xa01c18, { roughness: 0.7, side: THREE.DoubleSide }));
  skirt.position.y = -0.16;
  g.add(skirt);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.03, 6, 40).rotateX(Math.PI / 2), gold);
  trim.position.y = -0.37;
  g.add(trim);
  const tassels: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    tassels.push(new THREE.BoxGeometry(0.035, 0.22, 0.012).translate(Math.cos(a) * 1.12, -0.48, Math.sin(a) * 1.12).toNonIndexed());
  }
  g.add(new THREE.Mesh(mergeGeometries(tassels), gold));
  return g;
}
