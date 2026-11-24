import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEITIES } from '../config/deities';
import { hallYaw, PLATFORM_H, type HallDef } from '../config/layout';
import { THEME } from '../config/theme';
import type { Instrument, OfferingTable, Seat, WorldContext } from '../core/context';
import { ceilingTexture, textTexture, verticalTextTexture } from '../core/textures';
import type { ThangkaEntry } from '../content/manifest';
import { inscription, onLocaleChange, t, type I18nKey } from '../i18n';
import { clamp } from '../core/math';
import { furnishHall, type CushionBlock } from './hallFurnishings';
import { box, cylinder, mat } from './materials';
import { bellWindow, cutHole, irimoyaRoof, roofTexture } from './japaneseRoof';
import { buildOfferingTable } from './offeringTable';
import { buildStatueSlot } from './statue';
import { nightGlow } from '../world/nightGlow';
import { buildThangka } from './thangka';
import { addLampAt } from '../world/lightPool';

const T = 0.4; // wall thickness
const PORCH = 1.6; // platform margin around the walls
const DOOR_H = 3.9;
/** 禅宗様 colours: natural and dark wood, a dark grey tile roof. */
const ZEN_WOOD = 0x5a3b26, ZEN_WOOD_DARK = 0x3f2a1c, ZEN_ROOF = 0x5a5752;

/**
 * Build a hall. Halls facing east or west are built facing south around the origin inside a turned
 * group, and everything they register with the world (collisions, floors, steps, seats, offering
 * tables, instruments) is turned into place on the way through.
 */
export function buildHall(ctx: WorldContext, def: HallDef, models: Record<string, string>, thangkas: ThangkaEntry[]) {
  const yaw = hallYaw(def);
  if (!yaw) return buildHallSouth(ctx, def, models, thangkas);
  const root = new THREE.Group();
  root.name = `hall-${def.id}`;
  root.position.set(def.x, 0, def.z);
  root.rotation.y = yaw;
  ctx.scene.add(root);
  return buildHallSouth(turnedContext(ctx, def.x, def.z, yaw, root), { ...def, x: 0, z: 0 }, models, thangkas);
}

/** A WorldContext whose registrations are turned by `yaw` about (ox, oz); meshes go into `root`. */
function turnedContext(ctx: WorldContext, ox: number, oz: number, yaw: number, root: THREE.Group): WorldContext {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const X = (x: number, z: number) => ox + x * c + z * s, Z = (x: number, z: number) => oz - x * s + z * c;
  const aabb = (x0: number, x1: number, z0: number, z1: number) => {
    const xs = [X(x0, z0), X(x1, z0), X(x0, z1), X(x1, z1)], zs = [Z(x0, z0), Z(x1, z0), Z(x0, z1), Z(x1, z1)];
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  };
  const vec = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
  const collisions = {
    addBox: (x0: number, x1: number, z0: number, z1: number) => { const b = aabb(x0, x1, z0, z1); ctx.collisions.addBox(b.minX, b.maxX, b.minZ, b.maxZ); },
    addBoxCentered: (x: number, z: number, w: number, d: number) => ctx.collisions.addBoxCentered(X(x, z), Z(x, z), Math.abs(c) * w + Math.abs(s) * d, Math.abs(s) * w + Math.abs(c) * d),
    addCircle: (x: number, z: number, r: number) => ctx.collisions.addCircle(X(x, z), Z(x, z), r),
  };
  const ground = {
    addPad: (x0: number, x1: number, z0: number, z1: number, h: number) => { const b = aabb(x0, x1, z0, z1); ctx.ground.addPad(b.minX, b.maxX, b.minZ, b.maxZ, h); },
    // a north–south ramp turned a quarter becomes an east–west one
    addRamp: (x0: number, x1: number, z0: number, z1: number, h0: number, h1: number) => {
      const b = aabb(x0, x1, z0, z1);
      ctx.ground.addRampX(b.minZ, b.maxZ, X((x0 + x1) / 2, z0), X((x0 + x1) / 2, z1), h0, h1);
    },
    heightAt: (x: number, z: number) => ctx.ground.heightAt(X(x, z), Z(x, z)),
  };
  const seats = {
    set: (id: string, st: Seat) => ctx.seats.set(id, { ...st, x: X(st.x, st.z), z: Z(st.x, st.z), yaw: st.yaw + yaw, exit: vec(...st.exit) }),
  };
  const offeringTables = {
    push: (t: OfferingTable) =>
      ctx.offeringTables.push({
        ...t, x: X(t.x, t.z), z: Z(t.x, t.z), facing: yaw,
        slots: t.slots.map((p) => ({ ...p, x: X(p.x, p.z), z: Z(p.x, p.z) })),
        bowl: t.bowl && { ...t.bowl, x: X(t.bowl.x, t.bowl.z), z: Z(t.bowl.x, t.bowl.z) },
        stand: t.stand && { x: X(t.stand.x, t.stand.z), z: Z(t.stand.x, t.stand.z) },
      }),
  };
  const instruments = { push: (i: Instrument) => ctx.instruments.push({ ...i, x: X(i.x, i.z), z: Z(i.x, i.z) }) };
  return { ...ctx, scene: root as unknown as THREE.Scene, collisions, ground, seats, offeringTables, instruments } as unknown as WorldContext;
}

function buildHallSouth(ctx: WorldContext, def: HallDef, models: Record<string, string>, thangkas: ThangkaEntry[]) {
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
  const baseMat = mat(ZEN_WOOD_DARK, { roughness: 0.75 }); // 禅宗様: dark wood skirting, not a red band
  const wallX = (x0: number, x1: number, z: number) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    g.add(blocker(box(w, H, T, wallMat, cx, F, z)));
    g.add(box(w + 0.06, 1.0, T + 0.06, baseMat, cx, F, z)); // a little past the wall's ends: no flush faces at door jambs
    ctx.collisions.addBox(x0, x1, z - T / 2, z + T / 2);
  };
  const wallZ = (z0: number, z1: number, x: number) => {
    const d = z1 - z0, cz = (z0 + z1) / 2;
    g.add(blocker(box(T, H, d, wallMat, x, F, cz)));
    g.add(box(T + 0.06, 1.0, d + 0.06, baseMat, x, F, cz));
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
    // Painted coffered ceiling. Under a two-tier roof the middle opens up into a raised bay (藻井),
    // so the inside gains some of the height the roof shows outside.
    const ceilPlane = (w: number, d: number, cx: number, cz: number, y: number) => {
      const tex = ceilingTexture().clone();
      tex.repeat.set(w / 2.4, d / 2.4);
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
      m.position.set(cx, y, cz);
      g.add(blocker(m));
    };
    if (def.roofTiers === 2) {
      // keep the bay under the lower roof and below the clerestory
      const rw = width * 0.5, rd = depth * 0.4, RC = Math.max(1.2, Math.min(2.6, (depth + 4.8) * 0.38 * 0.3 - 0.9)), y = F + H - 0.02;
      ceilPlane(width, (depth - rd) / 2, hx, hz + (rd + depth) / 4, y);
      ceilPlane(width, (depth - rd) / 2, hx, hz - (rd + depth) / 4, y);
      ceilPlane((width - rw) / 2, rd, hx + (rw + width) / 4, hz, y);
      ceilPlane((width - rw) / 2, rd, hx - (rw + width) / 4, hz, y);
      ceilPlane(rw, rd, hx, hz, y + RC);
      const side = mat(THEME.beam, { roughness: 0.6, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        g.add(blocker(box(rw, RC, 0.08, side, hx, y, hz + s * rd / 2, false)));
        g.add(blocker(box(0.08, RC, rd, side, hx + s * rw / 2, y, hz, false)));
        g.add(box(rw + 0.2, 0.16, 0.16, mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 }), hx, y - 0.08, hz + s * rd / 2, false));
        g.add(box(0.16, 0.16, rd + 0.2, mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 }), hx + s * rw / 2, y - 0.08, hz, false));
      }
    } else ceilPlane(width, depth, hx, hz, F + H - 0.02);
  }

  // Dark wooden beams under the eaves (禅宗様)
  const beamMat = mat(ZEN_WOOD_DARK, { roughness: 0.6 });
  const bandY = F + H - 0.7;
  g.add(box(width + 0.6, 0.7, 0.3, beamMat, hx, bandY, front + 0.1));
  g.add(box(width + 0.6, 0.7, 0.3, beamMat, hx, bandY, back - 0.1));
  g.add(box(0.3, 0.7, depth + 0.6, beamMat, hx - hw - 0.1, bandY, hz));
  g.add(box(0.3, 0.7, depth + 0.6, beamMat, hx + hw + 0.1, bandY, hz));
  g.add(box(width + 0.7, 0.18, 0.34, mat(ZEN_WOOD), hx, bandY - 0.18, front + 0.1));

  // Porch columns (front), or corner columns for the open shrine
  const colMat = mat(ZEN_WOOD, { roughness: 0.6 });
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

  // ---- 禅宗様 walls: dark posts and a tie beam framing the plaster, bell-shaped windows (花頭窓) on the sides ----
  if (!isShrine) {
    const post = mat(ZEN_WOOD, { roughness: 0.6 }), out = T / 2 + 0.03;
    const doors: [number, number][] = [[hx - fd / 2 - 0.2, hx + fd / 2 + 0.2]];
    const clear = (x: number, gaps: [number, number][]) => !gaps.some(([a, b]) => x > a && x < b);
    const nX = Math.max(3, Math.round(width / 3.2)), nZ = Math.max(3, Math.round(depth / 3.2));
    for (let i = 0; i <= nX; i++) {
      const x = hx - hw + (i * width) / nX;
      if (clear(x, doors)) g.add(box(0.26, H, 0.06, post, x, F, front + out));
      if (!def.backDoor || clear(x, [[hx - 2.2, hx + 2.2]])) g.add(box(0.26, H, 0.06, post, x, F, back - out));
    }
    for (let i = 0; i <= nZ; i++) for (const s of [-1, 1]) g.add(box(0.06, H, 0.26, post, hx + s * (hw + out), F, back + (i * depth) / nZ));
    // the tie beam (長押) across each wall, broken at the doors
    for (const [x0, x1] of [[hx - hw, hx - fd / 2], [hx + fd / 2, hx + hw]]) g.add(box(x1 - x0, 0.2, 0.07, post, (x0 + x1) / 2, F + 2.3, front + out + 0.01));
    for (const s of [-1, 1]) g.add(box(0.07, 0.2, depth, post, hx + s * (hw + out + 0.01), F + 2.3, hz));
    const winMat = mat(0x2a1d14, { roughness: 0.8, side: THREE.DoubleSide });
    for (const s of [-1, 1])
      for (const wz of [hz - depth / 4, hz + depth / 4]) {
        const win = new THREE.Mesh(bellWindow(1.3, 1.7), winMat);
        win.position.set(hx + s * (hw + out + 0.02), F + 1.25, wz);
        win.rotation.y = s * Math.PI / 2;
        g.add(win);
      }
  }

  // ---- Roof ----
  const eave = isShrine ? 1.6 : 2.4;
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture('tile', ZEN_ROOF), roughness: 0.75, side: THREE.DoubleSide });
  const gableMat = mat(THEME.wall, { roughness: 0.9, side: THREE.DoubleSide }), edgeMat = mat(ZEN_WOOD_DARK, { roughness: 0.7, side: THREE.DoubleSide });
  const ridgeMat = mat(0x2b2b2e, { roughness: 0.7 });
  /** A curved 入母屋 roof (gable < 1) or a hipped skirt (gable ≈ 1); returns how high its corners turn up. */
  const addRoof = (W: number, D: number, RH: number, y: number, o: { gable: number; curve: number; upturn: number }, ring = false) => {
    const upturn = Math.min(o.upturn, 1.5 / (0.9 * RH)); // corners rise at most ~1.5 m
    const r = irimoyaRoof(W, D, RH, { ...o, upturn });
    if (ring) r.roof = cutHole(r.roof, hw + T / 2, hd + T / 2); // only outside the walls (inside is the room)
    r.roof.computeVertexNormals();
    r.gable.computeVertexNormals();
    const roof = new THREE.Mesh(r.roof, roofMat), gable = new THREE.Mesh(r.gable, gableMat), edge = new THREE.Mesh(r.edge, edgeMat);
    for (const m of [roof, gable, edge]) m.position.set(hx, y, hz);
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof, gable, edge);
    if (o.gable < 0.99) {
      const xr = W / 2 - (o.gable * D) / 2; // the ridge runs between the gables
      g.add(box(xr * 2 + 0.4, 0.4, 0.42, ridgeMat, hx, y + r.ridge - 0.12, hz));
      for (const s of [-1, 1]) g.add(box(0.42, 0.85, 0.5, ridgeMat, hx + s * (xr + 0.1), y + r.ridge - 0.12, hz)); // 鴟尾-like ends
    }
    return upturn * RH * 0.9;
  };
  const W = width + eave * 2, D = depth + eave * 2;
  let lift = 0;
  if (def.roofTiers === 2) {
    const RH = D * 0.38;
    lift = addRoof(W, D, RH * 0.5, F + H, { gable: 0.999, curve: 1.25, upturn: 0.35 });
    const cy = F + H + RH * 0.3;
    // the upper storey's walls run right down to the wall-tops, so no gap opens under the curved lower roof
    // (walls, not a solid block: the raised ceiling bay inside stays open)
    const uw = width * 0.74, ud = depth * 0.62, uy = F + H, uh = cy + 1.8 - uy;
    for (const s of [-1, 1]) {
      g.add(box(uw, uh, 0.3, wallMat, hx, uy, hz + s * (ud / 2 - 0.15)));
      g.add(box(0.3, uh, ud, wallMat, hx + s * (uw / 2 - 0.15), uy, hz));
    }
    g.add(box(width * 0.74 + 0.3, 0.6, depth * 0.62 + 0.3, beamMat, hx, cy + 1.2, hz));
    addRoof(width * 0.74 + eave * 2, depth * 0.62 + eave * 2, RH * 0.7, cy + 1.8, { gable: 0.55, curve: 1.7, upturn: 0.5 });
  } else {
    if (!isShrine) addRoof(width + 2.6, depth + 2.6, 1.3, F + DOOR_H + 0.25, { gable: 0.999, curve: 1.2, upturn: 0.35 }, true); // 裳階, above the door
    lift = addRoof(W, D, D * 0.36, F + H, { gable: 0.55, curve: 1.7, upturn: 0.5 });
  }

  // ---- Red lanterns under the front eave, wind bells at the eave corners (gently swaying) ----
  const swaying: { obj: THREE.Object3D; amp: number; speed: number; phase: number }[] = [];
  const lanternXs = isShrine ? [-2.4, 2.4] : width > 40 ? [-20, -12, -4, 4, 12, 20] : [-8.6, -4.2, 4.2, 8.6];
  for (const lx of lanternXs) {
    const l = buildRedLantern();
    l.userData.dynamic = l.userData.rigid = true; // sways as one piece
    l.position.set(hx + lx, F + H - 0.1, isShrine ? front + 0.9 : front + 1.85);
    g.add(l);
    addLampAt(l, { color: 0xff7a40, intensity: 20, range: 11, decay: 1.5 }, new THREE.Vector3(0, -0.93, 0));
    swaying.push({ obj: l, amp: 0.04, speed: 1.1, phase: lx });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b = buildWindBell();
    b.userData.dynamic = b.userData.rigid = true;
    b.position.set(hx + sx * (hw + eave - 0.3), F + H + lift * 0.8 - 0.05, hz + sz * (hd + eave - 0.3)); // under the up-turned corner
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
  // A wide altar (two or three deities) would stand in front of the lantern grids on the back wall (see
  // hallLanterns: each grid's inner edge is (2 + hw) / 2 − 3.2 from the middle), so it keeps further off.
  const wideAltar = altarW / 2 > (2 + hw) / 2 - 3.2;
  const walkway = def.backDoor ? 3.2 : wideAltar ? 2.6 : 0.8;
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

  // ---- Offering table ----
  const tableZ = altarZ + altarD / 2 + (isShrine ? 0.9 : 1.4);
  const tableLen = isShrine ? 2.2 : n > 1 ? Math.min(altarW - 1, 19) : 5;
  const table = buildOfferingTable(ctx, def.id, hx, F, tableZ, tableLen, n);
  g.add(table);

  // ---- Interior light ----
  // One of the pooled real lights (see lightPool): lit day and night, carrying further after dark.
  const lamp = new THREE.Object3D();
  lamp.position.set(hx, F + (isShrine ? 2.6 : 3.6), tableZ + 1.5);
  g.add(lamp);
  addLampAt(lamp, { color: 0xffc887, intensity: isShrine ? 6 : n > 1 ? 30 : 18, range: isShrine ? 10 : n > 1 ? 40 : 26, decay: 1.2, indoor: true });

  // ---- Kneeling cushions, then the furnishings around them ----
  const thangkaZs = Array.from({ length: def.thangkas }, (_, i) => back + 4 + (i * (depth - 8)) / Math.max(1, def.thangkas - 1));
  if (def.seats > 0) {
    const block = buildCushions(ctx, g, def, hx, F, tableZ + (wideAltar || def.width > 24 ? 2.6 : 3.6), front - T / 2); // one-deity gate halls: a metre more before the altar
    if (!isShrine) {
      furnishHall(ctx, g, { def, hx, hz, hw, F, H, front, back, frontInner: front - T / 2, altarZ, altarW, tableZ, tableLen, thangkaZs }, block);
    }
  }

  // ---- Thangkas on the side walls ----
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
    // (the back wall is the lantern wall now: no thangkas there)
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
  const sxGuess = wide ? 2.2 : 2.0, aisleGuess = wide ? 2.0 : 1.6;
  // per side of the centre aisle: as many as fit with the outer cushion a metre clear of the wall
  const cols = wide ? 6 : Math.max(2, Math.min(4, Math.floor((def.width / 2 - 1.1 - aisleGuess - 1.0) / sxGuess) + 1));
  const rows = Math.ceil(def.seats / (cols * 2));
  const seats = rows * cols * 2; // `def.seats` rounded up to whole rows, so no row is left half-filled
  const sx = wide ? 2.2 : 2.0;
  const aisle = wide ? 2.0 : 1.6; // half-width of the centre aisle
  const sideAisle = wide ? 1.6 : 0; // extra gap after the third column
  const sz = clamp((frontInner - 4.5 - startZ) / Math.max(1, rows - 1), 2.0, 2.5);
  const xs = Array.from({ length: cols }, (_, c) => aisle + 1.0 + c * sx + (c >= 3 ? sideAisle : 0));

  const body = new THREE.InstancedMesh(
    new THREE.LatheGeometry(CUSHION_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 28),
    mat(THEME.cushion, { roughness: 0.95 }),
    seats,
  );
  const top = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.018, 6, 28).rotateX(Math.PI / 2), mat(THEME.cushionTop, { roughness: 0.7 }), seats);
  const m = new THREE.Matrix4();
  const y = F + 0.056; // on the rug
  let i = 0;
  for (let r = 0; r < rows; r++)
    for (let side = -1; side <= 1; side += 2)
      for (let c = 0; c < cols; c++, i++) {
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
