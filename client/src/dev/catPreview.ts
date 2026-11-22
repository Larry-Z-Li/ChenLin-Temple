/**
 * Dev page (npm run dev → http://localhost:5173/cat.html): every coat in both poses, for judging the cat
 * model. URL: ?state=asleep|awake|petted, ?yaw=<radians> to fix the camera, ?focus=<0-9>&zoom=<n> to frame one cat.
 */
import * as THREE from 'three';
import { createCat, type CatCoat, type CatPose } from '../world/cat';

const q = new URLSearchParams(location.search);
let state = q.get('state') ?? 'awake', spin = !q.has('yaw');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfd8cf);
scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x6b6250, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
sun.position.set(1.5, 3, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

const coats: CatCoat[] = ['ginger', 'silver', 'tuxedo', 'calico', 'brown'];
const poses: CatPose[] = ['loaf', 'sit'];
const cats = poses.flatMap((pose, r) => coats.map((coat, c) => {
  const cat = createCat({ coat, pose, seed: c * 7 + r * 3 + 1 });
  cat.root.position.set((c - 2) * 0.62, 0, r * 0.75 - 0.35);
  scene.add(cat.root);
  return cat;
}));

const zoom = Number(q.get('zoom') ?? 1);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 50);
const person = new THREE.Vector3();
let yaw = Number(q.get('yaw') ?? 0.5);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
document.querySelectorAll<HTMLButtonElement>('#bar button').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.s === 'spin' ? (spin = !spin) : (state = b.dataset.s!))),
);

const clock = new THREE.Clock();
let petEvery = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), time = clock.elapsedTime;
  if (spin) yaw += dt * 0.25;
  const f = q.get('focus'), d = 3.6 / zoom;
  const target = f !== null ? cats[Number(f)].root.position.clone().setY(0.13) : new THREE.Vector3(0, 0.12, 0.05);
  camera.position.set(Math.sin(yaw) * d, 0.9 / zoom + 0.15, Math.cos(yaw) * d).add(target);
  camera.lookAt(target);
  person.copy(camera.position);
  if (state === 'petted' && (petEvery -= dt) < 0) {
    petEvery = 3;
    cats.forEach((c) => c.pet());
  }
  for (const c of cats) c.update(dt, time, state === 'asleep' ? null : person);
  renderer.render(scene, camera);
});
(window as unknown as Record<string, unknown>).catPreview = { cats, camera, setState: (s: string) => (state = s) };
