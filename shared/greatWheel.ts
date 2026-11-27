// The great prayer wheel's rules, shared: the server runs them for everyone; a client with no connection runs them alone.
// The "openings" are only eight places round the wheel (45° apart) where a rider can stand; the wheel itself is one plain cylinder.
// No outside dependencies.

/** The great wheels (the server keeps one sim for each; their places are in the client's layout). */
export const GW_IDS = ['west', 'east', 'north-west', 'north-east'] as const;
export type GreatWheelId = (typeof GW_IDS)[number];
export const isGwId = (v: unknown): v is GreatWheelId => (GW_IDS as readonly unknown[]).includes(v);

/** Openings round the wheel, and stairs to the pavilion (N, E, S, W = 0, 1, 2, 3). */
export const GW_OPENINGS = 8;
export const GW_STAIRS = 4;
/** The wheel's body, the rail round it at hand height, and where a rider stands (just outside the rail, right hand on it), from the axle (m). */
export const GW_WHEEL_R = 4.0;
export const GW_RAIL_R = 4.2;
export const GW_RIDER_R = 4.85;
/** Walking pace (m/s): the player's WALK in client/src/player/localPlayer.ts. */
export const GW_WALK = 3.8;
/**
 * Riders turn it by mashing E; every press by every rider is pooled. The pace (m/s at the riders) is
 * GW_MAX_PACE · ln(1 + rate / GW_RATE_SCALE) / ln(1 + GW_TOP_RATE / GW_RATE_SCALE), rate = pooled presses per second over the
 * last GW_WINDOW_S seconds, clamped at the top: about 20 a second pooled is top speed (more than one person can press: a
 * player is held to GW_MAX_PRESS_HZ), so one person at ~6/s gets about 40% of it, a slow walk.
 */
export const GW_WINDOW_S = 1.5;
export const GW_MAX_PACE = 4.5;
export const GW_TOP_RATE = 20;
export const GW_RATE_SCALE = 20;
/**
 * A heavy flywheel: it is still until someone mashes. Presses speed it up toward the pace they call for (GW_EASE_S); with none
 * it only loses speed to a light friction (GW_FRICTION_S: from top speed about 20 s to wind down), then creeps (GW_CREEP, rad/s)
 * to the next 45° mark and stops, riders or not. Getting off is at once, from wherever they are.
 * Most presses counted per player per second: GW_MAX_PRESS_HZ.
 */
export const GW_EASE_S = 1.5;
export const GW_FRICTION_S = 12;
export const GW_CREEP = 0.2;
export const GW_MAX_PRESS_HZ = 15;
/** The pace (rad/s) that a press rate gives. */
export const gwOmega = (pressesPerSec: number) => (GW_MAX_PACE * Math.min(1, Math.log(1 + pressesPerSec / GW_RATE_SCALE) / Math.log(1 + GW_TOP_RATE / GW_RATE_SCALE))) / GW_RIDER_R;

/** From the foot of a staircase: the first place in its queue (m from the axle), and the gap between places. */
export const GW_QUEUE_R0 = 11.4;
export const GW_QUEUE_GAP = 0.95;
/** Walking from the first queue place to an opening (s), and from an opening down a staircase and aside (s, at least). */
export const GW_BOARD_S = (GW_QUEUE_R0 - GW_RIDER_R) / GW_WALK;
export const GW_EXIT_S = 4.5;
export const GW_MAX_QUEUE = 12;

const TAU = Math.PI * 2, QUARTER = Math.PI / 2, EIGHTH = Math.PI / 4;
/** x mod m, in [0, m). */
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Compass azimuth (clockwise from north) of opening k when the wheel is at `angle`. */
export const openingAzimuth = (angle: number, k: number) => angle + k * EIGHTH;

/** What every client needs to draw the wheel and its queues. */
export interface GreatWheelState {
  /** Wheel angle (rad, clockwise seen from above) at the moment this was made. */
  angle: number;
  /** Its speed then (rad/s): clients carry the angle on at this speed until the next state. */
  omega: number;
  moving: boolean;
  /** Slowing to a halt: the mark (a multiple of 45°) it stops at. */
  stop: number | null;
  /** Who is in (or walking into) each opening. */
  openings: (string | null)[];
  /** The queue at each stair, first to last. */
  queues: string[][];
}

type Phase = 'queued' | 'boarding' | 'riding' | 'exiting';
interface Rider { stair: number; phase: Phase; opening: number; until: number }

export interface GreatWheelEvents {
  /** Walk from the head of the queue into opening `opening` (arriving in GW_BOARD_S). */
  board: (id: string, opening: number, stair: number) => void;
  /** Let go and walk off, straight out from where they stand. */
  exit: (id: string) => void;
}

export class GreatWheelSim {
  angle = 0;
  omega = 0;
  private time = 0;
  private presses: number[] = [];
  private riders = new Map<string, Rider>();
  private queues: string[][] = Array.from({ length: GW_STAIRS }, () => []);
  private openings: (string | null)[] = Array(GW_OPENINGS).fill(null);
  /** How far each opening is from being at each stair, less the lead for walking in: boarding starts as this crosses zero. */
  private gap = new Float64Array(GW_STAIRS * GW_OPENINGS).fill(1);
  private settling = false;
  /** Bumps whenever who is where changes (so a server knows to broadcast). */
  version = 0;

  constructor(private on: GreatWheelEvents) {}

  get moving() {
    return this.omega > 0;
  }

  private count(phase: Phase) {
    let n = 0;
    for (const r of this.riders.values()) if (r.phase === phase) n++;
    return n;
  }

  has(id: string) {
    return this.riders.has(id);
  }

  join(id: string, stair: number) {
    if (!Number.isInteger(stair) || stair < 0 || stair >= GW_STAIRS || this.riders.has(id) || this.queues[stair].length >= GW_MAX_QUEUE) return false;
    this.riders.set(id, { stair, phase: 'queued', opening: -1, until: 0 });
    this.queues[stair].push(id);
    this.version++;
    return true;
  }

  /** One press of E by a rider (the caller limits how often). Only those riding count. */
  press(id: string) {
    if (this.riders.get(id)?.phase !== 'riding') return false;
    this.presses.push(this.time);
    return true;
  }

  /** Leave the queue, or get off the wheel at once. */
  leave(id: string) {
    const r = this.riders.get(id);
    if (!r) return false;
    if (r.phase === 'queued') return this.remove(id);
    if (r.phase === 'riding') { // let go at once, wherever the wheel is
      this.openings[r.opening] = null;
      r.phase = 'exiting';
      r.until = this.time + GW_EXIT_S;
      r.opening = -1;
      this.version++;
      this.on.exit(id);
      return true;
    }
    return false;
  }

  /** Gone (a dropped connection, or finished). */
  remove(id: string) {
    const r = this.riders.get(id);
    if (!r) return false;
    this.riders.delete(id);
    const q = this.queues[r.stair], i = q.indexOf(id);
    if (i >= 0) q.splice(i, 1);
    if (r.opening >= 0 && this.openings[r.opening] === id) this.openings[r.opening] = null;
    this.version++;
    return true;
  }

  state(): GreatWheelState {
    const stop = this.settling && this.moving ? Math.ceil(this.angle / EIGHTH - 1e-9) * EIGHTH : null;
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    return { angle: r4(this.angle), omega: r4(this.omega), moving: this.moving, stop: stop === null ? null : r4(stop), openings: [...this.openings], queues: this.queues.map((q) => [...q]) };
  }

  private startBoarding(id: string, s: number, k: number) {
    const r = this.riders.get(id)!;
    this.queues[s].shift();
    r.phase = 'boarding';
    r.opening = k;
    r.until = this.time + GW_BOARD_S;
    this.openings[k] = id;
    this.version++;
    this.on.board(id, k, s);
  }

  /** Advance by dt seconds. */
  step(dt: number) {
    this.time += dt;
    for (const [id, r] of [...this.riders]) {
      if (r.phase === 'boarding' && this.time >= r.until) (r.phase = 'riding'), this.version++;
      else if (r.phase === 'exiting' && this.time >= r.until) this.remove(id);
    }
    // The pooled press rate → the pace it eases toward
    while (this.presses.length && this.time - this.presses[0] > GW_WINDOW_S) this.presses.shift();
    const riding = this.count('riding');
    if (!riding) this.presses.length = 0;
    const rate = this.presses.length / GW_WINDOW_S;
    const wasMoving = this.moving;
    // A flywheel: the pooled presses raise it toward the pace they call for; otherwise only friction slows it.
    const target = gwOmega(rate);
    let omega = target > this.omega ? this.omega + (target - this.omega) * (1 - Math.exp(-dt / GW_EASE_S)) : this.omega * Math.exp(-dt / GW_FRICTION_S);
    const coasting = rate === 0;
    if (coasting && omega < GW_CREEP * 1.25) omega = this.moving ? Math.max(omega, GW_CREEP) : 0; // (slowed to a creep: on to the mark)
    this.settling = coasting && omega <= GW_CREEP * 1.25;
    const before = this.angle;
    let d = omega * dt;
    if (this.settling && omega > 0) {
      const frac = before / EIGHTH, ahead = Math.abs(frac - Math.round(frac)) < 1e-9 ? 0 : (Math.ceil(frac) - frac) * EIGHTH;
      if (ahead <= d) {
        d = ahead; // on the mark: stop
        omega = 0;
      }
    }
    this.omega = omega;
    this.angle = mod(omega > 0 ? before + d : Math.round((before + d) / EIGHTH) * EIGHTH, TAU);
    if (this.moving !== wasMoving) this.version++;

    // The head of each queue steps on: at once when the wheel is at rest (every stair faces a place);
    // while it turns, where a place will be at the stair just as they get there.
    const still = !this.moving;
    for (let s = 0; s < GW_STAIRS; s++) {
      const head = this.queues[s][0], busyStair = [...this.riders.values()].some((r) => r.stair === s && r.phase === 'boarding');
      for (let k = 0; k < GW_OPENINGS; k++) {
        const rem = mod(s * QUARTER - openingAzimuth(this.angle, k) + 1e-6, TAU) - 1e-6, g = rem - this.omega * GW_BOARD_S, gi = s * GW_OPENINGS + k;
        const crossed = this.gap[gi] > 0 && g <= 0 && this.omega > 0.05 && rem > 1e-3; // (nearer than that and it has gone by)
        this.gap[gi] = g;
        if (!head || busyStair || this.openings[k] || !this.queues[s].length || this.queues[s][0] !== head) continue;
        if ((still && rem < 2e-6) || (!still && crossed)) {
          this.startBoarding(head, s, k);
          break;
        }
      }
    }
  }
}
