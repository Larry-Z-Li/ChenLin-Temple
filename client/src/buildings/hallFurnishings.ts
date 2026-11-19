import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HallDef } from '../config/layout';
import { THEME } from '../config/theme';
import type { Instrument, WorldContext } from '../core/context';
import { mulberry32 } from '../core/math';
import { canvasTexture, glowTexture } from '../core/textures';
import { haloPoints, nightGlow } from '../world/nightGlow';
import { box, cylinder, mat } from './materials';

/** Where things already stand in a hall, so the furnishings can fit around them. */
export interface HallFrame {
  def: HallDef;
  hx: number;
  hz: number;
  hw: number;
  F: number;
  H: number;
  front: number;
  back: number;
  /** Inner face of the front wall. */
  frontInner: number;
  altarZ: number;
  altarW: number;
  tableZ: number;
  tableLen: number;
  thangkaZs: number[];
}

/** Footprint of the cushion grid (x offsets are from the hall's centre line). */
export interface CushionBlock {
  aisle: number;
  outer: number;
  z0: number;
  z1: number;
}

const FLOOR_TOP = 0.04; // the floor slab's thickness

/**
 * Hall furnishings: rugs under the cushions and a runner up the aisle, hanging silk banners (幢幡),
 * standing lotus lamps, sutra shelves by the door, and the ritual instruments — bowl bell (磬) and
 * wooden fish (木魚) in every hall, plus a big drum and bell in the Center Hall.
 */
export function furnishHall(ctx: WorldContext, g: THREE.Group, f: HallFrame, block: CushionBlock) {
  const { def, hx, F, tableZ, tableLen } = f;
  const items = new THREE.Group();
  g.add(items);
  const big = def.width > 40;

  // ---- Rugs + aisle runner ----
  for (const side of [-1, 1]) {
    const x0 = block.aisle - 0.1, x1 = block.outer + 0.6;
    rug(items, hx + side * (x0 + x1) / 2, F, (block.z0 + block.z1) / 2, x1 - x0, block.z1 - block.z0 + 1.9);
  }
  const rz0 = tableZ + 0.6, rz1 = f.frontInner - 0.05;
  items.add(box(1.7, 0.012, rz1 - rz0, mat(0xa8842c, { roughness: 0.8 }), hx, F + FLOOR_TOP, (rz0 + rz1) / 2, false));
  items.add(box(1.4, 0.016, rz1 - rz0, mat(0x8e1f1a, { roughness: 0.95 }), hx, F + FLOOR_TOP, (rz0 + rz1) / 2, false));

  // ---- Hanging banners: a pair flanking the altar, more along the side aisles between the thangkas ----
  const bannerLen = Math.min(3.4, f.H * 0.43);
  const bannerGeo = bannerGeometry(bannerLen);
  const bannerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const banners: THREE.Mesh[] = [];
  const hang = (x: number, z: number) => {
    const b = new THREE.Mesh(bannerGeo, bannerMat);
    b.position.set(x, F + f.H - 0.02, z);
    items.add(b);
    banners.push(b);
    ctx.detailMeshes.push(b);
  };
  for (const s of [-1, 1]) {
    hang(hx + s * (f.altarW / 2 + 0.6), f.altarZ);
    for (let i = 0; i + 1 < f.thangkaZs.length; i++) hang(hx + s * (f.hw - 1.5), (f.thangkaZs[i] + f.thangkaZs[i + 1]) / 2);
  }

  // ---- Palace lanterns (宮燈) hanging over the cushions ----
  {
    const xs = big ? [(block.aisle + 1 + block.aisle + 1 + 2 * 2.2) / 2, (block.outer - 0.5 + block.outer - 0.5 - 2 * 2.2) / 2] : [(block.aisle + block.outer) / 2];
    const zs = [block.z0 + (block.z1 - block.z0) * 0.25, block.z0 + (block.z1 - block.z0) * 0.75];
    const spots = xs.flatMap((x) => zs.flatMap((z) => [[hx - x, z], [hx + x, z]]));
    const drop = Math.min(1.9, f.H - 4.4); // keep them well above head (and camera) height
    const frame = new THREE.InstancedMesh(palaceFrameGeometry(drop), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }), spots.length);
    const panels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.33, 0.33, 0.58, 6).translate(0, -drop - 0.33, 0), palacePaper(), spots.length);
    const m = new THREE.Matrix4(), haloPos: number[] = [], haloCol: number[] = [];
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, F + f.H - 0.02, z);
      frame.setMatrixAt(i, m);
      panels.setMatrixAt(i, m);
      haloPos.push(x, F + f.H - 0.02 - drop - 0.33, z);
      haloCol.push(1, 0.72, 0.42);
    });
    items.add(frame, panels, haloPoints(haloPos, haloCol, 2.6, 0.55, 0.22));
  }

  // ---- Standing lotus lamps at the ends of the offering table ----
  const flames: THREE.Sprite[] = [];
  for (const s of [-1, 1]) {
    const lx = hx + s * (tableLen / 2 + 0.75);
    items.add(lotusLamp(lx, F + FLOOR_TOP, tableZ, flames));
    ctx.collisions.addCircle(lx, tableZ, 0.3);
  }

  // ---- A low lamp table under each side-wall thangka ----
  for (const tz of f.thangkaZs)
    for (const s of [-1, 1]) {
      const tx = hx + s * (f.hw - 0.2 - 0.3);
      items.add(sideTable(tx, F + FLOOR_TOP, tz, flames));
      ctx.collisions.addBoxCentered(tx, tz, 0.6, 1.8);
    }

  // ---- Sutra shelves against the front wall, either side of the door ----
  const shelfXs = big ? [9, 17] : [Math.min(6.5, f.hw - 3)];
  for (const s of [-1, 1]) for (const sx of shelfXs) sutraShelf(ctx, items, hx + s * sx, F + FLOOR_TOP, f.frontInner - 0.3, `${def.id}${s}${sx}`);

  // ---- Instruments: bowl bell on the east (the altar's left), wooden fish on the west ----
  const ix = tableLen / 2 + 1.9, iz = tableZ + 0.2;
  const kicks: { obj: THREE.Object3D; kind: Instrument['kind']; t: number; glow?: THREE.Sprite }[] = [];
  const addInstrument = (kind: Instrument['kind'], obj: THREE.Object3D, x: number, z: number, glow?: THREE.Sprite) => {
    const k = { obj, kind, t: 99, glow };
    kicks.push(k);
    ctx.instruments.push({ id: `${def.id}-${kind}`, kind, x, z, onStrike: () => (k.t = 0) });
  };
  {
    const { group, bowl, glow } = bowlBell();
    group.position.set(hx + ix, F + FLOOR_TOP, iz);
    items.add(group);
    ctx.collisions.addBoxCentered(hx + ix, iz, 0.8, 0.8);
    addInstrument('bowl', bowl, hx + ix, iz, glow);
  }
  {
    const { group, fish } = woodenFish();
    group.position.set(hx - ix, F + FLOOR_TOP, iz);
    items.add(group);
    ctx.collisions.addBoxCentered(hx - ix, iz, 0.8, 0.8);
    addInstrument('woodfish', fish, hx - ix, iz);
  }
  if (big) {
    // Drum on the west, bell on the east, in the open floor beside the cushions.
    const dx = (block.outer + f.hw) / 2 + 0.6, dz = f.hz + 0.5;
    const { group: dg, barrel } = bigDrum();
    dg.position.set(hx - dx, F + FLOOR_TOP, dz);
    items.add(dg);
    ctx.collisions.addBoxCentered(hx - dx, dz, 1.3, 1.5);
    addInstrument('drum', barrel, hx - dx, dz);
    const { group: bg, bell } = hallBell();
    bg.position.set(hx + dx, F + FLOOR_TOP, dz);
    items.add(bg);
    ctx.collisions.addBoxCentered(hx + dx, dz, 1.3, 2.4);
    addInstrument('bell', bell, hx + dx, dz);
  }

  items.traverse((o) => (o.castShadow = false));

  ctx.updaters.push((dt, time) => {
    banners.forEach((b, i) => {
      b.rotation.z = Math.sin(time * 0.6 + i * 1.7) * 0.012;
      b.rotation.x = Math.sin(time * 0.45 + i * 2.3) * 0.01;
    });
    flames.forEach((fl, i) => {
      const k = (1 + 0.12 * Math.sin(time * 12 + i * 2.3) + 0.06 * Math.sin(time * 27 + i)) * fl.userData.size;
      fl.scale.set(0.11 * k, 0.2 * k, 1);
    });
    for (const k of kicks) {
      if (k.t > 6) continue;
      k.t += dt;
      const t = k.t;
      switch (k.kind) {
        case 'bowl':
          k.glow!.material.opacity = Math.max(0, 0.7 * Math.exp(-t * 1.2));
          k.glow!.scale.setScalar(0.9 + t * 0.4);
          break;
        case 'woodfish':
          k.obj.scale.setScalar(1 + 0.05 * Math.exp(-t * 18) * Math.cos(t * 50));
          break;
        case 'drum':
          k.obj.scale.set(1, 1 + 0.025 * Math.exp(-t * 9) * Math.cos(t * 40), 1 + 0.025 * Math.exp(-t * 9) * Math.cos(t * 40));
          break;
        case 'bell':
          k.obj.rotation.z = 0.06 * Math.exp(-t * 0.7) * Math.sin(t * 3.2);
          break;
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------

let paper: THREE.MeshStandardMaterial | null = null;
/** Painted silk panels of the palace lanterns: lit day and night, brighter after dark. */
function palacePaper() {
  if (!paper) {
    const p = (paper = new THREE.MeshStandardMaterial({ color: 0xffe0a8, roughness: 0.7, emissive: 0xffa040, emissiveIntensity: 0.55 }));
    nightGlow.track((n) => (p.emissiveIntensity = 0.55 + 1.3 * n));
  }
  return paper;
}

/** Hexagonal palace lantern (宮燈) frame: rod, carved caps, corner posts and red tassels. Origin at the ceiling. */
function palaceFrameGeometry(drop: number) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: number) => parts.push(tint(g.index ? g.toNonIndexed() : g, hex));
  const RED = 0x8e1f16, GOLD = 0xd4af37, DARK = 0x3a1a10;
  add(new THREE.CylinderGeometry(0.015, 0.015, drop + 3, 5).translate(0, (3 - drop) / 2, 0), DARK); // runs up past the ceiling (reaches the raised bay)
  const top = -drop;
  add(new THREE.CylinderGeometry(0.12, 0.42, 0.12, 6).translate(0, top - 0.0, 0), RED);
  add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 6).translate(0, top - 0.07, 0), GOLD);
  add(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 6).translate(0, top - 0.64, 0), GOLD);
  add(new THREE.CylinderGeometry(0.4, 0.14, 0.12, 6).translate(0, top - 0.72, 0), RED);
  add(new THREE.SphereGeometry(0.05, 8, 6).translate(0, top - 0.8, 0), GOLD);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 2; // CylinderGeometry corners
    const cx = Math.sin(a) * 0.34, cz = Math.cos(a) * 0.34;
    add(new THREE.BoxGeometry(0.035, 0.58, 0.035).translate(cx, top - 0.35, cz), RED);
    const tx = Math.sin(a) * 0.43, tz = Math.cos(a) * 0.43;
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 3).translate(tx, top - 0.1, tz), GOLD);
    add(new THREE.CylinderGeometry(0.025, 0.012, 0.38, 6).translate(tx, top - 0.34, tz), 0xc0221a);
  }
  add(new THREE.CylinderGeometry(0.035, 0.015, 0.5, 6).translate(0, top - 1.07, 0), 0xc0221a);
  return mergeGeometries(parts);
}

let rugTex: THREE.Texture | null = null;
/** Deep red field with a faint diamond lattice and gold rosettes. */
function rugTexture() {
  return (rugTex ??= (() => {
    const tex = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#741c17';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(35,6,4,0.45)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 64); g.lineTo(64, 0); g.lineTo(128, 64); g.lineTo(64, 128); g.closePath();
      g.stroke();
      g.fillStyle = '#b8902e';
      for (const [x, y, r] of [[64, 64, 7], [0, 0, 4], [128, 0, 4], [0, 128, 4], [128, 128, 4]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#8e2a20';
      g.beginPath();
      g.arc(64, 64, 3, 0, Math.PI * 2);
      g.fill();
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  })());
}

function rug(parent: THREE.Group, x: number, F: number, z: number, w: number, d: number) {
  parent.add(box(w, 0.012, d, mat(0xa8842c, { roughness: 0.85 }), x, F + FLOOR_TOP, z, false));
  const tex = rugTexture().clone();
  tex.repeat.set((w - 0.3) / 1.1, (d - 0.3) / 1.1);
  tex.needsUpdate = true;
  parent.add(box(w - 0.3, 0.016, d - 0.3, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), x, F + FLOOR_TOP, z, false));
}

/** Paint every vertex of a geometry one colour (for merged multi-colour meshes). */
function tint(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Cylindrical silk banner (幢幡) hanging from the ceiling; origin at the ceiling. */
function bannerGeometry(len: number) {
  const parts: THREE.BufferGeometry[] = [];
  const ring = (rt: number, rb: number, h: number, yTop: number, hex: number, open = true) =>
    parts.push(tint(new THREE.CylinderGeometry(rt, rb, h, 20, 1, open).translate(0, yTop - h / 2, 0), hex));
  ring(0.018, 0.018, 0.35, 0, 0xd4af37, false); // rod
  ring(0.1, 0.34, 0.14, -0.35, 0xd4af37, false); // gilded cap
  ring(0.36, 0.36, 0.26, -0.49, 0xe0b030); // top valance
  ring(0.37, 0.37, 0.06, -0.75, 0x2b4c8c);
  const body = len - 0.81 - 0.36 - 0.45;
  ring(0.3, 0.3, body, -0.81, 0x8c1d1d); // main silk body
  ring(0.33, 0.33, 0.18, -0.81 - body * 0.45, 0x2f7a5b); // middle band
  ring(0.38, 0.36, 0.3, -0.81 - body, 0xe0b030); // lower valance
  ring(0.385, 0.385, 0.06, -1.11 - body, 0x2b4c8c);
  const ribbon = [0x2b5fa8, 0xf2efe6, 0xb8261e, 0x2f8a4f, 0xe8c030];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const strip = new THREE.BoxGeometry(0.075, 0.45, 0.008).translate(0, -0.225, 0).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.36, -1.17 - body, Math.sin(a) * 0.36);
    parts.push(tint(strip, ribbon[i % ribbon.length]));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/** Bronze lotus lamp on a tall stand, lit. */
function lotusLamp(x: number, y: number, z: number, flames: THREE.Sprite[]) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const bronze = mat(THEME.bronze, { metalness: 0.8, roughness: 0.35 });
  g.add(cylinder(0.2, 0.28, 0.1, bronze, 0, 0, 0, 16));
  g.add(cylinder(0.07, 0.12, 0.12, bronze, 0, 0.1, 0, 12));
  g.add(cylinder(0.03, 0.03, 1.15, bronze, 0, 0.2, 0, 8));
  g.add(cylinder(0.2, 0.06, 0.12, mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 }), 0, 1.33, 0, 16));
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    petals.push(new THREE.SphereGeometry(0.07, 8, 6).scale(0.8, 1.7, 0.45).rotateX(0.5).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.17, 1.47, Math.sin(a) * 0.17));
  }
  g.add(new THREE.Mesh(mergeGeometries(petals), mat(0xeab6aa, { roughness: 0.6 })));
  g.add(cylinder(0.045, 0.045, 0.14, mat(0xf4ead2, { roughness: 0.6 }), 0, 1.42, 0, 10));
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.y = 1.66;
  flame.scale.set(0.11, 0.2, 1);
  flame.userData.size = 1;
  g.add(flame);
  flames.push(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc06a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 1.62;
  halo.scale.setScalar(0.9);
  g.add(halo);
  return g;
}

/** Narrow lacquered table along a side wall with two butter lamps and a small incense bowl. */
function sideTable(x: number, y: number, z: number, flames: THREE.Sprite[]) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const H = 0.8;
  g.add(box(0.5, 0.06, 1.7, mat(THEME.table, { roughness: 0.55 }), 0, H - 0.06, 0));
  g.add(box(0.42, H - 0.06, 1.55, mat(0x4a2214, { roughness: 0.6 }), 0, 0, 0));
  g.add(box(0.52, 0.08, 1.72, mat(THEME.altarTrim, { metalness: 0.6, roughness: 0.4 }), 0, H - 0.16, 0));
  const gold = mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 });
  g.add(cylinder(0.1, 0.08, 0.08, mat(THEME.bronze, { metalness: 0.8, roughness: 0.35 }), 0, H, 0, 14));
  for (const lz of [-0.55, 0.55]) {
    g.add(cylinder(0.05, 0.06, 0.03, gold, 0, H, lz, 12)); // foot
    g.add(cylinder(0.015, 0.015, 0.07, gold, 0, H + 0.03, lz, 6)); // stem
    g.add(cylinder(0.065, 0.03, 0.06, gold, 0, H + 0.1, lz, 14)); // cup
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.position.set(0, H + 0.22, lz);
    flame.userData.size = 0.6;
    g.add(flame);
    flames.push(flame);
  }
  return g;
}

/** Red-lacquer shelf of wrapped scriptures (Tibetan-style loose-leaf volumes in cloth). */
function sutraShelf(ctx: WorldContext, parent: THREE.Group, x: number, y: number, z: number, seed: string) {
  const W = 3.2, Hh = 2.2, D = 0.55, cols = 3, levels = 4;
  const wood = mat(0x5a2214, { roughness: 0.55 });
  const trim = mat(THEME.altarTrim, { metalness: 0.6, roughness: 0.4 });
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(W, Hh, 0.05, wood, 0, 0, D / 2 - 0.025)); // back panel (against the wall)
  for (let c = 0; c <= cols; c++) g.add(box(0.06, Hh, D, wood, -W / 2 + 0.03 + (c * (W - 0.06)) / cols, 0, 0));
  for (let l = 0; l <= levels; l++) g.add(box(W, 0.05, D, wood, 0, 0.1 + (l * (Hh - 0.15)) / levels, 0));
  g.add(box(W + 0.1, 0.08, D + 0.06, trim, 0, Hh, 0));
  g.add(box(W, 0.1, D, wood, 0, 0, 0));

  const cloths = [0xd9a441, 0xc9701c, 0x9e2a22, 0x6b1f1f, 0xe0b030];
  const rng = mulberry32([...seed].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const cellW = (W - 0.06) / cols, cellH = (Hh - 0.15) / levels;
  const n = cols * levels * 2;
  const vols = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW - 0.2, 0.13, D - 0.16), mat(0xffffff, { roughness: 0.85 }), n);
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW - 0.16, 0.025, D - 0.13), mat(0x6b4426, { roughness: 0.6 }), n);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let i = 0;
  for (let c = 0; c < cols; c++)
    for (let l = 0; l < levels; l++)
      for (let k = 0; k < 2; k++, i++) {
        const vx = -W / 2 + 0.03 + cellW * (c + 0.5) + (rng() - 0.5) * 0.06;
        const vy = 0.125 + l * cellH + k * 0.16;
        vols.setMatrixAt(i, m.makeTranslation(vx, vy + 0.065, -0.03));
        vols.setColorAt(i, col.setHex(cloths[Math.floor(rng() * cloths.length)]));
        boards.setMatrixAt(i, m.makeTranslation(vx, vy + 0.14, -0.03));
      }
  g.add(vols, boards);
  // Faces north, into the hall: the back panel is on the +Z (south, wall) side already.
  parent.add(g);
  ctx.collisions.addBoxCentered(x, z, W + 0.1, D + 0.1);
}

/** Low red stand with a round silk cushion on top (for the bowl bell and wooden fish). */
function lowStand(g: THREE.Group) {
  g.add(box(0.72, 0.5, 0.72, mat(0x7a2418, { roughness: 0.5 }), 0, 0, 0));
  g.add(box(0.76, 0.05, 0.76, mat(THEME.altarTrim, { metalness: 0.6, roughness: 0.4 }), 0, 0.5, 0));
  const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 10, 24).rotateX(Math.PI / 2), mat(0xc9302a, { roughness: 0.9 }));
  cushion.position.y = 0.6;
  g.add(cushion);
  g.add(cylinder(0.2, 0.2, 0.06, mat(0xd9a441, { roughness: 0.9 }), 0, 0.55, 0, 20));
  return 0.62; // top of the cushion
}

function mallet(g: THREE.Group, x: number, y: number, z: number, head = 0xb8261e) {
  const stick = cylinder(0.015, 0.015, 0.34, mat(0x6b4426), 0, 0, 0, 6);
  stick.rotation.z = Math.PI / 2;
  stick.position.set(x, y + 0.02, z);
  g.add(stick);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(head, { roughness: 0.8 }));
  h.position.set(x + 0.19, y + 0.03, z);
  g.add(h);
}

/** Bowl bell (大磬): a bronze bowl resting on a cushion on a lacquered stand. */
function bowlBell() {
  const group = new THREE.Group();
  const top = lowStand(group);
  const profile = [[0, 0], [0.14, 0], [0.24, 0.04], [0.31, 0.12], [0.35, 0.22], [0.36, 0.3], [0.335, 0.3], [0.325, 0.22], [0.285, 0.12], [0.2, 0.055], [0, 0.04]];
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32),
    mat(0xa07a3a, { metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }),
  );
  bowl.position.y = top - 0.04;
  group.add(bowl);
  mallet(group, -0.22, 0.53, 0.3, 0x2a1a10);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = top + 0.25;
  group.add(glow);
  return { group, bowl, glow };
}

/** Wooden fish (木魚): a round red-lacquered slit drum on a cushion. */
function woodenFish() {
  const group = new THREE.Group();
  const top = lowStand(group);
  const fish = new THREE.Group();
  fish.position.y = top + 0.2;
  group.add(fish);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16).scale(1.1, 0.82, 1), mat(0x9e2a22, { roughness: 0.32, metalness: 0.1 }));
  fish.add(body);
  const slit = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 24, Math.PI * 0.9).rotateZ(Math.PI * 1.05), mat(0x1a0a06));
  slit.position.set(0, -0.02, 0.29);
  slit.scale.set(1.2, 0.5, 1);
  fish.add(slit);
  const knob = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 16), mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 }));
  knob.position.y = 0.26;
  fish.add(knob);
  mallet(group, -0.22, 0.53, 0.3);
  return { group, fish };
}

/** Big temple drum (法鼓) lying on a wooden cradle, heads facing east–west. */
function bigDrum() {
  const group = new THREE.Group();
  const wood = mat(0x5a2214, { roughness: 0.55 });
  for (const sx of [-0.45, 0.45])
    for (const sz of [-0.42, 0.42]) {
      const leg = cylinder(0.05, 0.06, 1.0, wood, sx, 0, sz, 8);
      group.add(leg);
    }
  for (const sz of [-0.42, 0.42]) group.add(box(1.1, 0.08, 0.1, wood, 0, 0.95, sz));
  for (const sx of [-0.45, 0.45]) group.add(box(0.1, 0.06, 0.9, wood, sx, 0.4, 0));

  const barrel = new THREE.Group();
  barrel.position.y = 1.62;
  group.add(barrel);
  const prof = [[0.6, -0.55], [0.67, -0.3], [0.71, 0], [0.67, 0.3], [0.6, 0.55]].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 32).rotateZ(Math.PI / 2), mat(0xa3291f, { roughness: 0.45, side: THREE.DoubleSide }));
  barrel.add(shell);
  const hide = mat(0xe6d8b8, { roughness: 0.8 });
  const studs: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.6, 36), hide);
    head.rotation.y = (s * Math.PI) / 2;
    head.position.x = s * 0.55;
    barrel.add(head);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      studs.push(new THREE.SphereGeometry(0.022, 6, 4).translate(s * 0.54, Math.cos(a) * 0.62, Math.sin(a) * 0.62));
    }
  }
  barrel.add(new THREE.Mesh(mergeGeometries(studs), mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 })));
  // Two sticks laid across the lower rail on the aisle side
  for (const sz of [-0.12, 0.12]) {
    const st = cylinder(0.022, 0.022, 0.5, mat(0x6b4426), 0, 0, 0, 6);
    st.rotation.z = Math.PI / 2;
    st.position.set(0.5, 0.48, sz);
    group.add(st);
  }
  return { group, barrel };
}

/** Bronze hall bell (殿鐘) hanging in a red frame; struck with a wooden mallet. */
function hallBell() {
  const group = new THREE.Group();
  const red = mat(0xa3291f, { roughness: 0.5 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 });
  for (const sz of [-1.0, 1.0]) {
    group.add(cylinder(0.1, 0.11, 2.75, red, 0, 0.1, sz, 12));
    group.add(box(0.9, 0.16, 0.3, mat(0x5a2214), 0, 0, sz));
    group.add(cylinder(0.13, 0.13, 0.08, gold, 0, 2.85, sz, 12));
  }
  group.add(box(0.24, 0.24, 2.5, red, 0, 2.55, 0));
  group.add(box(0.26, 0.06, 2.6, gold, 0, 2.79, 0));

  const bell = new THREE.Group(); // pivot at the hook
  bell.position.y = 2.55;
  group.add(bell);
  bell.add(cylinder(0.025, 0.025, 0.12, mat(0x2a1a10), 0, -0.12, 0, 6));
  const bronze = mat(0x5f6e4e, { metalness: 0.7, roughness: 0.42, side: THREE.DoubleSide });
  const prof = [[0.0, 0], [0.3, -0.02], [0.34, -0.15], [0.36, -0.45], [0.42, -0.85], [0.52, -1.15], [0.6, -1.3], [0.62, -1.35]].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), bronze);
  shell.position.y = -0.12;
  bell.add(shell);
  const lug = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 16), bronze);
  lug.position.y = -0.06;
  bell.add(lug);
  for (const [y, r] of [[-0.55, 0.38], [-0.95, 0.445], [-1.3, 0.6]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 36).rotateX(Math.PI / 2), bronze);
    band.position.y = y - 0.12;
    bell.add(band);
  }
  // Mallet hanging on the post
  const m = cylinder(0.03, 0.03, 0.55, mat(0x6b4426), 0, 0, 0, 6);
  m.rotation.z = 0.15;
  m.position.set(-0.14, 1.1, -0.86);
  group.add(m);
  return { group, bell };
}
