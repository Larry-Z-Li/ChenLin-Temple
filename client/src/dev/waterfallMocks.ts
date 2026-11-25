import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mulberry32 } from '../core/math';

/**
 * Mock (dev: /waterfall-mocks.html): four waterfalls, side by side in a 2×2 grid — A a bowed curtain, B three
 * tiers, C veil strands over moss, D an arcing plunge. One water shader for all: vertical value-noise streaks
 * that stretch as they fall, foam at the lip and the foot, ragged edges. Click a view to look round it.
 */

// ---- the shared water shader ----
const time = { value: 0 };
const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform float uTime, uSpeed, uCols, uRows, uOpacity, uFoamTop, uFoamBase, uEdge, uSeed;
uniform vec3 uDeep, uLight;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float x = vUv.x, y = 1.0 - vUv.y;            // y: 0 at the lip … 1 at the foot
  float fall = y * (0.35 + 0.65 * y);           // accelerating: the streaks stretch as they fall
  float t = uTime * uSpeed;
  vec2 p = vec2(x * uCols + uSeed, fall * uRows - t);
  float s = noise(p * vec2(1.0, 0.16)) * 0.55 + noise(p * vec2(2.7, 0.3) + 7.3) * 0.3 + noise(p * vec2(6.0, 0.7) + 1.7) * 0.15;
  float streak = smoothstep(0.4, 0.82, s);
  float foam = (1.0 - smoothstep(0.0, uFoamTop, y)) * 0.85 + smoothstep(1.0 - uFoamBase, 1.0, y);
  float rag = noise(vec2(x * 9.0 + uSeed, fall * 5.0 - t * 1.2));
  float edge = min(x, 1.0 - x) / uEdge - rag * 0.7 + 0.15;
  float a = clamp(edge, 0.0, 1.0) * clamp(0.4 + streak * 0.6 + foam, 0.0, 1.0) * uOpacity;
  vec3 col = mix(uDeep, uLight, clamp(streak * 0.85 + foam, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;
interface WaterOpts { speed?: number; cols?: number; rows?: number; opacity?: number; foamTop?: number; foamBase?: number; edge?: number; seed?: number }
function waterMat(o: WaterOpts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: time,
      uSpeed: { value: o.speed ?? 0.55 },
      uCols: { value: o.cols ?? 8 },
      uRows: { value: o.rows ?? 5 },
      uOpacity: { value: o.opacity ?? 0.95 },
      uFoamTop: { value: o.foamTop ?? 0.06 },
      uFoamBase: { value: o.foamBase ?? 0.12 },
      uEdge: { value: o.edge ?? 0.12 },
      uSeed: { value: o.seed ?? 0 },
      uDeep: { value: new THREE.Color(0.5, 0.68, 0.8) },
      uLight: { value: new THREE.Color(1, 1, 1) },
    },
  });
}

// ---- pieces ----
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
const rock = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 1, flatShading: true });
const moss = new THREE.MeshStandardMaterial({ color: 0x5b7446, roughness: 1, flatShading: true });
const updaters: ((dt: number, t: number) => void)[] = [];

/** A sheet of falling water `w` wide and `h` tall, its foot at y = 0: bowed out in the middle, leaning out toward the foot. */
function curtain(w: number, h: number, mat: THREE.Material, bulge = 0.6, lean = 0.8) {
  const g = new THREE.PlaneGeometry(w, h, 12, 24).translate(0, h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, bulge * Math.cos((Math.PI * p.getX(i)) / w) + lean * (1 - p.getY(i) / h));
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  return m;
}

/** Water leaping from a lip at (0, y0, z0) at `v` m/s and falling to y = 0 under gravity, `w0` wide at the lip thinning to `w1`. */
function arc(y0: number, z0: number, v: number, w0: number, w1: number, mat: THREE.Material) {
  const T = Math.sqrt((2 * y0) / 9.8), N = 40, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (T * i) / N, y = y0 - 4.9 * t * t, z = z0 + v * t, hw = (w0 + (w1 - w0) * (i / N)) / 2;
    pos.push(-hw, y, z, hw, y, z);
    uv.push(0, 1 - i / N, 1, 1 - i / N);
    if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  return { mesh: m, foot: z0 + v * T };
}

/** Grey (or mossy) boulders flanking a fall `w` wide and `h` tall, and a cliff behind it. */
function cliff(g: THREE.Group, w: number, h: number, seed: number, mossy = 0) {
  const rng = mulberry32(seed);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 14, h + 8, 8), rock);
  back.position.set(0, h / 2 - 2, -4.5);
  g.add(back);
  for (let i = 0; i < 18; i++) {
    const s = 6 + rng() * 9, side = i % 2 ? 1 : -1;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rng() < mossy ? moss : rock);
    r.scale.set(s * (0.6 + rng() * 0.4), s * (1.1 + rng()), s * 0.5);
    r.position.set(side * (w / 2 + s * 0.5 + rng() * 5), rng() * h * 0.95, -s * 0.3 - rng() * 3);
    r.rotation.set(rng(), rng() * 6, rng());
    g.add(r);
  }
}

/** A pool at the foot: still water, a foam patch where the fall lands, ripples spreading from it. */
function pool(g: THREE.Group, r: number, z: number, footZ: number, deep = 0x3a7d86) {
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: deep, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92 }));
  water.position.set(0, 0.3, z);
  const bank = new THREE.Mesh(new THREE.TorusGeometry(r, 1.2, 6, 28).rotateX(Math.PI / 2), rock);
  bank.position.set(0, 0.2, z);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.75 }));
  foam.position.set(0, 0.36, footZ);
  foam.scale.set(r * 0.9, 1, r * 0.6);
  g.add(water, bank, foam);
  const rings = Array.from({ length: 3 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.position.set(0, 0.34, footZ);
    g.add(m);
    return { m, phase: i / 3 };
  });
  updaters.push((_, t) => {
    for (const ring of rings) {
      const k = (t * 0.25 + ring.phase) % 1;
      ring.m.scale.setScalar(1 + k * r * 0.7);
      (ring.m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
    }
  });
}

/** Spray thrown up where water lands: `n` soft white points over a strip `w` wide at (0, y, z). */
function spray(g: THREE.Group, n: number, w: number, y: number, z: number, power = 1) {
  const rng = mulberry32(n * 31 + Math.round(z * 7));
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  const reset = (i: number) => {
    pos.set([(rng() - 0.5) * w, y + rng() * 0.5, z + (rng() - 0.3) * 1.5], i * 3);
    vel.set([(rng() - 0.5) * 4 * power, (2 + rng() * 5) * power, (0.5 + rng() * 3) * power], i * 3);
  };
  for (let i = 0; i < n; i++) {
    reset(i);
    pos[i * 3 + 1] += rng() * 3; // start mid-flight, not all at once
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: puff, size: 1.3, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  pts.renderOrder = 3;
  g.add(pts);
  updaters.push((dt) => {
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      vel[j + 1] -= 7 * dt;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < y) reset(i);
    }
    geo.attributes.position.needsUpdate = true;
  });
}

/** Mist drifting about the foot: `n` big soft puffs, breathing. */
function mist(g: THREE.Group, n: number, w: number, z: number, size: number, opacity: number) {
  const puffs = Array.from({ length: n }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity }));
    s.position.set((i / Math.max(1, n - 1) - 0.5) * w * 1.4, 1.5 + (i % 3) * 1.6, z + (i % 2) * 2);
    s.renderOrder = 4;
    g.add(s);
    return s;
  });
  updaters.push((_, t) =>
    puffs.forEach((s, i) => {
      s.scale.setScalar(size * (1 + 0.18 * Math.sin(t * 0.5 + i * 1.7)));
      s.material.opacity = opacity * (0.75 + 0.25 * Math.sin(t * 0.7 + i));
    }),
  );
}

// ---- the four ----
function curtainFall() { // A
  const g = new THREE.Group(), W = 11, H = 40;
  cliff(g, W, H, 11);
  const fall = curtain(W, H, waterMat({ speed: 0.5, cols: 9, rows: 5 }));
  fall.position.z = 0.6;
  g.add(fall);
  pool(g, 11, 8, 2.5);
  spray(g, 160, W, 0.4, 1.8);
  mist(g, 6, W, 2.5, 9, 0.35);
  return g;
}

function tieredFall() { // B
  const g = new THREE.Group(), steps = [{ y: 27, z: 0, w: 9 }, { y: 13.5, z: 4, w: 10 }, { y: 0, z: 8, w: 11 }];
  cliff(g, 16, 40, 23);
  steps.forEach((s, i) => {
    const top = i === 0 ? 40 : steps[i - 1].y; // each tier falls from the ledge above
    const fall = curtain(s.w, top - s.y, waterMat({ speed: 0.6, cols: 7, rows: 2.2, seed: i * 3.1, foamBase: 0.2 }), 0.35, 0.4);
    fall.position.set(0, s.y, s.z + 0.5);
    g.add(fall);
    if (i < steps.length - 1) { // the ledge below this tier: a rock shelf holding a little foamy pool
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(s.w + 6, s.y, 4.2), rock); // a step of the cliff, down to the ground
      ledge.position.set(0, s.y / 2, s.z + 2.2);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 2, 3.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4b8f98, roughness: 0.08, transparent: true, opacity: 0.9 }));
      water.position.set(0, s.y + 0.02, s.z + 2.2);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 1, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.8 }));
      foam.position.set(0, s.y + 0.06, s.z + 1.4);
      g.add(ledge, water, foam);
      spray(g, 60, s.w, s.y + 0.1, s.z + 1, 0.6);
      mist(g, 3, s.w, s.z + 2, 6, 0.22);
    }
  });
  pool(g, 11, 16, 10.5);
  spray(g, 120, 11, 0.4, 9.8);
  mist(g, 5, 11, 10.5, 8, 0.3);
  return g;
}

function veilFall() { // C
  const g = new THREE.Group(), H = 40;
  cliff(g, 14, H, 37, 0.55);
  // moss patches across the face behind the strands
  const rng = mulberry32(5);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), moss);
    m.scale.set(1.5 + rng() * 2.5, 1 + rng() * 2, 0.25);
    m.position.set((rng() - 0.5) * 12, 3 + rng() * (H - 6), -0.75);
    g.add(m);
  }
  const strands = [{ x: -4.8, w: 1.8, v: 0.45 }, { x: -2.2, w: 3.0, v: 0.6 }, { x: 0.6, w: 2.0, v: 0.5 }, { x: 3.0, w: 3.2, v: 0.7 }, { x: 5.4, w: 1.5, v: 0.4 }];
  strands.forEach((s, i) => {
    const top = H - (i % 2) * 3; // they spill from slightly different heights
    const fall = curtain(s.w, top, waterMat({ speed: s.v, cols: 2 + s.w, rows: 6, edge: 0.16, opacity: 0.9, seed: i * 5.3 }), 0.15, 0.3 + i * 0.1);
    fall.position.set(s.x, 0, 0.5);
    g.add(fall);
    spray(g, 30, s.w, 0.4, 1.4, 0.6);
  });
  pool(g, 10, 7, 2);
  mist(g, 5, 12, 2, 7, 0.25);
  return g;
}

function arcFall() { // D
  const g = new THREE.Group(), H = 36;
  cliff(g, 10, H, 53);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 6), rock); // an overhang the water leaps from
  lip.position.set(0, H - 1.5, -1);
  g.add(lip);
  const front = arc(H, 1.6, 8, 7, 4.5, waterMat({ speed: 0.75, cols: 7, rows: 4, foamTop: 0.04, foamBase: 0.08 }));
  const inner = arc(H - 0.3, 1.2, 7.4, 6, 4, waterMat({ speed: 0.6, cols: 5, rows: 3, opacity: 0.55, seed: 9 })); // a thinner sheet behind, for depth
  g.add(front.mesh, inner.mesh);
  pool(g, 14, front.foot, front.foot, 0x245f6c);
  spray(g, 260, 5, 0.4, front.foot, 1.4);
  mist(g, 10, 9, front.foot, 13, 0.42);
  return g;
}

// ---- four views ----
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd7e8);
scene.fog = new THREE.Fog(0xbcd7e8, 90, 260);
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5d6b4a, 1.5));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
sun.position.set(40, 80, 60);
scene.add(sun);

const labels = [...document.querySelectorAll<HTMLElement>('.label')];
const shots = [{ eye: [18, 16, 72], at: [0, 18, 4] }, { eye: [22, 18, 78], at: [0, 18, 8] }, { eye: [16, 16, 70], at: [0, 18, 4] }, { eye: [62, 20, 52], at: [0, 16, 12] }];
const views = [curtainFall(), tieredFall(), veilFall(), arcFall()].map((g, i) => {
  const x = i * 400; // far apart: fog hides the others
  g.position.x = x;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 1 }));
  ground.position.set(x, -0.2, 20);
  scene.add(g, ground);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  const [ex, ey, ez] = shots[i].eye, [tx, ty, tz] = shots[i].at;
  const home = new THREE.Vector3(x + ex, ey, ez), target = new THREE.Vector3(x + tx, ty, tz);
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
    if (open < 0) v.camera.position.x = v.home.x + Math.sin(t * 0.15 + i) * 8; // a slow drift in the grid
    else v.controls.update();
    v.camera.aspect = c.w / c.h;
    v.camera.updateProjectionMatrix();
    if (open < 0) v.camera.lookAt(v.target);
    renderer.setViewport(c.x, y, c.w, c.h);
    renderer.setScissor(c.x, y, c.w, c.h);
    renderer.render(scene, v.camera);
  });
});
