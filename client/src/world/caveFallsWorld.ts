import * as THREE from 'three';
import { CAVE_FALLS, caveFallsAt } from '../config/layout';
import type { WorldContext } from '../core/context';
import { buildCaveFalls, colliders } from './caveFalls';
import { lighting } from './sky';
import { riverWaterMaterial } from './water';
import { coarseHeightAt, groundColour, riverBankTint, terrainHeight } from './terrain';

/**
 * Sets the cave waterfall (洞瀑) into the world. Its land is the terrain's own (see terrain.ts), so people walk its
 * gorge, stairs and ledge like anywhere else; here go the circles that stop them at its cliffs and its pool, and its
 * finer ground, rock, water and plants, which take a moment to build, so they come a beat after the rest.
 */
export function buildCaveFallsWorld(ctx: WorldContext) {
  const { x, y, z, yaw } = CAVE_FALLS;
  for (const [lx, lz, r] of colliders()) ctx.collisions.addCircle(...caveFallsAt(lx, lz), r);

  let falls: ReturnType<typeof buildCaveFalls> | null = null;
  const fog = new THREE.Color();
  setTimeout(() => {
    falls = buildCaveFalls({
      place: { x, y, z, yaw },
      ground: false,
      water: riverWaterMaterial(), // (its pool in the rivers' own water)
      terrain: {
        edge: coarseHeightAt,
        colour: (wx, wy, wz, slope, c) => riverBankTint(wx, wy, wz, groundColour(wx, wy, wz, slope, c)),
        height: terrainHeight,
      },
    });
    ctx.scene.add(falls.group);
  }, 0);
  ctx.updaters.push((_dt, time) => {
    if (!falls) return;
    const f = ctx.scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (f) fog.copy(f.color);
    falls.update(time, 0.08 + 0.92 * lighting.daylight, fog); // the water isn't lit by the scene: dim it by night
  });
}
