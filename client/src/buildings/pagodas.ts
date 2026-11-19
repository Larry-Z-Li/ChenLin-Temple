import * as THREE from 'three';
import { PAGODAS } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { lerp } from '../core/math';
import { box, cylinder, mat } from './materials';
import { smallStupa } from './stupas';

/** Colours per pagoda: [walls, eaves]. */
const STYLE: Record<string, [number, number]> = {
  ruyi: [0xd9d5cc, 0x7a2418], // 如意塔: pale stone, dark red eaves
  wenchang: [0xefe6d2, 0x9c2a1c], // 文昌塔: white walls, red eaves
  linggu: [0xb3afa6, 0x3b4048], // 靈骨塔: grey stone, dark tiles
};

/** The four corner pagodas: three tiered Chinese pagodas and the Duobao stupa-tower. */
export function buildPagodas(ctx: WorldContext) {
  for (const p of PAGODAS) (p.stories ? tieredPagoda : stupaTower)(ctx, p);
}

/** Octagonal pagoda: a stone base, then stories tapering upward, each with a red band and flared eaves. */
function tieredPagoda(ctx: WorldContext, p: (typeof PAGODAS)[number]) {
  const y0 = ctx.ground.heightAt(p.x, p.z);
  const g = new THREE.Group();
  g.position.set(p.x, y0, p.z);
  ctx.scene.add(g);
  const [wallHex, roofHex] = STYLE[p.id] ?? [0xefe6d2, 0x3b4048];
  const walls = mat(wallHex, { roughness: 0.85 }), roofs = mat(roofHex, { roughness: 0.7, flatShading: true });
  const red = mat(THEME.column, { roughness: 0.55 }), dark = mat(0x2a1a14, { roughness: 0.8 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 });
  const n = p.stories, r0 = p.height * 0.15, r1 = r0 * 0.55, spire = 2.4, base = 1.0;
  const storyH = (p.height - base - spire) / n;
  g.add(cylinder(r0 + 1.8, r0 + 2.1, base, mat(THEME.platformStone, { roughness: 0.95 }), 0, 0, 0, 8));
  for (let i = 0; i < n; i++) {
    const r = lerp(r0, r1, i / Math.max(1, n - 1)), yb = base + i * storyH, wallH = storyH * 0.7;
    g.add(cylinder(r * 0.92, r, wallH, walls, 0, yb, 0, 8));
    g.add(cylinder(r * 0.94, r * 0.94, 0.16, red, 0, yb + wallH - 0.16, 0, 8));
    // a dark doorway on each of the four main faces
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, door = box(r * 0.45, wallH * 0.55, 0.06, dark, 0, 0, 0);
      door.position.set(Math.sin(a) * r * 0.9, yb + wallH * 0.12 + (wallH * 0.55) / 2, Math.cos(a) * r * 0.9);
      door.rotation.y = a;
      g.add(door);
    }
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 1.5, storyH * 0.3, 8, 1), roofs);
    eave.position.y = yb + wallH + storyH * 0.15;
    eave.castShadow = true;
    g.add(eave);
  }
  const top = base + n * storyH;
  g.add(cylinder(0.06, r1 * 0.35, spire, gold, 0, top, 0, 8));
  for (let k = 0; k < 4; k++) g.add(cylinder(r1 * 0.32 - k * 0.04, r1 * 0.32 - k * 0.04, 0.08, gold, 0, top + 0.5 + k * 0.32, 0, 10));
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), gold);
  pearl.position.y = top + spire + 0.1;
  g.add(pearl);
  g.traverse((o) => (o.castShadow = true));
  ctx.collisions.addCircle(p.x, p.z, r0 + 2.1);
}

/** 多寶塔: a whitewashed stupa raised on a two-step square platform. */
function stupaTower(ctx: WorldContext, p: (typeof PAGODAS)[number]) {
  const y0 = ctx.ground.heightAt(p.x, p.z);
  ctx.scene.add(box(14, 2.4, 14, mat(THEME.platformStone, { roughness: 0.95 }), p.x, y0, p.z));
  ctx.scene.add(box(10, 1.6, 10, mat(0xe9e4d8, { roughness: 0.9 }), p.x, y0 + 2.4, p.z));
  ctx.scene.add(box(10.4, 0.12, 10.4, mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 }), p.x, y0 + 4.0, p.z));
  const st = smallStupa(p.height - 4);
  st.position.set(p.x, y0 + 4.05, p.z);
  ctx.scene.add(st);
  ctx.collisions.addBoxCentered(p.x, p.z, 14.4, 14.4);
}
