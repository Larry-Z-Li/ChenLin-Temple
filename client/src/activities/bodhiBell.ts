import * as THREE from 'three';
import { templeBell } from '../audio/sfx';
import { box, cylinder, mat } from '../buildings/materials';
import { BODHI_BELL } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';

const IN = 1.6; // camera flies over
const APPEAR = [1.2, 2.5] as const; // a bodhisattva rises on clouds above the bell…
const RAISE = [2.5, 3.0] as const; // …lifts a hand toward the log…
const PULL = [2.8, 3.9] as const; // …which draws back as if pulled…
const HIT = 4.2; // …and swings into the bell as the hand sweeps down
const TO_LANTERN = 7.2; // camera crosses to your lantern's wall…
const MOVE = 1.8;
const BACK = 10.4; // …the lantern shakes, then the camera comes home
const END = 12;

/** Where the camera looks when it visits your new lantern, and how to make that lantern shake. */
export interface LanternShot {
  at: THREE.Vector3;
  view: THREE.Vector3;
  shake: () => void;
}
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/**
 * The great bell (梵鐘) on the west meadow, in a little open bell frame, rung with a hanging log
 * (撞木). When you hang a wish lantern it rings for you alone: the camera flies over, and a
 * bodhisattva appears on clouds above it and rings it, raising a hand as the log draws back and
 * sweeping it down as the log strikes; the bell booms and sways. Then the camera pans to the wall
 * your new lantern hangs on (the lantern shakes) and straight back to you. Nobody else sees any of it.
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
  private shot: LanternShot | null = null;
  private shotQuat = new THREE.Quaternion();
  private shook = false;
  private apparition = new THREE.Group();
  /** The bodhisattva's right arm (toward the log), pivoting at the shoulder. */
  private arm = new THREE.Group();
  private ghostMats: THREE.Material[] = [];

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

    // ---- The apparition above the roof (a placeholder polygon figure until a real model is made) ----
    this.buildApparition(H + 2.4);
    root.add(this.apparition);

    // The camera's view: in front of the frame, far enough back to see the bell and the clouds above.
    root.updateWorldMatrix(true, false);
    this.viewPos.copy(root.localToWorld(new THREE.Vector3(-0.6, 3.8, 11.5)));
    const look = root.localToWorld(new THREE.Vector3(-0.1, 4.6, 0));
    const m = new THREE.Matrix4().lookAt(this.viewPos, look, new THREE.Vector3(0, 1, 0));
    this.viewQuat.setFromRotationMatrix(m);

    for (const o of [this.bellPivot, this.logPivot, this.wave, this.apparition]) o.userData.dynamic = true; // they move
    ctx.updaters.push((dt) => this.animate(dt));
  }

  /** A cinematic is running (input and prompts wait). */
  get active() {
    return this.t >= 0;
  }

  /** Ring it for this player (local only); `shot` is the lantern they just hung. */
  ring(shot: LanternShot | null = null) {
    if (this.t >= 0) return;
    this.t = 0;
    this.rang = this.shook = false;
    this.shot = shot;
    if (shot) this.shotQuat.setFromRotationMatrix(new THREE.Matrix4().lookAt(shot.view, shot.at, new THREE.Vector3(0, 1, 0)));
  }

  /**
   * A bodhisattva of plain polygons (a placeholder until a real model is made): seated on a lotus on
   * clouds, crowned topknot, earrings, necklace, a flowing scarf, a lotus in the left hand; the right
   * arm rings the bell. Glowing and half see-through.
   */
  private buildApparition(y: number) {
    const ghost = (color: number, opacity: number, emissive = 0.9) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, transparent: true, opacity, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });
      m.userData.base = opacity;
      this.ghostMats.push(m);
      return m;
    };
    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, yy = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, yy, z);
      return o;
    };
    const a = this.apparition;
    a.position.set(0.3, y, 0);
    a.userData.y0 = y;
    const cloud = ghost(0xffffff, 0.75, 0.35);
    [[0, 0, 0, 1.1], [-1.1, -0.1, 0.3, 0.8], [1.15, -0.05, -0.2, 0.85], [-0.4, -0.25, -0.8, 0.75], [0.6, -0.2, 0.8, 0.7], [-1.8, -0.3, -0.3, 0.55], [1.9, -0.25, 0.4, 0.55]].forEach(([x, cy, z, r]) =>
      a.add(mesh(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.6, 1), cloud, x, cy, z)),
    );
    const skin = ghost(0xffe2a6, 0.55), gold = ghost(0xffc861, 0.7, 1.1), robe = ghost(0xfff3dc, 0.5), hair = ghost(0x3a4a7a, 0.6, 0.5);
    const scarfA = ghost(0x6fd3c4, 0.55, 1), scarfB = ghost(0xff9eb0, 0.55, 1);
    const b = new THREE.Group();
    b.position.y = 0.55;
    // lotus seat, crossed legs in a robe, slim torso
    b.add(mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.35, 8), ghost(0xffb6c8, 0.6)));
    for (let k = 0; k < 8; k++) {
      const petal = mesh(new THREE.ConeGeometry(0.22, 0.5, 4).scale(1, 1, 0.4), ghost(0xffc9d6, 0.5), Math.cos((k * Math.PI) / 4) * 0.85, 0.25, Math.sin((k * Math.PI) / 4) * 0.85);
      petal.rotation.set(Math.sin((k * Math.PI) / 4) * 0.5, 0, -Math.cos((k * Math.PI) / 4) * 0.5);
      b.add(petal);
    }
    b.add(mesh(new THREE.SphereGeometry(1, 7, 4).scale(0.85, 0.3, 0.55), robe, 0, 0.42, 0));
    b.add(mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.95, 6), skin, 0, 1.1, 0));
    b.add(mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.28, 6), robe, 0, 0.72, 0)); // robe at the waist
    // jewellery: necklace with a pendant, armlets
    b.add(mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 14).rotateX(Math.PI / 2.4), gold, 0, 1.47, 0.04));
    b.add(mesh(new THREE.OctahedronGeometry(0.06), gold, 0, 1.3, 0.24));
    // head: face, hair down the back, earrings, topknot with a five-pointed crown
    b.add(mesh(new THREE.IcosahedronGeometry(0.25, 0), skin, 0, 1.85, 0));
    b.add(mesh(new THREE.BoxGeometry(0.4, 0.55, 0.12), hair, 0, 1.62, -0.18));
    for (const s of [-1, 1]) b.add(mesh(new THREE.OctahedronGeometry(0.05), gold, s * 0.25, 1.73, 0));
    b.add(mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.32, 6), hair, 0, 2.18, -0.02));
    for (let k = -2; k <= 2; k++) {
      const pt = mesh(new THREE.ConeGeometry(0.06, k === 0 ? 0.24 : 0.17, 3).scale(1, 1, 0.4), gold, Math.sin(k * 0.45) * 0.22, 2.08 + (k === 0 ? 0.04 : 0), Math.cos(k * 0.45) * 0.22 - 0.02);
      pt.rotation.y = k * 0.45;
      b.add(pt);
    }
    b.add(mesh(new THREE.TorusGeometry(0.21, 0.025, 5, 16).rotateX(Math.PI / 2), gold, 0, 2.0, 0)); // crown band
    // the scarf (天衣): an arc behind the shoulders, streamers falling past the knees
    b.add(mesh(new THREE.TorusGeometry(0.55, 0.035, 5, 20, Math.PI), scarfA, 0, 1.35, -0.14));
    for (const s of [-1, 1]) {
      const streamer = mesh(new THREE.BoxGeometry(0.07, 1.1, 0.02), s < 0 ? scarfA : scarfB, s * 0.62, 0.75, 0.1);
      streamer.rotation.z = s * 0.18;
      b.add(streamer);
    }
    // left arm: hand at the chest holding a lotus bud
    const left = new THREE.Group();
    left.position.set(0.32, 1.45, 0);
    left.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 5), skin, 0.05, -0.25, 0.05));
    left.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 5).rotateX(-1.2), skin, 0.02, -0.45, 0.25));
    left.add(mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 10).rotateX(Math.PI / 2), gold, 0.05, -0.12, 0.03)); // armlet
    left.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 6), ghost(0xff9eb0, 0.7, 1.2), 0.0, -0.18, 0.48)); // lotus bud
    left.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 3), ghost(0x6fbf73, 0.7), 0.0, -0.38, 0.45));
    // right arm: rests on the knee, then rises toward the log and sweeps down to ring the bell
    this.arm.position.set(-0.32, 1.45, 0);
    this.arm.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 5), skin, 0, -0.27, 0));
    this.arm.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 5), skin, 0, -0.75, 0.04));
    this.arm.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), skin, 0, -1.05, 0.05)); // open palm
    this.arm.add(mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 10).rotateX(Math.PI / 2), gold, 0, -0.14, 0));
    b.add(left, this.arm);
    // head halo and body aura
    b.add(mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 24), ghost(0xfff0c0, 0.8, 1.4), 0, 1.92, -0.25));
    b.add(mesh(new THREE.CircleGeometry(1.15, 24).scale(0.85, 1.3, 1), ghost(0xffe6a8, 0.22, 1.2), 0, 1.35, -0.32));
    a.add(b);
    a.visible = false;
  }

  /** The right arm through the strike: resting, raised out toward the log, swept down as it swings. */
  private armPose(t: number) {
    const rest = -0.25, up = -1.55, swept = -0.55;
    if (t < RAISE[0]) return rest;
    if (t < RAISE[1]) return rest + (up - rest) * ease((t - RAISE[0]) / (RAISE[1] - RAISE[0]));
    if (t < PULL[1]) return up - 0.12 * ease((t - RAISE[1]) / (PULL[1] - RAISE[1])); // draws the log back with it
    if (t < HIT) return up - 0.12 + (swept - up + 0.12) * ease((t - PULL[1]) / (HIT - PULL[1]));
    return swept + (rest - swept) * ease((t - HIT - 0.8) / 1.5);
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
    // The apparition fades in rising, hovers, and fades as the camera leaves.
    const fade = t < APPEAR[0] ? 0 : t < APPEAR[1] ? ease((t - APPEAR[0]) / (APPEAR[1] - APPEAR[0])) : 1 - ease((t - TO_LANTERN) / 1.2);
    this.apparition.visible = fade > 0.01;
    this.arm.rotation.z = this.armPose(t);
    if (this.apparition.visible) {
      this.apparition.position.y = this.apparition.userData.y0 + (1 - fade) * -0.8 + Math.sin(t * 1.3) * 0.08;
      this.apparition.rotation.y = Math.sin(t * 0.4) * 0.08;
      for (const m of this.ghostMats) m.opacity = m.userData.base * fade;
    }
    if (this.shot && !this.shook && t >= TO_LANTERN + MOVE) {
      this.shook = true;
      this.shot.shake();
    }
    if (t >= END) {
      this.t = -1;
      this.swing(0);
      this.bellPivot.rotation.z = 0;
      this.apparition.visible = false;
      this.shot = null;
    }
  }

  /** Two parallel ropes: the log stays level, moving along the arc (− draws it back from the bell). */
  private swing(a: number) {
    this.logBody.position.set(this.ropeLen * Math.sin(a), -this.ropeLen * Math.cos(a), 0);
    for (const r of this.ropes) r.rotation.z = a;
  }

  /** Call after the camera rig has placed the camera: carry it to the bell, then the lantern, then home. */
  applyCamera(camera: THREE.Camera) {
    if (this.t < 0) return;
    const t = this.t, rigPos = camera.position.clone(), rigQuat = camera.quaternion.clone();
    const bell = { pos: this.viewPos, quat: this.viewQuat };
    const lantern = this.shot ? { pos: this.shot.view, quat: this.shotQuat } : null;
    const homeFrom = lantern ?? bell, homeAt = lantern ? BACK : TO_LANTERN;
    let a: { pos: THREE.Vector3; quat: THREE.Quaternion }, b: { pos: THREE.Vector3; quat: THREE.Quaternion }, k: number;
    const rig = { pos: rigPos, quat: rigQuat };
    if (t < IN) [a, b, k] = [rig, bell, ease(t / IN)];
    else if (t < TO_LANTERN) [a, b, k] = [bell, bell, 1];
    else if (lantern && t < TO_LANTERN + MOVE) [a, b, k] = [bell, lantern, ease((t - TO_LANTERN) / MOVE)];
    else if (t < homeAt) [a, b, k] = [homeFrom, homeFrom, 1];
    else [a, b, k] = [homeFrom, rig, ease((t - homeAt) / (END - homeAt))];
    camera.position.lerpVectors(a.pos, b.pos, k); // straight across, no hop
    camera.quaternion.slerpQuaternions(a.quat, b.quat, k);
  }
}
