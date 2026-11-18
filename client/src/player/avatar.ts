import * as THREE from 'three';
import type { Anim } from '../../../shared/protocol';
import { damp } from '../core/math';
import { textTexture } from '../core/textures';

/** Joint targets (radians, except hipY in metres). Limbs hang along -Y; +x rotation swings them forward. */
export interface Pose {
  hipY: number;
  torso: number;
  lThigh: number; rThigh: number;
  lShin: number; rShin: number;
  lArm: number; rArm: number;
  lArmZ: number; rArmZ: number;
  lFore: number; rFore: number;
  head: number;
}

const STAND: Pose = { hipY: 0.92, torso: 0, lThigh: 0, rThigh: 0, lShin: 0, rShin: 0, lArm: 0.05, rArm: 0.05, lArmZ: -0.08, rArmZ: 0.08, lFore: 0.15, rFore: 0.15, head: 0 };
// Seiza: knees forward on the cushion, shins folded back underneath, hands resting in the lap.
const KNEEL: Pose = { ...STAND, hipY: 0.42, torso: 0.04, lThigh: 1.2, rThigh: 1.2, lShin: -2.7, rShin: -2.7, lArm: 0.35, rArm: 0.35, lArmZ: -0.1, rArmZ: 0.1, lFore: 1.25, rFore: 1.25, head: 0.08 };

// Sitting on a bench: thighs level, shins hanging, hands resting on the knees.
const SIT: Pose = { ...STAND, hipY: 0.53, torso: 0.02, lThigh: 1.57, rThigh: 1.57, lShin: -1.57, rShin: -1.57, lArm: 0.3, rArm: 0.3, lArmZ: -0.1, rArmZ: 0.1, lFore: 0.9, rFore: 0.9, head: 0.05 };

/**
 * Named poses. Add the prostration keyframes here later (stand+hands at crown → mouth → heart →
 * kneel → forehead to floor → rise) and play them as a sequence; the blend system already handles it.
 */
export const POSES: Record<Anim, Pose> = {
  idle: STAND,
  walk: STAND,
  run: STAND,
  kneel: KNEEL,
  beads: { ...KNEEL, rArm: 0.5, rArmZ: 0.05, rFore: 1.7, head: 0.18 },
  read: { ...KNEEL, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
  sit: SIT,
  sitRead: { ...SIT, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
};

const SKIN = 0xd8a982;

export class Avatar {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private joints: Record<'lThigh' | 'rThigh' | 'lShin' | 'rShin' | 'lArm' | 'rArm' | 'lFore' | 'rFore', THREE.Group>;
  private pose: Pose = { ...STAND };
  private phase = 0;
  private tag: THREE.Sprite | null = null;
  private phones: THREE.Group | null = null;
  anim: Anim = 'idle';

  constructor(color: string, name?: string) {
    const robe = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85 });
    const under = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      return mesh;
    };
    const limb = (len: number, r: number, m: THREE.Material) => mk(new THREE.CapsuleGeometry(r, len - r * 2, 3, 8).translate(0, -len / 2, 0), m);
    const joint = (x: number, y: number, z: number) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      return j;
    };

    this.root.add(this.hips);
    this.hips.add(this.torso);

    // Torso (robe) — origin at hips, shoulders at ~0.55
    this.torso.add(mk(new THREE.CylinderGeometry(0.17, 0.22, 0.62, 12).translate(0, 0.31, 0), robe));
    this.torso.add(mk(new THREE.SphereGeometry(0.2, 12, 8).scale(1, 0.55, 0.8).translate(0, 0.56, 0), robe));
    // Sash over the left shoulder
    const sash = mk(new THREE.BoxGeometry(0.06, 0.7, 0.36).translate(0, 0.3, 0), under);
    sash.rotation.z = 0.55;
    sash.position.set(0.02, 0.05, 0);
    this.torso.add(sash);

    this.head.position.set(0, 0.62, 0);
    this.head.add(mk(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8).translate(0, 0.04, 0), skin));
    this.head.add(mk(new THREE.SphereGeometry(0.115, 16, 12).translate(0, 0.19, 0), skin));
    this.torso.add(this.head);

    const lThigh = joint(-0.1, 0, 0), rThigh = joint(0.1, 0, 0);
    const lShin = joint(0, -0.45, 0), rShin = joint(0, -0.45, 0);
    lThigh.add(limb(0.47, 0.085, robe), lShin);
    rThigh.add(limb(0.47, 0.085, robe), rShin);
    lShin.add(limb(0.45, 0.07, robe));
    rShin.add(limb(0.45, 0.07, robe));
    const foot = () => mk(new THREE.BoxGeometry(0.09, 0.06, 0.2).translate(0, -0.45, -0.05), new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
    lShin.add(foot());
    rShin.add(foot());
    this.hips.add(lThigh, rThigh);

    const lArm = joint(-0.23, 0.52, 0), rArm = joint(0.23, 0.52, 0);
    const lFore = joint(0, -0.29, 0), rFore = joint(0, -0.29, 0);
    lArm.add(limb(0.31, 0.06, robe), lFore);
    rArm.add(limb(0.31, 0.06, robe), rFore);
    lFore.add(limb(0.27, 0.05, robe));
    rFore.add(limb(0.27, 0.05, robe));
    lFore.add(mk(new THREE.SphereGeometry(0.045, 8, 6).translate(0, -0.29, 0), skin));
    rFore.add(mk(new THREE.SphereGeometry(0.045, 8, 6).translate(0, -0.29, 0), skin));
    this.torso.add(lArm, rArm);

    this.joints = { lThigh, rThigh, lShin, rShin, lArm, rArm, lFore, rFore };
    if (name) this.setName(name);
  }

  setName(name: string) {
    if (this.tag) {
      this.root.remove(this.tag);
      this.tag.material.map?.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: textTexture(name, { w: 512, h: 96, color: '#fff8e7', font: `600 46px system-ui, sans-serif` }), depthWrite: false, transparent: true });
    this.tag = new THREE.Sprite(mat);
    this.tag.scale.set(1.6, 0.3, 1);
    this.tag.position.y = 2.05;
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
  }

  /** Headphones on while the person is listening to chants (built on first use). */
  setListening(on: boolean) {
    if (!this.phones) {
      if (!on) return;
      const shell = new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.45, metalness: 0.3 });
      const g = new THREE.Group();
      // Band arcs over the top of the head from ear to ear; cups sit against the sides.
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.013, 8, 24, Math.PI), shell));
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.045, 18).rotateZ(Math.PI / 2), shell);
        cup.position.x = s * 0.124;
        cup.castShadow = true;
        g.add(cup);
      }
      g.position.y = 0.19; // head sphere centre
      this.head.add(g);
      this.phones = g;
    }
    this.phones.visible = on;
  }

  /** Hide name tags beyond a distance to reduce clutter. */
  setTagVisible(v: boolean) {
    if (this.tag) this.tag.visible = v;
  }

  update(dt: number, speed = 0) {
    const target = POSES[this.anim];
    const p = this.pose;
    const rate = 8;
    for (const k in target) (p as unknown as Record<string, number>)[k] = damp((p as unknown as Record<string, number>)[k], (target as unknown as Record<string, number>)[k], rate, dt);

    // Procedural gait layered on top of the base pose.
    let swing = 0, bob = 0;
    if (this.anim === 'walk' || this.anim === 'run') {
      this.phase += dt * (this.anim === 'run' ? 11 : 7.5) * Math.min(1.4, Math.max(0.6, speed / 2.6));
      const amp = this.anim === 'run' ? 0.75 : 0.5;
      swing = Math.sin(this.phase) * amp;
      bob = Math.abs(Math.cos(this.phase)) * 0.035;
    } else this.phase = 0;

    const j = this.joints;
    this.hips.position.y = p.hipY + bob;
    this.torso.rotation.x = -p.torso;
    this.head.rotation.x = -p.head;
    j.lThigh.rotation.x = p.lThigh + swing;
    j.rThigh.rotation.x = p.rThigh - swing;
    j.lShin.rotation.x = p.lShin - Math.max(0, -swing) * 0.9;
    j.rShin.rotation.x = p.rShin - Math.max(0, swing) * 0.9;
    j.lArm.rotation.x = p.lArm - swing * 0.6;
    j.rArm.rotation.x = p.rArm + swing * 0.6;
    j.lArm.rotation.z = p.lArmZ;
    j.rArm.rotation.z = p.rArmZ;
    j.lFore.rotation.x = p.lFore;
    j.rFore.rotation.x = p.rFore;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.tag?.material.map?.dispose();
  }
}
