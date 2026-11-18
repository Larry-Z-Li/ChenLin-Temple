import * as THREE from 'three';
import { DEITIES } from '../config/deities';
import { PLATFORM_H, type HallDef } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { textTexture } from '../core/textures';
import type { ThangkaEntry } from '../content/manifest';
import { inscription, onLocaleChange, t, type I18nKey } from '../i18n';
import { box, cylinder, hipRoofGeometry, mat } from './materials';
import { buildOfferingTable } from './offeringTable';
import { buildStatueSlot } from './statue';
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

  if (!isShrine) {
    const fd = width > 40 ? 7 : 5;
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
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2), mat(THEME.ceiling, { side: THREE.DoubleSide }));
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

  def.deities.forEach((id, i) => {
    const sx = hx - altarW / 2 + (i + 0.5) * (altarW / n);
    g.add(buildStatueSlot(id, sx, F + altarH + 0.1, altarZ - 0.2, models[id]));
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

  // ---- Offering table ----
  const tableZ = altarZ + altarD / 2 + (isShrine ? 0.9 : 1.4);
  const tableLen = isShrine ? 2.2 : n > 1 ? Math.min(altarW - 1, 19) : 5;
  const table = buildOfferingTable(ctx, def.id, hx, F, tableZ, tableLen, n);
  g.add(table);

  // ---- Interior light ----
  const lamp = new THREE.PointLight(0xffc887, isShrine ? 6 : n > 1 ? 30 : 18, isShrine ? 10 : n > 1 ? 40 : 26, 1.2);
  lamp.position.set(hx, F + (isShrine ? 2.6 : 3.6), tableZ + 1.5);
  g.add(lamp);

  // ---- Kneeling cushions ----
  if (def.seats > 0) buildCushions(ctx, g, def, hx, F, tableZ + 2.4);

  // ---- Thangkas on the side walls (and back wall when there's no back door) ----
  if (!isShrine && def.thangkas > 0) {
    const pool = thangkas.filter((e) => !e.hall || e.hall === def.id);
    let k = 0;
    const next = () => (pool.length ? pool[k++ % pool.length] : null);
    const ty = F + 4.0;
    for (let i = 0; i < def.thangkas; i++) {
      const tz = back + 4 + (i * (depth - 8)) / Math.max(1, def.thangkas - 1);
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

function buildCushions(ctx: WorldContext, g: THREE.Group, def: HallDef, hx: number, F: number, startZ: number) {
  const cols = def.width > 40 ? 5 : 4; // per side of the centre aisle
  const rows = Math.ceil(def.seats / (cols * 2));
  const sx = 1.3, sz = 1.45, aisle = 2.4;
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.41, 0.17, 20), mat(THEME.cushion, { roughness: 0.95 }), def.seats);
  const top = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.26, 0.012, 20), mat(THEME.cushionTop, { roughness: 0.8 }), def.seats);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < rows && i < def.seats; r++)
    for (let side = -1; side <= 1 && i < def.seats; side += 2)
      for (let c = 0; c < cols && i < def.seats; c++, i++) {
        const x = hx + side * (aisle / 2 + 0.65 + c * sx), z = startZ + r * sz, y = F + 0.04;
        body.setMatrixAt(i, m.makeTranslation(x, y + 0.085, z));
        top.setMatrixAt(i, m.makeTranslation(x, y + 0.176, z));
        const id = `${def.id}-c${i}`;
        ctx.seats.set(id, { id, kind: 'cushion', hallId: def.id, x, y: y + 0.12, z, yaw: 0, exit: [0, 0.7], occupiedBy: null });
      }
  body.receiveShadow = top.receiveShadow = true;
  body.castShadow = true;
  g.add(body, top);
}
