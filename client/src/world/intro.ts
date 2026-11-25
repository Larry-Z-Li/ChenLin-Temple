import * as THREE from 'three';
import { STUPA_COURT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { clamp, damp, dampAngle } from '../core/math';
import type { LocalPlayer } from '../player/localPlayer';

/** Walking pace (m/s): unhurried, but going somewhere. */
const CRUISE = 1.1;
/** Speeding up and slowing down (m/s²). */
const ACCEL = 0.5;
/** At each end he walks round a small circle (this radius) instead of spinning on the spot, at this pace. */
const TURN_R = 0.35, TURN_V = 0.35;
/** Seconds spent halfway round each turn, facing out over the valley. */
const GAZE = 2.5;
/** The stretch he paces: as long as the ground allows, within these (metres). */
const MIN_LEN = 40, MAX_LEN = 80;
/** Spacing of the walk's centre line (metres). */
const STEP = 0.5;

interface LinePoint { x: number; z: number; tx: number; tz: number; nx: number; nz: number }

/**
 * The entry screen: your monk strolls back and forth on the ridge walk behind the mountain stupas,
 * hands folded. The camera follows from uphill, looking out over him and the stupas to the valley
 * and the temple below, so the stupas slide past in the foreground as he walks.
 *
 * He keeps to a gentle, nearly straight stretch of the walk (no steep pitches, no zig-zags, never out
 * of the camera's sight), eases down at each end, walks round a small turn, stops halfway round to
 * look out over the valley, and walks back.
 */
export class Intro {
  /** The stretch's centre line, every STEP metres, with its tangent and the normal toward the valley. */
  private line: LinePoint[] = [];
  private step = STEP;
  private total = 0;
  private u = 0;
  private dir = 1;
  private v = CRUISE;
  private stage: 'walk' | 'turn' | 'gaze' = 'walk';
  /** How far round the turn (0 → π); he stops at π/2 to look out. */
  private turnA = 0;
  private gazed = false;
  private wait = 0;
  private yaw = 0;
  private camPos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private started = false;

  constructor(private ctx: WorldContext, private camera: THREE.PerspectiveCamera, private player: LocalPlayer, ridge: [number, number][]) {
    // Follow the same curve the gravel ribbon is laid on.
    if (ridge.length < 2) ridge = [[-210, 0], [-200, 18]];
    const curve = new THREE.CatmullRomCurve3(ridge.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const [from, to] = this.pickStretch(curve);
    const len = curve.getLength(), n = Math.max(2, Math.round((to - from) / STEP));
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const s = (from + ((to - from) * i) / n) / len;
      curve.getPointAt(s, p);
      curve.getTangentAt(s, t);
      const tl = Math.hypot(t.x, t.z) || 1, tx = t.x / tl, tz = t.z / tl;
      // the normal on the valley side (where the stupas and the temple are)
      const flip = -tz * (STUPA_COURT.x - p.x) + tx * (STUPA_COURT.z - p.z) < 0 ? -1 : 1;
      this.line.push({ x: p.x, z: p.z, tx, tz, nx: -tz * flip, nz: tx * flip });
    }
    this.step = (to - from) / n;
    this.total = to - from;
    this.u = this.total * 0.5;
  }

  /**
   * Where along the ridge walk to pace (metres along the curve): the longest stretch that is gentle
   * (no steep pitch, no sharp bend), clear of the walk's ends and of anything to bump into, keeps him
   * in the camera's view all along, and looks out most openly over the valley.
   */
  private pickStretch(curve: THREE.CatmullRomCurve3): [number, number] {
    const g = this.ctx.ground, len = curve.getLength(), N = Math.max(2, Math.floor(len));
    const A = curve.getSpacedPoints(N).map((v) => [v.x, v.z] as const);
    const H = A.map(([x, z]) => g.heightAt(x, z));
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
    const foot = new THREE.Vector3(), head = new THREE.Vector3(), q = { x: 0, z: 0 };
    const slope: number[] = [], bend: number[] = [], view: number[] = [], bad: boolean[] = [];
    for (let k = 0; k <= N; k++) {
      const a = Math.max(0, k - 2), b = Math.min(N, k + 2);
      slope.push(Math.abs(H[b] - H[a]) / Math.max(1, b - a));
      const a3 = Math.max(0, k - 3), b3 = Math.min(N, k + 3);
      let d = Math.atan2(A[b3][0] - A[k][0], A[b3][1] - A[k][1]) - Math.atan2(A[k][0] - A[a3][0], A[k][1] - A[a3][1]);
      d = Math.abs(((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      bend.push(k - a3 && b3 - k ? d / 3 : 0); // radians per metre
      // Ground rising between him and the valley hides the view.
      const [x, z] = A[k], y = H[k], dx = STUPA_COURT.x - x, dz = STUPA_COURT.z - z, l = Math.hypot(dx, dz) || 1;
      let block = 0;
      for (const s of [5, 10, 15, 20]) block += Math.max(0, g.heightAt(x + (dx / l) * s, z + (dz / l) * s) - y + 1);
      view.push(block);
      // In the camera's view from start to finish?
      const shot = this.shot(x, y, z);
      cam.position.copy(shot.cam);
      cam.lookAt(shot.look);
      cam.updateMatrixWorld();
      foot.set(x, y, z).project(cam);
      head.set(x, y + 1.7, z).project(cam);
      let blocked = foot.y < -0.9 || head.y > 0.9 || Math.abs(foot.x) > 0.9;
      // Nothing in the way: a lantern, a stupa's platform… (either side of the line he keeps to, and round the turns).
      const ax = A[Math.min(N, k + 1)][0] - A[Math.max(0, k - 1)][0], az = A[Math.min(N, k + 1)][1] - A[Math.max(0, k - 1)][1];
      const tl = Math.hypot(ax, az) || 1, tx = ax / tl, tz = az / tl;
      for (const [ox, oz] of [[-tz, tx], [tz, -tx], [tx, tz], [-tx, -tz]]) {
        q.x = x + ox * (TURN_R + 0.1);
        q.z = z + oz * (TURN_R + 0.1);
        this.ctx.collisions.resolve(q, 0.32);
        if (Math.hypot(q.x - x - ox * (TURN_R + 0.1), q.z - z - oz * (TURN_R + 0.1)) > 1e-3) blocked = true;
      }
      bad.push(blocked);
    }
    // Every window of whole metres clear of the walk's ends: the gentlest, then the most open; longer is a little better.
    const margin = Math.min(12, Math.floor(N / 4));
    let best: [number, number] = [margin, Math.min(N - margin, margin + MIN_LEN)], bestCost = Infinity;
    for (let w = MAX_LEN; w >= MIN_LEN; w -= 5)
      for (let i = margin; i + w <= N - margin; i++) {
        let maxSlope = 0, maxBend = 0, sumView = 0, nBad = 0;
        for (let k = i; k <= i + w; k++) {
          maxSlope = Math.max(maxSlope, slope[k]);
          maxBend = Math.max(maxBend, bend[k]);
          sumView += view[k];
          if (bad[k]) nBad++;
        }
        const gentle = maxSlope <= 0.25 && maxBend <= 0.035;
        const cost = (nBad ? 100 + nBad : 0) + (gentle ? 0 : 10) + 4 * maxSlope + 20 * maxBend + (0.03 * sumView) / (w + 1) - 0.01 * w;
        if (cost < bestCost) [best, bestCost] = [[i, i + w], cost];
      }
    return [(best[0] * len) / N, (best[1] * len) / N];
  }

  /** The camera, wherever he stands. */
  private shot(x: number, y: number, z: number) {
    const g = this.ctx.ground;
    // Uphill of him and a little to his left, looking out toward the temple: over the stupas
    // (which slide past as he walks) to the valley and the temple, him on the right of the frame.
    const vl = Math.hypot(STUPA_COURT.x - x, STUPA_COURT.z - z) || 1;
    const vx = (STUPA_COURT.x - x) / vl, vz = (STUPA_COURT.z - z) / vl, rx = -vz, rz = vx;
    const cx = x - vx * 9 - rx * 3, cz = z - vz * 9 - rz * 3;
    // High enough to see over the knolls the stupas stand on.
    let knoll = -Infinity;
    for (const d of [4, 8, 12, 16]) knoll = Math.max(knoll, g.heightAt(x + vx * d, z + vz * d));
    let cam = new THREE.Vector3(cx, Math.max(y + 6, g.heightAt(cx, cz) + 2.5, knoll + 4), cz);
    let look = new THREE.Vector3(x + vx * 50, y - 10, z + vz * 50);
    if (this.camera.aspect < 0.9) {
      // Portrait phone: too narrow to keep him off to one side. Lower and right behind him, centred
      // a little above the middle, above the entry panel (which sits at the bottom).
      const px = x - vx * 10 - rx * 0.8, pz = z - vz * 10 - rz * 0.8;
      cam = new THREE.Vector3(px, Math.max(y + 3, g.heightAt(px, pz) + 2.5, knoll + 2), pz);
      const hx = x - px, hz = z - pz, hl = Math.hypot(hx, hz) || 1;
      const lift = Math.atan(0.2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      const pitch = Math.atan2(y + 1 - cam.y, hl) - lift;
      look = cam.clone().add(new THREE.Vector3((hx / hl) * Math.cos(pitch), Math.sin(pitch), (hz / hl) * Math.cos(pitch)).multiplyScalar(50));
    }
    return { cam, look };
  }

  /** The centre line at u (metres along the stretch). */
  private at(u: number): LinePoint {
    const f = clamp(u / this.step, 0, this.line.length - 1), i = Math.min(this.line.length - 2, Math.floor(f)), k = f - i;
    const a = this.line[i], b = this.line[i + 1], m = (p: number, q: number) => p + (q - p) * k;
    return { x: m(a.x, b.x), z: m(a.z, b.z), tx: m(a.tx, b.tx), tz: m(a.tz, b.tz), nx: m(a.nx, b.nx), nz: m(a.nz, b.nz) };
  }

  update(dt: number) {
    let x: number, z: number, hx: number, hz: number;
    if (this.stage === 'walk') {
      // Ease down toward the end, so he arrives at the turn's pace.
      const left = this.dir > 0 ? this.total - this.u : this.u;
      this.v = Math.min(this.v + ACCEL * dt, CRUISE, Math.sqrt(TURN_V * TURN_V + 2 * ACCEL * Math.max(0, left)));
      this.u = clamp(this.u + this.dir * this.v * dt, 0, this.total);
      if ((this.dir > 0 && this.u >= this.total) || (this.dir < 0 && this.u <= 0)) [this.stage, this.turnA, this.gazed] = ['turn', 0, false];
      // He keeps to the valley side of the path just after a turn and drifts across to the uphill side by the
      // far end, so each turn (toward the valley) brings him back onto the path rather than off its edge.
      const p = this.at(this.u), done = this.dir > 0 ? this.u / this.total : 1 - this.u / this.total;
      const off = TURN_R * Math.cos(Math.PI * done), drift = (-TURN_R * Math.PI * Math.sin(Math.PI * done)) / this.total;
      x = p.x + p.nx * off;
      z = p.z + p.nz * off;
      hx = this.dir * p.tx + p.nx * drift;
      hz = this.dir * p.tz + p.nz * drift;
    } else {
      if (this.stage === 'gaze') {
        this.wait -= dt;
        if (this.wait <= 0) [this.stage, this.gazed] = ['turn', true];
      } else {
        // Round the circle about the path's end, slowing to a stop facing the valley, then on round.
        const toGo = ((this.gazed ? 2 : 1) * Math.PI) / 2 - this.turnA;
        const brake = this.gazed ? TURN_V : Math.max(0.04, Math.sqrt(2 * ACCEL * TURN_R * toGo));
        this.v = Math.min(this.v + ACCEL * dt, TURN_V, brake);
        this.turnA += (this.v * dt) / TURN_R;
        if (!this.gazed && this.turnA >= Math.PI / 2) [this.turnA, this.stage, this.wait, this.v] = [Math.PI / 2, 'gaze', GAZE, 0];
        else if (this.gazed && this.turnA >= Math.PI) [this.turnA, this.stage, this.dir] = [Math.PI, 'walk', -this.dir];
      }
      const e = this.at(this.stage === 'walk' ? this.u : this.dir > 0 ? this.total : 0);
      const d = this.stage === 'walk' ? -this.dir : this.dir; // the way he was going into the turn
      const c = Math.cos(this.turnA), s = Math.sin(this.turnA);
      x = e.x - e.nx * TURN_R * c + d * e.tx * TURN_R * s;
      z = e.z - e.nz * TURN_R * c + d * e.tz * TURN_R * s;
      hx = e.nx * s + d * e.tx * c;
      hz = e.nz * s + d * e.tz * c;
    }
    const g = this.ctx.ground;
    const y = g.heightAt(x, z);
    const want = Math.atan2(-hx, -hz);
    this.yaw = this.started ? dampAngle(this.yaw, want, 12, dt) : want;
    this.player.avatar.clasp = true;
    this.player.puppet(dt, x, y, z, this.yaw, this.stage === 'gaze' ? 0 : this.v);

    const { cam, look } = this.shot(x, y, z);
    if (!this.started) {
      this.camPos.copy(cam);
      this.look.copy(look);
      this.started = true;
    }
    this.camPos.set(damp(this.camPos.x, cam.x, 2.5, dt), damp(this.camPos.y, cam.y, 2.5, dt), damp(this.camPos.z, cam.z, 2.5, dt));
    this.look.set(damp(this.look.x, look.x, 2.5, dt), damp(this.look.y, look.y, 2.5, dt), damp(this.look.z, look.z, 2.5, dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
  }

  /** Where he's standing (for shadows and the sky). */
  get position() {
    return this.player.pos;
  }
}
