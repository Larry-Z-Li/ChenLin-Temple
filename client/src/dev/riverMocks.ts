import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mulberry32 } from '../core/math';

/**
 * Mock (dev: /river-mocks.html): four stream styles in a 2×2 grid — A clear shallow stream over pebbles, B rapids
 * with foam wakes round rocks, C still reflective water with lily pads and reeds, D three small stone weirs.
 * One water shader for all (flow along the ribbon's v, edge foam via u, noise ripples, fresnel sheen, caustics).
 * Click a view to look round it.
 */

// ---- the shared water shader ----
const time = { value: 0 };
const VERT = /* glsl */ `
attribute float aFoam;
varying vec2 vUv; varying vec3 vW; varying float vFoam;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vFoam = aFoam;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
uniform float uTime, uSpeed, uScale, uStretch, uWidth, uAlphaEdge, uAlphaMid, uCaustic, uRipple, uEdgeFoam, uSheen;
uniform vec3 uShallow, uDeep, uSky;
varying vec2 vUv; varying vec3 vW; varying float vFoam;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float across = (vUv.x - 0.5) * 2.0, edgeD = 1.0 - abs(across);
  float depth = smoothstep(0.0, 0.85, edgeD);
  float t = uTime * uSpeed * (1.0 + vFoam * 1.5);
  vec2 p = vec2(across * uWidth * 0.5 * uScale, (vUv.y - t) * uScale / uStretch);
  float n1 = noise(p * vec2(1.0, 1.0) + 3.1), n2 = noise(p * vec2(2.4, 2.0) + vec2(9.0, 0.0));
  // caustic web: bright thin lines where two drifting noises cross 0.5
  float c1 = pow(1.0 - abs(noise(p * 2.2 + vec2(0.0, uTime * 0.15)) * 2.0 - 1.0), 7.0);
  float c2 = pow(1.0 - abs(noise(p * 2.9 + vec2(4.0, -uTime * 0.2)) * 2.0 - 1.0), 7.0);
  float caustic = (c1 + c2) * uCaustic * (0.4 + 0.6 * depth);
  float streak = smoothstep(0.6, 0.86, n1 * 0.6 + n2 * 0.4) * uRipple;
  float rag = noise(vec2(across * 6.0, (vUv.y - t * 0.7) * 1.5));
  float edgeFoam = (1.0 - smoothstep(0.02, 0.2, edgeD + (rag - 0.5) * 0.14)) * uEdgeFoam;
  float slope = vFoam * (0.55 + 0.45 * smoothstep(0.35, 0.7, n2 + noise(p * 5.0) * 0.4));
  float foam = clamp(edgeFoam + slope, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - clamp(V.y + (n1 - 0.5) * 0.12, 0.0, 1.0), 3.0) * uSheen;
  vec3 col = mix(uShallow, uDeep, depth);
  col = mix(col, uSky, clamp(fres, 0.0, 1.0));
  col += caustic * vec3(0.7, 0.95, 0.85);
  col = mix(col, vec3(1.0), clamp(foam + streak * 0.7, 0.0, 1.0));
  float a = mix(uAlphaEdge, uAlphaMid, depth);
  a = mix(a, 1.0, clamp(max(foam, fres * 0.6) + streak * 0.5, 0.0, 1.0));
  a *= smoothstep(0.0, 0.07, edgeD);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
interface WaterOpts {
  speed?: number; scale?: number; stretch?: number; alphaEdge?: number; alphaMid?: number; caustic?: number;
  ripple?: number; edgeFoam?: number; sheen?: number; shallow?: number; deep?: number; sky?: number;
}
function waterMat(o: WaterOpts) {
  const col = (c: number) => ({ value: new THREE.Color(c) });
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: time,
      uSpeed: { value: o.speed ?? 0.6 },
      uScale: { value: o.scale ?? 1.2 },
      uStretch: { value: o.stretch ?? 1.5 },
      uWidth: { value: 4 },
      uAlphaEdge: { value: o.alphaEdge ?? 0.4 },
      uAlphaMid: { value: o.alphaMid ?? 0.7 },
      uCaustic: { value: o.caustic ?? 0 },
      uRipple: { value: o.ripple ?? 0.2 },
      uEdgeFoam: { value: o.edgeFoam ?? 0.3 },
      uSheen: { value: o.sheen ?? 0.3 },
      uShallow: col(o.shallow ?? 0xa8dcd0),
      uDeep: col(o.deep ?? 0x2f8f9a),
      uSky: col(o.sky ?? 0xcfe6f4),
    },
  });
}

// ---- shared bits ----
const puff = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7872, roughness: 1, flatShading: true });
const updaters: ((dt: number, t: number) => void)[] = [];
const L0 = -14, L1 = 100; // the stream runs from s = L0 to L1 along +z

interface StreamOpts {
  seed: number; phase: number; hw: number; depth: number;
  yOf?: (s: number) => number;      // water-bed level along the stream (steps)
  foamOf?: (s: number) => number;   // 0..1 foam on the water by s
  bed: [number, number, number];    // rgb of the stream bed
  water: WaterOpts;
}
/** One stretch of stream: a grassy carved channel, the water ribbon, and a toolkit for placing things on it. */
function stream(o: StreamOpts) {
  const g = new THREE.Group(), rng = mulberry32(o.seed);
  const yOf = o.yOf ?? (() => 0);
  const dx = (s: number) => 3.5 * 0.07 * Math.cos(s * 0.07 + o.phase);
  const cx = (s: number) => 3.5 * Math.sin(s * 0.07 + o.phase);
  const hwOf = (s: number) => o.hw * (0.9 + 0.2 * Math.sin(s * 0.11 + o.seed));
  /** a point beside the centreline: s along, d across (+ to the right of travel), y above the water-bed level */
  const at = (s: number, d: number, y = 0) => {
    const k = Math.hypot(dx(s), 1);
    return new THREE.Vector3(cx(s) + d / k, yOf(s) + y, s - (d * dx(s)) / k);
  };
  const yaw = (s: number) => Math.atan2(dx(s), 1);

  // the land: a strip of grid across the stream, flat-shaded, vertex-coloured, the channel carved into it
  const kin = [0, 0.3, 0.6, 0.85, 1.0], kout = [0.5, 1.1, 2, 3.5, 6, 10, 18, 40];
  const cols: { k: number; outer: boolean }[] = [
    ...kout.map((k) => ({ k: -k, outer: true })).reverse(),
    ...kin.slice(1).map((k) => ({ k: -k, outer: false })).reverse(),
    ...kin.map((k) => ({ k, outer: false })),
    ...kout.map((k) => ({ k, outer: true })),
  ];
  const sList: number[] = [];
  for (let s = L0; s <= L1; s += 1.25) sList.push(s);
  const pos: number[] = [], colr: number[] = [], idx: number[] = [];
  const grass = new THREE.Color(0x6f9a52), grass2 = new THREE.Color(0x86ad5e), bed = new THREE.Color(...o.bed), c = new THREE.Color();
  sList.forEach((s) => {
    const hw = hwOf(s);
    cols.forEach(({ k, outer }) => {
      const d = outer ? Math.sign(k) * (hw + Math.abs(k)) : k * hw;
      const a = Math.abs(d) / hw;
      const t = THREE.MathUtils.smoothstep(a, 0.9, 1.5);
      const jitter = (rng() - 0.5) * 0.7 * THREE.MathUtils.smoothstep(a, 1.3, 2.5);
      const h = -o.depth * (1 - t) + jitter + 0.03 * Math.max(0, Math.abs(d) - hw - 1);
      const p = at(s, d, h);
      pos.push(p.x, p.y, p.z);
      const gm = grass.clone().lerp(grass2, rng());
      c.copy(bed).multiplyScalar(0.85 + rng() * 0.3).lerp(gm, THREE.MathUtils.smoothstep(a, 0.95, 1.35));
      colr.push(c.r, c.g, c.b);
    });
  });
  const W = cols.length;
  for (let i = 0; i < sList.length - 1; i++) for (let j = 0; j < W - 1; j++) {
    const a = i * W + j;
    idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
  }
  const land = new THREE.BufferGeometry();
  land.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  land.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  land.setIndex(idx);
  land.computeVertexNormals();
  g.add(new THREE.Mesh(land, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));

  // the water: a ribbon, v = distance downstream, u = across
  const wp: number[] = [], wuv: number[] = [], wf: number[] = [], wi: number[] = [];
  const N = Math.round((L1 - L0) / 0.4);
  for (let i = 0; i <= N; i++) {
    const s = L0 + (i * (L1 - L0)) / N, hw = hwOf(s) + 0.25;
    const l = at(s, -hw, -0.15), r = at(s, hw, -0.15), f = o.foamOf?.(s) ?? 0;
    wp.push(l.x, l.y, l.z, r.x, r.y, r.z);
    wuv.push(0, s, 1, s);
    wf.push(f, f);
    if (i < N) wi.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setAttribute('aFoam', new THREE.Float32BufferAttribute(wf, 1));
  wg.setIndex(wi);
  const water = new THREE.Mesh(wg, waterMat(o.water));
  water.renderOrder = 2;
  g.add(water);

  // rocks along both banks
  for (let i = 0; i < 46; i++) {
    const s = L0 + rng() * (L1 - L0), side = i % 2 ? 1 : -1, hw = hwOf(s);
    const r = 0.25 + rng() * rng() * 0.9;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    m.scale.set(r, r * (0.6 + rng() * 0.5), r * (0.8 + rng() * 0.4));
    m.position.copy(at(s, side * (hw + 0.2 + rng() * 2.5), r * 0.2));
    m.rotation.set(rng() * 3, rng() * 6, rng() * 3);
    g.add(m);
  }
  return { g, rng, at, yaw, hwOf, cx, yOf };
}
type Stream = ReturnType<typeof stream>;

/** Pebbles over the stream bed (instanced). */
function pebbles(st: Stream, n: number, depth: number, palette: number[], size = 1) {
  const m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), n);
  const o = new THREE.Object3D(), col = new THREE.Color(), rng = mulberry32(77);
  for (let i = 0; i < n; i++) {
    const s = L0 + rng() * (L1 - L0), r = (0.06 + rng() * rng() * 0.16) * size;
    o.position.copy(st.at(s, (rng() * 2 - 1) * st.hwOf(s) * 0.95, -depth + r * 0.3));
    o.scale.set(r * (1 + rng() * 0.5), r * 0.55, r);
    o.rotation.set(rng(), rng() * 6, rng());
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, col.setHex(palette[Math.floor(rng() * palette.length)]).multiplyScalar(0.8 + rng() * 0.4));
  }
  st.g.add(m);
}

/** Soft ripple rings that grow and fade at fixed spots on the water. */
function rings(st: Stream, spots: THREE.Vector3[], period: number, size: number) {
  spots.forEach((p, i) => {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.position.set(p.x, p.y - 0.1, p.z);
      m.renderOrder = 3;
      st.g.add(m);
      updaters.push((_, t) => {
        const q = (t / period + i * 0.37 + k * 0.5) % 1;
        m.scale.setScalar(0.1 + q * size);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - q) * Math.min(1, q * 8);
      });
    }
  });
}

/** Spray hopping up from `spots`: small soft white points. */
function spray(st: Stream, spots: THREE.Vector3[], n: number, power: number) {
  const rng = mulberry32(n + spots.length), pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), home = new Int32Array(n);
  const reset = (i: number) => {
    const p = spots[(home[i] = Math.floor(rng() * spots.length))];
    pos.set([p.x + (rng() - 0.5) * 0.8, p.y, p.z + (rng() - 0.5) * 0.8], i * 3);
    vel.set([(rng() - 0.5) * power, (1 + rng() * 2.2) * power, (rng() - 0.3) * power], i * 3);
  };
  for (let i = 0; i < n; i++) { reset(i); pos[i * 3 + 1] += rng(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: puff, size: 0.45, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  pts.renderOrder = 4;
  pts.frustumCulled = false;
  st.g.add(pts);
  updaters.push((dt) => {
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      vel[j + 1] -= 6 * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < spots[home[i]].y - 0.05) reset(i);
    }
    geo.attributes.position.needsUpdate = true;
  });
}

/** A flat soft foam patch on the water, pulsing, oriented along the stream. */
function foamPatch(st: Stream, p: THREE.Vector3, s: number, w: number, len: number, op: number, ph: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false, opacity: op }));
  m.position.set(p.x, p.y - 0.1, p.z);
  m.rotation.y = st.yaw(s);
  m.renderOrder = 3;
  st.g.add(m);
  updaters.push((_, t) => {
    const k = 1 + 0.12 * Math.sin(t * 3 + ph);
    m.scale.set(w * k, 1, len * (2 - k * 0.6));
    (m.material as THREE.MeshBasicMaterial).opacity = op * (0.8 + 0.2 * Math.sin(t * 4.3 + ph * 2));
  });
}

// ---- the four ----
const hazard = (st: Stream, rng: () => number, n: number, big: boolean) => {
  // rocks standing in the flow, each with a foam wake behind and a bow ripple before
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const s = 2 + (i / n) * 50 + rng() * 2, hw = st.hwOf(s), d = (rng() * 2 - 1) * hw * 0.75, r = (big ? 0.45 : 0.3) + rng() * 0.4;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    m.scale.set(r, r * 0.9, r * 1.1);
    m.position.copy(st.at(s, d, -0.1 + r * 0.45));
    m.rotation.set(rng() * 3, rng() * 6, rng() * 3);
    st.g.add(m);
    const w = st.at(s, d, 0);
    foamPatch(st, st.at(s + r + 0.9, d, -0.05), s, r * 2.6, r * 2.8 + 1.4, 0.85, i);
    foamPatch(st, st.at(s - r * 0.6, d, -0.05), s, r * 3, r * 1.6, 0.55, i + 3);
    spots.push(st.at(s + r, d, 0.1));
    void w;
  }
  return spots;
};

function clearStream() { // A
  const st = stream({
    seed: 3, phase: 0.4, hw: 2, depth: 0.55, bed: [0.72, 0.66, 0.5],
    water: { speed: 0.45, scale: 1.1, stretch: 1.6, alphaEdge: 0.18, alphaMid: 0.5, caustic: 0.55, ripple: 0.12, edgeFoam: 0.25, sheen: 0.35, shallow: 0xbfeadc, deep: 0x2a9aa0 },
  });
  pebbles(st, 1100, 0.55, [0x8b8478, 0xa59a86, 0x6e6a60, 0xb9ad94, 0x7d8a82], 1.1);
  return st.g;
}

function rapids() { // B
  const st = stream({
    seed: 9, phase: 1.3, hw: 2.1, depth: 0.7, bed: [0.5, 0.48, 0.42],
    water: { speed: 1.5, scale: 1.4, stretch: 3, alphaEdge: 0.5, alphaMid: 0.78, caustic: 0.1, ripple: 0.9, edgeFoam: 0.8, sheen: 0.2, shallow: 0xcfeaf0, deep: 0x3b8fa0 },
  });
  pebbles(st, 300, 0.7, [0x6e6a60, 0x7d7a70, 0x5f5c54], 1.6);
  const spots = hazard(st, mulberry32(21), 16, true);
  spray(st, spots, 220, 3);
  return st.g;
}

function stillWater() { // C
  const st = stream({
    seed: 14, phase: 2.2, hw: 2.4, depth: 0.9, bed: [0.22, 0.26, 0.22],
    water: { speed: 0.05, scale: 0.8, stretch: 1, alphaEdge: 0.7, alphaMid: 0.93, caustic: 0, ripple: 0.05, edgeFoam: 0.05, sheen: 1.15, shallow: 0x3e6e6a, deep: 0x18343c, sky: 0xaed2ea },
  });
  pebbles(st, 120, 0.9, [0x4a5048, 0x3d443e], 1);
  const rng = st.rng, padMat = new THREE.MeshStandardMaterial({ color: 0x4a8a3c, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const flower = new THREE.MeshStandardMaterial({ color: 0xf0a3c0, roughness: 0.8, flatShading: true });
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < 26; i++) {
    const s = 4 + rng() * 40, hw = st.hwOf(s), cl = i < 14 ? 0.55 : 0; // some near the right edge, some scattered
    const d = (cl ? 0.45 + rng() * 0.4 : (rng() * 2 - 1) * 0.8) * hw, r = 0.35 + rng() * 0.3;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 12, 0, 5.6).rotateX(-Math.PI / 2), padMat);
    pad.position.copy(st.at(s, d, -0.12));
    pad.rotation.y = rng() * 6.28;
    st.g.add(pad);
    if (i % 6 === 0) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 6), flower);
      f.position.copy(pad.position).add(new THREE.Vector3(0, 0.12, 0));
      st.g.add(f);
    }
    if (i % 4 === 0) spots.push(st.at(s, d, -0.1));
  }
  rings(st, spots, 5, 1.8);
  // reeds on both edges, with the odd cattail
  const reed = new THREE.MeshStandardMaterial({ color: 0x6f8f3c, roughness: 1, flatShading: true });
  const cat = new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: 1, flatShading: true });
  for (let i = 0; i < 34; i++) {
    const s = L0 + rng() * (L1 - L0 - 20), side = i % 2 ? 1 : -1, hw = st.hwOf(s), base = st.at(s, side * (hw + 0.1 + rng() * 0.8), -0.2);
    for (let k = 0; k < 6; k++) {
      const h = 1 + rng() * 1.1, b = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 4), reed);
      b.position.set(base.x + (rng() - 0.5) * 0.7, base.y + h / 2, base.z + (rng() - 0.5) * 0.7);
      b.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
      st.g.add(b);
      if (k === 0 && i % 3 === 0) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6), cat);
        c.position.set(b.position.x, base.y + h + 0.1, b.position.z);
        st.g.add(c);
      }
    }
  }
  return st.g;
}

const STEPS = [14, 26, 38], DROP = 0.9, RUN = 1.3;
const stepY = (s: number) => STEPS.reduce((y, a) => y - DROP * THREE.MathUtils.smoothstep(s, a, a + RUN), 0);
function stepsStream() { // D
  const st = stream({
    seed: 5, phase: 0.9, hw: 2, depth: 0.7, bed: [0.55, 0.52, 0.45], yOf: stepY,
    foamOf: (s) => STEPS.reduce((f, a) => Math.max(f, THREE.MathUtils.smoothstep(s, a - 0.2, a + 0.4) * (1 - THREE.MathUtils.smoothstep(s, a + RUN, a + RUN + 4.5) * 0.9)), 0),
    water: { speed: 0.5, scale: 1.2, stretch: 2, alphaEdge: 0.4, alphaMid: 0.72, caustic: 0.2, ripple: 0.3, edgeFoam: 0.35, sheen: 0.3, shallow: 0xb5e3dc, deep: 0x2f8c98 },
  });
  pebbles(st, 400, 0.7, [0x8b8478, 0xa59a86, 0x6e6a60], 1);
  const spots: THREE.Vector3[] = [];
  STEPS.forEach((a, i) => {
    const hw = st.hwOf(a), top = stepY(a - 1);
    // the weir: a stone sill across the lip (just under the water), with bigger stones at both ends
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.6, 0.7, 0.7), rockMat);
    sill.position.copy(st.at(a - 0.25, 0, -0.5));
    sill.position.y = top - 0.17 - 0.35;
    sill.rotation.y = st.yaw(a);
    st.g.add(sill);
    for (let k = 0; k < 7; k++) {
      const side = k % 2 ? 1 : -1, r = 0.4 + st.rng() * 0.3, m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
      m.scale.set(r, r * 0.8, r);
      m.position.copy(st.at(a + st.rng() * 1.2, side * (hw + 0.2 + st.rng() * 0.8), r * 0.2 - (k < 2 ? 0 : 0.0)));
      m.rotation.set(st.rng() * 3, st.rng() * 6, st.rng() * 3);
      st.g.add(m);
    }
    for (let k = 0; k < 3; k++) { // the foam where each fall lands, and where the pool eddies
      const d = (k - 1) * hw * 0.55;
      foamPatch(st, st.at(a + RUN + 0.6, d, -0.05), a, hw * 0.9, 1.6, 0.85, i + k);
      spots.push(st.at(a + RUN + 0.3, d, 0));
    }
    foamPatch(st, st.at(a + RUN + 2.8, 0, -0.05), a, hw * 1.5, 2.6, 0.4, i * 2);
  });
  spray(st, spots, 160, 2.2);
  return st.g;
}

// ---- four views ----
const SKY = 0xbcd7e8;
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 125);
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5d6b4a, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2);
sun.position.set(40, 80, 30);
scene.add(sun);

const labels = [...document.querySelectorAll<HTMLElement>('.label')];
const builders = [clearStream, rapids, stillWater, stepsStream];
const cxOf = (phase: number) => (s: number) => 3.5 * Math.sin(s * 0.07 + phase);
const phases = [0.4, 1.3, 2.2, 0.9];
const views = builders.map((build, i) => {
  const x = i * 400; // far apart: fog hides the others
  const g = build();
  g.position.x = x;
  scene.add(g);
  const cx = cxOf(phases[i]), d = i === 3;
  const home = new THREE.Vector3(x + cx(-2) + 2, d ? 8.5 : 8, -4), target = new THREE.Vector3(x + cx(d ? 22 : 16), d ? -1.2 : -0.4, d ? 22 : 16);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enabled = false;
  controls.enableDamping = true;
  return { camera, controls, home, target };
});

let open = -1; // which view fills the window (-1: the grid)
const cell = (i: number) => {
  const w = innerWidth, h = innerHeight;
  if (open >= 0) return { x: 0, y: 0, w, h };
  return { x: (i % 2) * (w / 2), y: Math.floor(i / 2) * (h / 2), w: w / 2, h: h / 2 };
};
function show(i: number) {
  open = i;
  views.forEach((v, j) => {
    v.controls.enabled = j === i;
    if (i < 0) { // back to the grid: every camera home
      v.camera.position.copy(v.home);
      v.controls.target.copy(v.target);
    }
  });
  labels.forEach((l, j) => l.classList.toggle('hidden', i >= 0 && j !== i));
  document.body.classList.toggle('open', i >= 0);
  layoutLabels();
}
function layoutLabels() {
  labels.forEach((l, i) => {
    const c = cell(i);
    l.style.left = `${c.x + 12}px`;
    l.style.top = `${c.y + 12}px`;
  });
}
let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a drag (orbiting), not a click
  if (open >= 0) return show(-1);
  show((e.clientX > innerWidth / 2 ? 1 : 0) + (e.clientY > innerHeight / 2 ? 2 : 0));
});
addEventListener('keydown', (e) => e.key === 'Escape' && show(-1));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  layoutLabels();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setScissorTest(true);
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  time.value = t;
  for (const u of updaters) u(dt, t);
  views.forEach((v, i) => {
    if (open >= 0 && i !== open) return;
    const c = cell(i), y = innerHeight - c.y - c.h; // GL's viewport counts from the bottom
    if (open < 0) v.camera.position.x = v.home.x + Math.sin(t * 0.15 + i) * 2; // a slow drift in the grid
    else v.controls.update();
    v.camera.aspect = c.w / c.h;
    v.camera.updateProjectionMatrix();
    if (open < 0) v.camera.lookAt(v.target);
    renderer.setViewport(c.x, y, c.w, c.h);
    renderer.setScissor(c.x, y, c.w, c.h);
    renderer.render(scene, v.camera);
  });
});
