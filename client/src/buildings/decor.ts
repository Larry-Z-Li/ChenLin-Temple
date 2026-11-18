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
  PAVED.forEach((r, i) => {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    const tex = base.clone();
    tex.repeat.set(w / 3, d / 3);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ map: tex, color: THEME.pavedStone, roughness: 0.95 }));
    m.position.set((r.minX + r.maxX) / 2, 0.02 + i * 0.001, (r.minZ + r.maxZ) / 2); // tiny offsets avoid z-fighting at overlaps
    m.receiveShadow = true;
    ctx.scene.add(m);
  });

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
    l.position.set(x + lx, H - 1.4, z);
    g.add(l);
    return l;
  });
  ctx.updaters.push((_dt, time) => lanterns.forEach((l, i) => (l.rotation.z = Math.sin(time * 1.1 + i * 2) * 0.05)));
  ctx.scene.add(g);
}
