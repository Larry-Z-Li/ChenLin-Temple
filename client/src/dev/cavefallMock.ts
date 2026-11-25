import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCaveFalls } from '../world/caveFalls';

/**
 * Mock (dev: /cavefall-mock.html): the cave waterfall built from the Tinkercad blockout (see world/caveFalls.ts).
 * URL: ?az=0.6 (orbit angle) &d=40 (distance) &ty=10 (target height) &el=0.2 (elevation) &tz=-8 (target depth)
 *      &still (no auto-rotate) &once (render three frames and stop, for screenshots)
 */

// ---------- renderer / scene ----------
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const skyCv = document.createElement('canvas');
skyCv.width = 2; skyCv.height = 256;
{
  const g = skyCv.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fb6e0'); gr.addColorStop(0.55, '#b7d8ec'); gr.addColorStop(1, '#e1eef0');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
}
const skyTex = new THREE.CanvasTexture(skyCv);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog(0xcfe3ec, 80, 220);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
scene.add(new THREE.HemisphereLight(0xd6e8f7, 0x6b6a50, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
sun.position.set(-30, 40, 34);
sun.target.position.set(0, 8, -2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 42, bottom: -32, near: 5, far: 150 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
const q = new URLSearchParams(location.search);
const az0 = parseFloat(q.get('az') ?? '0.25'), dist0 = parseFloat(q.get('d') ?? '50'), ty = parseFloat(q.get('ty') ?? '8.5'), el0 = parseFloat(q.get('el') ?? '0.14'), tz = parseFloat(q.get('tz') ?? '-7');
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, ty, tz);
controls.enableDamping = true;
controls.minDistance = 10; controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
const AZ = 1.35;
controls.minAzimuthAngle = -AZ; controls.maxAzimuthAngle = AZ;
controls.autoRotate = !q.has('still');
controls.autoRotateSpeed = 0.7;
camera.position.set(Math.sin(az0) * Math.cos(el0) * dist0, ty + Math.sin(el0) * dist0, tz + Math.cos(az0) * Math.cos(el0) * dist0);
controls.update();
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();


const t0 = performance.now();
const falls = buildCaveFalls({ sky: new THREE.Color(0xd2e6ee) });
console.log('cave falls built in', Math.round(performance.now() - t0), 'ms');
scene.add(falls.group);

const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  if (q.has('once') && ++frames > 3) { renderer.setAnimationLoop(null); return; } // for screenshots
  const t = q.has('once') ? 4 : clock.getElapsedTime();
  falls.update(t);
  const a = controls.getAzimuthalAngle();
  if (a > AZ - 0.03) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed);
  else if (a < -AZ + 0.03) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed);
  controls.update();
  renderer.render(scene, camera);
});
