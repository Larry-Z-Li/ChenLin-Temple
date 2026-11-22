import * as THREE from 'three';
import { MOUNTAIN_GATE, PAVED } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { stoneTexture, textTexture, verticalTextTexture } from '../core/textures';
import { buildRedLantern } from './hall';
import { inscription, onLocaleChange, t } from '../i18n';
import { box, cylinder, hipRoofGeometry, mat } from './materials';

/** Paved walkways + the mountain gate at the entrance. */
export function buildDecor(ctx: WorldContext) {
  const base = stoneTexture();
  // Where paved areas overlap (the ring walk's corners, walks running into the court), the earlier one
  // keeps the ground and the later is cut around it: two slabs in one plane flicker into each other.
  const pieces = PAVED.flatMap((r, i) => PAVED.slice(0, i).reduce((ps, cut) => ps.flatMap((p) => subtractRect(p, cut)), [r]));
  for (const r of pieces) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    const tex = base.clone();
    // 3 m stones laid on the world grid, so neighbouring pieces' patterns run on without a seam
    // (a box's top face maps u along +x and v along −z).
    tex.repeat.set(w / 3, d / 3);
    tex.offset.set(r.minX / 3, -r.maxZ / 3);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ map: tex, color: THEME.pavedStone, roughness: 0.95 }));
    m.position.set((r.minX + r.maxX) / 2, 0.02, (r.minZ + r.maxZ) / 2);
    m.receiveShadow = true;
    ctx.scene.add(m);
  }

  // Mountain gate (simple paifang-style arch)
  const { x, z, width: W, height: H, couplet } = MOUNTAIN_GATE;
  const g = new THREE.Group();
  const col = mat(THEME.column, { roughness: 0.55 });
  for (const s of [-1, 1]) {
    g.add(cylinder(0.3, 0.34, H, col, x + (s * W) / 2, 0, z, 14));
    g.add(box(1.0, 0.5, 1.0, mat(THEME.platformStone), x + (s * W) / 2, 0, z));
    ctx.collisions.addCircle(x + (s * W) / 2, z, 0.5);
  }
  g.add(box(W + 1.6, 0.5, 0.5, mat(THEME.beam), x, H - 1.4, z));
  g.add(box(W + 2.2, 0.6, 0.6, col, x, H - 0.6, z));
  const { geometry } = hipRoofGeometry(W + 3.6, 2.4, 1.3);
  const roof = new THREE.Mesh(geometry, mat(THEME.roof, { side: THREE.DoubleSide, flatShading: true }));
  roof.position.set(x, H, z);
  roof.castShadow = true;
  g.add(roof);

  const plaqueMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const draw = () => {
    plaqueMat.map?.dispose();
    plaqueMat.map = textTexture(inscription(t('app.title')), { bg: '#1d2b4a', color: '#e8c76a', border: '#c9a24a', w: 1024, h: 256 });
    plaqueMat.needsUpdate = true;
  };
  draw();
  onLocaleChange(draw);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), plaqueMat);
  plaque.position.set(x, H - 1.95, z + 0.3);
  g.add(plaque);

  // Couplet on the gate columns (上聯 on the right as you enter) and red lanterns under the beam.
  couplet.forEach((text, i) => {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.0), new THREE.MeshStandardMaterial({ map: verticalTextTexture(text, { bg: '#2a120c', border: '#c9a24a' }), roughness: 0.55 }));
    board.position.set(x + (i === 0 ? 1 : -1) * (W / 2), 2.4, z + 0.37);
    g.add(board);
  });
  const lanterns = [-2.4, 2.4].map((lx) => {
    const l = buildRedLantern(0.35);
    l.userData.dynamic = l.userData.rigid = true; // sways as one piece
    l.position.set(x + lx, H - 1.4, z);
    g.add(l);
    return l;
  });
  ctx.updaters.push((_dt, time) => lanterns.forEach((l, i) => (l.rotation.z = Math.sin(time * 1.1 + i * 2) * 0.05)));
  ctx.scene.add(g);
}

type Area = { minX: number; maxX: number; minZ: number; maxZ: number };
/** `a` minus `b`: up to four rectangles covering what of `a` lies outside `b`. */
function subtractRect(a: Area, b: Area): Area[] {
  if (b.maxX <= a.minX || b.minX >= a.maxX || b.maxZ <= a.minZ || b.minZ >= a.maxZ) return [a];
  const z0 = Math.max(a.minZ, b.minZ), z1 = Math.min(a.maxZ, b.maxZ);
  return [
    { ...a, maxZ: b.minZ },
    { ...a, minZ: b.maxZ },
    { minX: a.minX, maxX: b.minX, minZ: z0, maxZ: z1 },
    { minX: b.maxX, maxX: a.maxX, minZ: z0, maxZ: z1 },
  ].filter((r) => r.maxX - r.minX > 0.01 && r.maxZ - r.minZ > 0.01);
}
