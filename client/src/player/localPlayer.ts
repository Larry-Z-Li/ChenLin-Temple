import * as THREE from 'three';
import { ANIMS, type Anim, type Transform } from '../../../shared/protocol';
import { BASIN, PLAY_RADIUS, SPAWN } from '../config/layout';
import type { CollisionWorld } from '../core/collisions';
import type { Ground } from '../core/ground';
import type { Input } from '../core/input';
import { damp, dampAngle } from '../core/math';
import { Avatar } from './avatar';

const WALK = 2.6, RUN = 5.2, RADIUS = 0.32;

export type PlayerMode = 'free' | 'seated';

export class LocalPlayer {
  readonly avatar: Avatar;
  readonly pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  yaw = SPAWN.yaw;
  mode: PlayerMode = 'free';
  speed = 0;
  private vel = new THREE.Vector2();
  private anchorAnim: Anim = 'kneel';

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

  update(dt: number, input: Input, camYaw: number, collisions: CollisionWorld, ground: Ground) {
    if (this.mode !== 'free') {
      this.avatar.anim = this.anchorAnim;
      this.sync(dt);
      return;
    }
    let mx = 0, mz = 0;
    if (input.isDown('KeyW', 'ArrowUp')) mz -= 1;
    if (input.isDown('KeyS', 'ArrowDown')) mz += 1;
    if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) mx += 1;

    const running = input.isDown('ShiftLeft', 'ShiftRight');
    const target = new THREE.Vector2();
    if (mx || mz) {
      // Camera-relative: forward = (-sin θ, -cos θ), right = (cos θ, -sin θ)
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      target.set(-s * -mz + c * mx, -c * -mz - s * mx).normalize().multiplyScalar(running ? RUN : WALK);
    }
    this.vel.x = damp(this.vel.x, target.x, 10, dt);
    this.vel.y = damp(this.vel.y, target.y, 10, dt);
    this.speed = this.vel.length();

    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.y * dt };
    collisions.resolve(p, RADIUS);
    // Soft boundary around the valley
    const dx = p.x - BASIN.x, dz = p.z - BASIN.z, r = Math.hypot(dx, dz);
    if (r > PLAY_RADIUS) {
      p.x = BASIN.x + (dx / r) * PLAY_RADIUS;
      p.z = BASIN.z + (dz / r) * PLAY_RADIUS;
    }
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.pos.y = damp(this.pos.y, ground.heightAt(p.x, p.z), 14, dt);

    if (this.speed > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(-this.vel.x, -this.vel.y), 10, dt);
    this.avatar.anim = this.speed > 0.3 ? (this.speed > (WALK + RUN) / 2 ? 'run' : 'walk') : 'idle';
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
