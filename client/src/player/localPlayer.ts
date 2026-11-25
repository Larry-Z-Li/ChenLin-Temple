import * as THREE from 'three';
import { ANIMS, type Anim, type Transform } from '../../../shared/protocol';
import { BASIN, PLAY_RADIUS, SPAWN, caveFallsLocal } from '../config/layout';
import { inCut } from '../world/caveFalls';
import type { CollisionWorld } from '../core/collisions';
import type { Ground } from '../core/ground';
import type { Input } from '../core/input';
import { damp, dampAngle } from '../core/math';
import { Avatar } from './avatar';

const WALK = 3.8, RUN = 6.0, RADIUS = 0.32;

export type PlayerMode = 'free' | 'seated' | 'riding' | 'ritual';

export class LocalPlayer {
  readonly avatar: Avatar;
  readonly pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  yaw = SPAWN.yaw;
  mode: PlayerMode = 'free';
  speed = 0;
  private vel = new THREE.Vector2();
  private anchorAnim: Anim = 'kneel';
  /** A short gesture (e.g. a bow) that plays while standing still. */
  private gestureAnim: Anim | null = null;
  private gestureLeft = 0;

  constructor(color: string, name: string) {
    this.avatar = new Avatar(color); // own name tag hidden
    this.avatar.root.name = name;
  }

  get anim(): Anim {
    return this.avatar.anim;
  }

  /** Pin to a spot (a cushion). */
  anchor(x: number, y: number, z: number, yaw: number, mode: PlayerMode, anim: Anim) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.mode = mode;
    this.anchorAnim = anim;
    this.vel.set(0, 0);
    this.speed = 0;
  }

  setAnchorAnim(anim: Anim) {
    this.anchorAnim = anim;
  }

  release() {
    this.mode = 'free';
  }

  /** Free flight for looking around the preview: WASD along the camera, Space up, Q down, Shift ×3. */
  private fly(dt: number, input: Input, camYaw: number) {
    let mx = 0, mz = 0, my = 0;
    if (input.isDown('KeyW', 'ArrowUp')) mz -= 1;
    if (input.isDown('KeyS', 'ArrowDown')) mz += 1;
    if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) mx += 1;
    if (input.isDown('Space')) my += 1;
    if (input.isDown('KeyQ')) my -= 1;
    const v = 16 * (input.isDown('ShiftLeft', 'ShiftRight') ? 3 : 1) * dt;
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    this.pos.x += (s * mz + c * mx) * v;
    this.pos.z += (c * mz - s * mx) * v;
    this.pos.y += my * v;
    if (mx || mz) this.yaw = Math.atan2(-(s * mz + c * mx), -(c * mz - s * mx));
    this.speed = 0;
    this.avatar.anim = 'idle';
    this.sync(dt);
  }

  /** Play a gesture for `seconds`; walking cancels it. */
  gesture(anim: Anim, seconds: number) {
    this.gestureAnim = anim;
    this.gestureLeft = seconds;
  }

  /** Dev preview only (F): fly freely, through walls and ground. */
  flying = false;
  /** Beads and/or a sutra in hand on your feet (their pose); you can walk with them. */
  holdAnim: Anim | null = null;
  /** While the beads are out, ← → turn them instead of walking. */
  arrowsForBeads = false;

  update(dt: number, input: Input, camYaw: number, collisions: CollisionWorld, ground: Ground) {
    if (this.flying && this.mode === 'free') return this.fly(dt, input, camYaw);
    if (this.mode !== 'free') {
      this.avatar.anim = this.anchorAnim;
      this.sync(dt);
      return;
    }
    let mx = 0, mz = 0;
    if (input.isDown('KeyW', 'ArrowUp')) mz -= 1;
    if (input.isDown('KeyS', 'ArrowDown')) mz += 1;
    if (input.isDown('KeyA') || (!this.arrowsForBeads && input.isDown('ArrowLeft'))) mx -= 1;
    if (input.isDown('KeyD') || (!this.arrowsForBeads && input.isDown('ArrowRight'))) mx += 1;
    // Keyboard is full speed; the touch joystick is analog (pushed to the edge = faster walk).
    let mag = mx || mz ? 1 : 0;
    if (!mag && (input.stick.x || input.stick.y)) {
      mx = input.stick.x;
      mz = input.stick.y;
      mag = Math.min(1, Math.hypot(mx, mz));
    }

    const running = input.isDown('ShiftLeft', 'ShiftRight') || (mag > 0.95 && !(mx % 1 === 0 && mz % 1 === 0));
    const target = new THREE.Vector2();
    if (mag > 0.05) {
      // Camera-relative: forward = (-sin θ, -cos θ), right = (cos θ, -sin θ)
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      target.set(-s * -mz + c * mx, -c * -mz - s * mx).normalize().multiplyScalar((running ? RUN : WALK) * Math.min(1, mag));
      this.gestureAnim = null;
    }
    this.vel.x = damp(this.vel.x, target.x, 10, dt);
    this.vel.y = damp(this.vel.y, target.y, 10, dt);
    this.speed = this.vel.length();

    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.y * dt };
    collisions.resolve(p, RADIUS);
    // Soft boundary around the valley
    const dx = p.x - BASIN.x, dz = p.z - BASIN.z, r = Math.hypot(dx, dz);
    if (r > PLAY_RADIUS && !inCut(...caveFallsLocal(p.x, p.z))) { // (the cave waterfall's floor reaches a little further)
      p.x = BASIN.x + (dx / r) * PLAY_RADIUS;
      p.z = BASIN.z + (dz / r) * PLAY_RADIUS;
    }
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.pos.y = damp(this.pos.y, ground.heightAt(p.x, p.z), 14, dt);

    if (this.speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(-this.vel.x, -this.vel.y), 10, dt);
    this.gestureLeft -= dt;
    if (this.gestureAnim && this.gestureLeft <= 0) this.gestureAnim = null;
    this.avatar.anim = this.speed > 0.3 ? (this.speed > (WALK + RUN) / 2 ? 'run' : 'walk') : (this.gestureAnim ?? this.holdAnim ?? 'idle');
    this.avatar.hold = this.holdAnim; // walking, the arms keep what they hold
    this.sync(dt);
  }

  /** Steer the character directly (the entry screen's pacing monk), moving at `speed` m/s (0: standing still). */
  puppet(dt: number, x: number, y: number, z: number, yaw: number, speed: number) {
    this.speed = speed; // the legs keep pace with it
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.avatar.anim = speed > 0 ? 'walk' : 'idle';
    this.sync(dt);
  }

  private sync(dt: number) {
    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.yaw;
    this.avatar.update(dt, this.speed);
  }

  transform(flags = 0): Transform {
    const r = (n: number) => Math.round(n * 100) / 100;
    return [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), ANIMS.indexOf(this.avatar.anim), flags];
  }
}
