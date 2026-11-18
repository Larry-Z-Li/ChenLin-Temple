import * as THREE from 'three';
import { BASIN, POND, TERRAIN_SIZE } from '../config/layout';
import { fbm, lerp, noise2, smoothstep } from '../core/math';
import { nearestOnStream, nearStream } from './stream';

/**
 * Valley floor is flat; the ring of mountains rises beyond BASIN.radius.
 * Mountains are lower to the south so the view behind the spawn opens into a distant valley.
 */
export function terrainHeight(x: number, z: number) {
  const dx = x - BASIN.x, dz = z - BASIN.z;
  const r = Math.hypot(dx, dz);
  let h = 0;

  // Gentle meadow undulation near the rim (buildings are well inside this).
  h += smoothstep(BASIN.radius - 4, BASIN.radius + 8, r) * (noise2(x * 0.06, z * 0.06) - 0.3) * 1.2;

  // Mountains
  const az = Math.atan2(dx, dz); // 0 = south
  const southOpen = 1 - 0.55 * Math.exp(-(az * az) / 0.22);
  const ridge = fbm(x * 0.0065 + 3.1, z * 0.0065 - 7.7, 5);
  const rise = smoothstep(BASIN.radius - 5, BASIN.radius + 95, r);
  h += rise * southOpen * (18 + 120 * ridge * ridge + 30 * ridge);
  h += Math.max(0, r - (BASIN.radius + 95)) * 0.32 * southOpen;

  // Stream from the waterfall down to the pond: a ravine through the western slope
  // (so the falls are visible from the valley), then a shallow swale across the valley floor.
  if (nearStream(x, z)) {
    const q = nearestOnStream(x, z);
    const ravine = 1 - smoothstep(18, 46, q.s);
    const w = 4.5 + ravine * 8;
    const bed = 7.5 * (1 - smoothstep(0, 44, q.s)) - 0.35;
    const k = Math.exp(-(q.d * q.d) / (2 * w * w)) * smoothstep(-6, 0, q.behind);
    if (k > 0.001) h = lerp(h, Math.min(h, bed + noise2(x * 0.1, z * 0.1) * 0.4 * ravine), k);
  }

  // Lotus pond depression
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.radius + 3) h -= 1.3 * (1 - smoothstep(POND.radius - 5, POND.radius + 3, pd));

  return h;
}

export function buildTerrain(scene: THREE.Scene) {
  const seg = 240;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  // Vertex colours: meadow greens → forest → rock on steep / high ground.
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const meadow = new THREE.Color(0x6a9a42), meadowDry = new THREE.Color(0x87a64c), forest = new THREE.Color(0x3f6b33);
  const rock = new THREE.Color(0x7d7a70), mud = new THREE.Color(0x5b5038), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise2(x * 0.04, z * 0.04);
    c.copy(meadow).lerp(meadowDry, n * 0.6);
    c.lerp(forest, smoothstep(4, 40, y));
    const slope = 1 - nrm.getY(i);
    c.lerp(rock, smoothstep(0.25, 0.55, slope) * 0.85 + smoothstep(90, 160, y) * 0.5);
    if (y < -0.2) c.lerp(mud, smoothstep(-0.2, -1.0, y));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
