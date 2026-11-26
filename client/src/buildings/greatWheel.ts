import * as THREE from 'three';
import {
  GW_BOARD_S, GW_MAX_PRESS_HZ, GW_MAX_QUEUE, GW_OPENINGS, GW_QUEUE_GAP, GW_QUEUE_R0, GW_RIDER_R, GW_STAIRS, GW_WALK,
  GreatWheelSim, openingAzimuth, type GreatWheelState,
} from '../../../shared/greatWheel';
import { GREAT_WHEEL } from '../config/layout';
import type { WorldContext } from '../core/context';
import { clamp, damp, smoothstep } from '../core/math';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import { buildGreatWheelModel } from './greatWheelModel';

/**
 * 大轉經輪: the great prayer wheel — block-out. A square open pavilion on a plinth (four steps up, a stair on each side),
 * and in it a gold cylinder on an axle, one plain shape, with a rail round it at hand height. Eight places ("openings", 45°
 * apart, invisible) stand just outside the rail. Nobody can walk up: E at the foot of a stair joins its queue; with the wheel at
 * rest every stair faces a place and you step on at once, and then it turns at walking pace (only while someone rides, never
 * for those waiting), your right hand on the rail, clockwise. E again to get off at the next stair. The rules (and the server's copy of them) are in shared/greatWheel.ts; this draws
 * the wheel and walks your own character — everyone else is seen through the usual player snapshots.
 */

const STEP_H = 0.25, STEP_D = 0.6, STAIR_W = 3.6;
/** The sideways step a rider takes at the foot of the stairs, so the queue's head isn't stood in. */
const SIDE_STEP = 2.6;

type Phase = 'free' | 'queued' | 'boarding' | 'riding' | 'exiting';
const EMPTY: GreatWheelState = { angle: 0, omega: 0, moving: false, stop: null, openings: Array(GW_OPENINGS).fill(null), queues: [[], [], [], []] };

/** Unit vector (x, z) of compass azimuth ψ: 0 = north, clockwise. */
const dirOf = (psi: number): [number, number] => [Math.sin(psi), -Math.cos(psi)];

export class GreatWheel {
  /** Our character is in the wheel's hands (queueing, riding, stepping out): the game must not walk it. */
  controlling = false;
  /** Riding, right hand out on the rail. */
  get turning() {
    return this.phase === 'riding';
  }
  private phase: Phase = 'free';
  private stair = 0;
  private opening = -1;
  private snap: GreatWheelState = EMPTY;
  private snapAt = performance.now();
  private sim: GreatWheelSim;
  private root = new THREE.Group();
  private wheel = new THREE.Group();
  private base: number;
  private waitUntil = 0;
  private t0 = 0;
  private from = new THREE.Vector3();
  private path: [number, number][] = [];
  private pathLen = 0;
  private yCur = 0;

  constructor(private ctx: WorldContext, private net: NetClient, private player: LocalPlayer, private rig: CameraRig) {
    const c = GREAT_WHEEL;
    this.base = ctx.ground.heightAt(c.x, c.z);
    this.sim = this.makeSim();
    this.build();
    ctx.updaters.push((dt) => this.update(dt));
    net.on('gw', (s) => this.onState(s));
    net.on('welcome', (m) => {
      this.sim = this.makeSim(); // (anything we ran alone is over: the server's wheel is the wheel)
      this.onState(m.gw ?? EMPTY);
    });
    net.on('gwDo', (ev, opening, stair) => (ev === 'board' ? this.board(opening, stair) : ev === 'exit' ? this.exit() : this.denied()));
    if (import.meta.env.DEV && Math.abs(GW_WALK - 3.8) > 1e-9) console.warn('GW_WALK differs from the player walk speed');
  }

  private makeSim() {
    return new GreatWheelSim({
      board: (id, k, s) => id === this.net.id && this.board(k, s),
      exit: (id) => id === this.net.id && this.exit(),
    });
  }

  private get online() {
    return this.net.status === 'online';
  }

  // ---------------------------------------------------------------- geometry
  private build() {
    const c = GREAT_WHEEL, H = c.half, P = c.plinth;
    const g = this.root;
    g.name = 'great-wheel';
    g.position.set(c.x, this.base, c.z);
    this.ctx.scene.add(g);
    g.add(this.wheel);
    buildGreatWheelModel(g, this.wheel, H, P, STEP_H, STEP_D, STAIR_W);

    // Nobody walks up: the plinth and each stair are solid. The stairs are only to look at (and to queue at the foot of).
    const col = this.ctx.collisions;
    col.addBoxCentered(c.x, c.z, H * 2 + 0.4, H * 2 + 0.4);
    for (let s = 0; s < GW_STAIRS; s++) {
      const [dx, dz] = dirOf(s * Math.PI / 2), d = H + STEP_D * 1.5;
      col.addBoxCentered(c.x + dx * d, c.z + dz * d, Math.abs(dz) > 0.5 ? STAIR_W + 0.4 : STEP_D * 3 + 0.2, Math.abs(dz) > 0.5 ? STEP_D * 3 + 0.2 : STAIR_W + 0.4);
      // E at the foot of a stair
      const [fx, fz] = this.at(s, GW_QUEUE_R0 - 1);
      this.ctx.interactions.add({
        id: `great-wheel-${s}`, x: fx, z: fz, radius: 3,
        prompt: () => (this.phase !== 'free' || this.player.mode !== 'free' ? null : this.snap.queues[s].length >= GW_MAX_QUEUE ? { text: t('prompt.gwFull'), busy: true } : { text: t('prompt.gwJoin') }),
        onInteract: () => this.join(s),
      });
    }
  }

  /** The point on stair `s`'s axis, `r` metres from the axle. */
  private at(s: number, r: number, lateral = 0): [number, number] {
    const [dx, dz] = dirOf(s * Math.PI / 2);
    return [GREAT_WHEEL.x + dx * r - dz * lateral, GREAT_WHEEL.z + dz * r + dx * lateral];
  }

  /** Height of the floor, stairs and ground round the pavilion. */
  private floorAt(x: number, z: number) {
    const c = GREAT_WHEEL, ax = Math.abs(x - c.x), az = Math.abs(z - c.z), along = Math.max(ax, az), lat = Math.min(ax, az);
    if (along <= c.half) return this.base + c.plinth;
    if (lat <= STAIR_W / 2 && along < c.half + STEP_D * 3) return this.base + c.plinth - STEP_H * (1 + Math.floor((along - c.half) / STEP_D));
    return this.ctx.ground.heightAt(x, z);
  }

  // ---------------------------------------------------------------- state
  private angle() {
    if (!this.online) return this.sim.angle;
    const s = this.snap;
    if (!s.moving) return s.angle;
    // (it eases its speed on the server; the angle is carried on at the last speed sent, and corrected ten times a second)
    const a = s.angle + (s.omega * (performance.now() - this.snapAt)) / 1000;
    return s.stop !== null ? Math.min(a, s.stop) : a;
  }

  private onState(s: GreatWheelState) {
    this.snap = s;
    this.snapAt = performance.now();
    const me = this.net.id;
    if (this.phase === 'queued' && performance.now() > this.waitUntil && !s.queues.some((q) => q.includes(me)) && !s.openings.includes(me)) this.release(true);
    else if (this.phase === 'riding' && s.openings[this.opening] !== me) this.release(true);
  }

  // ---------------------------------------------------------------- our person
  private join(stair: number) {
    if (this.phase !== 'free' || this.player.mode !== 'free' || this.player.flying) return;
    if (this.online) {
      if (!this.net.gwJoin(stair)) return;
      this.waitUntil = performance.now() + 2500; // until the server's list shows us
    } else if (!this.sim.join(this.net.id, stair)) return;
    this.phase = 'queued';
    this.stair = stair;
    this.take();
  }

  private take() {
    this.controlling = true;
    this.player.mode = 'ritual';
    this.yCur = this.player.pos.y;
  }

  /** Give the character back. `home`: stand at the foot of the nearest stair (the wheel was reset under us). */
  private release(home = false) {
    if (home || this.phase === 'riding' || this.phase === 'boarding') {
      const p = this.player.pos, c = GREAT_WHEEL, s = Math.round(Math.atan2(p.x - c.x, -(p.z - c.z)) / (Math.PI / 2) + 4) % 4;
      const [x, z] = this.at(s, GW_QUEUE_R0 + 1, SIDE_STEP);
      p.set(x, this.ctx.ground.heightAt(x, z), z);
    }
    this.phase = 'free';
    this.controlling = false;
    this.opening = -1;
    this.player.release();
    this.rig.setYaw(this.rig.yaw); // (the camera is free again)
  }

  private denied() {
    if (this.phase === 'queued') this.release();
  }

  private board(opening: number, stair: number) {
    if (this.phase !== 'queued') return;
    this.phase = 'boarding';
    this.opening = opening;
    this.stair = stair;
    this.t0 = performance.now();
    this.from.copy(this.player.pos);
  }

  /** Let go and walk off: on foot along the floor round the wheel (clear of the rail and the pillars) the shorter way to the nearest stair, then down it and aside. */
  private exit() {
    if (this.phase !== 'riding' && this.phase !== 'boarding') return;
    this.phase = 'exiting';
    const c = GREAT_WHEEL, p = this.player.pos, TAU = Math.PI * 2;
    const psi = Math.atan2(p.x - c.x, -(p.z - c.z)), stair = ((Math.round(psi / (Math.PI / 2)) % GW_STAIRS) + GW_STAIRS) % GW_STAIRS;
    this.stair = stair;
    let delta = stair * (Math.PI / 2) - psi;
    delta -= Math.round(delta / TAU) * TAU; // the shorter way round (at most 45°)
    const ARC_R = 6.0, steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.15)), r0 = Math.hypot(p.x - c.x, p.z - c.z);
    this.path = [[p.x, p.z]];
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, a = psi + delta * u, r = r0 + (ARC_R - r0) * Math.min(1, u * 3); // out to a safe radius within the first third, then round
      const [dx, dz] = dirOf(a);
      this.path.push([c.x + dx * r, c.z + dz * r]);
    }
    const out = GW_QUEUE_R0 - 1.2;
    this.path.push(this.at(stair, out), this.at(stair, out, SIDE_STEP)); // straight down the stair, then aside
    this.pathLen = 0;
    for (let i = 1; i < this.path.length; i++) this.pathLen += Math.hypot(this.path[i][0] - this.path[i - 1][0], this.path[i][1] - this.path[i - 1][1]);
    this.t0 = performance.now();
  }

  private lastPress = 0;

  /** E while riding: one press of the pooled mashing that turns the wheel (the server counts at most GW_MAX_PRESS_HZ a second from us). */
  pressE() {
    const now = performance.now();
    if (this.phase !== 'riding' || now - this.lastPress < 1000 / GW_MAX_PRESS_HZ) return;
    this.lastPress = now;
    if (this.online) this.net.gwPress();
    else this.sim.press(this.net.id);
  }

  /** Q: leave the queue, or let go of the wheel at once and walk to the nearest stair. */
  getOff() {
    if (this.phase === 'queued') {
      if (this.online) this.net.gwLeave();
      else this.sim.leave(this.net.id);
      this.release();
    } else if (this.phase === 'riding') {
      if (this.online) this.net.gwLeave(); // (the server's word starts the walk)
      else this.sim.leave(this.net.id);
    }
  }

  /** There is something for Q (or the Get off button) to do. */
  get canLeave() {
    return this.phase === 'queued' || this.phase === 'riding';
  }

  /** The prompt while we're in the wheel's hands (no E badge: the keys are in the words). */
  prompt(): { text: string; busy: boolean } | null {
    if (this.phase === 'queued') return { text: t('prompt.gwLeaveQueue'), busy: true };
    if (this.phase === 'riding') return { text: t('prompt.gwGetOff'), busy: true };
    return null;
  }

  // ---------------------------------------------------------------- per frame
  private update(dt: number) {
    if (!this.online) {
      this.sim.step(dt);
      this.snap = this.sim.state();
    }
    this.wheel.rotation.y = -this.angle();
    this.player.avatar.wheelArm = this.phase === 'riding';
    if (this.phase === 'free') return;
    const p = this.player, c = GREAT_WHEEL, now = performance.now();
    let x = p.pos.x, z = p.pos.z, yaw = p.yaw, speed = 0, y = this.yCur;
    const walk = (tx: number, tz: number) => {
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz), step = Math.min(d, GW_WALK * dt);
      if (d > 1e-4) { x += (dx / d) * step; z += (dz / d) * step; }
      if (step > 1e-3 && d > 0.02) { speed = GW_WALK; yaw = Math.atan2(-dx, -dz); }
      return d;
    };
    if (this.phase === 'queued') {
      // in line at the foot of our stair, facing the wheel
      const q = this.snap.queues[this.stair], i = q.indexOf(this.net.id), j = i >= 0 ? i : q.length;
      const [tx, tz] = this.at(this.stair, GW_QUEUE_R0 + j * GW_QUEUE_GAP);
      if (walk(tx, tz) < 0.03) yaw = Math.atan2(-(c.x - x), -(c.z - z));
    } else if (this.phase === 'boarding') {
      // straight in along the stair's axis; the opening arrives at the end of the walk
      const u = clamp((now - this.t0) / 1000 / GW_BOARD_S, 0, 1);
      const [ax, az] = this.at(this.stair, GW_QUEUE_R0 + (GW_RIDER_R - GW_QUEUE_R0) * u);
      const [nx, nz] = this.niche();
      const w = u ** 4, e = smoothstep(0, 0.25, u);
      const px = ax * (1 - w) + nx * w, pz = az * (1 - w) + nz * w;
      const yaw0 = Math.atan2(-(px - x), -(pz - z));
      if (Math.hypot(px - x, pz - z) > 1e-3) yaw = yaw0;
      x = this.from.x * (1 - e) + px * e;
      z = this.from.z * (1 - e) + pz * e;
      speed = GW_WALK;
      if (u >= 1) this.phase = 'riding';
    }
    if (this.phase === 'riding') {
      [x, z] = this.niche();
      const psi = openingAzimuth(this.angle(), this.opening);
      yaw = Math.atan2(-Math.cos(psi), -Math.sin(psi)); // along the way it turns
      speed = (this.online ? this.snap.omega : this.sim.omega) * GW_RIDER_R; // the legs keep pace with the wheel
      this.rig.lookAlong(yaw); // the camera turns with the rider, staying behind them
    } else if (this.phase === 'exiting') {
      const k = ((now - this.t0) / 1000) * GW_WALK;
      let rest = k, i = 1;
      const seg = (n: number) => Math.hypot(this.path[n][0] - this.path[n - 1][0], this.path[n][1] - this.path[n - 1][1]);
      while (i < this.path.length - 1 && rest > seg(i)) rest -= seg(i++);
      const [ax, az] = this.path[i - 1], [bx, bz] = this.path[i], f = Math.min(1, rest / (seg(i) || 1));
      x = ax + (bx - ax) * f;
      z = az + (bz - az) * f;
      yaw = Math.atan2(-(bx - ax), -(bz - az));
      speed = k < this.pathLen ? GW_WALK : 0;
      if (k >= this.pathLen) {
        p.pos.set(x, this.ctx.ground.heightAt(x, z), z);
        p.yaw = yaw;
        this.phase = 'free';
        this.controlling = false;
        p.release();
        this.rig.setYaw(this.rig.yaw);
        return;
      }
    }
    // up and down the steps without popping
    this.yCur = y = damp(this.yCur, this.floorAt(x, z), 18, dt);
    p.puppet(dt, x, y, z, yaw, speed);
  }

  /** Where opening `this.opening` is now. */
  private niche(): [number, number] {
    const [dx, dz] = dirOf(openingAzimuth(this.angle(), this.opening));
    return [GREAT_WHEEL.x + dx * GW_RIDER_R, GREAT_WHEEL.z + dz * GW_RIDER_R];
  }
}
