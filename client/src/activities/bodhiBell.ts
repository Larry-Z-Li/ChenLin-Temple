import * as THREE from 'three';
import { templeBell } from '../audio/sfx';
import { box, cylinder, mat } from '../buildings/materials';
import { BODHI_BELL } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';

const IN = 1.6; // camera flies over
const PULL = [1.5, 2.6] as const; // the log is drawn back
const HIT = 2.9; // …and swung into the bell
const BACK = 6.3; // camera starts home
const END = 7.8;
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/**
 * The great bell (梵鐘) by the Bodhi tree, in a little open bell frame, rung with a hanging log
 * (撞木). When you hang a wish lantern it rings for you alone: the camera flies over, the log is
 * drawn back and swung, the bell booms and sways, and the camera comes home.
 */
export class BodhiBell {
  private t = -1;
  private rang = false;
  /** The log's hanging point on the beam; the log itself swings level on its two ropes. */
  private logPivot = new THREE.Group();
  private logBody = new THREE.Group();
  private ropes: THREE.Group[] = [];
  private ropeLen = 1;
  private bellPivot = new THREE.Group();
  private wave: THREE.Mesh;
  private viewPos = new THREE.Vector3();
  private viewQuat = new THREE.Quaternion();

  constructor(ctx: WorldContext) {
    const { x, z, yaw } = BODHI_BELL;
    const y = ctx.ground.heightAt(x, z);
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    ctx.scene.add(root);

    // ---- The frame: four red posts on stone bases, beams, a small hipped roof ----
    const red = mat(THEME.column, { roughness: 0.55 }), wood = mat(0x4a2c1a, { roughness: 0.7 });
    const stone = mat(THEME.platformStone, { roughness: 0.95 });
    const W = 2.4, D = 1.9, H = 4.2;
    root.add(box(W * 2 + 1.2, 0.25, D * 2 + 1.2, stone, 0, 0, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        root.add(box(0.5, 0.3, 0.5, stone, sx * W, 0.25, sz * D), cylinder(0.14, 0.16, H, red, sx * W, 0.25, sz * D, 10));
        const wp = new THREE.Vector3(sx * W, 0, sz * D).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        ctx.collisions.addCircle(x + wp.x, z + wp.z, 0.3);
      }
    for (const sz of [-1, 1]) root.add(box(W * 2 + 0.6, 0.22, 0.22, red, 0, H + 0.1, sz * D));
    for (const sx of [-1, 1]) root.add(box(0.22, 0.22, D * 2 + 0.4, red, sx * W, H + 0.1, 0));
    root.add(box(W * 2 + 0.3, 0.28, 0.28, wood, 0, H - 0.25, 0)); // the beam the bell and log hang from
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.5, 4, 1).rotateY(Math.PI / 4).scale(W * 1.75, 1, D * 1.95), mat(THEME.roof, { roughness: 0.75 }));
    roof.position.y = H + 0.95;
    root.add(roof);

    // ---- The bell: bronze, banded, with its striking boss toward the log ----
    const bronze = mat(0x6f5a36, { metalness: 0.75, roughness: 0.4 });
    const profile = [[0.001, 0], [0.64, 0], [0.68, 0.07], [0.62, 0.3], [0.58, 0.9], [0.57, 1.35], [0.47, 1.56], [0.22, 1.64], [0.001, 1.65]];
    const bell = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 28), bronze);
    const dark = mat(0x4a3b22, { metalness: 0.7, roughness: 0.5 });
    const bands = [0.42, 1.05, 1.3].map((h) => {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.025, 6, 28).rotateX(Math.PI / 2), dark);
      b.position.y = h;
      return b;
    });
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 14).rotateZ(Math.PI / 2), dark);
    boss.position.set(-0.6, 0.55, 0);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14), dark);
    hook.position.y = 1.75;
    const bellBody = new THREE.Group();
    bellBody.add(bell, ...bands, boss, hook);
    // Hung from the underside of the beam: rim at 1.55 m, a short iron rod up from the hook.
    const P = H - 0.25, rim = 1.55, rod = P - (rim + 1.92);
    bellBody.position.y = rim - P;
    this.bellPivot.position.set(0.3, P, 0);
    this.bellPivot.add(bellBody, box(0.06, rod, 0.06, dark, 0, -rod, 0));
    bellBody.traverse((o) => (o.castShadow = true));
    root.add(this.bellPivot);

    // ---- The striking log (撞木), hung on two ropes, its end resting against the boss ----
    const ropeLen = (this.ropeLen = P - (rim + 0.55)); // level with the boss
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.2, 12).rotateZ(Math.PI / 2), mat(0x7a5a3a, { roughness: 0.85 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.08, 12).rotateZ(Math.PI / 2), mat(0x2a1a10));
    cap.position.x = 1.08;
    this.logBody.add(log, cap);
    this.logBody.position.y = -ropeLen;
    const rope = mat(0xc9b48a, { roughness: 1 });
    for (const rx of [-0.6, 0.6]) {
      const r = new THREE.Group();
      r.position.x = rx;
      r.add(box(0.03, ropeLen, 0.03, rope, 0, -ropeLen, 0));
      this.ropes.push(r);
    }
    this.logPivot.add(this.logBody, ...this.ropes);
    this.logPivot.position.set(0.3 - 0.63 - 1.12, P, 0); // its capped end just touching the boss
    root.add(this.logPivot);

    // ---- A ring of sound spreading from the bell when it's struck ----
    this.wave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 6, 48).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.wave.position.set(0.3, rim + 0.8, 0);
    this.wave.visible = false;
    root.add(this.wave);

    // The camera's view: in front of the frame, a little above, looking at the bell.
    root.updateWorldMatrix(true, false);
    this.viewPos.copy(root.localToWorld(new THREE.Vector3(-0.6, 3.0, 7.2)));
    const look = root.localToWorld(new THREE.Vector3(-0.3, 2.2, 0));
    const m = new THREE.Matrix4().lookAt(this.viewPos, look, new THREE.Vector3(0, 1, 0));
    this.viewQuat.setFromRotationMatrix(m);

    ctx.updaters.push((dt) => this.animate(dt));
  }

  /** A cinematic is running (input and prompts wait). */
  get active() {
    return this.t >= 0;
  }

  /** Ring it for this player (local only). */
  ring() {
    if (this.t >= 0) return;
    this.t = 0;
    this.rang = false;
  }

  private animate(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    // Log: drawn back, swung in, rebounds.
    let a = 0;
    if (t > PULL[0] && t < PULL[1]) a = -0.55 * ease((t - PULL[0]) / (PULL[1] - PULL[0]));
    else if (t >= PULL[1] && t < HIT) a = -0.55 * (1 - Math.pow((t - PULL[1]) / (HIT - PULL[1]), 2));
    else if (t >= HIT) a = -0.17 * Math.exp(-(t - HIT) * 1.8) * Math.abs(Math.sin((t - HIT) * 4.2));
    this.swing(a);
    if (t >= HIT && !this.rang) {
      this.rang = true;
      templeBell();
    }
    const s = t - HIT;
    this.bellPivot.rotation.z = s > 0 ? 0.05 * Math.exp(-s * 0.7) * Math.sin(s * 3.1) : 0;
    this.wave.visible = s > 0 && s < 1.8;
    if (this.wave.visible) {
      this.wave.scale.setScalar(0.8 + s * 4);
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - s / 1.8);
    }
    if (t >= END) {
      this.t = -1;
      this.swing(0);
      this.bellPivot.rotation.z = 0;
    }
  }

  /** Two parallel ropes: the log stays level, moving along the arc (− draws it back from the bell). */
  private swing(a: number) {
    this.logBody.position.set(this.ropeLen * Math.sin(a), -this.ropeLen * Math.cos(a), 0);
    for (const r of this.ropes) r.rotation.z = a;
  }

  /** Call after the camera rig has placed the camera: carry it over to the bell and back. */
  applyCamera(camera: THREE.Camera) {
    if (this.t < 0) return;
    const t = this.t;
    const w = t < IN ? ease(t / IN) : t < BACK ? 1 : 1 - ease((t - BACK) / (END - BACK));
    if (w <= 0) return;
    const from = camera.position.clone(), lift = Math.min(28, Math.max(4, from.distanceTo(this.viewPos) * 0.22));
    camera.position.lerpVectors(from, this.viewPos, w).y += Math.sin(Math.PI * w) * lift;
    camera.quaternion.slerpQuaternions(camera.quaternion.clone(), this.viewQuat, w);
  }
}
