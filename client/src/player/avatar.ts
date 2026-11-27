import * as THREE from 'three';
import type { Anim } from '../../../shared/protocol';
import { damp } from '../core/math';
import { glowTexture, textTexture } from '../core/textures';
import { chaliceGeometries, lanternGeometries } from '../activities/wishLanterns';
import { CLOUD_TOP, makeCloud } from '../world/cloud';

/** Joint targets (radians, except hipY in metres). Limbs hang along -Y; +x rotation swings them forward. */
export interface Pose {
  hipY: number;
  /** Whole body pitched forward about the hips (π/2 = lying face down, the legs trailing behind), and the hips' shift forward (−Z) with it. */
  pitch: number; hipZ: number;
  torso: number;
  lThigh: number; rThigh: number;
  lShin: number; rShin: number;
  /** Sideways bends (outward splay at the hip, inward turn at the knee), for sitting cross-legged. */
  lThighZ: number; rThighZ: number;
  lShinZ: number; rShinZ: number;
  lArm: number; rArm: number;
  lArmZ: number; rArmZ: number;
  lFore: number; rFore: number;
  /** Sideways bend of the forearm (inward positive on the left, negative on the right), to bring joined hands to the midline. */
  lForeZ: number; rForeZ: number;
  /** Hand twist about the forearm: 0 = palms facing the body; ±π/2 turns them down/up. */
  lPalm: number; rPalm: number;
  head: number;
}

const STAND: Pose = { hipY: 0.92, pitch: 0, hipZ: 0, torso: 0, lThigh: 0, rThigh: 0, lShin: 0, rShin: 0, lThighZ: 0, rThighZ: 0, lShinZ: 0, rShinZ: 0, lArm: 0.05, rArm: 0.05, lArmZ: -0.08, rArmZ: 0.08, lFore: 0.15, rFore: 0.15, lForeZ: 0, rForeZ: 0, lPalm: 0, rPalm: 0, head: 0 };
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
// (hands upright, the palms' heels on the breastbone)
const HEART = { lArm: 0.22, rArm: 0.22, lArmZ: 0.21, rArmZ: -0.21, lFore: 2.28, rFore: 2.28, lForeZ: 0.63, rForeZ: -0.63 };
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

/** Standing, the right arm out to the side and a little forward, the hand at rail height (the great prayer wheel). */
const WHEEL_ARM: Pose = { ...STAND, torso: 0.04, rArm: 0.3, rArmZ: 0.95, rFore: 0.1, rPalm: 0, head: 0 };

// Prostration (大禮拜), after the palms at crown / forehead / mouth / heart: kneel, lie full length, arms back, rise.
const PK = { hipY: 0.5, lShin: -1.57, rShin: -1.57 }; // kneeling upright on the knees
// (both arms straight ahead along the ground, the hands side by side, palms flat down)
const FLAT: Pose = { ...STAND, hipY: 0.16, pitch: H, hipZ: -0.6, head: -0.25, lArm: 2.82, rArm: 2.82, lArmZ: 0.48, rArmZ: -0.48, lFore: 0.18, rFore: 0.18, lForeZ: 0.24 * -1, rForeZ: 0.24, lPalm: -H, rPalm: H };

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
  pCrown: { ...STAND, lArm: 2.48, rArm: 2.48, lArmZ: 0.47, rArmZ: -0.47, lFore: 0.98, rFore: 0.98, lForeZ: 0.02, rForeZ: -0.02, head: -0.05 },
  pMouth: { ...STAND, lArm: 1.32, rArm: 1.32, lArmZ: 0.21, rArmZ: -0.21, lFore: 1.97, rFore: 1.97, lForeZ: 0.53, rForeZ: -0.53 },
  pHeart: { ...STAND, ...HEART },
  pKneelUp: { ...STAND, ...HEART, hipY: 0.5, lShin: -1.57, rShin: -1.57 },
  pDown: P_DOWN,
  // forehead: the joined palms at the brow
  pForehead: { ...STAND, lArm: 1.87, rArm: 1.87, lArmZ: 0.21, rArmZ: -0.21, lFore: 1.48, rFore: 1.48, lForeZ: 0.45, rForeZ: -0.45, head: 0.04 },
  // lying flat on the face, the arms stretched out ahead along the ground
  pFlat: FLAT,
  // …then the elbows bend back and the joined palms come to rest above the head
  pFlatHands: { ...FLAT, lArm: 2.62, rArm: 2.62, lArmZ: 0.67, rArmZ: -0.67, lFore: 1.46, rFore: 1.46, lForeZ: 0.1, rForeZ: -0.1, lPalm: 0, rPalm: 0 },
  // pushing up: the hands planted by the chest, the arms straightening, the chest and hips lifting off the ground
  pPush: { ...STAND, hipY: 0.43, pitch: 1.1, hipZ: -0.5, head: -0.4, lArm: 1.1, rArm: 1.1, lArmZ: -0.1, rArmZ: 0.1, lFore: 0.02, rFore: 0.02, lPalm: -H, rPalm: H },
  // …then back onto the knees, still leaning on the hands
  pRise: { ...STAND, ...PK, hipZ: -0.15, pitch: 0.2, torso: 0.9, head: 0.1, lThigh: 0.2, rThigh: 0.2, lArm: 1.05, rArm: 1.05, lArmZ: -0.1, rArmZ: 0.1, lFore: 0.1, rFore: 0.1, lPalm: -H, rPalm: H },
  pUp: { ...P_DOWN, lPalm: H, rPalm: -H },
  reach: { ...STAND, torso: 0.15, head: 0.2, rArm: 1.0, rArmZ: 0.05, rFore: 0.35 },
  offerUp: { ...STAND, torso: -0.08, head: -0.35, rArm: 2.75, rArmZ: 0.18, rFore: 0.2, lArm: 0.35, lArmZ: -0.12, lFore: 0.6 }, // (a flag held up high, looking up)
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

/**
 * Wide pleated trouser legs (hakama): a flared tube hanging from the joint (along −Y), its radius stepping out at
 * each knife pleat. Side by side, standing, the two read as one pleated skirt; they still walk, sit and kneel.
 */
function pleatedLeg(top: number, bottom: number, len: number, pleats: number) {
  const g = new THREE.CylinderGeometry(top, bottom, len, pleats * 4, 2).translate(0, -len / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), down = -p.getY(i) / len;
    const k = 1 + ((((a / (Math.PI * 2)) * pleats) % 1 + 1) % 1) * (0.03 + 0.06 * down);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** The koromo's outline: [radius, height above the hips]. The body is this, turned, and flattened to 0.74 front to back. */
const ROBE: [number, number][] = [[0.001, 0.66], [0.07, 0.645], [0.19, 0.58], [0.235, 0.5], [0.225, 0.3], [0.225, 0.08], [0.235, -0.04]];
/** How far the robe's front stands out (+) at (x, y). */
function chestZ(x: number, y: number) {
  let r = ROBE[ROBE.length - 1][0];
  for (let i = 1; i < ROBE.length; i++) {
    const [r0, y0] = ROBE[i - 1], [r1, y1] = ROBE[i];
    if (y <= y0 && y >= y1) {
      r = r0 + ((r1 - r0) * (y0 - y)) / (y0 - y1);
      break;
    }
  }
  return 0.74 * Math.sqrt(Math.max(0, r * r - x * x));
}

/** How big a carried lantern is by default (world scale): a wall lantern's size, so it doesn't change in your hands. */
export const LANTERN_HELD = 0.9;
const heldScale = new THREE.Vector3(), qHand = new THREE.Quaternion(), qRoot = new THREE.Quaternion();

/** The colour someone glows after walking round the stupa (see setGlow). */
const GLOW = new THREE.Color(1, 0.78, 0.45);

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
  /** Footfalls so far: the footstep sound plays on each one, so sound and feet keep time. */
  steps = 0;
  /** Walk/stand with hands tucked in the sleeves and no arm swing (local only — the entry stroll). */
  clasp = false;
  /** Walking with the right hand out on the great prayer wheel's rail (the legs keep walking). */
  wheelArm = false;
  /** The right hand (to hold something in it, e.g. a prayer flag). */
  get rightHand() {
    return this.joints.rHand;
  }

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

    // Torso: a koromo — broad, soft shoulders, a little flattened front to back. Origin at the hips, shoulders at ~0.55.
    const body = new THREE.LatheGeometry([...ROBE].reverse().map(([r, y]) => new THREE.Vector2(r, y)), 20).scale(1, 1, 0.74); // bottom → top, so its faces point out
    this.torso.add(mk(body, robe));
    // a dark band at the waist, where the hakama is tied over the robe
    this.torso.add(mk(new THREE.CylinderGeometry(0.242, 0.244, 0.07, 20).scale(1, 1, 0.76).translate(0, -0.02, 0), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 })));
    // collar (the front is −Z): a white under-collar edging the robe's collar band, crossed left over right on the chest
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.7 });
    // each band a ribbon lying on the chest (it follows the robe's curve), from beside the neck down to where they cross
    const ribbon = (x0: number, y0: number, x1: number, y1: number, w: number, off: number, m: THREE.Material) => {
      const N = 8, pos: number[] = [], idx: number[] = [];
      const len = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / len) * (w / 2), ny = ((x1 - x0) / len) * (w / 2);
      for (let i = 0; i <= N; i++) {
        const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * i) / N;
        for (const e of [-1, 1]) pos.push(x + e * nx, y + e * ny, -chestZ(x + e * nx, y + e * ny) - off);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      if ((g.attributes.normal as THREE.BufferAttribute).getZ(0) > 0) g.setIndex(idx.reverse()), g.computeVertexNormals(); // face out (−Z)
      this.torso.add(mk(g, m));
    };
    // A V from the sides of the neck to where the collars cross (low on the chest). The wearer's right collar tucks
    // under there; the left one, on top, carries on down toward the right hip. The white under-collar edges the V.
    const [cx, cy] = [0, 0.4];
    for (const side of [-1, 1]) {
      const [x0, y0] = [side * 0.077, 0.63], l = Math.hypot(cx - x0, cy - y0);
      const ix = (-(y0 - cy) / l) * side * 0.033, iy = (Math.abs(cx - x0) / l) * 0.033; // toward the opening of the V
      ribbon(x0 + ix, y0 + iy, cx + ix, cy + iy, 0.03, 0.008, white);
      const on = side < 0, k = on ? 1.87 : 1.04; // the left goes on past the crossing; the right just reaches it
      ribbon(x0, y0, x0 + (cx - x0) * k, y0 + (cy - y0) * k, 0.07, on ? 0.018 : 0.014, robe);
    }
    this.torso.add(mk(new THREE.TorusGeometry(0.078, 0.02, 6, 16, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI).scale(1, 1, 0.8).translate(0, 0.625, 0.01), white)); // round the back of the neck

    this.head.position.set(0, 0.62, 0);
    this.head.add(mk(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8).translate(0, 0.04, 0), skin));
    this.head.add(mk(new THREE.SphereGeometry(0.115, 16, 12).translate(0, 0.19, 0), skin));
    this.torso.add(this.head);

    const lThigh = joint(-0.1, 0, 0), rThigh = joint(0.1, 0, 0);
    const lShin = joint(0, -0.45, 0), rShin = joint(0, -0.45, 0);
    // hakama: wide pleated legs to the ankle, in a darker shade of the robe
    lThigh.add(mk(pleatedLeg(0.125, 0.15, 0.5, 6).translate(0, 0.04, 0), under), lShin);
    rThigh.add(mk(pleatedLeg(0.125, 0.15, 0.5, 6).translate(0, 0.04, 0), under), rShin);
    lShin.add(mk(pleatedLeg(0.15, 0.18, 0.45, 6), under));
    rShin.add(mk(pleatedLeg(0.15, 0.18, 0.45, 6), under));
    const foot = () => mk(new THREE.BoxGeometry(0.09, 0.06, 0.2).translate(0, -0.45, -0.05), new THREE.MeshStandardMaterial({ color: 0x2a2018 }));
    lShin.add(foot());
    rShin.add(foot());
    this.hips.add(lThigh, rThigh);

    const lArm = joint(-0.23, 0.52, 0), rArm = joint(0.23, 0.52, 0);
    const lFore = joint(0, -0.29, 0), rFore = joint(0, -0.29, 0);
    // loose robe sleeves, widening a little toward the cuff
    lArm.add(limb(0.31, 0.085, robe), lFore);
    rArm.add(limb(0.31, 0.085, robe), rFore);
    const sleeve = () => mk(new THREE.CylinderGeometry(0.075, 0.1, 0.27, 12).translate(0, -0.135, 0), robe);
    lFore.add(sleeve());
    rFore.add(sleeve());
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

  private glowMats: THREE.MeshStandardMaterial[] | null = null;
  private glowNow = 0;
  /** Lit from within (after walking round the stupa): robe, skin and all glow in their own colours, 0 … ~0.6. */
  setGlow(v: number) {
    if (Math.abs(v - this.glowNow) < 0.005) return;
    this.glowNow = v;
    if (!this.glowMats) {
      const set = new Set<THREE.MeshStandardMaterial>();
      this.root.traverse((o) => { const m = (o as THREE.Mesh).material; if (m instanceof THREE.MeshStandardMaterial && !m.vertexColors) set.add(m); });
      this.glowMats = [...set];
      for (const m of this.glowMats) m.emissive.copy(m.color).lerp(GLOW, 0.15); // each its own colour, a touch warmer: brighter, not white
    }
    for (const m of this.glowMats) m.emissiveIntensity = v;
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
  holdLantern(color: number | null, glow = 1, size = LANTERN_HELD, kind: 'lantern' | 'chalice' = 'lantern') {
    if (color === null) {
      if (this.lantern) this.lantern.g.visible = false;
      return;
    }
    if (this.lantern && this.lantern.kind !== kind) {
      this.joints.rHand.remove(this.lantern.g);
      this.lantern = null;
    }
    if (!this.lantern) {
      const { body, trim } = kind === 'chalice' ? chaliceGeometries() : lanternGeometries();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, mat), new THREE.Mesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = kind === 'chalice' ? 0.47 : -0.55; // at the flame, or the lantern's middle
      g.add(halo);
      this.joints.rHand.add(g);
      this.lantern = { g, mat, halo, kind };
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
  private lantern: { g: THREE.Group; mat: THREE.MeshStandardMaterial; halo: THREE.Sprite; kind: 'lantern' | 'chalice' } | null = null;

  private props: { book: THREE.Group; mala: THREE.Group } | null = null;
  /** The sutra book and the mala in the hands for the pose `a` (null or any other pose: neither). */
  private showProps(a: Anim | null) {
    const both = a === 'read' || a === 'sitRead' || a === 'crossRead' || a === 'standRead';
    const withBeads = a === 'crossReadBeads' || a === 'sitReadBeads' || a === 'standReadBeads'; // sutra right, beads left
    const beads = a === 'beads' || a === 'sitBeads' || a === 'crossBeads' || a === 'standBeads';
    if (!this.props) {
      if (!both && !withBeads && !beads) return;
      this.props = this.makeProps();
    }
    const { book, mala } = this.props;
    book.visible = both || withBeads;
    if (book.visible) {
      book.position.x = both ? 0 : 0.23;
      book.scale.x = both ? 1 : 0.55;
    }
    mala.visible = beads || withBeads;
    if (mala.visible) {
      const hand = withBeads ? this.joints.lHand : this.joints.rHand;
      if (mala.parent !== hand) hand.add(mala);
    }
  }

  private makeProps() {
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      return mesh;
    };
    // a folded sutra: cream leaves between two dark blue covers, held open before the face between the two hands
    const cover = new THREE.MeshStandardMaterial({ color: 0x24305a, roughness: 0.8 }), leaf = new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.9 });
    const book = new THREE.Group();
    book.add(mk(new THREE.BoxGeometry(0.4, 0.014, 0.16), cover), mk(new THREE.BoxGeometry(0.38, 0.03, 0.15).translate(0, 0.02, 0), leaf), mk(new THREE.BoxGeometry(0.4, 0.014, 0.16).translate(0, 0.04, 0), cover));
    book.position.set(0, 0.34, -0.44); // between the hands, before the chest (torso space)
    book.rotation.x = -0.45; // tipped back toward the eyes
    this.torso.add(book);
    // a mala: a ring of wooden beads round the fingers, a gold marker, a guru bead and a short red tassel
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b2f1a, roughness: 0.45 }), gold = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.4, metalness: 0.4 });
    const mala = new THREE.Group();
    const N = 18, R = 0.058;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, b = mk(new THREE.SphereGeometry(i % 6 === 0 ? 0.016 : 0.012, 8, 6), i % 6 === 0 && i ? gold : wood);
      b.position.set(Math.cos(a) * R * 0.7, 0, Math.sin(a) * R);
      mala.add(b);
    }
    const tassel = mk(new THREE.ConeGeometry(0.01, 0.07, 6).translate(0, -0.035, 0), new THREE.MeshStandardMaterial({ color: 0x9e1b1b, roughness: 0.9 }));
    tassel.position.set(0, -0.01, R);
    mala.add(tassel);
    mala.position.set(0, -0.085, 0); // round the fingers
    mala.visible = false;
    this.joints.rHand.add(mala);
    return { book, mala };
  }

  /** Hide name tags beyond a distance to reduce clutter. */
  setTagVisible(v: boolean) {
    if (this.tag) this.tag.visible = v;
  }

  update(dt: number, speed = 0) {
    const carrying = !!this.lantern?.g.visible, moving = this.anim === 'walk' || this.anim === 'idle' || this.anim === 'run';
    const holding = !!this.hold && (this.anim === 'walk' || this.anim === 'run'); // beads / a sutra, on the move
    const wheeling = this.wheelArm && moving;
    const target = wheeling ? WHEEL_ARM : carrying && moving ? CARRY : carrying && this.anim === 'bow' ? CARRY_BOW : holding ? POSES[this.hold!] : this.clasp && moving && this.anim !== 'run' ? CLASP : POSES[this.anim];
    const p = this.pose;
    const rate = 8;
    for (const k in target) (p as unknown as Record<string, number>)[k] = damp((p as unknown as Record<string, number>)[k], (target as unknown as Record<string, number>)[k], rate, dt);

    // Procedural gait layered on top of the base pose.
    let swing = 0, bob = 0;
    if (this.anim === 'walk' || this.anim === 'run') {
      // Legs ~0.9 m long swinging ±amp cover 2·0.9·sin(amp) a step; take steps at exactly the rate you move, so the
      // feet don't skate, and count each footfall (legs widest apart, body lowest) for the footstep sound.
      const amp = this.anim === 'run' ? 0.85 : 0.62, stepLen = 1.8 * Math.sin(amp), before = this.phase;
      this.phase += (dt * Math.PI * Math.max(0.6, speed)) / stepLen;
      if (Math.floor(this.phase / Math.PI - 0.5) > Math.floor(before / Math.PI - 0.5)) this.steps++;
      swing = Math.sin(this.phase) * amp;
      bob = Math.abs(Math.cos(this.phase)) * 0.035;
    } else this.phase = 0;

    const j = this.joints;
    this.hips.position.y = p.hipY + bob;
    this.hips.position.z = p.hipZ;
    this.hips.rotation.x = -p.pitch;
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
    const armSwing = this.clasp || carrying || holding || wheeling ? 0 : swing * 0.6;
    j.lHand.visible = j.rHand.visible = !this.clasp || carrying; // hands up the sleeves (unless carrying)
    j.lArm.rotation.x = p.lArm - armSwing;
    j.rArm.rotation.x = p.rArm + armSwing;
    j.lArm.rotation.z = p.lArmZ;
    j.rArm.rotation.z = p.rArmZ;
    j.lFore.rotation.x = p.lFore;
    j.rFore.rotation.x = p.rFore;
    j.lFore.rotation.z = p.lForeZ;
    j.rFore.rotation.z = p.rForeZ;
    j.lHand.rotation.y = p.lPalm;
    j.rHand.rotation.y = p.rPalm;
    // Beads / a sutra in the hands, while the arms are in their holding pose (and not reaching, carrying, hiding in sleeves)
    const held = wheeling || carrying || (this.clasp && moving) ? null : holding ? this.hold : this.anim;
    this.showProps(held);
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
