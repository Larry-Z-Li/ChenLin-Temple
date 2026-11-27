import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTexture } from '../core/textures';

/**
 * Garuda: standing, hands joined at the chest, crowned, with great spread wings, a fan of tail feathers and taloned
 * feet. One skinned mesh (three draws: body, gold, feathers) on a skeleton you can pose: rotate any of `bones` (rest is
 * the standing pose; each part follows its bone, the limbs bending smoothly at the joints). Metres; feet at the
 * origin, facing +z (its left is +x). Bones:
 *   root › hips › spine › chest › neck › head
 *   chest › shoulder.L/R › upperArm › forearm › hand · chest › wing1.L/R › wing2 › wing3
 *   hips › thigh.L/R › shin › foot · hips › tail
 * `update(dt, 'idle' | 'flap', level)` animates the wings, chest and head by itself ('flap' with `level` 1 beats them
 * for a body pitched forward flat in flight, 0 for an upright hover); 'none' leaves every bone to you.
 */
export interface Garuda {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  update(dt: number, mode?: 'idle' | 'flap' | 'none', level?: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
const SKIN = 0xe3b07e, GOLD = 0xd9a520, RED = 0xb3261e, DEEP = 0x7a1712, HAIR = 0x2b1a12, DARK = 0x1c1410, JEWEL = 0xc0182a;
const SCALE = 0xc8923a, CLAW = 0x2a211b;
const WING = (s: number) => [V(0.12 * s, 1.4, -0.14), V(0.7 * s, 1.62, -0.2), V(1.3 * s, 1.86, -0.22), V(1.85 * s, 2.06, -0.22)];

export function buildGaruda(): Garuda {
  // ---------- the skeleton (rest positions given in the figure's frame) ----------
  const bones: Record<string, THREE.Bone> = {}, list: THREE.Bone[] = [], at = new Map<THREE.Bone, THREE.Vector3>();
  const bone = (name: string, parent: THREE.Bone | null, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    at.set(b, V(x, y, z));
    if (parent) b.position.set(x, y, z).sub(at.get(parent)!), parent.add(b);
    else b.position.set(x, y, z);
    bones[name] = b;
    list.push(b);
    return b;
  };
  const root = bone('root', null, 0, 0, 0);
  const hips = bone('hips', root, 0, 0.95, 0);
  const spine = bone('spine', hips, 0, 1.1, 0);
  const chest = bone('chest', spine, 0, 1.3, 0);
  const neck = bone('neck', chest, 0, 1.5, 0);
  bone('head', neck, 0, 1.6, 0);
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    const sh = bone(`shoulder.${k}`, chest, 0.1 * s, 1.43, 0);
    const ua = bone(`upperArm.${k}`, sh, 0.19 * s, 1.43, 0);
    const fa = bone(`forearm.${k}`, ua, 0.27 * s, 1.17, 0.07);
    bone(`hand.${k}`, fa, 0.06 * s, 1.29, 0.2);
    const th = bone(`thigh.${k}`, hips, 0.1 * s, 0.95, 0);
    const sn = bone(`shin.${k}`, th, 0.11 * s, 0.5, 0.02);
    bone(`foot.${k}`, sn, 0.11 * s, 0.1, 0.03);
    const [w0, w1, w2] = WING(s);
    const b1 = bone(`wing1.${k}`, chest, w0.x, w0.y, w0.z);
    const b2 = bone(`wing2.${k}`, b1, w1.x, w1.y, w1.z);
    bone(`wing3.${k}`, b2, w2.x, w2.y, w2.z);
  }
  bone('tail', hips, 0, 0.9, -0.12);

  // ---------- the parts: each made in place, coloured, and bound to its bone ----------
  type Bucket = 'body' | 'gold' | 'feather';
  type Blend = { bone: string; a: THREE.Vector3; b: THREE.Vector3; span: number };
  const buckets: Record<Bucket, THREE.BufferGeometry[]> = { body: [], gold: [], feather: [] };
  const tmp = new THREE.Color();
  /** Bound to `boneName`; with `blend` (a limb from a to b), shared with `blend.bone` at a, so the joint bends smoothly. */
  const part = (geo: THREE.BufferGeometry, boneName: string, colour: number | ((i: number, c: THREE.Color) => void), bucket: Bucket = 'body', blend: Blend | null = null) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    g.computeVertexNormals();
    const p = g.attributes.position, n = p.count, bi = list.indexOf(bones[boneName]);
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const d = blend ? blend.b.clone().sub(blend.a) : null, L2 = d ? d.lengthSq() : 1, v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (typeof colour === 'function') colour(i, tmp); else tmp.set(colour);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
      si[i * 4] = bi;
      sw[i * 4] = 1;
      if (blend && d) {
        const x = Math.min(1, Math.max(0, v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(blend.a).dot(d) / L2 / blend.span));
        const wp = 0.5 * (1 - x * x * (3 - 2 * x));
        si[i * 4 + 1] = list.indexOf(bones[blend.bone]);
        sw[i * 4] = 1 - wp;
        sw[i * 4 + 1] = wp;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    buckets[bucket].push(g);
  };
  /** A tapered cylinder from a (radius r0) to b (radius r1). */
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 8) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    return new THREE.CylinderGeometry(r1, r0, L, seg, 1).translate(0, L / 2, 0)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())).translate(a.x, a.y, a.z);
  };
  const ball = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 10) =>
    new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)).scale(sx, sy, sz).translate(x, y, z);
  const ring = (r: number, tube: number, x: number, y: number, z: number, tilt = 0, sz = 1) =>
    new THREE.TorusGeometry(r, tube, 6, 18).rotateX(Math.PI / 2 + tilt).scale(1, 1, sz).translate(x, y, z);

  // head and crown
  part(ball(0.105, 0, 1.645, 0.01, 1, 1.18, 1.02), 'head', SKIN);
  part(ball(0.112, 0, 1.67, -0.025, 1, 1.05, 1), 'head', HAIR);
  part(new THREE.ConeGeometry(0.018, 0.05, 6).rotateX(Math.PI / 2).translate(0, 1.635, 0.122), 'head', SKIN);
  for (const s of [1, -1]) {
    part(ball(0.012, 0.036 * s, 1.665, 0.1, 1.3, 0.8, 0.6, 6), 'head', DARK);
    part(ball(0.025, 0.103 * s, 1.645, 0, 0.5, 1, 0.8, 6), 'head', SKIN);
    part(new THREE.TorusGeometry(0.022, 0.006, 5, 10).rotateY(Math.PI / 2).translate(0.106 * s, 1.598, 0), 'head', GOLD, 'gold');
    part(new THREE.ConeGeometry(0.035, 0.12, 3).scale(1, 1, 0.25).rotateZ(-0.6 * s).translate(0.12 * s, 1.79, 0), 'head', GOLD, 'gold');
  }
  part(new THREE.BoxGeometry(0.05, 0.012, 0.02).translate(0, 1.597, 0.1), 'head', 0xa0302a);
  for (const [r0, r1, h, y] of [[0.112, 0.116, 0.06, 1.745], [0.1, 0.106, 0.07, 1.81], [0.084, 0.09, 0.07, 1.88], [0.066, 0.072, 0.07, 1.95]])
    part(new THREE.CylinderGeometry(r0, r1, h, 12).translate(0, y, 0), 'head', GOLD, 'gold');
  part(new THREE.ConeGeometry(0.06, 0.13, 12).translate(0, 2.05, 0), 'head', GOLD, 'gold');
  part(ball(0.022, 0, 2.125, 0, 1, 1, 1, 8), 'head', GOLD, 'gold');
  part(ball(0.02, 0, 1.75, 0.116, 1, 1.2, 0.6, 8), 'head', JEWEL);

  // neck, torso, jewellery
  part(limb(V(0, 1.44, 0), V(0, 1.57, 0), 0.058, 0.052), 'neck', SKIN, 'body', { bone: 'chest', a: V(0, 1.44, 0), b: V(0, 1.57, 0), span: 0.5 });
  part(new THREE.CylinderGeometry(0.17, 0.138, 0.46, 10).scale(1, 1, 0.72).translate(0, 1.24, 0), 'chest', SKIN);
  part(new THREE.CylinderGeometry(0.176, 0.172, 0.07, 12, 1, true).scale(1, 1, 0.75).translate(0, 1.34, 0), 'chest', GOLD, 'gold');
  part(ring(0.1, 0.013, 0, 1.47, 0.02, 0.35), 'chest', GOLD, 'gold');
  part(ring(0.135, 0.015, 0, 1.39, 0.035, 0.5, 0.78), 'chest', GOLD, 'gold');
  part(ball(0.022, 0, 1.33, 0.13, 1, 1.2, 0.6, 8), 'chest', JEWEL);

  // arms, hands joined at the chest
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    const shoulder = V(0.19 * s, 1.43, 0), elbow = V(0.27 * s, 1.17, 0.07), wrist = V(0.06 * s, 1.29, 0.2);
    const up = elbow.clone().sub(shoulder).normalize(), fore = wrist.clone().sub(elbow).normalize();
    part(ball(0.072, shoulder.x, shoulder.y, shoulder.z), `upperArm.${k}`, SKIN);
    part(limb(shoulder, elbow, 0.056, 0.046), `upperArm.${k}`, SKIN, 'body', { bone: 'chest', a: shoulder, b: elbow, span: 0.25 });
    const band = lerpV(shoulder, elbow, 0.35);
    part(limb(band.clone().addScaledVector(up, -0.02), band.clone().addScaledVector(up, 0.02), 0.062, 0.06, 10), `upperArm.${k}`, GOLD, 'gold');
    part(ball(0.047, elbow.x, elbow.y, elbow.z, 1, 1, 1, 8), `forearm.${k}`, SKIN);
    part(limb(elbow, wrist, 0.046, 0.034), `forearm.${k}`, SKIN, 'body', { bone: `upperArm.${k}`, a: elbow, b: wrist, span: 0.2 });
    const cuff = lerpV(elbow, wrist, 0.86);
    part(limb(cuff.clone().addScaledVector(fore, -0.018), cuff.clone().addScaledVector(fore, 0.018), 0.042, 0.04, 10), `forearm.${k}`, GOLD, 'gold');
    part(new THREE.BoxGeometry(0.026, 0.13, 0.075).rotateX(-0.25).translate(0.015 * s, 1.36, 0.215), `hand.${k}`, SKIN);
  }

  // the dhoti: wrapped at the hips and on down each leg (so the legs move in it); belt and sash
  part(new THREE.CylinderGeometry(0.158, 0.19, 0.3, 12).scale(1, 1, 0.8).translate(0, 0.9, 0), 'hips', RED);
  part(new THREE.CylinderGeometry(0.162, 0.162, 0.05, 12).scale(1, 1, 0.8).translate(0, 1.045, 0), 'hips', GOLD, 'gold');
  part(new THREE.CylinderGeometry(0.192, 0.194, 0.035, 12, 1, true).scale(1, 1, 0.8).translate(0, 0.76, 0), 'hips', GOLD, 'gold');
  part(new THREE.BoxGeometry(0.1, 0.5, 0.02).translate(0, 0.77, 0.172), 'hips', (i, c) => void c.set(i % 12 < 6 ? DEEP : RED));
  part(new THREE.BoxGeometry(0.11, 0.03, 0.025).translate(0, 0.55, 0.176), 'hips', GOLD, 'gold');
  part(ball(0.025, 0, 1.045, 0.135, 1, 1, 0.6, 8), 'hips', JEWEL);
  // legs: cloth to mid-calf, then a bird's scaly shank and taloned foot (three toes forward, one back)
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    const hip = V(0.1 * s, 0.95, 0), knee = V(0.11 * s, 0.5, 0.02), calf = V(0.11 * s, 0.3, 0.025), ankle = V(0.11 * s, 0.1, 0.03);
    part(limb(hip, knee, 0.105, 0.078, 10), `thigh.${k}`, RED, 'body', { bone: 'hips', a: hip, b: knee, span: 0.35 });
    part(ball(0.078, knee.x, knee.y, knee.z, 1, 1, 1, 10), `shin.${k}`, RED);
    part(limb(knee, calf, 0.078, 0.07, 10), `shin.${k}`, RED, 'body', { bone: `thigh.${k}`, a: knee, b: calf, span: 0.5 });
    part(ring(0.071, 0.012, calf.x, calf.y, calf.z), `shin.${k}`, GOLD, 'gold');
    part(limb(calf, ankle, 0.042, 0.032, 7), `shin.${k}`, (i, c) => void c.set(SCALE).multiplyScalar(i % 6 < 3 ? 0.85 : 1));
    part(ring(0.038, 0.01, ankle.x, ankle.y + 0.04, ankle.z), `shin.${k}`, GOLD, 'gold');
    part(ball(0.04, ankle.x, ankle.y - 0.035, ankle.z + 0.01, 1, 0.7, 1.1, 8), `foot.${k}`, SCALE);
    const toe = (yaw: number, len: number, r: number) => { // a toe out from the foot's pad, curling down into a claw
      const dir = V(Math.sin(yaw), -0.18, Math.cos(yaw)).normalize(), a = V(ankle.x, 0.045, ankle.z + 0.01), b = a.clone().addScaledVector(dir, len);
      part(limb(a, b, r, r * 0.75, 6), `foot.${k}`, SCALE);
      part(ball(r * 0.85, b.x, b.y, b.z, 1, 1, 1, 6), `foot.${k}`, SCALE);
      const tip = b.clone().addScaledVector(dir, 0.045).add(V(0, -0.03, 0));
      part(limb(b, tip, r * 0.7, 0.002, 6), `foot.${k}`, CLAW);
    };
    for (const yaw of [-0.42, 0, 0.42]) toe(yaw * s + 0.04 * s, 0.1, 0.018);
    toe(Math.PI, 0.055, 0.016);
  }

  // ---------- feathers ----------
  const BROWN = new THREE.Color(0x5a3418), TAN = new THREE.Color(0xa86f35), TIP = new THREE.Color(0xd9a656);
  /** A feather `len` long from `base` along `dir` (flat, its face to ±z), shading from its root to its tip. */
  const feather = (base: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, boneName: string, from = BROWN, to = TIP) => {
    const t = new THREE.OctahedronGeometry(1, 0).scale(width / 2, len / 2, 0.012).translate(0, len / 2, 0);
    const p = t.attributes.position, ys = Array.from({ length: p.count }, (_, i) => p.getY(i) / len);
    t.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())).translate(base.x, base.y, base.z);
    part(t, boneName, (i, c) => { const y = ys[i]; c.copy(from).lerp(to, y); if (y > 0.78 && y < 0.86) c.multiplyScalar(0.55); }, 'feather');
  };
  const D = Math.PI / 180, ang = (a: number, s: number) => V(Math.cos(a) * s, Math.sin(a), 0); // (from out along the wing; negative is down)
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    const [w0, w1, w2, w3] = WING(s);
    part(limb(w0, w1, 0.04, 0.034), `wing1.${k}`, 0x8a5a2b, 'feather');
    part(limb(w1, w2, 0.034, 0.026), `wing2.${k}`, 0x8a5a2b, 'feather', { bone: `wing1.${k}`, a: w1, b: w2, span: 0.2 });
    part(limb(w2, w3, 0.026, 0.012), `wing3.${k}`, 0x8a5a2b, 'feather', { bone: `wing2.${k}`, a: w2, b: w3, span: 0.2 });
    for (let i = 0; i < 10; i++) { // primaries, fanning from down-and-out to out-and-up toward the tip
      const t = i / 9;
      feather(lerpV(w2, w3, t * 0.85).add(V(0, 0, -0.03)), ang((-78 + 100 * t) * D, s), 0.55 + 0.4 * t, 0.12, `wing3.${k}`);
    }
    for (let i = 0; i < 10; i++) { // secondaries, hanging down along the middle of the wing
      const t = i / 9;
      feather(lerpV(w1, w2, t).add(V(0, 0, -0.025)), ang((-100 + 18 * t) * D, s), 0.6 + 0.05 * t, 0.13, `wing2.${k}`);
    }
    for (let i = 0; i < 5; i++) { // tertials by the body
      const t = i / 4;
      feather(lerpV(w0, w1, 0.25 + t * 0.75).add(V(0, 0, -0.02)), ang((-104 + 4 * t) * D, s), 0.45 + 0.12 * t, 0.12, `wing1.${k}`);
    }
    for (const [row, len, dz, dy] of [[0, 0.32, 0, -0.02], [1, 0.2, 0.012, 0.02]]) { // coverts over the roots of the long ones
      for (let i = 0; i < 16; i++) {
        const t = i / 15, seg = t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
        const base = (seg === 0 ? lerpV(w0, w1, t * 3) : seg === 1 ? lerpV(w1, w2, t * 3 - 1) : lerpV(w2, w3, t * 3 - 2)).add(V(0, dy, dz));
        feather(base, ang((-95 + 30 * t) * D, s), len * (1 - 0.25 * t), 0.1, `wing${seg + 1}.${k}`, row ? new THREE.Color(0xb8863f) : TAN, row ? new THREE.Color(0xe8c06a) : TIP);
      }
    }
  }
  for (let i = 0; i < 11; i++) { // the tail: a fan of long feathers down behind the legs
    const t = i / 10, a = (-58 - 64 * t) * D;
    feather(V(0, 0.9, -0.15 - 0.01 * Math.abs(t - 0.5)), V(Math.cos(a), Math.sin(a), -0.28), 0.82 + 0.1 * Math.sin(t * Math.PI), 0.14, 'tail');
  }

  // ---------- one skinned mesh ----------
  const geo = mergeGeometries([mergeGeometries(buckets.body), mergeGeometries(buckets.gold), mergeGeometries(buckets.feather)], true);
  // (glowing always, each part in its own colours: the emissive taken from the vertex colours)
  const glowing = (m: THREE.MeshStandardMaterial, k: number) => {
    m.emissive.setRGB(1, 1, 1);
    m.emissiveIntensity = k;
    m.onBeforeCompile = (sh) => (sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;'));
    m.customProgramCacheKey = () => 'garuda-glow';
    return m;
  };
  const mesh = new THREE.SkinnedMesh(geo, [
    glowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true }), 0.4),
    glowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85, flatShading: true }), 0.6),
    glowing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }), 0.45),
  ]);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(list));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false; // (its bounds are the rest pose's; a raised wing would be culled wrongly)
  const group = new THREE.Group();
  group.name = 'Garuda';
  group.add(mesh);
  // and a soft golden aura about him
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.set(0, 1.5, 0);
  aura.scale.setScalar(3.6);
  group.add(aura);

  // ---------- its own motion: a slow idle, or a wingbeat ----------
  let t = 0;
  const update = (dt: number, mode: 'idle' | 'flap' | 'none' = 'idle', level = 0) => {
    if (mode === 'none') return;
    t += dt;
    const flap = mode === 'flap', w = flap ? (Math.PI * 2) / 1.4 : (Math.PI * 2) / 3, amp = flap ? [0.4, 0.2, 0.17] : [0.05, 0.03, 0.03];
    const lv = flap ? level : 0, big = 1 + 0.6 * lv; // (in flight the beat is about the spine, so the tips go up and down)
    for (const [s, k] of [[1, 'L'], [-1, 'R']] as const)
      for (let i = 0; i < 3; i++) {
        const b = bones[`wing${i + 1}.${k}`], a = s * amp[i] * big * Math.cos(w * t - i * 0.45);
        b.rotation.z = a * (1 - lv);
        b.rotation.y = a * lv;
      }
    bones.chest.rotation.x = (flap ? 0.03 : 0.02) * Math.sin(w * t);
    if (!flap) bones.head.rotation.y = 0.05 * Math.sin(w * t * 0.5);
  };
  return { root: group, bones, update };
}
