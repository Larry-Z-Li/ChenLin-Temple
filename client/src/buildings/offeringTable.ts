import * as THREE from 'three';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { glowTexture } from '../core/textures';
import { box, cylinder, mat } from './materials';

/**
 * Long offering table: incense bowl + stack of incense, candles, and empty fruit plates.
 * The future incense / fruit-offering features attach to `ctx.offeringTables`.
 */
export function buildOfferingTable(ctx: WorldContext, hallId: string, x: number, floorY: number, z: number, length: number, plates: number) {
  const g = new THREE.Group();
  const H = 0.85, D = 0.9;
  const wood = mat(THEME.table, { roughness: 0.55 });
  g.add(box(length, 0.08, D, wood, x, floorY + H - 0.08, z));
  g.add(box(length - 0.3, H - 0.08, D - 0.25, mat(0x4a2214, { roughness: 0.6 }), x, floorY, z));
  g.add(box(length + 0.02, 0.12, D + 0.02, mat(THEME.altarTrim, { metalness: 0.6, roughness: 0.4 }), x, floorY + H - 0.2, z));
  ctx.collisions.addBoxCentered(x, z, length + 0.1, D + 0.1);

  const top = floorY + H;
  const bronze = mat(THEME.bronze, { metalness: 0.8, roughness: 0.35 });

  // Incense bowl (centre) filled with ash: wide enough for many people's sticks
  g.add(cylinder(0.42, 0.3, 0.3, bronze, x, top, z, 24));
  g.add(cylinder(0.39, 0.39, 0.01, mat(0xb9b3a6, { roughness: 1 }), x, top + 0.26, z, 24));

  // Stack of ready incense sticks in a holder, beside the bowl
  const stack = new THREE.Group();
  stack.add(cylinder(0.07, 0.07, 0.12, bronze, 0, 0, 0, 10));
  const stickMat = mat(0x9c4a2a, { roughness: 0.9 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.03 + (i % 3) * 0.012;
    const s = cylinder(0.005, 0.005, 0.38, stickMat, Math.cos(a) * r, 0.05, Math.sin(a) * r, 4);
    s.castShadow = false;
    stack.add(s);
  }
  stack.position.set(x + 0.62, top, z);
  g.add(stack);

  // Altar candles at both ends, plus a small lighting candle right beside the incense.
  const flames: THREE.Sprite[] = [];
  const candleXs = [x - (length / 2 - 0.35), x + (length / 2 - 0.35)];
  if (length >= 3) candleXs.push(x + 0.98); // short tables light from the end candle, already close by
  for (const cx of candleXs) {
    g.add(cylinder(0.12, 0.14, 0.06, bronze, cx, top, z, 12));
    g.add(cylinder(0.05, 0.05, 0.3, mat(0xf4ead2, { roughness: 0.6 }), cx, top + 0.06, z, 10));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.position.set(cx, top + 0.42, z);
    flame.scale.set(0.12, 0.2, 1);
    g.add(flame);
    flames.push(flame);
  }

  // Plates for fruit offerings
  const slots: { x: number; y: number; z: number }[] = [];
  const nPlates = Math.max(2, plates);
  const span = length - 2.2;
  for (let i = 0; i < nPlates; i++) {
    const px = nPlates === 1 ? x : x - span / 2 + (i * span) / (nPlates - 1);
    if (Math.abs(px - x) < 1.3) continue; // keep clear of the bowl, incense and lighting candle
    // Wide, shallow offering bowl for fruit
    g.add(cylinder(0.33, 0.2, 0.11, bronze, px, top, z + 0.08, 20));
    g.add(cylinder(0.3, 0.3, 0.01, mat(0x6b4a24, { roughness: 0.6 }), px, top + 0.1, z + 0.08, 20));
    slots.push({ x: px, y: top + 0.1, z: z + 0.08 });
  }
  ctx.offeringTables.push({ hallId, x, y: top, z, length, slots, bowl: { x, y: top + 0.27, z, r: 0.36 } });

  ctx.updaters.push((_dt, time) => {
    flames.forEach((f, i) => {
      const k = 1 + 0.12 * Math.sin(time * 13 + i * 2.1) + 0.06 * Math.sin(time * 29 + i);
      f.scale.set(0.12 * k, 0.21 * k, 1);
    });
  });
  return g;
}
