import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASIN, BRIDGE, FOOT_BRIDGES, PLAY_RADIUS, POND, RIVERS, STREAM, WATERFALL } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, range, smoothstep } from '../core/math';
import { glowTexture, waterfallTexture } from '../core/textures';
import { colourGlowMaterial, haloPoints, nightGlow, whiteColors } from './nightGlow';
import { lighting } from './sky';
import { riverLength } from './stream';
import { terrainHeight } from './terrain';

const WATER_Y = -0.45;

export function buildPond(ctx: WorldContext) {
  const rng = mulberry32(777);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.radius + 1.5, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a7f84, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 }), // clear enough to see the koi
  );
  water.position.set(POND.x, WATER_Y, POND.z);
  water.receiveShadow = true;
  ctx.scene.add(water);
  // Keep people out of the water: a ring of colliders with a gap in the east where the pavilion walkway starts.
  const R = POND.radius - 0.8;
  for (let a = 0; a < Math.PI * 2; a += 0.9 / R) {
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.16) continue;
    ctx.collisions.addCircle(POND.x + Math.cos(a) * R, POND.z + Math.sin(a) * R, 0.6);
  }

  // Shore stones (with a gap where the stream flows in from the west)
  const stoneGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const n = 70;
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1, flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let used = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + range(rng, -0.03, 0.03), r = POND.radius + range(rng, -0.6, 0.4);
    if (Math.abs(a - Math.PI) < 0.16 || Math.abs(a - Math.PI / 2) < 0.18 || a < 0.14 || a > Math.PI * 2 - 0.14) continue; // stream mouth, river outlet, pavilion walkway
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r, s = range(rng, 0.5, 1.2);
    stones.setMatrixAt(used++, m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.1, z), q.setFromEuler(e.set(rng(), rng() * 6, rng())), new THREE.Vector3(s * 1.3, s * 0.6, s)));
  }
  stones.count = used;
  stones.castShadow = stones.receiveShadow = true;
  ctx.scene.add(stones);

  // Lotus pads (a disc with a notch)
  const padGeo = new THREE.CircleGeometry(0.55, 14, 0.3, Math.PI * 2 - 0.45).rotateX(-Math.PI / 2);
  const padCount = 70;
  const pads = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x3f7f3a, roughness: 0.6, side: THREE.DoubleSide }), padCount);
  const up = new THREE.Vector3(0, 1, 0);
  const padPos: THREE.Vector3[] = [];
  for (let i = 0; i < padCount; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (POND.radius - 2);
    const p = new THREE.Vector3(POND.x + Math.cos(a) * r, WATER_Y + 0.02, POND.z + Math.sin(a) * r);
    padPos.push(p);
    const s = range(rng, 0.7, 1.6);
    pads.setMatrixAt(i, m.compose(p, q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, 1, s)));
  }
  ctx.scene.add(pads);

  // Lotus flowers: two rings of petals + seed pod, sitting on some pads.
  const petals: THREE.BufferGeometry[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const count = ring ? 8 : 6, tilt = ring ? 0.9 : 0.45, len = ring ? 0.26 : 0.22;
    for (let k = 0; k < count; k++) {
      const g = new THREE.SphereGeometry(0.09, 6, 4).scale(0.55, 1, 0.3).translate(0, len / 2, 0);
      g.rotateX(tilt).rotateY((k / count) * Math.PI * 2 + ring * 0.3);
      petals.push(g.toNonIndexed());
    }
  }
  const flowerGeo = whiteColors(mergeGeometries(petals));
  const podGeo = new THREE.CylinderGeometry(0.05, 0.035, 0.05, 8).translate(0, 0.08, 0);
  const flowerCount = 30;
  // The flowers glow softly after dark, each in its own colour.
  const flowers = new THREE.InstancedMesh(flowerGeo, colourGlowMaterial({ roughness: 0.5 }, (n) => 0.04 + 0.85 * n), flowerCount);
  const podMat = new THREE.MeshStandardMaterial({ color: 0xe5c74a, roughness: 0.6, emissive: 0xffc040, emissiveIntensity: 0 });
  nightGlow.track((n) => (podMat.emissiveIntensity = 0.9 * n));
  const pods = new THREE.InstancedMesh(podGeo, podMat, flowerCount);
  const pink = new THREE.Color(0xf29bb8), whiteC = new THREE.Color(0xfdf3f3);
  const haloPos: number[] = [], haloCol: number[] = [];
  for (let i = 0; i < flowerCount; i++) {
    const p = padPos[i * 2].clone().add(new THREE.Vector3(0, 0.03, 0));
    const s = range(rng, 1.4, 2.0);
    m.compose(p, q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, s, s));
    flowers.setMatrixAt(i, m);
    pods.setMatrixAt(i, m);
    const c = rng() < 0.65 ? pink : whiteC;
    flowers.setColorAt(i, c);
    haloPos.push(p.x, p.y + 0.25, p.z);
    haloCol.push(c.r, c.g * 0.9, c.b);
  }
  ctx.scene.add(flowers, pods, haloPoints(haloPos, haloCol, 1.6, 0.55));

  buildWaterLanterns(ctx, flowerGeo);
}

/** Lotus-shaped candle lanterns (放水燈) drifting slowly around the pond. */
function buildWaterLanterns(ctx: WorldContext, flowerGeo: THREE.BufferGeometry) {
  const rng = mulberry32(4242);
  const N = 12;
  const COLS = [0xffb3c8, 0xfff0e0, 0xffd27a, 0xff8fa8];
  const blooms = new THREE.InstancedMesh(flowerGeo, colourGlowMaterial({ roughness: 0.6 }, (n) => 0.25 + 1.3 * n), N);
  const bases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.17, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x3f7f3a, roughness: 0.7 }), N);
  blooms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bases.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blooms.frustumCulled = bases.frustumCulled = false;
  const boats = Array.from({ length: N }, (_, i) => {
    blooms.setColorAt(i, new THREE.Color(COLS[i % COLS.length]));
    return { r: range(rng, 3, POND.radius - 3), a: 0, a0: rng() * 6, amp: range(rng, 1.8, 2.5), w: range(rng, 0.012, 0.03) * (rng() < 0.5 ? -1 : 1), wob: rng() * 6, spin: range(rng, -0.2, 0.2) };
  });
  // A bright candle core and a wide soft halo for each.
  const corePos = new Float32Array(N * 3), haloPos = new Float32Array(N * 3);
  const cores = haloPoints([...corePos], new Array(N * 3).fill(0).map((_, i) => [1, 0.85, 0.55][i % 3]), 0.35, 1, 0.55);
  const halos = haloPoints([...haloPos], new Array(N * 3).fill(0).map((_, i) => [1, 0.75, 0.45][i % 3]), 2.4, 0.6);
  ctx.scene.add(blooms, bases, cores, halos);
  cores.frustumCulled = halos.frustumCulled = false;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(2.1, 2.1, 2.1), one = new THREE.Vector3(1, 1, 1);
  ctx.updaters.push((_dt, time) => {
    const cp = cores.geometry.attributes.position as THREE.BufferAttribute, hp = halos.geometry.attributes.position as THREE.BufferAttribute;
    boats.forEach((b, i) => {
      b.a = Math.PI + b.amp * Math.sin(time * b.w + b.a0); // drift back and forth, never under the pavilion (east)
      const r = b.r + Math.sin(time * 0.05 + b.wob) * 1.5;
      const x = POND.x + Math.cos(b.a) * r, z = POND.z + Math.sin(b.a) * r, y = WATER_Y + 0.02 + Math.sin(time * 1.1 + b.wob) * 0.012;
      q.setFromEuler(e.set(Math.sin(time * 0.9 + b.wob) * 0.04, b.wob + time * b.spin, Math.cos(time * 0.8 + b.wob) * 0.04));
      bases.setMatrixAt(i, m.compose(p.set(x, y, z), q, one));
      blooms.setMatrixAt(i, m.compose(p.set(x, y + 0.02, z), q, s));
      cp.setXYZ(i, x, y + 0.3, z);
      hp.setXYZ(i, x, y + 0.35, z);
    });
    blooms.instanceMatrix.needsUpdate = bases.instanceMatrix.needsUpdate = true;
    cp.needsUpdate = hp.needsUpdate = true;
  });
}

/** Waterfall on the western mountains, facing east toward the temple, feeding the stream. */
export function buildWaterfall(ctx: WorldContext) {
  const { x, z, width, height } = WATERFALL;
  const baseY = terrainHeight(STREAM[0][0], STREAM[0][1]) - 0.6;

  // Built facing +Z, then turned to face east (+X).
  const g = new THREE.Group();
  g.position.set(x, baseY, z);
  g.rotation.y = Math.PI / 2;
  ctx.scene.add(g);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 1, flatShading: true });
  const rng = mulberry32(31);
  for (let i = 0; i < 14; i++) {
    const s = range(rng, 8, 16);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    const side = i % 2 ? 1 : -1;
    rock.scale.set(s * range(rng, 0.6, 1.0), s * range(rng, 1.2, 2.2), s * 0.45);
    // Flank the falls on both sides and sit behind the water, never in front of it.
    rock.position.set(side * (width / 2 + s * 0.55 + range(rng, 0, 6)), range(rng, 0, height * 0.9), -s * 0.45 - range(rng, 1, 5));
    rock.rotation.set(rng(), rng() * 6, rng());
    g.add(rock);
  }
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(width + 10, height + 8, 8, 4, 8, 2), rockMat);
  cliff.position.set(0, height / 2, -4.5);
  g.add(cliff);

  const tex = waterfallTexture();
  tex.repeat.set(1.5, 3);
  const fallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, color: 0xe6f2f8, depthWrite: false });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), fallMat);
  const dayWater = new THREE.Color(0xe6f2f8), nightWater = new THREE.Color(0x46566e);
  fall.position.set(0, height / 2, 0);
  g.add(fall);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.75, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a7d86, roughness: 0.1, transparent: true, opacity: 0.9 }),
  );
  pool.position.set(0, 0.5, width * 0.45);
  g.add(pool);

  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    s.position.set((i - 2.5) * 2.2, 2, 2);
    s.scale.setScalar(9);
    g.add(s);
    mists.push(s);
  }

  ctx.updaters.push((dt, time) => {
    tex.offset.y += dt * 0.9;
    fallMat.color.copy(nightWater).lerp(dayWater, lighting.daylight); // unlit material: dim it by hand at night
    mists.forEach((s, i) => {
      s.material.opacity = (0.25 + 0.12 * Math.sin(time * 0.8 + i)) * (0.35 + 0.65 * lighting.daylight);
      s.scale.setScalar(8 + Math.sin(time * 0.6 + i * 2) * 1.5);
    });
  });
}

/** The stream as a flowing ribbon laid on the carved channel, from the falls into the lotus pond. */
export function buildStream(ctx: WorldContext) {
  const tex = waterfallTexture();
  tex.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, color: 0x8fc6d4, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (const river of RIVERS) {
    const L = riverLength(river);
    const curve = new THREE.CatmullRomCurve3(river.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const N = Math.ceil(L / (river.falls ? 1 : 1.5));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const p = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tan);
      const s = u * L;
      // Falls stream widens into the pond; rivers breathe a little along their course.
      const half = river.falls ? 1.5 + 0.9 * smoothstep(L - 14, L, s) : river.halfWidth * (0.85 + 0.3 * Math.sin(s * 0.07 + river.points.length));
      const nx = -tan.z, nz = tan.x, nl = Math.hypot(nx, nz) || 1;
      const lx = p.x + (nx / nl) * half, lz = p.z + (nz / nl) * half;
      const rx = p.x - (nx / nl) * half, rz = p.z - (nz / nl) * half;
      // Sit just above the highest of centre/banks so the bed never pokes through.
      const y = Math.max(terrainHeight(p.x, p.z), terrainHeight(lx, lz), terrainHeight(rx, rz)) + 0.12;
      pos.push(lx, y, lz, rx, y, rz);
      uv.push(0, s / 4, 1, s / 4);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ribbon = new THREE.Mesh(geo, mat);
    ribbon.receiveShadow = true;
    ctx.scene.add(ribbon);
  }
  ctx.updaters.push((dt) => {
    tex.offset.y -= dt * 0.55; // flows downstream
  });
}

/** Rivers can't be walked into: a line of colliders down each channel, open only where a bridge crosses. */
export function buildRiverColliders(ctx: WorldContext) {
  // Leave the channel open beside each deck far enough that no collider reaches onto it
  // (deck half-width + collider radius + a walker's radius); the rails close the sides.
  const onBridge = (x: number, z: number, r: number) => {
    const across = 1.2 + r + 0.35;
    return (
      FOOT_BRIDGES.some((b) => (b.axis === 'x' ? Math.abs(x - b.x) < b.length / 2 + 0.3 && Math.abs(z - b.z) < across : Math.abs(z - b.z) < b.length / 2 + 0.3 && Math.abs(x - b.x) < across)) ||
      (Math.abs(x - BRIDGE.x) < BRIDGE.width / 2 + r + 0.35 && z > BRIDGE.z0 - 0.3 && z < BRIDGE.z1 + 0.3)
    );
  };
  for (const river of RIVERS) {
    const curve = new THREE.CatmullRomCurve3(river.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const L = riverLength(river), p = new THREE.Vector3();
    for (let s = 0; s <= L; s += 0.9) {
      curve.getPointAt(s / L, p);
      if (Math.hypot(p.x - BASIN.x, p.z - BASIN.z) > PLAY_RADIUS + 4) continue; // beyond the walkable valley
      if (Math.hypot(p.x - POND.x, p.z - POND.z) < POND.radius) continue; // the pond has its own rim
      const r = river.halfWidth * 0.8;
      if (onBridge(p.x, p.z, r)) continue;
      ctx.collisions.addCircle(p.x, p.z, r);
    }
  }
}
