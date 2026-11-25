import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GW_OPENINGS, GW_RAIL_R, GW_STAIRS, GW_WHEEL_R } from '../../../shared/greatWheel';
import { THEME } from '../config/theme';
import { canvasTexture } from '../core/textures';
import { hipRoofGeometry, mat } from './materials';
import { drumTexture } from './prayerWheels';

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
  const mantra = drumTexture(); // the small wheels' band: reused, not new lettering
  mantra.wrapS = THREE.RepeatWrapping;
  mantra.repeat.set(10, 1);
  const bandMat = new THREE.MeshStandardMaterial({ map: mantra, metalness: 0.55, roughness: 0.4 });

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
  w.add(gold, new THREE.CylinderGeometry(R, R, WH, 48), 0, WH / 2, 0);
  // a red tray at its base, with struts radiating from it
  w.add(red, new THREE.CylinderGeometry(R + 0.55, R + 0.55, 0.3, 48), 0, 0.15, 0);
  for (let i = 0; i < GW_OPENINGS; i++) {
    const a = (i * Math.PI) / 4, r = R + 0.1;
    w.add(fascia, new THREE.BoxGeometry(0.2, 0.14, 1.0), Math.sin(a) * r, 0.37, -Math.cos(a) * r, -a);
  }
  // three bands of mantra, and thin gold rings between them
  const bandH = 1.7, gaps = (WH - 1.8 - 0.9 - 3 * bandH) / 2;
  for (let i = 0; i < 3; i++) {
    const y = 1.8 + i * (bandH + gaps);
    w.add(bandMat, new THREE.CylinderGeometry(R + 0.04, R + 0.04, bandH, 48, 1, true), 0, y + bandH / 2, 0);
    for (const yy of [y - 0.05, y + bandH + 0.05]) w.add(goldLine, new THREE.TorusGeometry(R + 0.06, 0.06, 6, 48).rotateX(Math.PI / 2), 0, yy, 0);
  }
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
