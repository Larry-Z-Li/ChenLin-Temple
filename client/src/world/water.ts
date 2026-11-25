import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASIN, BRIDGE, FOOT_BRIDGES, PLAY_RADIUS, POND, RIVERS, STREAM, WATERFALL } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, noise2, range, smoothstep } from '../core/math';
import { glowTexture } from '../core/textures';
import { colourGlowMaterial, haloPoints, nightGlow, whiteColors } from './nightGlow';
import { lighting } from './sky';
import { riverFrame, riverHalfWidth, riverLength } from './stream';
import { coarseHeightAt, groundColour, POND_LEVEL, riverEndMeets, terrainHeight, waterLevel } from './terrain';

const WATER_Y = POND_LEVEL;

/** The pond's lily pads and lotus flowers (pads, glowing petals, seed pods), shared with the rivers' quiet stretches. */
let kit: ReturnType<typeof makeLotusKit> | null = null;
function makeLotusKit() {
  const padGeo = new THREE.CircleGeometry(0.55, 14, 0.3, Math.PI * 2 - 0.45).rotateX(-Math.PI / 2); // a disc with a notch
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3f7f3a, roughness: 0.6, side: THREE.DoubleSide });
  const petals: THREE.BufferGeometry[] = []; // two rings of petals
  for (let ring = 0; ring < 2; ring++) {
    const count = ring ? 8 : 6, tilt = ring ? 0.9 : 0.45, len = ring ? 0.26 : 0.22;
    for (let k = 0; k < count; k++) {
      const g = new THREE.SphereGeometry(0.09, 6, 4).scale(0.55, 1, 0.3).translate(0, len / 2, 0);
      g.rotateX(tilt).rotateY((k / count) * Math.PI * 2 + ring * 0.3);
      petals.push(g.toNonIndexed());
    }
  }
  const flowerGeo = whiteColors(mergeGeometries(petals));
  const flowerMat = colourGlowMaterial({ roughness: 0.5 }, (n) => 0.04 + 0.85 * n); // the flowers glow softly after dark, each in its own colour
  const podGeo = new THREE.CylinderGeometry(0.05, 0.035, 0.05, 8).translate(0, 0.08, 0);
  const podMat = new THREE.MeshStandardMaterial({ color: 0xe5c74a, roughness: 0.6, emissive: 0xffc040, emissiveIntensity: 0 });
  nightGlow.track((n) => (podMat.emissiveIntensity = 0.9 * n));
  return { padGeo, padMat, flowerGeo, flowerMat, podGeo, podMat, pink: new THREE.Color(0xf29bb8), white: new THREE.Color(0xfdf3f3) };
}
const lotusKit = () => (kit ??= makeLotusKit());

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

  // Lotus pads
  const K = lotusKit();
  const padCount = 70;
  const pads = new THREE.InstancedMesh(K.padGeo, K.padMat, padCount);
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
  const flowerCount = 30;
  const flowers = new THREE.InstancedMesh(K.flowerGeo, K.flowerMat, flowerCount);
  const pods = new THREE.InstancedMesh(K.podGeo, K.podMat, flowerCount);
  const pink = K.pink, whiteC = K.white;
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

  buildWaterLanterns(ctx, K.flowerGeo);
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

/** Falling water: value-noise streaks stretched downward and sliding down, foam at the lip and foot, ragged edges (fogged). */
function fallingWater() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float x = vUv.x, y = 1.0 - vUv.y;               // y: 0 at the lip … 1 at the foot
        float fall = y * (0.35 + 0.65 * y);              // accelerating: the streaks stretch as they fall
        float t = uTime * 0.5;
        vec2 p = vec2(x * 9.0, fall * 5.0 - t);
        float s = noise(p * vec2(1.0, 0.16)) * 0.55 + noise(p * vec2(2.7, 0.3) + 7.3) * 0.3 + noise(p * vec2(6.0, 0.7) + 1.7) * 0.15;
        float streak = smoothstep(0.4, 0.82, s);
        float foam = (1.0 - smoothstep(0.0, 0.06, y)) * 0.85 + smoothstep(0.88, 1.0, y);
        float rag = noise(vec2(x * 9.0, fall * 5.0 - t * 1.2));
        float edge = min(x, 1.0 - x) / 0.12 - rag * 0.7 + 0.15;
        float a = clamp(edge, 0.0, 1.0) * clamp(0.4 + streak * 0.6 + foam, 0.0, 1.0) * 0.95;
        gl_FragColor = vec4(mix(vec3(0.5, 0.68, 0.8), vec3(1.0), clamp(streak * 0.85 + foam, 0.0, 1.0)) * uTint, a);
        #include <fog_fragment>
      }`,
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

  // The fall: one wide sheet, bowed out in the middle and leaning out toward the foot, drawn by a shader — streaks
  // that stretch as they fall, foam at the lip and the foot, ragged see-through edges.
  const fallMat = fallingWater();
  const sheet = new THREE.PlaneGeometry(width, height, 12, 24).translate(0, height / 2, 0);
  const sp = sheet.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, 0.6 * Math.cos((Math.PI * sp.getX(i)) / width) + 0.8 * (1 - sp.getY(i) / height));
  const fall = new THREE.Mesh(sheet, fallMat);
  fall.renderOrder = 2;
  g.add(fall);
  const dayWater = new THREE.Color(1, 1, 1), nightWater = new THREE.Color(0.32, 0.38, 0.5);
  // Spray thrown up where it lands (heavier, as at the foot of a big plunge).
  const N = 260, rng2 = mulberry32(47), spPos = new Float32Array(N * 3), spVel = new Float32Array(N * 3);
  const reset = (i: number) => {
    spPos.set([(rng2() - 0.5) * width, 0.6 + rng2() * 0.5, 1.6 + (rng2() - 0.3) * 1.5], i * 3);
    spVel.set([(rng2() - 0.5) * 5, 2.5 + rng2() * 6.5, 0.6 + rng2() * 4], i * 3);
  };
  for (let i = 0; i < N; i++) reset(i), (spPos[i * 3 + 1] += rng2() * 3);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sprayMat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.85, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.renderOrder = 3;
  spray.frustumCulled = false;
  g.add(spray);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.75, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a7d86, roughness: 0.1, transparent: true, opacity: 0.9 }),
  );
  pool.position.set(0, 0.5, width * 0.45);
  g.add(pool);

  // mist rolling off the foot
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    s.position.set((i / 9 - 0.5) * width * 1.4, 1.5 + (i % 3) * 1.6, 2 + (i % 2) * 2);
    s.renderOrder = 4;
    g.add(s);
    mists.push(s);
  }

  ctx.updaters.push((dt, time) => {
    fallMat.uniforms.uTime.value = time;
    fallMat.uniforms.uTint.value.copy(nightWater).lerp(dayWater, lighting.daylight); // unlit: dim it by hand at night
    const day = 0.35 + 0.65 * lighting.daylight;
    sprayMat.opacity = 0.45 * day;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      spVel[j + 1] -= 7 * dt;
      spPos[j] += spVel[j] * dt;
      spPos[j + 1] += spVel[j + 1] * dt;
      spPos[j + 2] += spVel[j + 2] * dt;
      if (spPos[j + 1] < 0.5) reset(i);
    }
    sprayGeo.attributes.position.needsUpdate = true;
    mists.forEach((s, i) => {
      s.material.opacity = 0.4 * (0.75 + 0.25 * Math.sin(time * 0.7 + i)) * day;
      s.scale.setScalar(12 * (1 + 0.18 * Math.sin(time * 0.5 + i * 1.7)));
    });
  });
}

/**
 * River water, lit like the pond (dark at night, catching the moon, the sun and the lanterns): teal in the middle and
 * clear at the edges over the bed, a gentle drift of light and ripple downstream, the sky at grazing angles, and white
 * water below each weir. Per vertex: aRiverUv (across 0…1, metres downstream), aFoam (white water), aFade (ends).
 */
function riverWater() {
  const uniforms = { uTime: { value: 0 }, uSky: { value: new THREE.Color() }, uShallow: { value: new THREE.Color(0x6fae9f) }, uDeep: { value: new THREE.Color(0x2c7880) } };
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.12, metalness: 0.1, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aRiverUv; attribute float aFoam; attribute float aFade;
        varying vec2 vRiverUv; varying float vFoam; varying float vFade; varying vec3 vRiverW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRiverUv = aRiverUv; vFoam = aFoam; vFade = aFade; vRiverW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uSky, uShallow, uDeep;
        varying vec2 vRiverUv; varying float vFoam; varying float vFade; varying vec3 vRiverW;
        float rhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(rhash(i), rhash(i + vec2(1.0, 0.0)), f.x), mix(rhash(i + vec2(0.0, 1.0)), rhash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        float across = (vRiverUv.x - 0.5) * 2.0, edgeD = 1.0 - abs(across);
        float depth = smoothstep(0.0, 0.85, edgeD);
        float t = uTime * 0.45 * (1.0 + vFoam * 1.5);
        vec2 p = vec2(across * 2.1, (vRiverUv.y - t) * 0.6);
        float n1 = rnoise(p + 3.1), n2 = rnoise(p * vec2(2.4, 2.0) + vec2(9.0, 0.0));
        float c1 = pow(1.0 - abs(rnoise(p * 2.2 + vec2(0.0, uTime * 0.12)) * 2.0 - 1.0), 8.0);
        float c2 = pow(1.0 - abs(rnoise(p * 2.9 + vec2(4.0, -uTime * 0.16)) * 2.0 - 1.0), 8.0);
        float caustic = (c1 + c2) * 0.1 * depth;
        float streak = smoothstep(0.62, 0.88, n1 * 0.6 + n2 * 0.4) * 0.2;
        float white = vFoam * (0.55 + 0.45 * smoothstep(0.35, 0.7, n2 + rnoise(p * 5.0) * 0.4));
        vec3 V = normalize(cameraPosition - vRiverW);
        float riverFres = pow(1.0 - clamp(V.y + (n1 - 0.5) * 0.1, 0.0, 1.0), 3.0);
        vec3 wcol = mix(uShallow, uDeep, depth) + caustic;
        wcol = mix(wcol, vec3(0.92), clamp(white + streak * 0.6, 0.0, 1.0));
        float wa = mix(0.3, 0.8, depth);
        wa = mix(wa, 0.95, clamp(white + streak * 0.4 + riverFres * 0.5, 0.0, 1.0));
        wa *= smoothstep(0.0, 0.08, edgeD) * vFade;
        vec4 diffuseColor = vec4(wcol, wa * opacity);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uSky * riverFres * 0.55 * (1.0 - clamp(white, 0.0, 1.0)); // the sky, mirrored at a slant`);
  };
  return { mat, uniforms };
}

/** Weirs: how high the water backs up behind each, and how far below it the water runs white. */
const WEIR_CREST = 0.28, WEIR_RUN = 1.3;

/**
 * The rivers as flowing ribbons laid on their carved channels. Wherever a channel has fallen half a metre since the
 * last one (and at least 10 m on), a low stone weir crosses it: the water backs up into a still pool behind it,
 * spills over in a short white fall, and runs foamy for a few metres below. On the flat, one every ~24 m, the water
 * rising gently to the sill. None near the ends or under a bridge.
 */
export function buildStream(ctx: WorldContext) {
  const { mat, uniforms } = riverWater();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7872, roughness: 1, flatShading: true });
  const stone = new THREE.DodecahedronGeometry(1, 0);
  const rng = mulberry32(911);
  const bridges = [...FOOT_BRIDGES.map((b) => [b.x, b.z]), [BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2]];
  // Pebbles on the streambeds in the valley (seen through the clear water at the edges): one draw for them all.
  const pebbleMats: THREE.Matrix4[] = [], pebbleCols: THREE.Color[] = [];
  let pebbleN = 0;
  const pebbleTones = [0x7a7468, 0x8a8273, 0x625f57, 0x6e6759, 0x938c7d];
  // (declared before the river loop below fills them)
  const lilyPads: THREE.Matrix4[] = [], lotuses: { m: THREE.Matrix4; c: THREE.Color; p: THREE.Vector3 }[] = [];
  const rockMats: THREE.Matrix4[] = [], rockCols: THREE.Color[] = [];
  const rockTone = new THREE.Color(0x7a7872), mossTone = new THREE.Color(0x5d7246);
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const river of RIVERS) {
    const L = riverLength(river);
    const N = Math.ceil(L / (river.falls ? 0.5 : 1));
    // along the river: where it is, across which way, how wide, and the water's natural level
    const S = Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * L, f = riverFrame(river, s), wl = waterLevel(river, s);
      return { s, x: f.x, z: f.z, nx: f.nx, nz: f.nz, half: riverHalfWidth(river, s), wl, y: wl, foam: 0 };
    });
    // the weirs
    const weirs: number[] = [];
    let lastWl = S[0].wl, lastS = 0;
    S.forEach((q, i) => {
      if (q.s < 12 || q.s > L - 12 || bridges.some(([bx, bz]) => Math.hypot(q.x - bx, q.z - bz) < 9)) return; // clear of the ends and bridges
      if ((lastWl - q.wl >= 0.5 && q.s - lastS >= 10) || q.s - lastS >= 24) { // a real drop, or every so often on the flat
        weirs.push(i);
        lastWl = q.wl;
        lastS = q.s;
      }
    });
    for (const w of weirs) {
      const q = S[w], level = q.wl + WEIR_CREST;
      // the water backs up behind the weir, rising gently over the last 10 m to its sill; white water below it
      for (let i = w; i >= 0 && q.s - S[i].s <= 10; i--) S[i].y = Math.max(S[i].y, level - (q.s - S[i].s) * (WEIR_CREST / 10));
      for (const o of S) {
        const d = o.s - q.s;
        o.foam = Math.max(o.foam, smoothstep(-0.2, 0.4, d) * (1 - smoothstep(WEIR_RUN, WEIR_RUN + 4.5, d))); // (dies away fully a few metres on)
      }
      // the weir: a stone sill set across the channel and into both banks, its top just under the water
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2 * (q.half + 1.1), 0.8, 0.6), rockMat);
      sill.position.set(q.x, level - 0.44, q.z);
      sill.rotation.y = Math.atan2(-q.nz, q.nx);
      sill.receiveShadow = true;
      ctx.scene.add(sill);
      for (let k = 0; k < 4; k++) { // and a few stones on the banks at either end
        const side = k % 2 ? 1 : -1, r = 0.35 + rng() * 0.35, off = q.half + 1.0 + rng() * 0.8, along = rng() * 1.2 - 0.3;
        const m = new THREE.Mesh(stone, rockMat);
        m.scale.set(r, r * 0.8, r);
        const bx = q.x + side * q.nx * off - q.nz * along, bz = q.z + side * q.nz * off + q.nx * along;
        m.position.set(bx, terrainHeight(bx, bz) + r * 0.2, bz);
        m.rotation.set(rng() * 3, rng() * 6, rng() * 3);
        ctx.scene.add(m);
      }
    }
    // the water: its edges tucked just under the banks (wider where it's backed up, as it climbs them)
    // where an end runs into the pond or another river it fades into it; the falls stream fades in from its pool
    const fadeIn = river.falls || riverEndMeets(river, 0) !== null, fadeOut = riverEndMeets(river, 1) !== null;
    const pos: number[] = [], uv: number[] = [], foam: number[] = [], fade: number[] = [], idx: number[] = [];
    S.forEach((q, i) => {
      const half = q.half + 0.3 + (q.y - q.wl) * 2.6;
      const f = (fadeIn ? smoothstep(0, 2, q.s) : 1) * (fadeOut ? smoothstep(0, 2, L - q.s) : 1);
      pos.push(q.x + q.nx * half, q.y, q.z + q.nz * half, q.x - q.nx * half, q.y, q.z - q.nz * half);
      uv.push(0, q.s, 1, q.s);
      foam.push(q.foam, q.foam);
      fade.push(f, f);
      if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aRiverUv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if ((geo.attributes.normal as THREE.BufferAttribute).getY(0) < 0) geo.setIndex(idx.reverse()), geo.computeVertexNormals(); // facing up, for the light
    pebbles(river, L);
    rocks(river, L, weirs.map((w) => S[w].s));
    lilies(S, L, riverEndMeets(river, 0) !== null, riverEndMeets(river, 1) !== null);
    const ribbon = new THREE.Mesh(geo, mat);
    ribbon.frustumCulled = false; // long and thin: its bounds would cull it wrongly at times
    ctx.scene.add(ribbon);
    ctx.scene.add(bankStrip(river, L));
  }

  function pebbles(river: (typeof RIVERS)[number], L: number) {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const skip0 = riverEndMeets(river, 0) !== null ? 15 : 0, skip1 = riverEndMeets(river, 1) !== null ? 15 : 0; // not where it opens into the pond
    for (let s = skip0; s < L - skip1; s += 0.6) {
      const f = riverFrame(river, s);
      if (Math.hypot(f.x - BASIN.x, f.z - BASIN.z) > PLAY_RADIUS + 15) continue;
      const hw = riverHalfWidth(river, s);
      for (let k = 0; k < 2; k++) {
        const d = (rng() * 2 - 1) * hw * 0.7, along = rng() * 0.45, x = f.x + f.nx * d - f.nz * along, z = f.z + f.nz * d + f.nx * along, r = 0.06 + rng() * rng() * 0.16;
        pebbleMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, terrainHeight(x, z) + r * 0.25, z), q.setFromEuler(e.set(rng() * 0.4, rng() * 6, rng() * 0.4)), new THREE.Vector3(r * 1.3, r * 0.5, r)));
        pebbleCols.push(new THREE.Color(pebbleTones[Math.floor(rng() * pebbleTones.length)]).multiplyScalar(0.85 + rng() * 0.3));
        pebbleN++;
      }
    }
  }

  // Boulders: along the banks (some mossy), and a few standing in the current, their tops out of the water.
  function rocks(river: (typeof RIVERS)[number], L: number, weirAt: number[]) {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const skip0 = riverEndMeets(river, 0) !== null ? 15 : 6, skip1 = riverEndMeets(river, 1) !== null ? 15 : 6;
    const put = (x: number, y: number, z: number, r: number, mossy: boolean) => {
      rockMats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rng() * 3, rng() * 6, rng() * 3)), new THREE.Vector3(r * (1 + rng() * 0.4), r * (0.7 + rng() * 0.3), r)));
      rockCols.push(rockTone.clone().lerp(mossTone, mossy ? 0.5 + rng() * 0.3 : 0).multiplyScalar(0.85 + rng() * 0.3));
    };
    for (let s = skip0; s < L - skip1; s += 2.5 + rng() * 3) {
      const f = riverFrame(river, s);
      if (Math.hypot(f.x - BASIN.x, f.z - BASIN.z) > PLAY_RADIUS + 15 || weirAt.some((w) => Math.abs(w - s) < 3) || bridges.some(([bx, bz]) => Math.hypot(f.x - bx, f.z - bz) < 9)) continue;
      const hw = riverHalfWidth(river, s);
      if (rng() < 0.55) { // on a bank, half sunk in it
        const d = (rng() < 0.5 ? -1 : 1) * (hw + 0.3 + rng() * 1.9), x = f.x + f.nx * d, z = f.z + f.nz * d, r = 0.22 + rng() * rng() * 0.6;
        put(x, terrainHeight(x, z) + r * 0.15, z, r, rng() < 0.35);
      }
      if (rng() < 0.16) { // in the stream, standing a little proud of the water
        const d = (rng() * 2 - 1) * hw * 0.55, x = f.x + f.nx * d, z = f.z + f.nz * d, r = 0.3 + rng() * 0.25;
        put(x, waterLevel(river, s) + 0.08 + rng() * 0.12 - r * 0.6, z, r, rng() < 0.5);
      }
    }
  }

  // Lily pads in clusters by the edges of quiet water (never in the white water), a lotus on a few.
  function lilies(S: { s: number; x: number; z: number; nx: number; nz: number; half: number; y: number; foam: number }[], L: number, end0: boolean, end1: boolean) {
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), step = L / (S.length - 1);
    for (let s = end0 ? 15 : 6; s < L - (end1 ? 15 : 6); s += 5 + rng() * 7) {
      const o = S[Math.round(s / step)];
      if (rng() > 0.85 || o.foam > 0.02 || Math.hypot(o.x - BASIN.x, o.z - BASIN.z) > PLAY_RADIUS + 15 || bridges.some(([bx, bz]) => Math.hypot(o.x - bx, o.z - bz) < 7)) continue;
      const side = rng() < 0.5 ? -1 : 1, n = 3 + Math.floor(rng() * 4), flower = rng() < 0.3;
      for (let k = 0; k < n; k++) {
        const d = side * o.half * (0.4 + rng() * 0.45), along = (rng() - 0.5) * 2.2, sc = 0.7 + rng() * 0.55;
        const p = new THREE.Vector3(o.x + o.nx * d - o.nz * along, o.y + 0.04, o.z + o.nz * d + o.nx * along); // (clear of the water's surface)
        lilyPads.push(new THREE.Matrix4().compose(p, q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(sc, 1, sc)));
        if (flower && k === 0) {
          const fs = 1.2 + rng() * 0.4;
          lotuses.push({ m: new THREE.Matrix4().compose(p.clone().setY(p.y + 0.02), q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(fs, fs, fs)), c: rng() < 0.65 ? lotusKit().pink : lotusKit().white, p });
        }
      }
    }
  }

  function bankStrip(river: (typeof RIVERS)[number], L: number) {
    // Across: from the grass well clear of the river, down the bank, over the bed, and up the far side. Finer near
    // the water's edge, where the shape changes fastest.
    const outs = [6, 4.4, 3.2, 2.4, 1.7, 1.2, 0.75, 0.35, 0];
    const rows = Math.ceil(L / 0.8), cols = outs.length * 2 + 3;
    const pos = new Float32Array((rows + 1) * cols * 3), col = new Float32Array((rows + 1) * cols * 3), idx: number[] = [];
    const c = new THREE.Color(), dampGrass = new THREE.Color(0x4d7034), earth = new THREE.Color(0x76694a), pebble = new THREE.Color(0x8f8877), bed = new THREE.Color(0x5c5844);
    for (let r = 0; r <= rows; r++) {
      const s = (r / rows) * L, f = riverFrame(river, s), hw = riverHalfWidth(river, s), wl = waterLevel(river, s);
      const ds = [...outs.map((o) => -(hw + o)), -hw * 0.55, 0, hw * 0.55, ...[...outs].reverse().map((o) => hw + o)];
      ds.forEach((d, k) => {
        // (its outer edge lies exactly on the coarse terrain's surface: no crack where they meet)
        const x = f.x + f.nx * d, z = f.z + f.nz * d, j = (r * cols + k) * 3, edge = smoothstep(hw + 4, hw + 6, Math.abs(d));
        const y = edge > 0 ? terrainHeight(x, z) + (coarseHeightAt(x, z) - terrainHeight(x, z)) * edge : terrainHeight(x, z);
        pos.set([x, y, z], j);
        const gx = (terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) / 2, gz = (terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
        groundColour(x, y, z, 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz), c);
        // (the bands wander a little, so they read as ground, not stripes)
        const above = y - wl + (noise2(x * 0.9, z * 0.9) - 0.5) * 0.16;
        c.lerp(dampGrass, (1 - smoothstep(0.25, 1.0, above)) * 0.4); // damp grass toward the water
        c.lerp(earth, (1 - smoothstep(0.08, 0.36, above)) * (0.7 + 0.3 * noise2(x * 2.3, z * 2.3))); // the earthen bank
        c.lerp(pebble, (1 - smoothstep(0, 0.14, Math.abs(above - 0.03))) * 0.7); // wet pebbles at the water's edge
        if (above < 0) c.lerp(bed, smoothstep(0, -0.2, above)).lerp(pebble, noise2(x * 4.1, z * 4.1) * 0.35); // a pebbly streambed
        c.multiplyScalar(0.88 + 0.24 * noise2(x * 3.3, z * 3.3)); // speckled
        col.set([c.r, c.g, c.b], j);
      });
      if (r < rows) for (let k = 0; k < cols - 1; k++) {
        const a = r * cols + k, b = a + cols;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if ((g.attributes.normal as THREE.BufferAttribute).getY(Math.floor(cols / 2)) < 0) g.setIndex(idx.reverse()), g.computeVertexNormals(); // face up
    const m = new THREE.Mesh(g, bankMat);
    m.receiveShadow = true;
    return m;
  }

  if (pebbleN) {
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), pebbleN);
    for (let i = 0; i < pebbleN; i++) {
      im.setMatrixAt(i, pebbleMats[i]);
      im.setColorAt(i, pebbleCols[i]);
    }
    im.receiveShadow = true;
    ctx.scene.add(im);
  }

  if (lilyPads.length) {
    const K = lotusKit();
    const pads = new THREE.InstancedMesh(K.padGeo, K.padMat, lilyPads.length);
    lilyPads.forEach((m, i) => pads.setMatrixAt(i, m));
    pads.receiveShadow = true;
    ctx.scene.add(pads);
    if (lotuses.length) {
      const flowers = new THREE.InstancedMesh(K.flowerGeo, K.flowerMat, lotuses.length), pods = new THREE.InstancedMesh(K.podGeo, K.podMat, lotuses.length);
      const hp: number[] = [], hc: number[] = [];
      lotuses.forEach((l, i) => {
        flowers.setMatrixAt(i, l.m);
        pods.setMatrixAt(i, l.m);
        flowers.setColorAt(i, l.c);
        hp.push(l.p.x, l.p.y + 0.25, l.p.z);
        hc.push(l.c.r, l.c.g * 0.9, l.c.b);
      });
      ctx.scene.add(flowers, pods, haloPoints(hp, hc, 1.6, 0.55));
    }
  }
  if (rockMats.length) {
    const im = new THREE.InstancedMesh(stone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), rockMats.length);
    rockMats.forEach((m, i) => (im.setMatrixAt(i, m), im.setColorAt(i, rockCols[i])));
    im.castShadow = im.receiveShadow = true;
    ctx.scene.add(im);
  }

  const fog = ctx.scene.fog as THREE.FogExp2 | null;
  ctx.updaters.push((_, time) => {
    uniforms.uTime.value = time;
    if (fog) uniforms.uSky.value.copy(fog.color); // what the water mirrors at a slant: the sky low down, day or night
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
