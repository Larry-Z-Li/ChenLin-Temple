import * as THREE from 'three';
import { CAVE_FALLS, caveFallsAt } from '../config/layout';
import type { WorldContext } from '../core/context';
import { buildCaveFalls, CAVE_RECESS, colliders } from './caveFalls';
import { box, cylinder, mat } from '../buildings/materials';
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

  buildCaveMats(ctx);

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
    falls.update(time, 0.34 + 0.66 * lighting.daylight, fog); // the water isn't lit by the scene: dim it by night (white water still catches the moon)
  });
}

/**
 * Five meditation mats on the floor of the recess behind the fall, in a shallow arc facing out through the falling
 * water: a square mat (座布團) with a round cushion on it, each a seat.
 */
function buildCaveMats(ctx: WorldContext) {
  const R = CAVE_RECESS, s = Math.sin(CAVE_FALLS.yaw), c = Math.cos(CAVE_FALLS.yaw);
  const matCloth = mat(0x6e2a22, { roughness: 0.95 }), edge = mat(0x3a1a14, { roughness: 0.95 }), zafu = mat(0x2f3a5a, { roughness: 0.9 });
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const lx = R.x + (i - 2) * 1.55, lz = R.z + 1.6 - 0.09 * (i - 2) ** 2 * 1.55; // (the arc's ends drawn back a little)
    const [wx, wz] = caveFallsAt(lx, lz), wy = ctx.ground.heightAt(wx, wz);
    const m = new THREE.Group();
    m.position.set(wx, wy, wz);
    m.rotation.y = CAVE_FALLS.yaw + Math.atan2(-(i - 2) * 0.12, 1); // (facing out, turned a touch toward the middle)
    m.add(box(0.9, 0.04, 0.9, edge, 0, 0, 0), box(0.84, 0.035, 0.84, matCloth, 0, 0.035, 0), cylinder(0.21, 0.23, 0.13, zafu, 0, 0.07, -0.08, 16));
    g.add(m);
    const id = `cave-mat-${i}`, yaw = m.rotation.y + Math.PI; // (local +z, out toward the water and the temple)
    ctx.seats.set(id, { id, kind: 'cushion', x: wx - Math.sin(m.rotation.y) * 0.08, y: wy + 0.2, z: wz - Math.cos(m.rotation.y) * 0.08, yaw, exit: [-s * 0.95, -c * 0.95], occupiedBy: null });
  }
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));
  ctx.scene.add(g);
}
