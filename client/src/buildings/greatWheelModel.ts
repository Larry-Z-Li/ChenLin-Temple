import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GW_OPENINGS, GW_RAIL_R, GW_STAIRS, GW_WHEEL_R } from '../../../shared/greatWheel';
import { THEME } from '../config/theme';
import { canvasTexture } from '../core/textures';
import { hipRoofGeometry, mat } from './materials';
import { nightGlow } from '../world/nightGlow';
import { addLamp } from '../world/lightPool';
import { smoothstep } from '../core/math';

/**
 * The great prayer wheel's pavilion and wheel (the look; the behaviour is in greatWheel.ts): a red open pavilion with a
 * two-tier roof over a gold wheel. Parts are gathered per material and merged, so it is a dozen meshes, not hundreds;
 * what turns is one group (`wheel`).
 */

/** Collects boxes and other shapes per material, then merges each material's into one mesh. */
class Parts {
  private by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private o = new THREE.Object3D();

  add(material: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
    const o = this.o;
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, 0);
    o.updateMatrix();
    const g = geo.clone().applyMatrix4(o.matrix);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const list = this.by.get(material) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.by.set(material, list);
  }

  /** A box whose bottom sits at y. */
  box(material: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0) {
    this.add(material, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry);
  }

  flush(into: THREE.Group, shadow = true) {
    for (const [m, list] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      into.add(mesh);
    }
    this.by.clear();
  }
}

/** Cut-stone blocks in pale tones that differ a little from block to block (1 tile = 4 m × 2 m: blocks 1 m × 0.5 m, joints staggered). */
function stoneTexture() {
  const tex = canvasTexture(256, 128, (g) => {
    const rnd = (i: number) => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const k = 0.9 + rnd(row * 4 + col + 1) * 0.16, x = col * 64 + (row % 2) * 32;
        g.fillStyle = `rgb(${Math.round(190 * k)},${Math.round(184 * k)},${Math.round(170 * k)})`;
        g.fillRect(x - 64, row * 32, 64, 32);
        g.fillRect(x, row * 32, 64, 32);
      }
    g.strokeStyle = 'rgba(70,64,54,0.55)';
    g.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      g.beginPath(); g.moveTo(0, row * 32); g.lineTo(256, row * 32); g.stroke();
      for (let col = -1; col < 5; col++) { const x = col * 64 + (row % 2) * 32; g.beginPath(); g.moveTo(x, row * 32); g.lineTo(x, row * 32 + 32); g.stroke(); }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** The upper tier's maroon face with a row of gold lozenges. */
function lozengeTexture() {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = '#6b1a22';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#d9b24a';
    g.lineWidth = 3;
    g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#d9b24a';
    for (const cx of [48, 128, 208]) { g.beginPath(); g.moveTo(cx, 12); g.lineTo(cx + 22, 32); g.lineTo(cx, 52); g.lineTo(cx - 22, 32); g.closePath(); g.fill(); }
  });
}

/** A box's UVs in metres across the stone tile, so blocks keep their size on every face. */
function stoneBox(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * faces[f][0]) / 4, (uv.getY(k) * faces[f][1]) / 2); }
  return geo;
}

export function buildGreatWheelModel(root: THREE.Group, wheel: THREE.Group, half: number, plinth: number, stepH: number, stepD: number, stairW: number) {
  const red = mat(0xa3231b, { roughness: 0.7 }), goldLine = mat(0xe3b93c, { roughness: 0.5, metalness: 0.4 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.35 }), goldDark = mat(0x9c7a24, { metalness: 0.6, roughness: 0.45 });
  const brass = mat(0xc29a3a, { metalness: 0.9, roughness: 0.22 });
  const dark = mat(0x2b2b2e, { roughness: 0.7, side: THREE.DoubleSide }), fascia = mat(0x8e1d17, { roughness: 0.6 });
  const blue = mat(0x1f5f8a), green = mat(0x2f7d5b), corbelMat = mat(0xd8542a, { roughness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 });
  const maroon = new THREE.MeshStandardMaterial({ map: lozengeTexture(), roughness: 0.7 });
  const mantra = mantraTexture();
  const bandMat = new THREE.MeshStandardMaterial({ map: mantra, metalness: 0.55, roughness: 0.4 });
  const drumGold = gold; // (lit after dark by the spotlights round it: real lights, see below)

  // ---- The pavilion ----
  const s = new Parts(), H = half, P = plinth;
  s.add(stone, stoneBox(H * 2, P, H * 2), 0, P / 2, 0);
  for (let k = 0; k < GW_STAIRS; k++) for (let i = 0; i < 3; i++) {
    const h = P - stepH * (i + 1), r = H + stepD * (i + 0.5), a = (k * Math.PI) / 2;
    s.add(stone, stoneBox(stairW, h, stepD), Math.sin(a) * r, h / 2, -Math.cos(a) * r, -a);
  }
  const PH = 8.5, PX = H - 0.5, top = P + PH;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    s.box(red, 0.9, PH, 0.9, sx * PX, P, sz * PX);
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) s.box(goldLine, 0.06, PH, 0.06, sx * PX + ex * 0.45, P, sz * PX + ez * 0.45); // thin gold edge lines
    // corbels (a quarter-round under the beam) toward both neighbours
    for (const along of ['x', 'z'] as const) {
      const q = new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10, 1, false, 0, Math.PI / 2).rotateX(Math.PI / 2); // x>0, below, thickness along z
      const dirX = along === 'x' ? -sx : 0, dirZ = along === 'z' ? -sz : 0;
      s.add(corbelMat, q, sx * PX + dirX * 0.45, top - 0.5, sz * PX + dirZ * 0.45, along === 'x' ? (dirX > 0 ? 0 : Math.PI) : dirZ > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // the beam (blue face) and, under it, a row of small stacked blocks: red, blue, green in turn
  for (const sd of [-1, 1]) {
    s.box(blue, PX * 2 + 0.9, 1.0, 1.1, 0, top, sd * PX);
    s.box(blue, 1.1, 1.0, PX * 2 + 0.9, sd * PX, top, 0);
    const n = Math.round((PX * 2 - 1) / 0.55), step = (PX * 2 - 1) / n;
    for (let i = 0; i <= n; i++) {
      const m = [red, blue, green][i % 3], p = -PX + 0.5 + i * step;
      s.box(m, 0.42, 0.4, 0.5, p, top - 0.45, sd * PX + sd * 0.2);
      s.box(m, 0.5, 0.4, 0.42, sd * PX + sd * 0.2, top - 0.45, p);
    }
  }
  // red lanterns hung under the corners of both roofs, glowing after dark and lighting the floor below
  const cord = mat(0x2a1a12, { roughness: 0.9 });
  const eaveLo = top + 1.0, eaveHi = eaveLo + 3.2 + 1.4, cornerLo = (PX * 2 + 4.6) / 2 - 0.45, cornerHi = 9.2 / 2 - 0.4;
  for (const [c, eave] of [[cornerLo, eaveLo], [cornerHi, eaveHi]] as const) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = sx * c, lz = sz * c, ly = eave - 1.3, cl = eave - (ly + 0.58);
    s.add(nightGlow.lanternBody, new THREE.SphereGeometry(0.42, 14, 10).scale(1, 1.25, 1), lx, ly, lz);
    s.add(goldLine, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), lx, ly + 0.53, lz);
    s.add(goldLine, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), lx, ly - 0.53, lz);
    s.add(cord, new THREE.CylinderGeometry(0.02, 0.02, cl, 4), lx, ly + 0.58 + cl / 2, lz);
    s.add(red, new THREE.CylinderGeometry(0.05, 0.02, 0.5, 6), lx, ly - 0.83, lz);
    const halo = new THREE.Sprite(nightGlow.lanternHalo);
    halo.position.set(lx, ly, lz);
    halo.scale.setScalar(2.4);
    root.add(halo);
    root.updateMatrixWorld(true);
    const at = root.localToWorld(new THREE.Vector3(lx, ly, lz));
    addLamp({ x: at.x, y: at.y, z: at.z, color: 0xff8a50, intensity: 5, range: 15, decay: 1.1 });
  }
  // the uplights: a spotlight on the floor between each pair of the riders' places, out past their circle, its
  // bronze barrel on a yoke aimed up at the drum, its lens glowing, a faint beam to the drum after dark, and a real light
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.15, emissive: 0xffd9a0, emissiveIntensity: 0.1 });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffdcaa, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  nightGlow.track((n) => { const k = smoothstep(0.15, 0.6, n); lensMat.emissiveIntensity = 0.1 + 1.4 * k; beamMat.opacity = 0.06 * k; });
  const tilt = 0.9, aim = new THREE.Vector3(0, Math.sin(tilt), -Math.cos(tilt)), headY = 0.32, SPOT_R = 6.8;
  const toAim = (from: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(from, aim);
  const lensAt = aim.clone().multiplyScalar(0.19).add(new THREE.Vector3(0, headY, 0));
  root.updateMatrixWorld(true);
  for (let i = 0; i < UPLIGHTS; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / UPLIGHTS, x = Math.sin(a) * SPOT_R, z = -Math.cos(a) * SPOT_R, ry = Math.PI - a; // (its -z toward the drum)
    s.add(goldDark, new THREE.CylinderGeometry(0.2, 0.22, 0.05, 12), x, P + 0.025, z, ry);
    for (const side of [-1, 1]) s.add(goldDark, new THREE.BoxGeometry(0.03, 0.34, 0.06).translate(side * 0.18, 0.2, 0), x, P, z, ry);
    s.add(goldDark, new THREE.CylinderGeometry(0.13, 0.155, 0.38, 14).applyQuaternion(toAim(new THREE.Vector3(0, 1, 0))).translate(0, headY, 0), x, P, z, ry);
    s.add(lensMat, new THREE.CircleGeometry(0.115, 18).applyQuaternion(toAim(new THREE.Vector3(0, 0, 1))).translate(lensAt.x, lensAt.y, lensAt.z), x, P, z, ry);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 18, 1, true).translate(0, -2.2, 0).applyQuaternion(toAim(new THREE.Vector3(0, -1, 0))).translate(lensAt.x, lensAt.y, lensAt.z), beamMat);
    beam.position.set(x, P, z);
    beam.rotation.y = ry;
    beam.renderOrder = 2;
    root.add(beam);
    // its light: a real one (from the pool given to the lamps nearest you), from the lens toward the drum
    const lens = new THREE.Vector3(lensAt.x, lensAt.y, lensAt.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, P, z));
    const at = root.localToWorld(lens.addScaledVector(new THREE.Vector3(-Math.sin(a), 0.6, Math.cos(a)), 0.6));
    addLamp({ x: at.x, y: at.y, z: at.z, color: 0xffd9a8, intensity: 5, range: 18, decay: 0.9, indoor: true });
    // …and, so the drum stays lit from across the valley (when the real lights have gone to nearer lamps), the light
    // where the beam lands painted into the night light map
    const hit = root.localToWorld(new THREE.Vector3(Math.sin(a) * (GW_WHEEL_R + 0.6), P + 1.6, -Math.cos(a) * (GW_WHEEL_R + 0.6)));
    addLamp({ x: hit.x, y: hit.y, z: hit.z, color: 0xffd9a8, intensity: 3, range: 7, decay: 1.1 });
  }
  const roof = (W: number, h: number, y: number) => {
    s.add(dark, hipRoofGeometry(W, W, h).geometry, 0, y, 0);
    for (const sd of [-1, 1]) { // red fascia boards round the eaves
      s.box(fascia, W + 0.1, 0.35, 0.14, 0, y - 0.05, sd * (W / 2));
      s.box(fascia, 0.14, 0.35, W + 0.1, sd * (W / 2), y - 0.05, 0);
    }
  };
  const W1 = PX * 2 + 4.6, y1 = top + 1.0, y2 = y1 + 3.2;
  roof(W1, 3.2, y1);
  s.add(maroon, new THREE.BoxGeometry(5.6, 1.4, 5.6), 0, y2 + 0.7, 0);
  s.box(blue, 5.9, 0.4, 5.9, 0, y2 + 1.0);
  roof(9.2, 2.0, y2 + 1.4);
  s.add(goldDark, new THREE.CylinderGeometry(0.45, 0.45, y2 + 1.0 - P, 12), 0, P + (y2 + 1.0 - P) / 2, 0); // the axle
  s.flush(root);

  // ---- The wheel (turns as one group) ----
  const w = new Parts(), R = GW_WHEEL_R, WH = PH;
  w.add(drumGold, new THREE.CylinderGeometry(R, R, WH, 48), 0, WH / 2, 0);
  // a red tray at its base, with struts radiating from it
  w.add(red, new THREE.CylinderGeometry(R + 0.55, R + 0.55, 0.3, 48), 0, 0.15, 0);
  for (let i = 0; i < GW_OPENINGS; i++) {
    const a = (i * Math.PI) / 4, r = R + 0.1;
    w.add(fascia, new THREE.BoxGeometry(0.2, 0.14, 1.0), Math.sin(a) * r, 0.37, -Math.cos(a) * r, -a);
  }
  // the six-syllable mantra (ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ) in raised gold on red, round and round the drum in many rows, a thin gold
  // ring between each
  const LEVELS = 6, gap = 0.08, bandH = (WH - 1.8 - 0.9 - (LEVELS - 1) * gap) / LEVELS;
  mantra.repeat.set(Math.max(4, Math.round((2 * Math.PI * (R + 0.04)) / (bandH * MANTRA_TILE))), 1);
  for (let i = 0; i < LEVELS; i++) {
    const y = 1.8 + i * (bandH + gap);
    w.add(bandMat, new THREE.CylinderGeometry(R + 0.04, R + 0.04, bandH, 64, 1, true), 0, y + bandH / 2, 0);
  }
  for (let i = 0; i <= LEVELS; i++) w.add(goldLine, new THREE.TorusGeometry(R + 0.06, 0.04, 6, 64).rotateX(Math.PI / 2), 0, 1.8 + i * (bandH + gap) - gap / 2, 0);
  // the green-and-red pleated valance round the top, a lid, and the axle cap
  const pleats = 48, pw = (2 * Math.PI * (R + 0.1)) / pleats;
  for (let i = 0; i < pleats; i++) {
    const a = (i / pleats) * Math.PI * 2;
    w.add(i % 2 ? red : green, new THREE.BoxGeometry(pw * 0.98, 0.9, 0.07), Math.sin(a) * (R + 0.12), WH - 0.45, -Math.cos(a) * (R + 0.12), -a, 0);
  }
  w.add(red, new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.25, 48), 0, WH + 0.1, 0);
  w.add(gold, new THREE.CylinderGeometry(0.65, 0.65, 0.4, 16), 0, WH + 0.45, 0);
  // the rail the riders' right hands rest on, joined to the wheel by struts
  w.add(brass, new THREE.TorusGeometry(GW_RAIL_R, 0.07, 8, 64).rotateX(Math.PI / 2), 0, 1.1, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8, r = (R + GW_RAIL_R) / 2;
    w.add(brass, new THREE.BoxGeometry(0.06, 0.06, GW_RAIL_R - R + 0.1), Math.sin(a) * r, 1.07, -Math.cos(a) * r, -a);
  }
  w.flush(wheel);
  wheel.position.y = P;
}

/** One mantra per tile, this many times as wide as it is tall (the lettering's own shape, with a margin round it). */
const MANTRA_TILE = 1.85;
/**
 * The six-syllable mantra (from /assets/wheel/om-mani-padme-hum.png, white letters on transparent) raised in gold on a
 * deep red ground: a dark edge below and to the right for depth, then the gold. Drawn when the image arrives.
 */
function mantraTexture() {
  const W = 1024, H = Math.round(W / MANTRA_TILE), c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const ground = g.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#6e1410'), ground.addColorStop(0.5, '#8a1d15'), ground.addColorStop(1, '#5e100c');
  g.fillStyle = ground;
  g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    const h = H * 0.86, w = (img.width / img.height) * h, x = (W - w) / 2, y = (H - h) / 2;
    const tint = (color: string | CanvasGradient) => { // the letters' shape, filled with a colour
      const t = document.createElement('canvas');
      t.width = W;
      t.height = H;
      const tg = t.getContext('2d')!;
      tg.drawImage(img, x, y, w, h);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = color;
      tg.fillRect(0, 0, W, H);
      return t;
    };
    g.drawImage(tint('rgba(40, 8, 4, 0.85)'), 4, 5); // (the raised edge's shadow)
    const gold = g.createLinearGradient(0, y, 0, y + h);
    gold.addColorStop(0, '#fff1b0'), gold.addColorStop(0.45, '#e2b545'), gold.addColorStop(1, '#a8741c');
    g.drawImage(tint(gold), 0, 0);
    tex.needsUpdate = true;
  };
  img.src = '/assets/wheel/om-mani-padme-hum.png';
  return tex;
}

/** How many uplights stand round the drum (between the riders' places). */
const UPLIGHTS = 8;
