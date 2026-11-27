import type * as THREE from 'three';
import { STUPA_COURT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { damp } from '../core/math';
import type { Input } from '../core/input';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import { t } from '../i18n';

/**
 * 繞塔 on autopilot: Q in the stupa court sets you walking clockwise round the great stupa along a rounded square, and
 * mashing E sets the pace (nothing: you stand; a few presses a second: a walk; ten: nearly a run). Q again, or walking
 * yourself, ends it. There are several concentric lanes (the innermost first); you take the innermost one that isn't
 * crowded (about 2.5 m of lane per person), judged from the other circlers' positions. All the lanes steer clear of the
 * stupa's platform and altar, the incense burner and its table, the wheel galleries, the flag poles and the corner pavilions.
 */

/** Half-sizes of the lanes (m from the stupa's middle to the lane's side), innermost first. */
export const CIRCLE_LANES = [15.2, 22.4, 25.6, 28.8];
const CORNER_R = 3.5;
const SPACING = 2.5;
const V_MAX = 6.0, RATE_REF = 2, RATE_MAX = 10, WINDOW = 1.2;
const APPROACH = 3.8;
const PLATFORM_HALF = 12.6;

const laneLength = (h: number) => 8 * (h - CORNER_R) + 2 * Math.PI * CORNER_R;

/** The point (relative to the stupa) and heading at arc length `s` along the lane, clockwise from above, starting at the north side's west end. */
export function lanePoint(h: number, s: number): { x: number; z: number; dx: number; dz: number } {
  const r = CORNER_R, a = h - r, L = laneLength(h), arc = (Math.PI / 2) * r, str = 2 * a;
  s = ((s % L) + L) % L;
  const segs: [number, (u: number) => [number, number, number, number]][] = [
    [str, (u) => [-a + u, -h, 1, 0]],
    [arc, (u) => corner(a, -a, 0, u / r)],
    [str, (u) => [h, -a + u, 0, 1]],
    [arc, (u) => corner(a, a, Math.PI / 2, u / r)],
    [str, (u) => [a - u, h, -1, 0]],
    [arc, (u) => corner(-a, a, Math.PI, u / r)],
    [str, (u) => [-h, a - u, 0, -1]],
    [arc, (u) => corner(-a, -a, Math.PI * 1.5, u / r)],
  ];
  for (const [len, f] of segs) {
    if (s <= len) { const [x, z, dx, dz] = f(s); return { x, z, dx, dz }; }
    s -= len;
  }
  return { x: -a, z: -h, dx: 1, dz: 0 };
  function corner(cx: number, cz: number, th0: number, d: number): [number, number, number, number] {
    const th = th0 + d;
    return [cx + r * Math.sin(th), cz - r * Math.cos(th), Math.cos(th), Math.sin(th)];
  }
}

/** Which lane a point stands on (null: none). */
export function laneAt(x: number, z: number): number | null {
  const d = Math.max(Math.abs(x - STUPA_COURT.x), Math.abs(z - STUPA_COURT.z));
  let best = -1, bd = 1.6;
  CIRCLE_LANES.forEach((h, i) => { if (Math.abs(d - h) < bd) (bd = Math.abs(d - h)), (best = i); });
  return best < 0 ? null : best;
}

export class CircleWalk {
  active = false;
  /** Pace, m/s. */
  speed = 0;
  /** Started circling: put away whatever is in hand. */
  onStart: () => void = () => {};
  /** A press of E (the button's bounce). */
  onPress: () => void = () => {};
  lane = 0;
  private s = 0;
  private approaching = false;
  private presses: number[] = [];
  private lastPress = 0;

  constructor(private ctx: WorldContext, private player: LocalPlayer, private rig: CameraRig, private others: () => THREE.Vector3[]) {}

  /** Where in the court (outside the stupa's platform, inside the walls) a circle can be started. */
  inCourt(x: number, z: number) {
    const d = Math.max(Math.abs(x - STUPA_COURT.x), Math.abs(z - STUPA_COURT.z));
    return d > PLATFORM_HALF && d < STUPA_COURT.half - 0.6;
  }

  get canStart() {
    return !this.active && !this.player.flying && this.player.mode === 'free' && this.inCourt(this.player.pos.x, this.player.pos.z);
  }

  /** How fast we're mashing, 0 … 1. */
  get mashLevel() {
    return Math.min(1, this.rate() / RATE_MAX);
  }

  private rate() {
    const now = performance.now();
    while (this.presses.length && now - this.presses[0] > WINDOW * 1000) this.presses.shift();
    return this.presses.length / WINDOW;
  }

  start() {
    if (!this.canStart) return;
    const p = this.player.pos, cx = STUPA_COURT.x, cz = STUPA_COURT.z;
    // the innermost lane with room: others on it, against its length / 2.5 m each
    const mine = new Array(CIRCLE_LANES.length).fill(0);
    for (const o of this.others()) {
      const l = laneAt(o.x, o.z);
      if (l !== null) mine[l]++;
    }
    let lane = CIRCLE_LANES.findIndex((h, i) => mine[i] < Math.floor(laneLength(h) / SPACING));
    if (lane < 0) lane = CIRCLE_LANES.length - 1; // all full: the outermost takes the rest
    this.lane = lane;
    // the nearest point of the lane to where we stand
    const h = CIRCLE_LANES[lane], L = laneLength(h);
    let bs = 0, bd = Infinity;
    for (let s = 0; s < L; s += 0.1) {
      const q = lanePoint(h, s), d = Math.hypot(cx + q.x - p.x, cz + q.z - p.z);
      if (d < bd) (bd = d), (bs = s);
    }
    this.s = bs;
    this.approaching = bd > 0.05;
    this.speed = 0;
    this.presses = [];
    this.active = true;
    this.onStart();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.speed = 0;
    this.player.speed = 0;
    this.player.avatar.anim = 'idle';
    this.rig.setYaw(this.rig.yaw); // (the camera is free again)
  }

  pressE() {
    const now = performance.now();
    if (!this.active || now - this.lastPress < 80) return;
    this.lastPress = now;
    this.presses.push(now);
    this.onPress();
  }

  prompt(): { text: string; busy: boolean; mash: boolean } {
    return { text: t('prompt.circleMash'), busy: false, mash: true };
  }

  /** Per frame while active: ends itself if we walk off by hand or leave the court. */
  update(dt: number, input: Input) {
    if (!this.active) return;
    const p = this.player;
    if (input.isDown('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight') || input.stick.x || input.stick.y || p.mode !== 'free' || p.flying || Math.max(Math.abs(p.pos.x - STUPA_COURT.x), Math.abs(p.pos.z - STUPA_COURT.z)) > STUPA_COURT.half) {
      this.stop();
      return;
    }
    const rate = Math.min(RATE_MAX, this.rate());
    const target = rate > 0 ? (V_MAX * Math.log(1 + rate / RATE_REF)) / Math.log(1 + RATE_MAX / RATE_REF) : 0;
    this.speed = damp(this.speed, target, target > this.speed ? 5 : 1.8, dt);
    if (target === 0 && this.speed < 0.1) this.speed = 0;
    const cx = STUPA_COURT.x, cz = STUPA_COURT.z, h = CIRCLE_LANES[this.lane];
    let x = p.pos.x, z = p.pos.z, yaw = p.yaw, v = this.speed;
    if (this.approaching) {
      const q = lanePoint(h, this.s), tx = cx + q.x, tz = cz + q.z, dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
      v = Math.max(APPROACH, this.speed);
      const step = Math.min(d, v * dt);
      if (d > 1e-4) { x += (dx / d) * step; z += (dz / d) * step; yaw = Math.atan2(-dx, -dz); }
      if (d - step < 0.03) this.approaching = false;
    } else {
      this.s += v * dt;
      const q = lanePoint(h, this.s);
      x = cx + q.x;
      z = cz + q.z;
      if (v > 0.01) yaw = Math.atan2(-q.dx, -q.dz);
    }
    const y = this.ctx.ground.heightAt(x, z);
    p.puppet(dt, x, y, z, yaw, v > 0.15 ? v : 0, v > 4.9);
  }
}
