import * as THREE from 'three';
import { glowTexture } from '../core/textures';

/** Motes in flight per trail (a pool, reused). */
const N = 320;
/** By strength 0 … 4: motes a second (while walking), how long each lasts (s), and how big. */
const RATE = [0, 16, 34, 60, 95], LIFE = [0, 1.4, 1.9, 2.4, 3.0], SIZE = [0.3, 0.3, 0.38, 0.46, 0.55];
/** Warm gold at first; with more laps, the five colours of the prayer flags drift in among the gold. */
const GOLD = new THREE.Color(1, 0.78, 0.38), FIVE = [0x4f8cff, 0xffffff, 0xff5a4a, 0x4fd27a, 0xffd24a].map((c) => new THREE.Color(c));

/**
 * A trail of drifting motes of light left behind someone who has walked round the great stupa: `strength` 0 (none)
 * … 4 (after 15 laps). Motes rise gently from around the body and fade; one draw per person.
 */
export class LightTrail {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private base = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private max = new Float32Array(N);
  private next = 0;
  private acc = 0;
  private last = new THREE.Vector3();
  private hasLast = false;
  private live = 0;
  /** A soft halo round the walker: how bright now, and how much they're moving (both eased). */
  private halo: THREE.Sprite;
  /** How brightly the walker glows now (eased), for their avatar's own glow: see Avatar.setGlow. */
  glow = 0;
  private moving = 0;
  private t = 0;

  constructor(private scene: THREE.Scene) {
    this.pos.fill(-9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.visible = false;
    scene.add(this.halo);
  }

  update(dt: number, at: THREE.Vector3, strength: number) {
    const moved = this.hasLast ? Math.hypot(at.x - this.last.x, at.z - this.last.z) : 0;
    this.last.copy(at);
    this.hasLast = true;
    if (strength > 0 && moved > 0.003) this.acc += RATE[strength] * dt;
    // the walker glows too: brighter with more laps and while walking, breathing gently
    this.t += dt;
    this.moving += ((moved > 0.003 ? 1 : 0) - this.moving) * Math.min(1, dt * 4);
    const want = strength ? (0.3 + 0.1 * strength) * (0.6 + 0.4 * this.moving) : 0;
    this.glow += (want - this.glow) * Math.min(1, dt * (want > this.glow ? 2 : 3));
    this.halo.visible = this.glow > 0.01;
    if (this.halo.visible) {
      const s = 1.3 + 0.2 * strength; // kept clear of the ground, which would cut it off in a hard line
      this.halo.scale.set(s, s * 1.5, 1);
      this.halo.position.set(at.x, at.y + 0.2 + s * 0.75, at.z);
      (this.halo.material as THREE.SpriteMaterial).opacity = this.glow * (0.85 + 0.15 * Math.sin(this.t * 2.4));
    }
    while (this.acc >= 1) {
      this.acc -= 1;
      const i = this.next, j = i * 3;
      this.next = (this.next + 1) % N;
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3;
      this.pos.set([at.x + Math.cos(a) * r, at.y + 0.15 + Math.random() * 1.5, at.z + Math.sin(a) * r], j);
      this.vel.set([(Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15], j);
      const c = strength >= 3 && Math.random() < (strength === 4 ? 0.55 : 0.3) ? FIVE[Math.floor(Math.random() * 5)] : GOLD;
      const k = 0.55 + 0.15 * strength;
      this.base.set([c.r * k, c.g * k, c.b * k], j);
      this.life[i] = this.max[i] = LIFE[strength] * (0.7 + Math.random() * 0.6);
    }
    this.live = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -9999;
        this.col[j] = this.col[j + 1] = this.col[j + 2] = 0;
        continue;
      }
      this.live++;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = this.life[i] / this.max[i], fade = f * f * (3 - 2 * f) * Math.min(1, (1 - f) * 6); // in quickly, out slowly
      this.col[j] = this.base[j] * fade;
      this.col[j + 1] = this.base[j + 1] * fade;
      this.col[j + 2] = this.base[j + 2] * fade;
    }
    (this.points.material as THREE.PointsMaterial).size = SIZE[strength];
    this.points.visible = this.live > 0;
    if (this.live) this.points.geometry.attributes.position.needsUpdate = this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points, this.halo);
    this.halo.material.dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
