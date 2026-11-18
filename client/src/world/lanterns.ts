import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cylinder, mat } from '../buildings/materials';
import {
  BENCHES, BODHI_TREE, CLOUD_STATIONS, FLAG_LINES, HALLS, LANTERN_CANOPY, LANTERN_STRINGS, PATH_LIGHT_RUNS, POND, POND_LIGHT_RING, STONE_LANTERNS,
} from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mulberry32 } from '../core/math';
import { colourGlowMaterial, haloPoints, nightGlow, whiteColors } from './nightGlow';

/** Lotus-lantern colours: pink, red, orange, yellow, green, blue, violet, white. */
export const LOTUS_COLOURS = [0xff6fa5, 0xe8343a, 0xff8a2a, 0xffd23f, 0x5ccf6a, 0x4a8cff, 0xa066e0, 0xfff1e0];

const BODY_Y = -0.42; // lantern body centre below its hook

/** Paint every vertex of a geometry one colour. */
function paint(geo: THREE.BufferGeometry, hex: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Round lotus lantern: a paper globe covered in upturned petals (tinted per instance). Origin at the hook. */
function lotusBodyGeometry() {
  const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.19, 12, 8).scale(1, 0.85, 1).translate(0, BODY_Y, 0)];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), d = new THREE.Vector3();
  for (const [el, n, off] of [[-0.45, 10, 0], [0.05, 11, 0.3], [0.55, 8, 0.1]]) {
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + off, tilt = el + 0.5;
      d.set(Math.cos(tilt) * Math.cos(az), Math.sin(tilt), Math.cos(tilt) * Math.sin(az));
      const petal = new THREE.ConeGeometry(0.05, 0.13, 5).translate(0, 0.065, 0).applyQuaternion(q.setFromUnitVectors(up, d));
      parts.push(petal.translate(0.19 * Math.cos(el) * Math.cos(az), BODY_Y + 0.16 * Math.sin(el), 0.19 * Math.cos(el) * Math.sin(az)));
    }
  }
  return whiteColors(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))));
}

/** Cord, green leaves under the bloom and a paper wish tag hanging below. */
function lotusTrimGeometry() {
  const parts = [paint(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4).translate(0, -0.13, 0), 0x2a1a10)];
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.SphereGeometry(0.08, 6, 4).scale(1, 0.22, 0.55).translate(0.13, 0, 0).rotateZ(-0.4).rotateY((k / 6) * Math.PI * 2).translate(0, BODY_Y - 0.12, 0);
    parts.push(paint(leaf, 0x3f8a3a));
  }
  parts.push(paint(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3).translate(0, BODY_Y - 0.22, 0), 0x2a1a10));
  parts.push(paint(new THREE.BoxGeometry(0.07, 0.28, 0.004).translate(0, BODY_Y - 0.42, 0), 0xf6f1e4));
  return mergeGeometries(parts);
}

/** One sagging string between a and b: line segments into `lines`, hook points returned (ends excluded). */
function string(a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number, lines: number[]) {
  const at = (t: number) => new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
  const n = Math.max(2, Math.round(a.distanceTo(b) / spacing));
  const seg = n * 2;
  for (let j = 0; j < seg; j++) lines.push(...at(j / seg).toArray(), ...at((j + 1) / seg).toArray());
  return Array.from({ length: n - 1 }, (_, j) => at((j + 1) / n));
}

/**
 * Colourful lotus lanterns: a canopy over the approach, strings along the Marīcī courtyard and
 * lanterns hanging in the Bodhi tree. Plus low paper lanterns along the paths and around the pond.
 */
export function buildLanterns(ctx: WorldContext) {
  const rng = mulberry32(2025);
  const hooks: THREE.Vector3[] = [];
  const lines: number[] = [];
  const red = mat(THEME.column, { roughness: 0.55 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.3 });

  // ---- Canopy over the approach ----
  const c = LANTERN_CANOPY;
  const yTop = ctx.ground.heightAt(0, (c.z0 + c.z1) / 2) + c.height;
  for (const s of [-1, 1]) {
    const x = s * c.x;
    for (let i = 0; i < c.posts; i++) {
      const z = c.z0 + (i * (c.z1 - c.z0)) / (c.posts - 1), y0 = ctx.ground.heightAt(x, z);
      ctx.scene.add(box(0.5, 0.25, 0.5, mat(0x9a958a, { roughness: 0.95 }), x, y0, z));
      ctx.scene.add(cylinder(0.11, 0.13, yTop - y0, red, x, y0, z, 10));
      ctx.scene.add(cylinder(0.15, 0.15, 0.1, gold, x, yTop, z, 10));
      ctx.collisions.addCircle(x, z, 0.3);
    }
    ctx.scene.add(box(0.16, 0.2, c.z1 - c.z0 + 0.4, red, x, yTop - 0.2, (c.z0 + c.z1) / 2));
  }
  for (let z = c.z0 + 0.8; z <= c.z1 - 0.79; z += c.wireSpacing) {
    hooks.push(...string(new THREE.Vector3(-c.x, yTop - 0.15, z), new THREE.Vector3(c.x, yTop - 0.15, z), 0.35, c.lanternSpacing, lines));
  }

  // ---- Strings along the courtyard ----
  for (const [a, b] of LANTERN_STRINGS) {
    const A = new THREE.Vector3(a[0], ctx.ground.heightAt(a[0], a[1]) + a[2], a[1]);
    const B = new THREE.Vector3(b[0], ctx.ground.heightAt(b[0], b[1]) + b[2], b[1]);
    hooks.push(...string(A, B, A.distanceTo(B) * 0.045, 1.6, lines));
  }

  // ---- Hanging in the Bodhi tree ----
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + rng() * 0.3, r = 1.7 + rng() * 1.9;
    const x = BODHI_TREE.x + Math.cos(a) * r, z = BODHI_TREE.z + Math.sin(a) * r;
    const y = ctx.ground.heightAt(x, z) + 4.5 + rng() * 0.6;
    hooks.push(new THREE.Vector3(x, y, z));
    lines.push(x, y, z, x, y + 2.2, z); // cord up into the leaves
  }

  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({ color: 0x3a2c22 }));
  ctx.scene.add(wires);

  // ---- The lanterns themselves ----
  const n = hooks.length;
  const bodies = new THREE.InstancedMesh(lotusBodyGeometry(), colourGlowMaterial({ roughness: 0.65 }, (k) => 0.14 + 1.15 * k), n);
  const trims = new THREE.InstancedMesh(lotusTrimGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), n);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodies.frustumCulled = trims.frustumCulled = false;
  const haloPos: number[] = [], haloCol: number[] = [];
  const col = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  let last = -1;
  const phases = hooks.map((h, i) => {
    let pick = Math.floor(rng() * LOTUS_COLOURS.length);
    if (pick === last) pick = (pick + 1 + Math.floor(rng() * 3)) % LOTUS_COLOURS.length;
    last = pick;
    bodies.setColorAt(i, col.setHex(LOTUS_COLOURS[pick]));
    haloPos.push(h.x, h.y + BODY_Y, h.z);
    col.lerp(white, 0.25);
    haloCol.push(col.r, col.g, col.b);
    return rng() * Math.PI * 2;
  });
  ctx.scene.add(bodies, trims, haloPoints(haloPos, haloCol, 1.5, 0.6));

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  ctx.updaters.push((_dt, time) => {
    for (let i = 0; i < n; i++) {
      const ph = phases[i];
      q.setFromEuler(e.set(Math.sin(time * 1.3 + ph) * 0.05, ph, Math.sin(time * 1.05 + ph * 1.7) * 0.06));
      m.compose(hooks[i], q, one);
      bodies.setMatrixAt(i, m);
      trims.setMatrixAt(i, m);
    }
    bodies.instanceMatrix.needsUpdate = trims.instanceMatrix.needsUpdate = true;
  });

  buildPathLights(ctx);
}

// ---------------------------------------------------------------------------------------------

/** Spots for the path lanterns, kept clear of benches, stone lanterns, poles, stairs and the cloud. */
function pathLightSpots() {
  const spots: [number, number][] = [];
  for (const r of PATH_LIGHT_RUNS) {
    const [x0, z0] = r.from, [x1, z1] = r.to;
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / r.step);
    for (let i = 0; i <= n; i++) spots.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  }
  const skipAngles = [0, Math.PI, ...[0.75, 1.57, 2.3, 3.95, 4.71, 5.5]]; // the east path, the stream mouth, the benches
  for (let i = 0; i < POND_LIGHT_RING.count; i++) {
    const a = (i / POND_LIGHT_RING.count) * Math.PI * 2 + 0.14;
    if (skipAngles.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.2)) continue;
    spots.push([POND.x + Math.cos(a) * POND_LIGHT_RING.radius, POND.z + Math.sin(a) * POND_LIGHT_RING.radius]);
  }
  const poles = FLAG_LINES.flat().filter((p) => p.pole);
  return spots.filter(([x, z]) => {
    if (STONE_LANTERNS.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 1.8)) return false;
    if (BENCHES.some((b) => Math.hypot(x - b.x, z - b.z) < 1.9)) return false;
    if (poles.some((p) => Math.hypot(x - p.x, z - p.z) < 1.2)) return false;
    if (Object.values(CLOUD_STATIONS).some((s) => Math.hypot(x - s.x, z - s.z) < 2.6)) return false;
    if (Math.abs(x) < 4.5 && z < -26 && z > -36) return false; // where the centre path meets the cross path
    for (const h of HALLS) {
      const front = h.z + h.depth / 2, back = h.z - h.depth / 2;
      if (Math.abs(x - h.x) < h.width / 2 + 2 && z > back - 4.5 && z < front + 4.5) return false; // the hall, its porch and stairs
    }
    return true;
  });
}

/** Low wooden path lanterns (行燈) with paper sides that glow warmly at night. */
function buildPathLights(ctx: WorldContext) {
  const spots = pathLightSpots();
  const wood = 0x3a2416;
  const frameGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(0.09, 0.5, 0.09).translate(0, 0.25, 0), wood),
    paint(new THREE.BoxGeometry(0.32, 0.04, 0.32).translate(0, 0.52, 0), wood),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => paint(new THREE.BoxGeometry(0.028, 0.4, 0.028).translate(sx * 0.125, 0.74, sz * 0.125), wood)),
    paint(new THREE.BoxGeometry(0.3, 0.03, 0.3).translate(0, 0.95, 0), wood),
    paint(new THREE.ConeGeometry(0.27, 0.13, 4).rotateY(Math.PI / 4).translate(0, 1.03, 0), 0x2f3338),
    paint(new THREE.SphereGeometry(0.03, 6, 4).translate(0, 1.11, 0), THEME.goldLeaf),
  ]);
  const paperGeo = new THREE.BoxGeometry(0.24, 0.38, 0.24).translate(0, 0.74, 0);
  const frames = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), spots.length);
  const papers = new THREE.InstancedMesh(paperGeo, nightGlow.paper, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const haloPos: number[] = [], haloCol: number[] = [];
  spots.forEach(([x, z], i) => {
    const yy = ctx.ground.heightAt(x, z);
    m.compose(p.set(x, yy, z), q.setFromAxisAngle(up, (x * 7 + z * 3) % 1.5), one);
    frames.setMatrixAt(i, m);
    papers.setMatrixAt(i, m);
    haloPos.push(x, yy + 0.74, z);
    haloCol.push(1, 0.78, 0.5);
    ctx.collisions.addCircle(x, z, 0.22);
  });
  frames.castShadow = true;
  ctx.scene.add(frames, papers, haloPoints(haloPos, haloCol, 1.9, 0.6));
}
