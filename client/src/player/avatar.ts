import * as THREE from 'three';
import type { Anim } from '../../../shared/protocol';
import { damp } from '../core/math';
import { glowTexture, textTexture } from '../core/textures';
import { lanternGeometries } from '../activities/wishLanterns';
import { CLOUD_TOP, makeCloud } from '../world/cloud';

/** Joint targets (radians, except hipY in metres). Limbs hang along -Y; +x rotation swings them forward. */
export interface Pose {
  hipY: number;
  torso: number;
  lThigh: number; rThigh: number;
  lShin: number; rShin: number;
  /** Sideways bends (outward splay at the hip, inward turn at the knee), for sitting cross-legged. */
  lThighZ: number; rThighZ: number;
  lShinZ: number; rShinZ: number;
  lArm: number; rArm: number;
  lArmZ: number; rArmZ: number;
  lFore: number; rFore: number;
  /** Hand twist about the forearm: 0 = palms facing the body; ±π/2 turns them down/up. */
  lPalm: number; rPalm: number;
  head: number;
}

const STAND: Pose = { hipY: 0.92, torso: 0, lThigh: 0, rThigh: 0, lShin: 0, rShin: 0, lThighZ: 0, rThighZ: 0, lShinZ: 0, rShinZ: 0, lArm: 0.05, rArm: 0.05, lArmZ: -0.08, rArmZ: 0.08, lFore: 0.15, rFore: 0.15, lPalm: 0, rPalm: 0, head: 0 };
// Seiza: knees forward on the cushion, shins folded back underneath, hands resting in the lap.
const KNEEL: Pose = { ...STAND, hipY: 0.42, torso: 0.04, lThigh: 1.2, rThigh: 1.2, lShin: -2.7, rShin: -2.7, lArm: 0.35, rArm: 0.35, lArmZ: -0.1, rArmZ: 0.1, lFore: 1.25, rFore: 1.25, head: 0.08 };

// Sitting on a bench: thighs level, shins hanging, hands resting on the knees.
const SIT: Pose = { ...STAND, hipY: 0.53, torso: 0.02, lThigh: 1.57, rThigh: 1.57, lShin: -1.57, rShin: -1.57, lArm: 0.3, rArm: 0.3, lArmZ: -0.1, rArmZ: 0.1, lFore: 0.9, rFore: 0.9, head: 0.05 };

// Sitting cross-legged on a cushion: knees out to the sides, shins crossed in front, hands in the lap.
const CROSS: Pose = {
  ...STAND, hipY: 0.15, torso: 0.02, head: 0.06,
  lThigh: 1.62, rThigh: 1.62, lThighZ: -0.78, rThighZ: 0.78,
  lShin: -2.25, rShin: -2.25, lShinZ: 0.95, rShinZ: -0.95,
  lArm: 0.42, rArm: 0.42, lArmZ: -0.06, rArmZ: 0.06, lFore: 1.15, rFore: 1.15,
};

// Palms pressed together at the heart (合掌).
const HEART = { lArm: 0.6, rArm: 0.6, lArmZ: 0.45, rArmZ: -0.45, lFore: 1.5, rFore: 1.5 };
const H = Math.PI / 2;
// Prostration: forehead to the floor, hips raised, hands flat on the floor beside the head.
const P_DOWN: Pose = { ...STAND, hipY: 0.5, torso: 2.0, head: 0.35, lThigh: 0.3, rThigh: 0.3, lShin: -1.87, rShin: -1.87, lArm: 3.15, rArm: 3.15, lArmZ: -0.35, rArmZ: 0.35, lFore: 0.2, rFore: 0.2, lPalm: -H, rPalm: H };

/** Named poses; the avatar blends smoothly toward whichever is current. Sequences just step through them. */
/** Arms folded across the middle, hands tucked into the opposite sleeves, villager-style (the entry stroll). */
const CLASP: Pose = { ...STAND, torso: 0.03, lArm: 0.42, rArm: 0.42, lArmZ: 0.6, rArmZ: -0.6, lFore: 1.15, rFore: 1.15, head: 0.06 };

/** Carrying a lantern before you in both hands, hands together at its ring — walking, standing, and bowing with it. */
const CARRY_ARMS = { lArm: 1.0, rArm: 1.0, lArmZ: 0.42, rArmZ: -0.42, lFore: 0.8, rFore: 0.8 };
const CARRY: Pose = { ...STAND, ...CARRY_ARMS, head: 0.12 };
const CARRY_BOW: Pose = { ...STAND, ...CARRY_ARMS, torso: 0.55, head: 0.25 };

export const POSES: Record<Anim, Pose> = {
  idle: STAND,
  walk: STAND,
  run: STAND,
  kneel: KNEEL,
  beads: { ...KNEEL, rArm: 0.5, rArmZ: 0.05, rFore: 1.7, head: 0.18 },
  read: { ...KNEEL, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
  sit: SIT,
  sitRead: { ...SIT, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
  sitBeads: { ...SIT, rArm: 0.5, rArmZ: 0.05, rFore: 1.7, head: 0.18 },
  bow: { ...STAND, ...HEART, torso: 0.55, head: 0.25 },
  kneelBow: { ...KNEEL, ...HEART, torso: 0.6, head: 0.25 },
  sitBow: { ...SIT, ...HEART, torso: 0.45, head: 0.25 },
  // Prostration keyframes: palms together at crown → mouth → heart, kneel upright, forehead down, palms up.
  pCrown: { ...STAND, lArm: 2.75, rArm: 2.75, lArmZ: 0.45, rArmZ: -0.45, lFore: 0.6, rFore: 0.6, head: -0.05 },
  pMouth: { ...STAND, lArm: 1.3, rArm: 1.3, lArmZ: 0.45, rArmZ: -0.45, lFore: 1.5, rFore: 1.5 },
  pHeart: { ...STAND, ...HEART },
  pKneelUp: { ...STAND, ...HEART, hipY: 0.5, lShin: -1.57, rShin: -1.57 },
  pDown: P_DOWN,
  pUp: { ...P_DOWN, lPalm: H, rPalm: -H },
  reach: { ...STAND, torso: 0.15, head: 0.2, rArm: 1.0, rArmZ: 0.05, rFore: 0.35 },
  cross: CROSS,
  crossBeads: { ...CROSS, rArm: 0.5, rArmZ: 0.05, rFore: 1.7, head: 0.18 },
  standBeads: { ...STAND, rArm: 0.5, rArmZ: 0.05, rFore: 1.7, head: 0.18 },
  standRead: { ...STAND, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
  crossRead: { ...CROSS, lArm: 0.45, rArm: 0.45, lArmZ: -0.04, rArmZ: 0.04, lFore: 1.55, rFore: 1.55, head: 0.35 },
  // the sutra in the right hand, counting beads with the left
  crossReadBeads: { ...CROSS, rArm: 0.45, rArmZ: 0.04, rFore: 1.55, lArm: 0.5, lArmZ: -0.05, lFore: 1.7, head: 0.35 },
  sitReadBeads: { ...SIT, rArm: 0.45, rArmZ: 0.04, rFore: 1.55, lArm: 0.5, lArmZ: -0.05, lFore: 1.7, head: 0.35 },
  standReadBeads: { ...STAND, rArm: 0.45, rArmZ: 0.04, rFore: 1.55, lArm: 0.5, lArmZ: -0.05, lFore: 1.7, head: 0.35 },
  crossBow: { ...CROSS, ...HEART, torso: 0.6, head: 0.25 },
};

const SKIN = 0xd8a982;

/** How big a carried lantern is by default (world scale): a wall lantern's size, so it doesn't change in your hands. */
export const LANTERN_HELD = 0.9;
const heldScale = new THREE.Vector3(), qHand = new THREE.Quaternion(), qRoot = new THREE.Quaternion();

export class Avatar {
  readonly root = new THREE.Group();
  /** Beads / a sutra in hand while walking: the arms and head keep that pose (the legs walk). */
  hold: Anim | null = null;
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private joints: Record<'lThigh' | 'rThigh' | 'lShin' | 'rShin' | 'lArm' | 'rArm' | 'lFore' | 'rFore' | 'lHand' | 'rHand', THREE.Group>;
  private incense: { stick: THREE.Mesh; tip: THREE.Sprite } | null = null;
  private pose: Pose = { ...STAND };
  private phase = 0;
  private tag: THREE.Sprite | null = null;
  private phones: THREE.Group | null = null;
  private cloud: THREE.Mesh | null = null;
  anim: Anim = 'idle';
  /** Walk/stand with hands tucked in the sleeves and no arm swing (local only — the entry stroll). */
  clasp = false;

  private robeMat: THREE.MeshStandardMaterial;
  private underMat: THREE.MeshStandardMaterial;

  /** Change the robe colour (the entry screen's robe picker). */
  setColor(color: string) {
    this.robeMat.color.set(color);
    this.underMat.color.set(color).multiplyScalar(0.6);
  }

  constructor(color: string, name?: string) {
    const robe = (this.robeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85 }));
    const under = (this.underMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: 0.9 }));
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
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
    // Sash (kasaya band) wrapping diagonally from the left shoulder to the right hip, front and back.
    // An open ring, stretched so that once tilted it hugs the round torso instead of cutting through it.
    const tilt = 0.6;
    const sash = mk(new THREE.CylinderGeometry(0.218, 0.218, 0.12, 24, 1, true).scale(1 / Math.cos(tilt), 1, 1).rotateZ(tilt).translate(0, 0.33, 0), under);
    (sash.material as THREE.Material).side = THREE.DoubleSide;
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
    // Flat hands with a lighter palm, so turning the palms up/down reads clearly.
    const palm = new THREE.MeshStandardMaterial({ color: 0xffe6d4, roughness: 0.75 });
    const handGeo = new THREE.BoxGeometry(0.035, 0.1, 0.075).translate(0, -0.05, 0);
    const lHand = joint(0, -0.27, 0), rHand = joint(0, -0.27, 0);
    lHand.add(mk(handGeo, [palm, skin, skin, skin, skin, skin])); // palm faces +X (toward the body)
    rHand.add(mk(handGeo, [skin, palm, skin, skin, skin, skin])); // palm faces −X
    lFore.add(lHand);
    rFore.add(rHand);
    this.torso.add(lArm, rArm);

    this.joints = { lThigh, rThigh, lShin, rShin, lArm, rArm, lFore, rFore, lHand, rHand };
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

  /** Standing on a flying cloud (fast travel). */
  setCloud(on: boolean) {
    if (!this.cloud) {
      if (!on) return;
      this.cloud = makeCloud();
      this.cloud.position.y = -CLOUD_TOP;
      this.root.add(this.cloud);
    }
    this.cloud.visible = on;
  }

  /** Stick of incense in the right hand: 0 = none, 1 = unlit, 2 = lit (glowing tip). */
  setIncense(state: 0 | 1 | 2) {
    if (!this.incense) {
      if (!state) return;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 5), new THREE.MeshStandardMaterial({ color: 0x9c4a2a, roughness: 0.9 }));
      stick.rotation.x = -Math.PI / 2 + 0.4; // held forward and a little up
      stick.position.set(0, -0.06 + 0.07, -0.17);
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      tip.scale.setScalar(0.06);
      tip.position.set(0, 0.18, 0);
      stick.add(tip);
      this.joints.rHand.add(stick);
      this.incense = { stick, tip };
    }
    this.incense.stick.visible = state > 0;
    this.incense.tip.visible = state === 2;
  }

  /**
   * A lantern carried before you in both hands (blessing a wish), glowing `glow` times its usual brightness
   * (1–20), `size` its world scale (the wall lantern's); null puts it away.
   */
  holdLantern(color: number | null, glow = 1, size = LANTERN_HELD) {
    if (color === null) {
      if (this.lantern) this.lantern.g.visible = false;
      return;
    }
    if (!this.lantern) {
      const { body, trim } = lanternGeometries();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, mat), new THREE.Mesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = -0.55;
      g.add(halo);
      this.joints.rHand.add(g);
      this.lantern = { g, mat, halo };
    }
    const { g, mat, halo } = this.lantern;
    g.visible = true;
    g.scale.setScalar(size / (this.joints.rHand.getWorldScale(heldScale).x || 1));
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    mat.emissiveIntensity = 0.45 * glow;
    // the halo widens and brightens together: about 0.7 m across as carried, ~4.5 m at a blessing's 20×
    halo.material.color.setHex(color).multiplyScalar(Math.max(1, glow / 5));
    halo.material.opacity = Math.min(1, 0.22 * glow);
    halo.scale.setScalar(((0.9 + 0.4 * glow) * 0.5) / size); // in metres, whatever the lantern's size
  }
  private lantern: { g: THREE.Group; mat: THREE.MeshStandardMaterial; halo: THREE.Sprite } | null = null;

  /** Hide name tags beyond a distance to reduce clutter. */
  setTagVisible(v: boolean) {
    if (this.tag) this.tag.visible = v;
  }

  update(dt: number, speed = 0) {
    const carrying = !!this.lantern?.g.visible, moving = this.anim === 'walk' || this.anim === 'idle' || this.anim === 'run';
    const holding = !!this.hold && (this.anim === 'walk' || this.anim === 'run'); // beads / a sutra, on the move
    const target = carrying && moving ? CARRY : carrying && this.anim === 'bow' ? CARRY_BOW : holding ? POSES[this.hold!] : this.clasp && moving && this.anim !== 'run' ? CLASP : POSES[this.anim];
    const p = this.pose;
    const rate = 8;
    for (const k in target) (p as unknown as Record<string, number>)[k] = damp((p as unknown as Record<string, number>)[k], (target as unknown as Record<string, number>)[k], rate, dt);

    // Procedural gait layered on top of the base pose.
    let swing = 0, bob = 0;
    if (this.anim === 'walk' || this.anim === 'run') {
      this.phase += dt * (this.anim === "run" ? 11 : 8) * Math.min(1.4, Math.max(0.6, speed / 3.8));
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
    j.lThigh.rotation.z = p.lThighZ;
    j.rThigh.rotation.z = p.rThighZ;
    j.lShin.rotation.z = p.lShinZ;
    j.rShin.rotation.z = p.rShinZ;
    const armSwing = this.clasp || carrying || holding ? 0 : swing * 0.6;
    j.lHand.visible = j.rHand.visible = !this.clasp || carrying; // hands up the sleeves (unless carrying)
    j.lArm.rotation.x = p.lArm - armSwing;
    j.rArm.rotation.x = p.rArm + armSwing;
    j.lArm.rotation.z = p.lArmZ;
    j.rArm.rotation.z = p.rArmZ;
    j.lFore.rotation.x = p.lFore;
    j.rFore.rotation.x = p.rFore;
    j.lHand.rotation.y = p.lPalm;
    j.rHand.rotation.y = p.rPalm;
    if (carrying) { // the lantern hangs straight down from the hands, however the arms are bent
      j.rHand.updateWorldMatrix(true, false);
      this.lantern!.g.quaternion.copy(j.rHand.getWorldQuaternion(qHand).invert().multiply(this.root.getWorldQuaternion(qRoot)));
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.tag?.material.map?.dispose();
  }
}
