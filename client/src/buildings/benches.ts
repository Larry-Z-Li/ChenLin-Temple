import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BENCHES } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { mat } from './materials';

const LEN = 2.0;

/** Garden benches (wooden seat + backrest on stone legs), built facing +Z then rotated to `face`. */
export function buildBenches(ctx: WorldContext) {
  const b = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const stoneGeo = mergeGeometries([b(0.18, 0.42, 0.46, -0.78, 0, 0), b(0.18, 0.42, 0.46, 0.78, 0, 0)]);
  const woodGeo = mergeGeometries([
    b(LEN, 0.07, 0.5, 0, 0.42, 0.02), // seat
    b(0.08, 0.5, 0.06, -0.78, 0.49, -0.22), // back posts
    b(0.08, 0.5, 0.06, 0.78, 0.49, -0.22),
    b(LEN, 0.16, 0.04, 0, 0.72, -0.24), // back rails
    b(LEN, 0.1, 0.04, 0, 0.9, -0.24),
  ]);

  const stone = new THREE.InstancedMesh(stoneGeo, mat(THEME.platformStone, { roughness: 0.95 }), BENCHES.length);
  const wood = new THREE.InstancedMesh(woodGeo, mat(THEME.wood, { roughness: 0.7 }), BENCHES.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);

  BENCHES.forEach((bench, i) => {
    m.compose(new THREE.Vector3(bench.x, ctx.ground.heightAt(bench.x, bench.z), bench.z), q.setFromAxisAngle(up, bench.face), one);
    stone.setMatrixAt(i, m);
    wood.setMatrixAt(i, m);
    // Two circles along the bench's length (works at any angle).
    const ax = Math.cos(bench.face), az = -Math.sin(bench.face); // bench's local +X
    const fx = Math.sin(bench.face), fz = Math.cos(bench.face); // direction the sitter faces
    for (const s of [-0.55, 0.55]) ctx.collisions.addCircle(bench.x + ax * s, bench.z + az * s, 0.45);
    // Two places to sit; hips slightly behind the seat's centre so the knees clear the front edge.
    [-0.5, 0.5].forEach((s, k) => {
      const id = `bench-${i}-${k}`;
      const x = bench.x + ax * s - fx * 0.05, z = bench.z + az * s - fz * 0.05;
      ctx.seats.set(id, { id, kind: 'bench', x, y: ctx.ground.heightAt(bench.x, bench.z), z, yaw: bench.face + Math.PI, exit: [fx * 0.8, fz * 0.8], occupiedBy: null });
    });
  });
  for (const mesh of [stone, wood]) {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
  }
}
