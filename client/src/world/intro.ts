import * as THREE from 'three';
import { STUPA_COURT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { damp, dampAngle } from '../core/math';
import type { LocalPlayer } from '../player/localPlayer';

/**
 * The entry screen: your monk strolls back and forth on the ridge walk behind the mountain stupas,
 * hands folded. The camera follows from uphill, looking out over him and the stupas to the valley
 * and the temple below, so the stupas slide past in the foreground as he walks.
 */
export class Intro {
  private pts: THREE.Vector2[];
  private lens: number[] = [];
  private total = 0;
  private u = 0;
  private dir = 1;
  private pause = 0;
  private yaw = 0;
  private camPos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private started = false;

  constructor(private ctx: WorldContext, private camera: THREE.PerspectiveCamera, private player: LocalPlayer, ridge: [number, number][]) {
    // Follow the same curve the gravel ribbon is laid on, finely sampled.
    if (ridge.length < 2) ridge = [[-210, 0], [-200, 18]];
    const curve = new THREE.CatmullRomCurve3(ridge.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const h = (x: number, z: number) => ctx.ground.heightAt(x, z);
    // Seven stops (six stupa-to-stupa legs), clear of the ridge's ends: the stretch whose view is most
    // open (least ground rising in front of the walk) and that climbs least.
    const n = ridge.length, span = Math.min(6, Math.max(1, n - 3)), first = n > span + 2 ? 1 : 0;
    let best = first, bestScore = Infinity;
    const last = Math.max(first, n - 1 - first - span);
    for (let i = first; i <= last; i++) {
      let score = 0, prevY: number | null = null;
      for (let k = 0; k <= 40; k++) {
        const q = curve.getPoint((i + (span * k) / 40) / (n - 1));
        const y = h(q.x, q.z), dx = STUPA_COURT.x - q.x, dz = STUPA_COURT.z - q.z, l = Math.hypot(dx, dz) || 1;
        for (const d of [5, 10, 15, 20]) score += Math.max(0, h(q.x + (dx / l) * d, q.z + (dz / l) * d) - y + 1) * 2;
        if (prevY !== null) score += Math.abs(y - prevY);
        prevY = y;
      }
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    const t0 = best / (n - 1), t1 = Math.min(n - 1, best + span) / (n - 1);
    this.pts = [];
    for (let k = 0; k <= 240; k++) {
      const q = curve.getPoint(t0 + ((t1 - t0) * k) / 240);
      this.pts.push(new THREE.Vector2(q.x, q.z));
    }
    for (let i = 1; i < this.pts.length; i++) {
      const l = this.pts[i].distanceTo(this.pts[i - 1]);
      this.lens.push(l);
      this.total += l;
    }
    this.u = this.total * 0.5;
  }

  private at(u: number) {
    let i = 0, d = u;
    while (i < this.lens.length - 1 && d > this.lens[i]) d -= this.lens[i++];
    const a = this.pts[i], b = this.pts[i + 1], k = Math.min(1, d / this.lens[i]);
    return { x: a.x + (b.x - a.x) * k, z: a.y + (b.y - a.y) * k, dx: b.x - a.x, dz: b.y - a.y };
  }

  update(dt: number) {
    // Stroll to one end, pause, turn round, stroll back.
    let walking = false;
    if (this.pause > 0) this.pause -= dt;
    else {
      this.u += this.dir * 1.0 * dt;
      walking = true;
      if (this.u >= this.total || this.u <= 0) {
        this.u = THREE.MathUtils.clamp(this.u, 0, this.total);
        this.dir *= -1;
        this.pause = 1.8;
      }
    }
    const p = this.at(this.u);
    const g = this.ctx.ground;
    const y = g.heightAt(p.x, p.z);
    const want = Math.atan2(-p.dx * this.dir, -p.dz * this.dir);
    this.yaw = this.started ? dampAngle(this.yaw, want, walking ? 5 : 2.5, dt) : want;
    this.player.avatar.clasp = true;
    this.player.puppet(dt, p.x, y, p.z, this.yaw, walking);

    // Uphill of him and a little to his left, looking out toward the temple: over the stupas
    // (which slide past as he walks) to the valley and the temple, him on the right of the frame.
    const vl = Math.hypot(STUPA_COURT.x - p.x, STUPA_COURT.z - p.z) || 1;
    const vx = (STUPA_COURT.x - p.x) / vl, vz = (STUPA_COURT.z - p.z) / vl, rx = -vz, rz = vx;
    const cx = p.x - vx * 9 - rx * 3, cz = p.z - vz * 9 - rz * 3;
    // High enough to see over the knolls the stupas stand on.
    let knoll = -Infinity;
    for (const d of [4, 8, 12, 16]) knoll = Math.max(knoll, g.heightAt(p.x + vx * d, p.z + vz * d));
    let wantCam = new THREE.Vector3(cx, Math.max(y + 6, g.heightAt(cx, cz) + 2.5, knoll + 4), cz);
    let wantLook = new THREE.Vector3(p.x + vx * 50, y - 10, p.z + vz * 50);
    if (this.camera.aspect < 0.9) {
      // Portrait phone: too narrow to keep him off to one side. Lower and right behind him, centred
      // a little above the middle, above the entry panel (which sits at the bottom).
      const px = p.x - vx * 10 - rx * 0.8, pz = p.z - vz * 10 - rz * 0.8;
      wantCam = new THREE.Vector3(px, Math.max(y + 3, g.heightAt(px, pz) + 2.5, knoll + 2), pz);
      const hx = p.x - px, hz = p.z - pz, hl = Math.hypot(hx, hz) || 1;
      const lift = Math.atan(0.2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      const pitch = Math.atan2(y + 1 - wantCam.y, hl) - lift;
      wantLook = wantCam.clone().add(new THREE.Vector3((hx / hl) * Math.cos(pitch), Math.sin(pitch), (hz / hl) * Math.cos(pitch)).multiplyScalar(50));
    }
    if (!this.started) {
      this.camPos.copy(wantCam);
      this.look.copy(wantLook);
      this.started = true;
    }
    this.camPos.set(damp(this.camPos.x, wantCam.x, 2.5, dt), damp(this.camPos.y, wantCam.y, 2.5, dt), damp(this.camPos.z, wantCam.z, 2.5, dt));
    this.look.set(damp(this.look.x, wantLook.x, 2.5, dt), damp(this.look.y, wantLook.y, 2.5, dt), damp(this.look.z, wantLook.z, 2.5, dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
  }

  /** Where he's standing (for shadows and the sky). */
  get position() {
    return this.player.pos;
  }
}
