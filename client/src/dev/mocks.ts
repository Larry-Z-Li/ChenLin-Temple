/**
 * Dev page (npm run dev → http://localhost:5173/mocks.html): design mocks to choose from —
 * map styles (the current map first), three Japanese-zen player looks, and simple stylised trees.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHARACTERS } from './characterMocks';
import { realisticTree } from './realTree';
import { hojoHall, wayoHall, zenHall } from './templeMocks';
import { drawTempleMap } from '../ui/mapDraw';
import { drawStyledMap, type MapStyle } from '../ui/mapStyles';
import { setLocale } from '../i18n';

await setLocale(new URLSearchParams(location.search).get('lang') ?? 'zh-Hant'); // the game's language by default

// ---------------------------------------------------------------- maps
const maps = document.getElementById('maps')!;
const S = 720;
for (const [style, caption] of [[null, '現在 · current'], ['ink', '水墨 · ink wash'], ['lacquer', '金漆 · gold lacquer'], ['garden', '庭園 · painted garden']] as const) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  if (style) drawStyledMap(g, S, style as MapStyle);
  else {
    g.fillStyle = '#2a2420';
    g.fillRect(0, 0, S, S);
    drawTempleMap(g, S, { labels: true });
  }
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(c, cap);
  maps.append(fig);
}

// ---------------------------------------------------------------- scene
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9dfd2);
scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x6b6250, 1.5));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbdb7a2, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

const shadowed = (o: THREE.Object3D) => (o.traverse((c) => ((c as THREE.Mesh).isMesh && ((c.castShadow = true), (c.receiveShadow = true)))), o);

// ---- players: stylised characters (see characterMocks.ts), in a little arc, with an idle bob
const players = CHARACTERS.map(([, make], i) => {
  const c = make();
  c.position.set(-4.8 + i * 1.2, 0, 2.4 - Math.abs(i - 4) * 0.22);
  scene.add(shadowed(c));
  return c;
});

// ---- trees (each one mesh with vertex colours: instanced in the world, as cheap as today's)
function paint(geo: THREE.BufferGeometry, hex: number, jitter = 0.08, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i += 3) {
    s = (s * 16807) % 2147483647;
    const f = 1 - jitter + (s / 2147483647) * jitter * 2; // per-face shade: a painted, faceted look
    for (let v = 0; v < 3; v++) col.set([c.r * f, c.g * f, c.b * f], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const blob = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z);
const limb = (r0: number, r1: number, len: number, x: number, y: number, z: number, rx = 0, rz = 0) => new THREE.CylinderGeometry(r1, r0, len, 6).translate(0, len / 2, 0).rotateX(rx).rotateZ(rz).translate(x, y, z);
const bark = 0x5a4232;

const trees: Record<string, THREE.BufferGeometry> = {
  // 松: a leaning, forked trunk with flat cloud-pads of needles
  pine: mergeGeometries([
    paint(limb(0.22, 0.14, 2.6, 0, 0, 0, 0, 0.25), bark),
    paint(limb(0.13, 0.07, 1.6, -0.6, 2.4, 0, 0.2, 0.9), bark),
    paint(limb(0.12, 0.06, 1.4, -0.5, 2.3, 0, -0.3, -0.5), bark),
    ...[[-1.9, 3.2, 0.3, 1.25], [-0.1, 3.4, -0.6, 1.05], [-0.9, 4.2, 0, 1.15], [0.5, 2.7, 0.5, 0.8]].map(([x, y, z, r], i) => paint(blob(r, 1.4, 0.42, 1.2, x, y, z), 0x2f5a3a, 0.12, i + 3)),
  ])!,
  // 紅葉: a slim trunk under a rounded crown of red and orange
  maple: mergeGeometries([
    paint(limb(0.13, 0.08, 2.4, 0, 0, 0), bark),
    ...[[0, 3.1, 0, 1.3, 0xc0392b], [0.9, 2.7, 0.3, 0.85, 0xd35400], [-0.8, 2.8, -0.2, 0.9, 0xb03a2e], [0.1, 3.9, 0.2, 0.8, 0xe67e22]].map(([x, y, z, r, c], i) => paint(blob(r, 1, 0.85, 1, x, y, z), c, 0.12, i + 7)),
  ])!,
  // 桜: a wide, low spread of pink puffs on spreading limbs
  cherry: mergeGeometries([
    paint(limb(0.2, 0.13, 1.6, 0, 0, 0), bark),
    paint(limb(0.11, 0.06, 1.7, 0, 1.5, 0, 0, 0.9), bark),
    paint(limb(0.11, 0.06, 1.7, 0, 1.5, 0, 0, -0.9), bark),
    ...[[-1.5, 2.4, 0, 1.0], [1.5, 2.4, 0, 1.0], [0, 2.9, 0.2, 1.15], [-0.6, 3.2, -0.6, 0.8], [0.7, 3.1, 0.6, 0.8]].map(([x, y, z, r], i) => paint(blob(r, 1.25, 0.75, 1.1, x, y, z), 0xf2b8c6, 0.1, i + 11)),
  ])!,
  // 竹: a clump of tall jointed canes with leaf tufts
  bamboo: mergeGeometries(
    [[0, 0], [0.35, 0.2], [-0.3, 0.25], [0.15, -0.35], [-0.25, -0.2]].flatMap(([x, z], i) => {
      const h = 4.2 + i * 0.35;
      return [
        paint(new THREE.CylinderGeometry(0.05, 0.06, h, 6).translate(x, h / 2, z), 0x6f9a4a, 0.05, i + 20),
        ...[0.25, 0.5, 0.75].map((f) => paint(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 6).translate(x, h * f, z), 0x4f7a34)),
        paint(blob(0.5, 1, 0.5, 1, x, h - 0.2, z, 0), 0x5e8f3e, 0.15, i + 30),
      ];
    }),
  )!,
};
Object.values(trees).forEach((geo, i) => {
  const tree = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  tree.position.set(-10 + i * 5, 0, -4);
  scene.add(shadowed(tree));
});
// and a realistic one, for comparison
const real = realisticTree();
real.position.set(10, 0, -4);
real.scale.setScalar(0.55);
scene.add(shadowed(real));
console.info('[realistic tree]', real.userData.counts);

// ---- render
const camera = new THREE.PerspectiveCamera(38, 2, 0.1, 200);
let yaw = 0.25;
const clock = new THREE.Clock();
function frame() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * renderer.getPixelRatio()) renderer.setSize(w, h, false), (camera.aspect = w / h), camera.updateProjectionMatrix();
  yaw = 0.25 + Math.sin(clock.elapsedTime * 0.15) * 0.25;
  camera.position.set(Math.sin(yaw) * 12, 4.2, Math.cos(yaw) * 12 + 2);
  camera.lookAt(0, 1.5, -0.5);
  players.forEach((p, i) => (p.position.y = Math.abs(Math.sin(clock.elapsedTime * 1.6 + i)) * 0.03));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// ---------------------------------------------------------------- temples (exteriors)
const tCanvas = document.getElementById('temples') as HTMLCanvasElement;
const tRenderer = new THREE.WebGLRenderer({ canvas: tCanvas, antialias: true });
tRenderer.setPixelRatio(Math.min(2, devicePixelRatio));
tRenderer.shadowMap.enabled = true;
const tScene = new THREE.Scene();
tScene.background = new THREE.Color(0xcfd9df);
tScene.add(new THREE.HemisphereLight(0xf2f6ff, 0x6b6250, 1.4));
const tSun = new THREE.DirectionalLight(0xfff2dc, 2.6);
tSun.position.set(-20, 30, 25);
tSun.castShadow = true;
tSun.shadow.mapSize.set(2048, 2048);
Object.assign(tSun.shadow.camera, { left: -40, right: 40, top: 25, bottom: -25, far: 120 });
tScene.add(tSun);
const tGround = new THREE.Mesh(new THREE.PlaneGeometry(140, 70).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fae84, roughness: 1 }));
tGround.receiveShadow = true;
tScene.add(tGround);
[zenHall(), wayoHall(), hojoHall()].forEach((hall, i) => {
  hall.position.set(-24 + i * 24, 0, 0);
  hall.rotation.y = 0.35 - i * 0.35;
  tScene.add(shadowed(hall));
});
const tCam = new THREE.PerspectiveCamera(34, 2, 0.5, 400);
(function tFrame() {
  const w = tCanvas.clientWidth, h = tCanvas.clientHeight;
  if (tCanvas.width !== w * tRenderer.getPixelRatio()) tRenderer.setSize(w, h, false), (tCam.aspect = w / h), tCam.updateProjectionMatrix();
  const a = 0.1 + Math.sin(performance.now() / 9000) * 0.15;
  tCam.position.set(Math.sin(a) * 62, 18, Math.cos(a) * 62);
  tCam.lookAt(0, 4, 0);
  tRenderer.render(tScene, tCam);
  requestAnimationFrame(tFrame);
})();
