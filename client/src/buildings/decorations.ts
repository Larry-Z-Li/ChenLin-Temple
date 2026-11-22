import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGE, INCENSE_BURNER, STELE, STONE_LANTERNS } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { glowTexture, verticalTextTexture } from '../core/textures';
import zhHant from '../i18n/locales/zh-Hant';
import { nightGlow } from '../world/nightGlow';
import { terrainHeight } from '../world/terrain';
import type { StupaSpot } from './stupas';
import { box, cylinder, hipRoofGeometry, mat } from './materials';
import { addLamp } from '../world/lightPool';

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const STONE = 0xa29d91;

/** Courtyard and garden furnishings: stone lanterns, the bronze incense burner, the stream bridge, the gate stele, mani stones. */
export function buildDecorations(ctx: WorldContext, stupas: StupaSpot[]) {
  buildStoneLanterns(ctx);
  buildIncenseBurner(ctx);
  buildBridge(ctx);
  buildStele(ctx);
  buildManiPiles(ctx, stupas);
}

/** 石燈籠: base, post, firebox with glowing windows, hexagonal roof, finial. */
function buildStoneLanterns(ctx: WorldContext) {
  const stoneGeo = merge([
    new THREE.CylinderGeometry(0.3, 0.34, 0.14, 6).translate(0, 0.07, 0),
    new THREE.CylinderGeometry(0.11, 0.13, 0.75, 6).translate(0, 0.14 + 0.375, 0),
    new THREE.CylinderGeometry(0.3, 0.26, 0.1, 6).translate(0, 0.94, 0),
    new THREE.BoxGeometry(0.36, 0.34, 0.36).translate(0, 1.16, 0),
    new THREE.ConeGeometry(0.44, 0.32, 6).translate(0, 1.49, 0),
    new THREE.SphereGeometry(0.07, 8, 6).translate(0, 1.7, 0),
  ]);
  const windowGeo = new THREE.BoxGeometry(0.372, 0.2, 0.372).translate(0, 1.16, 0);
  const stones = new THREE.InstancedMesh(stoneGeo, mat(STONE, { roughness: 1, flatShading: true }), STONE_LANTERNS.length);
  const glow = new THREE.InstancedMesh(windowGeo, nightGlow.stoneWindow, STONE_LANTERNS.length);
  const m = new THREE.Matrix4();
  STONE_LANTERNS.forEach(([x, z], i) => {
    m.makeTranslation(x, ctx.ground.heightAt(x, z), z);
    stones.setMatrixAt(i, m);
    glow.setMatrixAt(i, m);
    ctx.collisions.addCircle(x, z, 0.35);
    const gy = ctx.ground.heightAt(x, z);
    addLamp({ x, y: gy + 1.16, z, color: 0xffc070, intensity: 6, range: 8, decay: 1.6, ground: true });
    const halo = new THREE.Sprite(nightGlow.stoneHalo); // pool of light after dark
    halo.position.set(x, gy + 1.16, z);
    halo.scale.setScalar(2.2);
    ctx.scene.add(halo);
  });
  stones.castShadow = stones.receiveShadow = true;
  ctx.scene.add(stones, glow);
}

/** Large bronze incense burner (香爐) under a small roof, with a table of incense and a candle in front. */
function buildIncenseBurner(ctx: WorldContext) {
  const { x, z, tableZ, standZ } = INCENSE_BURNER;
  const y0 = ctx.ground.heightAt(x, z);
  const bronze = mat(0x6e5a3a, { metalness: 0.8, roughness: 0.42 });
  const g = new THREE.Group();
  g.position.set(x, y0, z);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const leg = cylinder(0.07, 0.1, 0.55, bronze, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, 8);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(leg);
  }
  const body = new THREE.Mesh(
    new THREE.LatheGeometry([[0.5, 0.45], [0.82, 0.55], [0.97, 0.8], [0.97, 1.05], [0.88, 1.18], [0.96, 1.24], [0.96, 1.3]].map(([r, h]) => new THREE.Vector2(r, h)), 28),
    bronze,
  );
  body.castShadow = true;
  g.add(body);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28).rotateX(-Math.PI / 2), mat(0xb5afa2, { roughness: 1 }));
  ash.position.y = 1.16;
  g.add(ash);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 16), bronze);
    handle.position.set(s * 0.98, 1.42, 0);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
  }
  // Little roof on four posts; smoke drifts out from under it.
  for (const [px, pz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) g.add(cylinder(0.035, 0.035, 1.05, bronze, px, 1.2, pz, 8));
  const { geometry } = hipRoofGeometry(1.7, 1.7, 0.55);
  const roof = new THREE.Mesh(geometry, mat(0x5c4a30, { metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide, flatShading: true }));
  roof.position.y = 2.25;
  roof.castShadow = true;
  g.add(roof);
  g.add(cylinder(0.0, 0.09, 0.3, mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 }), 0, 2.78, 0, 10));
  ctx.scene.add(g);
  ctx.collisions.addCircle(x, z, 1.05);

  // Incense table: a stack of sticks with the candle right beside it.
  const t = new THREE.Group();
  const wood = mat(THEME.table, { roughness: 0.55 });
  t.add(box(1.3, 0.06, 0.55, wood, 0, 0.79, 0));
  t.add(box(1.15, 0.79, 0.42, mat(0x4a2214, { roughness: 0.6 }), 0, 0, 0));
  const stack = new THREE.Group();
  stack.add(cylinder(0.07, 0.07, 0.12, bronze, 0, 0, 0, 10));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.03 + (i % 3) * 0.012;
    stack.add(cylinder(0.005, 0.005, 0.38, mat(0x9c4a2a, { roughness: 0.9 }), Math.cos(a) * r, 0.05, Math.sin(a) * r, 4));
  }
  stack.position.set(-0.25, 0.85, 0);
  t.add(stack);
  t.add(cylinder(0.1, 0.12, 0.05, bronze, 0.2, 0.85, 0, 12));
  t.add(cylinder(0.045, 0.045, 0.26, mat(0xf4ead2, { roughness: 0.6 }), 0.2, 0.9, 0, 10));
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0.2, 1.22, 0);
  flame.scale.set(0.11, 0.19, 1);
  t.add(flame);
  const ty = ctx.ground.heightAt(x, tableZ);
  t.position.set(x, ty, tableZ);
  ctx.scene.add(t);
  ctx.collisions.addBoxCentered(x, tableZ, 1.35, 0.6);
  ctx.updaters.push((_dt, time) => flame.scale.set(0.11 * (1 + 0.1 * Math.sin(time * 13)), 0.19 * (1 + 0.1 * Math.sin(time * 11 + 1)), 1));

  ctx.offeringTables.push({
    hallId: 'courtyard', x, y: ty + 0.85, z: tableZ, length: 1.3, slots: [],
    stand: { x, z: standZ },
    bowl: { x, y: y0 + 1.16, z, r: 0.75 },
    ambientSmoke: true,
  });
}

/** Arched stone bridge across the stream; walkable, with low parapets. */
function buildBridge(ctx: WorldContext) {
  const { x, z0, z1, width: W, rise } = BRIDGE;
  const L = z1 - z0, zc = (z0 + z1) / 2;
  const base = Math.min(terrainHeight(x, z0), terrainHeight(x, z1));
  const deck = (u: number) => base + 0.12 + rise * (1 - (2 * u / L) ** 2); // u ∈ [−L/2, L/2]
  const stone = mat(0xb3ad9f, { roughness: 0.95, flatShading: true });

  // Side profile: deck on top, an arch opening underneath.
  const N = 24, a = L / 2 - 1.3, archTop = rise + 0.15;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, base - 0.7);
  for (let i = 0; i <= N; i++) {
    const u = -L / 2 + (i / N) * L;
    shape.lineTo(u, deck(u));
  }
  shape.lineTo(L / 2, base - 0.7);
  shape.lineTo(a, base - 0.7);
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI;
    shape.lineTo(a * Math.cos(th), base - 0.7 + archTop * Math.sin(th));
  }
  shape.lineTo(-L / 2, base - 0.7);
  // Map shape (u, v) and extrusion depth (w) to world: u → z, v → y, w → −x (a proper rotation).
  const toWorld = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  const body = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2).applyMatrix4(toWorld);
  const mesh = new THREE.Mesh(body, stone);
  mesh.position.set(x, 0, zc);
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  // Parapets following the deck.
  const rail = new THREE.Shape();
  rail.moveTo(-L / 2 + 0.3, deck(-L / 2 + 0.3));
  for (let i = 0; i <= N; i++) {
    const u = -L / 2 + 0.3 + (i / N) * (L - 0.6);
    rail.lineTo(u, deck(u) + 0.55);
  }
  for (let i = N; i >= 0; i--) {
    const u = -L / 2 + 0.3 + (i / N) * (L - 0.6);
    rail.lineTo(u, deck(u));
  }
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(rail, { depth: 0.18, bevelEnabled: false }).translate(0, 0, -0.09).applyMatrix4(toWorld);
    const r = new THREE.Mesh(g, stone);
    r.position.set(x + s * (W / 2 - 0.09), 0, zc);
    r.castShadow = true;
    ctx.scene.add(r);
    ctx.collisions.addBox(x + s * (W / 2 - 0.09) - 0.1, x + s * (W / 2 - 0.09) + 0.1, z0 + 0.4, z1 - 0.4);
  }

  // Walkable deck: piecewise ramps tracing the arch.
  const S = 10;
  for (let i = 0; i < S; i++) {
    const ua = -L / 2 + (i / S) * L, ub = -L / 2 + ((i + 1) / S) * L;
    ctx.ground.addRamp(x - W / 2 + 0.2, x + W / 2 - 0.2, zc + ua, zc + ub, deck(ua), deck(ub));
  }
}

/** 石碑 at the gate: plinth, slab with a rounded crown, the temple's name carved down the face. */
function buildStele(ctx: WorldContext) {
  const { x, z } = STELE;
  const y = ctx.ground.heightAt(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const stone = mat(0x8f8b82, { roughness: 0.9 });
  g.add(box(1.5, 0.5, 0.8, stone, 0, 0, 0));
  g.add(box(1.0, 2.2, 0.26, stone, 0, 0.5, 0));
  // Rounded crown: a disc whose lower half hides inside the slab.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.26, 24).rotateX(Math.PI / 2), stone);
  crown.position.y = 2.7;
  g.add(crown);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 1.85),
    new THREE.MeshStandardMaterial({ map: verticalTextTexture(zhHant['app.title'], { bg: '#8f8b82', color: '#2b2622', w: 160, h: 420 }), roughness: 0.9 }),
  );
  face.position.set(0, 1.62, 0.142);
  g.add(face);
  g.traverse((o) => (o.castShadow = true));
  ctx.scene.add(g);
  ctx.collisions.addBoxCentered(x, z, 1.5, 0.8);
}

/** Piles of mani stones beside each ridge stupa and between neighbours. */
function buildManiPiles(ctx: WorldContext, stupas: StupaSpot[]) {
  const rng = mulberry32(42);
  const piles: { x: number; z: number }[] = [];
  stupas.forEach((s, i) => {
    const side = rng() < 0.5 ? -1 : 1, ax = Math.cos(s.yaw), az = -Math.sin(s.yaw);
    piles.push({ x: s.x + ax * side * range(rng, 5.5, 7.5), z: s.z + az * side * range(rng, 5.5, 7.5) });
    const n = stupas[i + 1];
    if (n && Math.hypot(n.x - s.x, n.z - s.z) < 45) piles.push({ x: (s.x + n.x) / 2 + range(rng, -2, 2), z: (s.z + n.z) / 2 + range(rng, -2, 2) });
  });
  const per = 12;
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), piles.length * per);
  const colors = [0xe9e5dc, 0xd8d3c8, 0xbfb9ad, 0xf2efe8, 0xa83a2a, 0x2f5f9e, 0xd9b23a, 0x3f8a55].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0;
  for (const p of piles) {
    const gy = terrainHeight(p.x, p.z);
    for (let j = 0; j < per; j++) {
      const layer = Math.floor(j / 4), r = (1 - layer * 0.3) * 0.7;
      const a = rng() * Math.PI * 2, s = range(rng, 0.7, 1.1) * (1 - layer * 0.15);
      m.compose(
        new THREE.Vector3(p.x + Math.cos(a) * r * rng(), gy + 0.08 + layer * 0.22, p.z + Math.sin(a) * r * rng()),
        q.setFromEuler(e.set(range(rng, -0.15, 0.15), rng() * 6, range(rng, -0.15, 0.15))),
        new THREE.Vector3(s, s * 0.35, s * 0.8),
      );
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k++, colors[rng() < 0.75 ? Math.floor(rng() * 4) : 4 + Math.floor(rng() * 4)]);
    }
  }
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.scene.add(mesh);
}
