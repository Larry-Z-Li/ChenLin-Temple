import { cullFar } from '../core/farCull';
import * as THREE from 'three';
import type { Offerings } from '../activities/offerings';
import { hallHalf, spreadPoint, PLAZA, ABBOT, BODHI_TREE, CAT_SPOTS, CHERRY_GROVE, DEER_RANGES, DORM, DRAGON_POOL, DRAGON_SPRING, FOOTPATHS, HALLS, ORCHARD, PAVED, POND, STUPA_COURT, SAND_GARDEN } from '../config/layout';
import type { WorldContext } from '../core/context';
import type { Interactable } from '../core/interaction';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';
import { FRUIT_TYPES } from '../config/theme';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import { lighting } from './sky';
import { createCat } from './cat';
import { isReserved } from './zones';

// ---------------------------------------------------------------- hearts

let heartTex: THREE.Texture | null = null;
const hearts: { s: THREE.Sprite; t: number; vx: number; vz: number }[] = [];
let heartScene: THREE.Scene | null = null;

/** A little burst of hearts floating up from (x, y, z). */
export function heartBurst(x: number, y: number, z: number, n = 6) {
  if (!heartScene) return;
  heartTex ??= canvasTexture(64, 64, (g) => {
    g.fillStyle = '#ff5c8a';
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 34, 8, 8, 32, 20);
    g.bezierCurveTo(56, 8, 60, 34, 32, 54);
    g.fill();
    g.stroke();
  });
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    s.scale.setScalar(0.01);
    heartScene.add(s);
    hearts.push({ s, t: -i * 0.18, vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25 });
  }
}

function updateHearts(dt: number) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.t += dt;
    if (h.t < 0) continue;
    h.s.position.y += dt * 0.55;
    h.s.position.x += h.vx * dt + Math.sin(h.t * 5) * 0.004;
    h.s.position.z += h.vz * dt;
    h.s.scale.setScalar(Math.min(0.28, h.t * 1.2));
    h.s.material.opacity = Math.max(0, 1 - h.t / 1.8);
    if (h.t > 1.8) {
      h.s.removeFromParent();
      h.s.material.dispose();
      hearts.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- deer

interface Deer {
  id: string;
  root: THREE.Group;
  legs: THREE.Group[];
  neck: THREE.Group;
  head: THREE.Group;
  wps: [number, number][];
  seed: number;
  item: Interactable;
  happy: number;
  stride: number;
  /** Friendly deer come over to people nearby. */
  friendly: boolean;
  pos: THREE.Vector3;
  started: boolean;
}

/** Inside a hall or on its porch: animals don't follow people there. */
const inHallZone = (x: number, z: number) => HALLS.some((h) => Math.abs(x - h.x) < hallHalf(h)[0] + 4 && Math.abs(z - h.z) < hallHalf(h)[1] + 4);

const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  h ^= h >>> 15;
  return (Math.imul(h, 0x27d4eb2f) ^ (h >>> 13)) >>> 0;
};

function deerModel(stag: boolean) {
  const coat = new THREE.MeshStandardMaterial({ color: 0x9a5f34, roughness: 0.9, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9, flatShading: true });
  const blob = (r: [number, number, number], p: [number, number, number], m = coat) => {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(...r), m);
    o.position.set(...p);
    o.castShadow = true;
    return o;
  };
  const root = new THREE.Group();
  root.add(blob([0.19, 0.2, 0.46], [0, 0.82, 0]));
  root.add(blob([0.12, 0.1, 0.06], [0, 0.86, -0.44], pale)); // white rump
  root.add(blob([0.04, 0.07, 0.03], [0, 0.88, -0.48], dark)); // tail tip
  for (let i = 0; i < 9; i++) root.add(blob([0.025, 0.012, 0.025], [((i % 3) - 1) * 0.09, 0.99 - Math.abs((i % 3) - 1) * 0.04, -0.25 + Math.floor(i / 3) * 0.2], pale)); // sika spots
  const legs = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.11, 0.7, sz * 0.3);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.7, 6).translate(0, -0.35, 0), coat);
      bone.castShadow = true;
      leg.add(bone, blob([0.03, 0.03, 0.035], [0, -0.69, 0.01], dark));
      root.add(leg);
      return leg;
    }),
  );
  const neck = new THREE.Group();
  neck.position.set(0, 0.9, 0.36);
  root.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.1, 0.5, 7).translate(0, 0.25, 0), coat);
  neckMesh.castShadow = true;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.y = 0.5;
  neck.add(head);
  head.add(blob([0.08, 0.085, 0.16], [0, 0, 0.06]));
  head.add(blob([0.05, 0.05, 0.06], [0, -0.03, 0.2], dark));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 5), coat);
    ear.position.set(s * 0.08, 0.07, -0.04);
    ear.rotation.set(-0.3, 0, s * -0.9);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), dark);
    eye.position.set(s * 0.065, 0.025, 0.1);
    head.add(eye);
    if (stag) {
      const antler = new THREE.Group();
      antler.position.set(s * 0.04, 0.08, -0.02);
      antler.rotation.set(-0.35, 0, s * -0.35);
      const am = new THREE.MeshStandardMaterial({ color: 0xcdb895, roughness: 0.7 });
      antler.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.32, 5).translate(0, 0.16, 0), am));
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.14, 5).translate(0, 0.07, 0), am);
      tine.position.y = 0.14;
      tine.rotation.x = 0.8;
      antler.add(tine);
      head.add(antler);
    }
  }
  return { root, legs, neck, head };
}

// ---------------------------------------------------------------- cat

/** One of the temple cats (see cat.ts): asleep until someone comes close, then it watches them; pet it for hearts and a purr. */
function buildCat(ctx: WorldContext, spot: (typeof CAT_SPOTS)[number], index: number, people: () => THREE.Vector3[]) {
  const { x, z, h } = spot;
  const cat = createCat({ coat: spot.coat, pose: spot.pose, seed: index * 7 + 3, scale: 0.95 + (index % 3) * 0.05 });
  cat.root.position.set(x, h, z);
  cat.root.rotation.y = 0.6 + index * 1.9;
  ctx.scene.add(cat.root);
  cullFar(cat.root, 55);
  ctx.collisions.addCircle(x, z, 0.3);
  const head = new THREE.Vector3();
  ctx.updaters.push((dt, time) => {
    // the nearest person within 3 m: it looks up at their face
    let near: THREE.Vector3 | null = null, best = 9;
    for (const p of people()) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) [best, near] = [d, p];
    }
    cat.update(dt, time, near ? head.set(near.x, near.y + 1.45, near.z) : null);
  });
  ctx.instruments.push({ id: `cat-${index}`, kind: 'cat', x, z, onStrike: () => {
    cat.pet();
    heartBurst(x, h + 0.45, z, 4);
  } });
}

// ---------------------------------------------------------------- butterflies & fireflies

function buildButterflies(ctx: WorldContext) {
  const spots: [number, number][] = [
    [BODHI_TREE.x + 3, BODHI_TREE.z - 2], [CHERRY_GROVE.x - 16, CHERRY_GROVE.z + 6], [CHERRY_GROVE.x + 16, CHERRY_GROVE.z + 6],
    [SAND_GARDEN.minX - 3, SAND_GARDEN.maxZ - 4], [POND.x + 4, POND.z + 18], [DRAGON_POOL.x + 8, DRAGON_POOL.z], [DRAGON_SPRING.x + 4, DRAGON_SPRING.z],
    [-34, PLAZA.z], [34, PLAZA.z], [ORCHARD.minX - 3, (ORCHARD.minZ + ORCHARD.maxZ) / 2], [ABBOT.x + 8, ABBOT.z + 6], [(DORM.minX + DORM.maxX) / 2 - 4, (DORM.minZ + DORM.maxZ) / 2],
  ];
  const N = spots.length * 3;
  // Four wings in the XZ plane (body along Z); flapping squeezes them toward the body.
  const wing = (s: number) => [0, 0, 0.02, s * 0.11, 0, 0.09, s * 0.12, 0, -0.01, 0, 0, -0.01, s * 0.09, 0, -0.03, s * 0.05, 0, -0.1];
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...wing(1), ...wing(-1)], 3));
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x222222 }), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const cols = [0xffffff, 0xffe066, 0xff9f43, 0x7fb8ff, 0xf7a1c4].map((c) => new THREE.Color(c));
  const rng = mulberry32(9);
  const bs = Array.from({ length: N }, (_, i) => {
    mesh.setColorAt(i, cols[i % cols.length]);
    const [x, z] = spots[Math.floor(i / 3)];
    return { x, z, y: ctx.ground.heightAt(x, z), ph: rng() * 6, w1: range(rng, 0.25, 0.45), w2: range(rng, 0.2, 0.4), R: range(rng, 1.5, 3.5) };
  });
  ctx.scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  ctx.updaters.push((_dt, time) => {
    const vis = Math.max(0, (lighting.daylight - 0.35) / 0.65);
    mesh.visible = vis > 0;
    if (!mesh.visible) return;
    bs.forEach((b, i) => {
      const tt = time + b.ph * 10;
      p.set(b.x + Math.sin(tt * b.w1) * b.R, b.y + 0.8 + Math.sin(tt * 1.3) * 0.35 + Math.sin(tt * 0.31) * 0.3, b.z + Math.cos(tt * b.w2) * b.R);
      const dx = Math.cos(tt * b.w1) * b.w1, dz = -Math.sin(tt * b.w2) * b.w2;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      sc.set((0.15 + 0.85 * Math.abs(Math.sin(tt * 16))) * 1.4 * vis, 1.4 * vis, 1.4 * vis);
      mesh.setMatrixAt(i, m.compose(p, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function buildFireflies(ctx: WorldContext) {
  const areas: [number, number, number][] = [
    [POND.x, POND.z, 20], [CHERRY_GROVE.x, CHERRY_GROVE.z, 24], [DRAGON_POOL.x, DRAGON_POOL.z, 9], [BODHI_TREE.x, BODHI_TREE.z, 8],
    [STUPA_COURT.x, STUPA_COURT.z + STUPA_COURT.half + 8, 10], [...spreadPoint(-62, 80), 12], [...spreadPoint(70, 66), 12], [ORCHARD.minX + 10, (ORCHARD.minZ + ORCHARD.maxZ) / 2, 14], [PLAZA.x, PLAZA.z, 14],
  ];
  const N = 200, rng = mulberry32(31);
  const base = Array.from({ length: N }, (_, i) => {
    const [cx, cz, r] = areas[i % areas.length];
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    return { x, z, y: ctx.ground.heightAt(x, z) + range(rng, 0.4, 2.2), ph: rng() * 20, sp: range(rng, 0.6, 1.4) };
  });
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const matl = new THREE.PointsMaterial({ size: 0.22, map: glowSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, matl);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  ctx.updaters.push((_dt, time) => {
    matl.opacity = Math.max(0, (lighting.night - 0.4) / 0.6);
    pts.visible = matl.opacity > 0;
    if (!pts.visible) return;
    base.forEach((b, i) => {
      const tt = time * b.sp + b.ph;
      pos[i * 3] = b.x + Math.sin(tt * 0.5) * 1.2;
      pos[i * 3 + 1] = b.y + Math.sin(tt * 0.9) * 0.4;
      pos[i * 3 + 2] = b.z + Math.cos(tt * 0.43) * 1.2;
      const blink = Math.max(0, Math.sin(tt * 2.1)) ** 3;
      col[i * 3] = 0.75 * blink;
      col[i * 3 + 1] = 1.0 * blink;
      col[i * 3 + 2] = 0.35 * blink;
    });
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
  });
}

let glow: THREE.Texture | null = null;
function glowSprite() {
  return (glow ??= canvasTexture(32, 32, (g) => {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  }));
}

// ---------------------------------------------------------------- the system

/** Deer (feed them apples), the cat on the steps, butterflies by day and fireflies by night. */
export class Wildlife {
  /** You fed a deer (功德). */
  onFed: () => void = () => {};
  private deer: Deer[] = [];

  constructor(private ctx: WorldContext, private net: NetClient, private offerings: Offerings, private player: LocalPlayer, private others: () => THREE.Vector3[]) {
    heartScene = ctx.scene;
    CAT_SPOTS.forEach((c, i) => buildCat(ctx, c, i, () => [this.player.pos, ...this.others()]));
    buildButterflies(ctx);
    buildFireflies(ctx);

    const rng = mulberry32(1225);
    DEER_RANGES.forEach((r, i) => {
      const wps: [number, number][] = [];
      for (let k = 0; k < 80 && wps.length < 16; k++) {
        const x = range(rng, r.minX, r.maxX), z = range(rng, r.minZ, r.maxZ);
        if (!isReserved(x, z, 0.5)) wps.push([x, z]);
      }
      if (wps.length < 2) return;
      // Now and then they wander onto a nearby path too (about one stop in four).
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const onPaths: [number, number][] = [];
      for (const fp of FOOTPATHS)
        for (let k = 0; k + 1 < fp.length; k++)
          for (let t = 0; t < 1; t += 0.34) onPaths.push([fp[k][0] + (fp[k + 1][0] - fp[k][0]) * t, fp[k][1] + (fp[k + 1][1] - fp[k][1]) * t]);
      for (const pv of PAVED.filter((r) => Math.min(r.maxX - r.minX, r.maxZ - r.minZ) < 8)) // narrow paved paths only (not the plaza or courtyard)
        for (let t = 0.1; t < 1; t += 0.2)
          onPaths.push(pv.maxX - pv.minX > pv.maxZ - pv.minZ ? [pv.minX + (pv.maxX - pv.minX) * t, (pv.minZ + pv.maxZ) / 2] : [(pv.minX + pv.maxX) / 2, pv.minZ + (pv.maxZ - pv.minZ) * t]);
      const near = onPaths.filter(([x, z]) => Math.hypot(x - cx, z - cz) < 32);
      for (let k = near.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1)); // seeded shuffle: identical on every client
        [near[k], near[j]] = [near[j], near[k]];
      }
      near.length = Math.min(near.length, Math.ceil(wps.length / 3));
      wps.push(...near);
      const { root, legs, neck, head } = deerModel(i % 2 === 0);
      ctx.scene.add(root);
      root.userData.rigid = true; // legs, neck and head move; the pieces within them don't
      cullFar(root, 75);
      const id = `deer-${i}`;
      const d: Deer = { id, root, legs, neck, head, wps, seed: i * 7919 + 13, happy: 99, stride: 0, item: null!, friendly: i % 3 === 0, pos: new THREE.Vector3(), started: false };
      d.item = {
        id, x: 0, z: 0, radius: 2.0,
        prompt: () => {
          const f = this.offerings.inventory[0];
          return f ? { text: t('prompt.feedDeer', { fruit: t(FRUIT_TYPES[f].nameKey) }) } : { text: t('prompt.deerWantsApple'), busy: true };
        },
        onInteract: () => this.feed(d),
      };
      ctx.interactions.add(d.item);
      this.deer.push(d);
    });

    net.on('fed', (deerId, by, fruit) => {
      const d = this.deer.find((x) => x.id === deerId);
      if (!d) return;
      d.happy = 0;
      const p = d.root.position;
      heartBurst(p.x + Math.sin(d.root.rotation.y) * 0.5, p.y + 1.4, p.z + Math.cos(d.root.rotation.y) * 0.5, 7);
      if (by === net.id) {
        this.offerings.removeFruit(fruit);
        this.onFed();
      }
    });
    ctx.updaters.push((dt) => {
      updateHearts(dt);
      this.update(dt);
    });
  }

  private feed(d: Deer) {
    const fruit = this.offerings.inventory[0];
    if (!fruit) return;
    const p = this.player;
    p.yaw = Math.atan2(-(d.root.position.x - p.pos.x), -(d.root.position.z - p.pos.z));
    p.gesture('reach', 0.6);
    this.net.feedDeer(d.id, fruit);
  }

  private update(dt: number) {
    const now = Date.now() / 1000, P = 22;
    const people = [this.player.pos, ...this.others()].filter((p) => !inHallZone(p.x, p.z));
    for (const d of this.deer) {
      // Where the shared schedule says this deer is (same on every client).
      const tt = now + d.seed;
      const k = Math.floor(tt / P), f = tt - k * P;
      const a = d.wps[hash(d.seed, k) % d.wps.length], b = d.wps[hash(d.seed, k + 1) % d.wps.length];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const walkT = Math.min(P * 0.6, dist / 0.9);
      const u = dist > 0.2 && f < walkT ? f / walkT : 1;
      const e = u * u * (3 - 2 * u);
      let tx = a[0] + (b[0] - a[0]) * e, tz = a[1] + (b[1] - a[1]) * e;
      // Friendly deer wander over to the nearest person (not into the hall) and stop a little way off.
      let near: THREE.Vector3 | null = null;
      if (d.friendly) {
        let best = 16;
        for (const p of people) {
          const dd = Math.hypot(p.x - tx, p.z - tz);
          if (dd < best) [best, near] = [dd, p];
        }
        if (near) {
          const dx = d.pos.x - near.x, dz = d.pos.z - near.z, l = Math.hypot(dx, dz) || 1;
          tx = near.x + (dx / l) * 1.8;
          tz = near.z + (dz / l) * 1.8;
        }
      }
      if (!d.started) {
        d.pos.set(tx, 0, tz);
        d.started = true;
      }
      // Walk toward the target (trot if far behind), never through walls, rivers or the hall.
      const gx = tx - d.pos.x, gz = tz - d.pos.z, gl = Math.hypot(gx, gz);
      const speed = gl > 6 ? 2.6 : 1.1;
      const step = Math.min(gl, speed * dt);
      const moving = gl > 0.15;
      if (moving) {
        d.pos.x += (gx / gl) * step;
        d.pos.z += (gz / gl) * step;
        d.root.rotation.y = Math.atan2(gx, gz);
      } else if (near) d.root.rotation.y = Math.atan2(near.x - d.pos.x, near.z - d.pos.z); // look at them
      this.ctx.collisions.resolve(d.pos, 0.45);
      if (inHallZone(d.pos.x, d.pos.z)) d.pos.z += dt * 3; // drift back out the front
      const prev = d.root.position.clone();
      d.root.position.set(d.pos.x, this.ctx.ground.heightAt(d.pos.x, d.pos.z), d.pos.z);
      d.stride += prev.distanceTo(d.root.position) * 7;
      d.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(d.stride + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 : l.rotation.x * 0.9));
      // Graze with the head down; look up when fed, when visiting someone, or now and then.
      d.happy += dt;
      const lookUp = d.happy < 3 || moving || !!near || Math.sin(tt * 0.7) > 0.85;
      const target = lookUp ? 0.35 : 2.35;
      d.neck.rotation.x += (target - d.neck.rotation.x) * Math.min(1, dt * 3);
      d.head.rotation.x = -d.neck.rotation.x * 0.75 + (d.happy < 3 ? Math.sin(d.happy * 9) * 0.15 : 0);
      d.item.x = d.pos.x;
      d.item.z = d.pos.z;
    }
  }

}
