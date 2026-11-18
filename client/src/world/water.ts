import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POND, WATERFALL } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { glowTexture, waterfallTexture } from '../core/textures';
import { terrainHeight } from './terrain';

const WATER_Y = -0.45;

export function buildPond(ctx: WorldContext) {
  const rng = mulberry32(777);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.radius + 1.5, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2f6f73, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9 }),
  );
  water.position.set(POND.x, WATER_Y, POND.z);
  water.receiveShadow = true;
  ctx.scene.add(water);
  ctx.collisions.addCircle(POND.x, POND.z, POND.radius - 0.8);

  // Shore stones
  const stoneGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const n = 70;
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1, flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + range(rng, -0.03, 0.03), r = POND.radius + range(rng, -0.6, 0.4);
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r, s = range(rng, 0.5, 1.2);
    stones.setMatrixAt(i, m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.1, z), q.setFromEuler(e.set(rng(), rng() * 6, rng())), new THREE.Vector3(s * 1.3, s * 0.6, s)));
  }
  stones.castShadow = stones.receiveShadow = true;
  ctx.scene.add(stones);

  // Lotus pads (a disc with a notch)
  const padGeo = new THREE.CircleGeometry(0.55, 14, 0.3, Math.PI * 2 - 0.45).rotateX(-Math.PI / 2);
  const padCount = 90;
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
  const flowerGeo = mergeGeometries(petals);
  const podGeo = new THREE.CylinderGeometry(0.05, 0.035, 0.05, 8).translate(0, 0.08, 0);
  const flowerCount = 34;
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), flowerCount);
  const pods = new THREE.InstancedMesh(podGeo, new THREE.MeshStandardMaterial({ color: 0xe5c74a, roughness: 0.6 }), flowerCount);
  const pink = new THREE.Color(0xf29bb8), whiteC = new THREE.Color(0xfdf3f3);
  for (let i = 0; i < flowerCount; i++) {
    const p = padPos[i * 2].clone().add(new THREE.Vector3(0, 0.03, 0));
    const s = range(rng, 1.4, 2.0);
    m.compose(p, q.setFromAxisAngle(up, rng() * 6), new THREE.Vector3(s, s, s));
    flowers.setMatrixAt(i, m);
    pods.setMatrixAt(i, m);
    flowers.setColorAt(i, rng() < 0.65 ? pink : whiteC);
  }
  ctx.scene.add(flowers, pods);
}

export function buildWaterfall(ctx: WorldContext) {
  const { x, z, width, height } = WATERFALL;
  const baseY = terrainHeight(x, z + 8) - 1;

  // Rock face the water falls over.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 1, flatShading: true });
  const rng = mulberry32(31);
  for (let i = 0; i < 14; i++) {
    const s = range(rng, 8, 16);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    const side = i % 2 ? 1 : -1;
    rock.scale.set(s * range(rng, 0.6, 1.0), s * range(rng, 1.2, 2.2), s * 0.45);
    // Flank the falls on both sides and sit behind the water plane, never in front of it.
    rock.position.set(x + side * (width / 2 + s * 0.55 + range(rng, 0, 6)), baseY + range(rng, 0, height * 0.9), z - s * 0.45 - range(rng, 1, 5));
    rock.rotation.set(rng(), rng() * 6, rng());
    ctx.scene.add(rock);
  }
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(width + 10, height + 8, 8, 4, 8, 2), rockMat);
  cliff.position.set(x, baseY + height / 2, z - 4.5);
  ctx.scene.add(cliff);

  const tex = waterfallTexture();
  tex.repeat.set(1.5, 3);
  const fallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, color: 0xe6f2f8, depthWrite: false });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), fallMat);
  fall.position.set(x, baseY + height / 2, z);
  ctx.scene.add(fall);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(width * 1.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a7d86, roughness: 0.1, transparent: true, opacity: 0.9 }),
  );
  pool.position.set(x, baseY + 0.4, z + width * 0.8);
  ctx.scene.add(pool);

  // Mist at the base
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    s.position.set(x + (i - 2.5) * 2.4, baseY + 2, z + 2);
    s.scale.setScalar(9);
    ctx.scene.add(s);
    mists.push(s);
  }

  ctx.updaters.push((dt, time) => {
    tex.offset.y += dt * 0.9;
    mists.forEach((s, i) => {
      s.material.opacity = 0.25 + 0.12 * Math.sin(time * 0.8 + i);
      s.scale.setScalar(8 + Math.sin(time * 0.6 + i * 2) * 1.5);
    });
  });
}
