import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { canvasTexture } from '../core/textures';

/**
 * Marīcī's boar, asleep beside her altar (her chariot is drawn by boars). Low-poly and stylised;
 * it breathes, puffs out a few "z"s, and when petted lifts its head, flicks its ears and oinks.
 * Built facing +Z (head forward); `yaw` turns it.
 */
export function buildBoar(ctx: WorldContext, parent: THREE.Group, id: string, x: number, y: number, z: number, yaw: number) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.95, flatShading: true });
  const snoutMat = new THREE.MeshStandardMaterial({ color: 0x8a6a60, roughness: 0.8, flatShading: true });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.5 });
  const blob = (r: [number, number, number], p: [number, number, number], m = fur, detail = 1) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail).scale(...r), m);
    mesh.position.set(...p);
    mesh.castShadow = true;
    return mesh;
  };

  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.rotation.y = yaw;
  parent.add(root);

  // Body (breathes): chest, belly and haunch blobs, a bristly mane along the spine.
  const body = new THREE.Group();
  root.add(body);
  body.add(blob([0.4, 0.31, 0.46], [0, 0.29, 0.12]));
  body.add(blob([0.37, 0.27, 0.42], [0, 0.26, -0.28]));
  body.add(blob([0.3, 0.12, 0.6], [0, 0.08, -0.05], fur, 0));
  for (const s of [-1, 1]) {
    body.add(blob([0.1, 0.17, 0.2], [s * 0.3, 0.13, -0.38])); // haunches
    body.add(blob([0.07, 0.06, 0.13], [s * 0.22, 0.04, -0.62], dark, 0)); // tucked hind hooves
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8, zz = -0.42 + t * 0.78;
    const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14 + Math.sin(t * Math.PI) * 0.06, 4), dark);
    bristle.position.set(0, 0.5 + Math.sin(t * Math.PI) * 0.1 - (t < 0.3 ? 0.04 : 0), zz);
    bristle.rotation.x = -0.5;
    body.add(bristle);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.36, -0.66);
  body.add(tail);
  const tailStick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.2, 5).translate(0, -0.1, 0), fur);
  tailStick.rotation.x = 0.4;
  tail.add(tailStick);
  const tuft = blob([0.03, 0.06, 0.03], [0, -0.19, -0.08], dark, 0);
  tail.add(tuft);

  // Front legs folded forward, the head resting on them.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.34, 6), fur);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(s * 0.15, 0.06, 0.52);
    root.add(leg);
    root.add(blob([0.06, 0.05, 0.06], [s * 0.15, 0.05, 0.71], dark, 0));
  }

  const head = new THREE.Group(); // pivot at the neck
  head.position.set(0, 0.3, 0.45);
  root.add(head);
  head.add(blob([0.21, 0.19, 0.25], [0, -0.03, 0.17]));
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.15, 0.3, 8).rotateX(Math.PI / 2), fur);
  snout.position.set(0, -0.1, 0.42);
  head.add(snout);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12).rotateX(Math.PI / 2), snoutMat);
  disc.position.set(0, -0.1, 0.575);
  head.add(disc);
  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), dark);
    nostril.position.set(s * 0.035, -0.1, 0.59);
    head.add(nostril);
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.11, 6), ivory);
    tusk.position.set(s * 0.1, -0.11, 0.46);
    tusk.rotation.set(-0.2, 0, s * -0.5);
    head.add(tusk);
    // Closed eyes: a little dark crescent on each side.
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 10, Math.PI), dark);
    eye.position.set(s * 0.17, 0.04, 0.27);
    eye.rotation.set(Math.PI, s * Math.PI * 0.42, 0);
    head.add(eye);
  }
  const ears: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.13, 0.12, 0.08);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4).translate(0, 0.08, 0), dark);
    cone.rotation.set(-0.7, 0, s * -0.55);
    ear.add(cone);
    head.add(ear);
    ears.push(ear);
  }
  head.rotation.x = 0.28; // chin down, resting

  // "z z z" drifting up while it sleeps.
  const zTex = canvasTexture(64, 64, (g) => {
    g.font = 'bold 48px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(40,30,60,0.6)';
    g.strokeText('z', 32, 34);
    g.fillStyle = '#f4f0ff';
    g.fillText('z', 32, 34);
  });
  const zs = [0, 1, 2].map((i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false }));
    root.add(sp);
    return { sp, offset: i / 3 };
  });

  ctx.collisions.addCircle(x + Math.sin(yaw) * 0.1, z + Math.cos(yaw) * 0.1, 0.62);

  let woke = 99; // seconds since the last pet
  ctx.updaters.push((dt, time) => {
    woke += dt;
    const breath = Math.sin(time * 1.35);
    body.scale.set(1 + breath * 0.02, 1 + breath * 0.04, 1);
    // Petted: lift the head, flick the ears, wag; then settle back to sleep.
    const k = Math.exp(-woke * 1.2);
    head.rotation.x = 0.28 - 0.45 * Math.min(1, woke * 6) * k + Math.sin(time * 1.35 - 0.6) * 0.012;
    ears.forEach((e, i) => (e.rotation.z = Math.sin(woke * 22 + i * 1.3) * 0.35 * Math.exp(-woke * 3)));
    tail.rotation.z = Math.sin(time * (woke < 3 ? 14 : 1.2)) * (woke < 3 ? 0.6 * Math.exp(-woke) : 0.06);
    const sleepy = Math.min(1, Math.max(0, woke - 4) / 2);
    zs.forEach(({ sp, offset }) => {
      const t = (time / 3.6 + offset) % 1;
      sp.position.set(0.12 + t * 0.35, 0.55 + t * 0.9, 0.62 - t * 0.1);
      sp.scale.setScalar(0.12 + t * 0.16);
      sp.material.opacity = sleepy * Math.sin(t * Math.PI) * 0.85;
    });
  });

  ctx.instruments.push({ id, kind: 'boar', x, z, onStrike: () => (woke = 0) });
}
