import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A more realistic broadleaf tree (dev mock): a tapering trunk that forks and forks again, and clusters
 * of leaf cards (a cut-out leaf texture, a little colour variation) at the twigs. Two meshes: bark and
 * leaves — instance-able like today's trees, though leaf cards cost more fill-rate than solid blobs.
 */
function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // a small spray of leaves on one card
  const leaf = (x: number, y: number, a: number, s: number, shade: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `hsl(${95 + shade * 25}, ${45 + shade * 15}%, ${26 + shade * 12}%)`;
    g.beginPath();
    g.moveTo(0, -s);
    g.quadraticCurveTo(s * 0.55, -s * 0.2, 0, s);
    g.quadraticCurveTo(-s * 0.55, -s * 0.2, 0, -s);
    g.fill();
    g.strokeStyle = 'rgba(20,40,10,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -s * 0.9);
    g.lineTo(0, s * 0.9);
    g.stroke();
    g.restore();
  };
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) leaf(24 + r() * 80, 24 + r() * 80, r() * Math.PI * 2, 16 + r() * 10, r());
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function realisticTree(seed = 11) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bark: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();

  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(r * 0.72, r, len, depth > 3 ? 9 : 6, 1);
    geo.applyQuaternion(q.setFromUnitVectors(up, dir));
    geo.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    bark.push(geo);
    if (depth === 0) return tips.push(to);
    if (depth <= 2) tips.push(from.clone().lerp(to, 0.6)); // leaves along the smaller branches too
    const n = depth === 5 ? 3 : 2 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // fork away from the parent, round it evenly, with a little lift toward the light
      const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      side.applyAxisAngle(dir, (i / n) * Math.PI * 2 + rnd() * 1.2);
      const nd = dir.clone().applyAxisAngle(side, 0.35 + rnd() * 0.45).add(new THREE.Vector3(0, 0.25, 0)).normalize();
      grow(to, nd, len * (0.68 + rnd() * 0.12), r * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 1, 0).normalize(), 2.6, 0.3, 5);
  // roots flaring at the foot
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    bark.push(new THREE.ConeGeometry(0.16, 0.9, 5).rotateZ(Math.PI / 2 - 0.25).rotateY(-a).translate(Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3));
  }

  // leaf cards: a cluster round every twig tip
  const pos: number[] = [], uv: number[] = [], col: number[] = [], m = new THREE.Matrix4(), e = new THREE.Euler();
  const card = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (const tip of tips)
    for (let k = 0; k < 14; k++) {
      const size = 0.7 + rnd() * 0.45, c = 0.8 + rnd() * 0.35;
      m.makeRotationFromEuler(e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)).setPosition(tip.x + (rnd() - 0.5) * 0.9, tip.y + (rnd() - 0.4) * 0.7, tip.z + (rnd() - 0.5) * 0.9);
      for (const [x, y] of card) {
        const v = new THREE.Vector3(x * size, y * size, 0).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        uv.push(x + 0.5, y + 0.5);
        col.push(c, c, c * 0.95);
      }
    }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  leaves.computeVertexNormals();

  const g = new THREE.Group();
  const barkGeo = mergeGeometries(bark.map((b) => (b.deleteAttribute('uv'), b.index ? b.toNonIndexed() : b)))!;
  barkGeo.computeVertexNormals();
  g.add(new THREE.Mesh(barkGeo, new THREE.MeshStandardMaterial({ color: 0x4e3b2c, roughness: 0.95 })));
  g.add(new THREE.Mesh(leaves, new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 })));
  g.userData.counts = { leaves: tips.length * 14, triangles: barkGeo.attributes.position.count / 3 + pos.length / 9 };
  return g;
}
