import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Avatar } from '../player/avatar';

/**
 * Mock (dev: /koromo-mock.html): a monk in a Zen koromo — black robe with loose sleeves, a white under-collar
 * crossed left over right, a dark pleated skirt to the ankles — in three poses (shashu, gassho, arms down), beside
 * today's avatar. Faces +Z, feet on y = 0.
 */
const BLACK = 0x17171b, SKIRT = 0x1b2030, WHITE = 0xf2efe8, SKIN = 0xd8a982;
const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...o });
const robe = mat(BLACK), skirtMat = mat(SKIRT, { side: THREE.DoubleSide }), collar = mat(WHITE, { roughness: 0.7 }), skin = mat(SKIN, { roughness: 0.7 });
const UP = new THREE.Vector3(0, 1, 0);

const mesh = (geo: THREE.BufferGeometry, m: THREE.Material) => {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  return o;
};
/** A capsule (or a flat band, if `flat`) from a to b; `r1` tapers it to a wider end at b (a loose sleeve). */
function between(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, flat?: { w: number; t: number }, r1 = r) {
  const len = a.distanceTo(b);
  const geo = flat ? new THREE.BoxGeometry(flat.w, len, flat.t) : r1 !== r ? new THREE.CylinderGeometry(r1, r, len, 14) : new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);
  const o = mesh(geo, m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return o;
}

/** Knife pleats: a flared tube whose radius steps out at each pleat, deeper toward the hem. */
function pleatedSkirt(top: number, bottom: number, h: number, pleats: number) {
  const g = new THREE.CylinderGeometry(top, bottom, h, pleats * 8, 6, true).translate(0, -h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), down = -y / h;
    const saw = (((a / (Math.PI * 2)) * pleats) % 1 + 1) % 1;
    const k = 1 + saw * (0.025 + 0.06 * down);
    p.setXYZ(i, x * k, y, z * k * 0.92);
  }
  g.computeVertexNormals();
  return g;
}

type V = [number, number, number];
interface Arms { elbow: V; wrist: V; hands: 'shashu' | 'gassho' | 'down' }
const v = (p: V, mirror = 1) => new THREE.Vector3(p[0] * mirror, p[1], p[2]);

/** Positions are in the body's frame: origin at the hips (0.92 m up), shoulders at (±0.23, 0.52, 0). */
function koromo(arms: Arms) {
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.y = 0.92;
  root.add(body);

  // the robe's body: broad, soft shoulders, a little flattened front to back
  const torso = new THREE.LatheGeometry([[0.001, 0.66], [0.07, 0.645], [0.19, 0.58], [0.235, 0.5], [0.225, 0.3], [0.225, 0.08], [0.235, -0.04]].map(([r, y]) => new THREE.Vector2(r, y)), 28).scale(1, 1, 0.74);
  body.add(mesh(torso, robe));
  // a black band at the waist where the skirt is tied over the robe
  body.add(mesh(new THREE.CylinderGeometry(0.242, 0.244, 0.07, 28).scale(1, 1, 0.76).translate(0, -0.02, 0), mat(0x0e0e10)));
  // the pleated skirt, waist to ankle
  const skirt = mesh(pleatedSkirt(0.245, 0.36, 0.88, 16), skirtMat);
  skirt.position.y = -0.03;
  body.add(skirt);
  // toes of dark tabi under the hem
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.085, 0.05, 0.13).translate(s * 0.09, -0.895, 0.2), mat(0x101014)));

  // collar: the white under-collar edging the black collar band; they cross left over right at the chest
  const neck = new THREE.Vector3(0, 0.62, -0.02);
  for (const side of [-1, 1]) {
    const top = new THREE.Vector3(side * 0.075, 0.625, 0.02), cross = new THREE.Vector3(side * -0.035, 0.31, 0.168), lift = side < 0 ? 0.004 : 0; // the left one on top
    const white = between(top.clone().add(new THREE.Vector3(side * -0.022, 0, 0.012)), cross.clone().add(new THREE.Vector3(side * -0.022, 0.03, 0.006)), 0, collar, { w: 0.05, t: 0.012 });
    const black = between(top.clone().add(new THREE.Vector3(0, 0, 0.02 + lift)), cross.clone().add(new THREE.Vector3(0, 0, 0.012 + lift)), 0, robe, { w: 0.075, t: 0.018 });
    for (const o of [white, black]) o.rotateY(side * 0.35); // lying along the chest
    body.add(white, black);
  }
  body.add(mesh(new THREE.TorusGeometry(0.078, 0.02, 6, 20, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI).scale(1, 1, 0.8).translate(neck.x, neck.y + 0.005, neck.z + 0.01), collar)); // round the back of the neck

  // head: neck and a shaven head
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.09, 10).translate(0, 0.68, 0), skin));
  body.add(mesh(new THREE.SphereGeometry(0.115, 20, 14).translate(0, 0.83, 0.005), skin));

  // arms: loose sleeves, widening a little toward the cuff; hands
  const handGeo = new THREE.BoxGeometry(0.075, 0.1, 0.035);
  for (const m of [-1, 1]) {
    const sh = new THREE.Vector3(m * 0.23, 0.52, 0), el = v(arms.elbow, m), wr = v(arms.wrist, m);
    body.add(between(sh, el, 0.09, robe), between(el, wr, 0.085, robe, undefined, 0.1));
    if (arms.hands === 'shashu') {
      if (m < 0) body.add(mesh(new THREE.SphereGeometry(0.048, 12, 10).scale(1.2, 0.9, 0.9).translate(-0.005, wr.y + 0.005, wr.z + 0.04), skin)); // left fist, thumb in
      else {
        const h = mesh(new THREE.BoxGeometry(0.11, 0.075, 0.03), skin); // right hand cupped over it
        h.position.set(0, wr.y + 0.01, wr.z + 0.085);
        h.rotation.set(0.15, 0, -0.25);
        body.add(h);
      }
    } else if (arms.hands === 'gassho') {
      const h = mesh(handGeo, skin);
      h.position.set(m * 0.018, wr.y + 0.09, wr.z + 0.025);
      h.rotation.set(-0.25, 0, 0);
      body.add(h);
    } // 'down': hands inside the sleeves
  }
  return root;
}

// ---- scene ----
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e4da);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0.6, 1.45, 6.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7a66, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -1 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2), mat(0xd9d0c0, { roughness: 1 }));
floor.receiveShadow = true;
scene.add(floor);

const figures: THREE.Object3D[] = [
  koromo({ elbow: [-0.3, 0.27, 0.07], wrist: [-0.03, 0.34, 0.19], hands: 'shashu' }), // 叉手, as in the photo
  koromo({ elbow: [-0.27, 0.29, 0.1], wrist: [-0.03, 0.4, 0.22], hands: 'gassho' }), // 合掌
  koromo({ elbow: [-0.28, 0.25, 0.02], wrist: [-0.3, 0.0, 0.06], hands: 'down' }), // arms down, hands in the sleeves
];
const old = new Avatar('#8b2a1e');
old.root.rotation.y = Math.PI; // the game's avatar faces −Z
(old as unknown as { hips: THREE.Group }).hips.position.y = 0.92; // standing (its pose isn't run here)
figures.push(old.root);
figures.forEach((f, i) => {
  f.position.x = (i - 1.5) * 1.25;
  scene.add(f);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
