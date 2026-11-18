import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASIN, BODHI_TREE, ORCHARD } from '../config/layout';
import { FRUIT_TYPES, type FruitType } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, pick, range, type Rng } from '../core/math';
import { terrainHeight } from './terrain';
import { basinDist, inWaterfallVista, isReserved } from './zones';

// ---------- Instancing helper ----------

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; tint?: boolean; shadow?: boolean }

class Species {
  private matrices: THREE.Matrix4[] = [];
  private tints: THREE.Color[] = [];
  constructor(private parts: Part[]) {}

  add(x: number, y: number, z: number, scale: number, rotY: number, tint = new THREE.Color(1, 1, 1)) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale),
    );
    this.matrices.push(m);
    this.tints.push(tint);
  }

  build(scene: THREE.Scene) {
    if (!this.matrices.length) return;
    for (const p of this.parts) {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, this.matrices.length);
      this.matrices.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        if (p.tint) mesh.setColorAt(i, this.tints[i]);
      });
      mesh.castShadow = p.shadow ?? true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  }
}

const flat = (color: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
const white = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });

function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, s = 1) => g.scale(s, s, s).translate(x, y, z);

// ---------- Tree shapes ----------

const trunkGeo = (h = 2.4, r = 0.18) => new THREE.CylinderGeometry(r * 0.65, r, h, 6).translate(0, h / 2, 0);
const BARK = flat(0x5a3d26);

function pine() {
  return new Species([
    { geo: trunkGeo(2.2, 0.2), mat: BARK },
    {
      geo: merge([
        new THREE.ConeGeometry(1.6, 2.6, 7).translate(0, 2.6, 0),
        new THREE.ConeGeometry(1.25, 2.2, 7).translate(0, 3.9, 0),
        new THREE.ConeGeometry(0.85, 1.8, 7).translate(0, 5.0, 0),
      ]),
      mat: white(),
      tint: true,
    },
  ]);
}

function broadleaf() {
  return new Species([
    { geo: trunkGeo(2.6, 0.22), mat: BARK },
    {
      geo: merge([
        at(new THREE.IcosahedronGeometry(1.6, 0), 0, 3.4, 0),
        at(new THREE.IcosahedronGeometry(1.15, 0), 0.9, 3.9, 0.4),
        at(new THREE.IcosahedronGeometry(1.1, 0), -0.8, 3.7, -0.5),
        at(new THREE.IcosahedronGeometry(0.9, 0), 0.1, 4.6, -0.2),
      ]),
      mat: white(),
      tint: true,
    },
  ]);
}

function cypress() {
  return new Species([
    { geo: trunkGeo(1.2, 0.15), mat: BARK },
    { geo: new THREE.CylinderGeometry(0.15, 0.85, 5.4, 7).translate(0, 3.6, 0), mat: white(), tint: true },
  ]);
}

function bamboo() {
  const stalks: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const rng = mulberry32(99);
  for (let i = 0; i < 9; i++) {
    const x = range(rng, -0.8, 0.8), z = range(rng, -0.8, 0.8), h = range(rng, 5, 7.5);
    stalks.push(new THREE.CylinderGeometry(0.045, 0.06, h, 5).translate(x, h / 2, z));
    leaves.push(at(new THREE.IcosahedronGeometry(0.55, 0), x, h - 0.3, z));
    leaves.push(at(new THREE.IcosahedronGeometry(0.4, 0), x + 0.3, h - 1.1, z - 0.2));
  }
  return new Species([
    { geo: merge(stalks), mat: flat(0x9bb55a), shadow: false },
    { geo: merge(leaves), mat: flat(0x6f9e3c) },
  ]);
}

function bush() {
  return new Species([{ geo: new THREE.IcosahedronGeometry(0.8, 0).scale(1.2, 0.75, 1.2).translate(0, 0.45, 0), mat: white(), tint: true }]);
}

// ---------- Public builders ----------

const GREENS = [0x4f7f37, 0x5d8f3c, 0x3f6e33, 0x6f9a45, 0x557d3a].map((c) => new THREE.Color(c));
const PINE_GREENS = [0x2f5a32, 0x3a6838, 0x2a4f2e].map((c) => new THREE.Color(c));
const BLOSSOM = [0xf4b6c8, 0xf7c9d6, 0xeea3bb].map((c) => new THREE.Color(c));
const MAPLE = [0xc8452c, 0xd8742a, 0xb83a30].map((c) => new THREE.Color(c));

export interface FruitSpot {
  id: string;
  type: FruitType;
  position: THREE.Vector3;
  /** Instance index within the per-type mesh (hide by scaling to 0 when picked). */
  index: number;
}

export function buildVegetation(ctx: WorldContext) {
  const rng = mulberry32(20261117);
  const sp = { pine: pine(), broad: broadleaf(), cypress: cypress(), cherry: broadleaf(), maple: broadleaf(), bamboo: bamboo(), bush: bush() };

  const place = (s: Species, x: number, z: number, scale: number, tint?: THREE.Color, collide = true) => {
    s.add(x, terrainHeight(x, z) - 0.1, z, scale, rng() * Math.PI * 2, tint);
    if (collide && basinDist(x, z) < BASIN.radius + 15) ctx.collisions.addCircle(x, z, 0.35 * scale);
  };

  // Forest ring at the foot of the mountains, thinning up the slopes.
  for (let i = 0; i < 1400; i++) {
    const a = rng() * Math.PI * 2;
    const r = BASIN.radius - 18 + Math.pow(rng(), 1.4) * 170;
    const x = BASIN.x + Math.sin(a) * r, z = BASIN.z + Math.cos(a) * r;
    if (isReserved(x, z, 3) || inWaterfallVista(x, z)) continue;
    const h = terrainHeight(x, z);
    if (h > 140) continue;
    const roll = rng();
    if (roll < 0.5) place(sp.pine, x, z, range(rng, 0.9, 1.7), pick(rng, PINE_GREENS));
    else if (roll < 0.75) place(sp.broad, x, z, range(rng, 0.9, 1.5), pick(rng, GREENS));
    else if (roll < 0.9) place(sp.cypress, x, z, range(rng, 0.8, 1.3), pick(rng, PINE_GREENS));
    else place(sp.maple, x, z, range(rng, 0.9, 1.3), pick(rng, MAPLE));
  }

  // Scattered meadow trees and bushes inside the valley.
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (BASIN.radius - 12);
    const x = BASIN.x + Math.sin(a) * r, z = BASIN.z + Math.cos(a) * r;
    if (isReserved(x, z, 4) || inWaterfallVista(x, z)) continue;
    const roll = rng();
    if (roll < 0.3) place(sp.cherry, x, z, range(rng, 0.8, 1.1), pick(rng, BLOSSOM));
    else if (roll < 0.45) place(sp.maple, x, z, range(rng, 0.8, 1.1), pick(rng, MAPLE));
    else if (roll < 0.65) place(sp.broad, x, z, range(rng, 0.8, 1.2), pick(rng, GREENS));
    else place(sp.bush, x, z, range(rng, 0.7, 1.4), pick(rng, GREENS), false);
  }

  // Cherry avenue along the approach.
  for (let z = 78; z <= 116; z += 7) {
    place(sp.cherry, -11, z, 1, pick(rng, BLOSSOM));
    place(sp.cherry, 11, z, 1, pick(rng, BLOSSOM));
  }

  // Groves close to the halls so there's greenery near the centre, not only at the valley rim.
  const GROVES: [number, number][] = [
    [-30, 72], [30, 72], [-36, 48], [36, 50], [-24, 96], [24, 96],
    [-72, 0], [-74, 40], [76, 8], [74, 44], [-64, -16], [64, -20], [-30, -24], [30, -24],
  ];
  for (const [gx, gz] of GROVES)
    for (let k = 0; k < 8; k++) {
      const x = gx + range(rng, -8, 8), z = gz + range(rng, -8, 8);
      if (isReserved(x, z, 2.5) || inWaterfallVista(x, z)) continue;
      const roll = rng();
      if (roll < 0.3) place(sp.cherry, x, z, range(rng, 0.8, 1.15), pick(rng, BLOSSOM));
      else if (roll < 0.45) place(sp.maple, x, z, range(rng, 0.8, 1.15), pick(rng, MAPLE));
      else if (roll < 0.75) place(sp.broad, x, z, range(rng, 0.85, 1.3), pick(rng, GREENS));
      else if (roll < 0.9) place(sp.pine, x, z, range(rng, 0.8, 1.2), pick(rng, PINE_GREENS));
      else place(sp.bush, x, z, range(rng, 0.8, 1.3), pick(rng, GREENS), false);
    }

  // Bamboo groves behind the northern halls.
  for (const gx of [-60, -20, 20, 60]) for (let k = 0; k < 4; k++) place(sp.bamboo, gx + range(rng, -6, 6), -70 + range(rng, -4, 3), range(rng, 0.9, 1.2), undefined, true);

  // Bodhi tree (large broadleaf) in the courtyard.
  place(sp.broad, BODHI_TREE.x, BODHI_TREE.z, 2.4, new THREE.Color(0x4d8a3a));

  Object.values(sp).forEach((s) => s.build(ctx.scene));

  const fruits = buildOrchard(ctx, rng);
  buildFlowers(ctx, rng);
  return { fruits };
}

function buildOrchard(ctx: WorldContext, rng: Rng): FruitSpot[] {
  const types = Object.keys(FRUIT_TYPES) as FruitType[];
  const trees = new Species([
    { geo: trunkGeo(1.6, 0.16), mat: BARK },
    { geo: new THREE.IcosahedronGeometry(1.5, 1).scale(1, 0.85, 1).translate(0, 2.6, 0), mat: white(), tint: true },
  ]);
  const fruitPos: Record<FruitType, THREE.Vector3[]> = Object.fromEntries(types.map((t) => [t, []])) as never;
  const spots: FruitSpot[] = [];
  let row = 0;
  for (let z = ORCHARD.minZ; z <= ORCHARD.maxZ; z += ORCHARD.spacing, row++) {
    const type = types[row % types.length]; // one fruit per row
    for (let x = ORCHARD.minX; x <= ORCHARD.maxX; x += ORCHARD.spacing) {
      const y = terrainHeight(x, z);
      trees.add(x, y, z, 1, rng() * 6, pick(rng, GREENS));
      ctx.collisions.addCircle(x, z, 0.3);
      for (let k = 0; k < 9; k++) {
        const a = rng() * Math.PI * 2, e = range(rng, -0.4, 0.6);
        const p = new THREE.Vector3(x + Math.cos(a) * Math.cos(e) * 1.45, y + 2.6 + Math.sin(e) * 1.2, z + Math.sin(a) * Math.cos(e) * 1.45);
        spots.push({ id: `fruit-${type}-${spots.length}`, type, position: p, index: fruitPos[type].length });
        fruitPos[type].push(p);
      }
    }
  }
  trees.build(ctx.scene);

  const fruitGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const m = new THREE.Matrix4();
  for (const t of types) {
    const list = fruitPos[t];
    const mesh = new THREE.InstancedMesh(fruitGeo, new THREE.MeshStandardMaterial({ color: FRUIT_TYPES[t].color, roughness: 0.5 }), list.length);
    list.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    mesh.castShadow = true;
    mesh.name = `fruit-${t}`;
    ctx.scene.add(mesh);
  }
  return spots;
}

function buildFlowers(ctx: WorldContext, rng: Rng) {
  const PALETTES = [
    [0xffffff, 0xfff4c2], [0xf7d348, 0xf2b134], [0xe85d75, 0xf29cb0], [0x9b6bd6, 0xb79be8],
    [0xd9381e, 0xf26b3a], [0x4f7bd9, 0x86a8f0], [0xf5a3c7, 0xffffff],
  ];
  const heads = [
    new THREE.CylinderGeometry(0.11, 0.06, 0.05, 6).translate(0, 0.32, 0), // daisy
    new THREE.ConeGeometry(0.07, 0.16, 5).rotateX(Math.PI).translate(0, 0.36, 0), // tulip
    new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.3, 0), // bell
  ];
  const lists: THREE.Matrix4[][] = heads.map(() => []);
  const colors: THREE.Color[][] = heads.map(() => []);
  const tufts: THREE.Matrix4[] = [];
  const tuftColors: THREE.Color[] = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);

  const addFlower = (x: number, z: number, palette: number[], shape: number) => {
    const y = terrainHeight(x, z);
    const s = range(rng, 0.8, 1.3);
    lists[shape].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, s, s)));
    colors[shape].push(new THREE.Color(pick(rng, palette)));
    tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, s, s)));
    tuftColors.push(pick(rng, GREENS));
  };

  // Natural-looking patches
  for (let p = 0; p < 260; p++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (BASIN.radius - 8);
    const cx = BASIN.x + Math.sin(a) * r, cz = BASIN.z + Math.cos(a) * r;
    if (isReserved(cx, cz, 1)) continue;
    const palette = pick(rng, PALETTES), shape = Math.floor(rng() * 3), n = 10 + Math.floor(rng() * 30);
    for (let i = 0; i < n; i++) {
      const x = cx + range(rng, -3, 3), z = cz + range(rng, -3, 3);
      if (!isReserved(x, z, 0.4)) addFlower(x, z, palette, shape);
    }
  }
  // Borders along the paved courtyard and approach
  for (let z = 76; z < 106; z += 0.7) for (const x of [-3.6, 3.6]) if (!isReserved(x + Math.sign(x) * 0.3, z, 0)) addFlower(x + Math.sign(x) * 0.3, z, pick(rng, PALETTES), 0);

  heads.forEach((geo, i) => {
    if (!lists[i].length) return;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), lists[i].length);
    lists[i].forEach((m, k) => {
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, colors[i][k]);
    });
    ctx.scene.add(mesh);
  });

  // Leafy tufts under flowers + loose grass clumps everywhere
  for (let i = 0; i < 5000; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (BASIN.radius + 10);
    const x = BASIN.x + Math.sin(a) * r, z = BASIN.z + Math.cos(a) * r;
    if (isReserved(x, z, 0.3, false)) continue;
    const s = range(rng, 0.6, 1.4);
    tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, terrainHeight(x, z), z), q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, s * range(rng, 0.7, 1.4), s)));
    tuftColors.push(pick(rng, GREENS));
  }
  const tuftGeo = merge([
    new THREE.ConeGeometry(0.05, 0.4, 3).translate(0, 0.2, 0),
    new THREE.ConeGeometry(0.05, 0.32, 3).rotateZ(0.35).translate(0.06, 0.15, 0),
    new THREE.ConeGeometry(0.05, 0.32, 3).rotateZ(-0.35).translate(-0.06, 0.15, 0.03),
  ]);
  const tuftMesh = new THREE.InstancedMesh(tuftGeo, white(), tufts.length);
  tufts.forEach((m, i) => {
    tuftMesh.setMatrixAt(i, m);
    tuftMesh.setColorAt(i, tuftColors[i]);
  });
  ctx.scene.add(tuftMesh);
}
