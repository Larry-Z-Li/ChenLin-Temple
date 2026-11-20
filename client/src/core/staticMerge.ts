import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching: the buildings are made of thousands of small meshes, and every mesh costs a draw
 * call. Once the world is built, meshes that never move are merged: one mesh per material per
 * building (a root with many pieces), or per ~96 m patch for scattered small things, so what's
 * off-screen is still culled. Anything flagged
 * `userData.dynamic` (with its children) is left alone, as are instanced meshes, sprites, lines,
 * transparent materials and the `skip` set. Merged originals leave the scene, except camera
 * blockers, which stay as invisible raycast targets.
 *
 * Plain-coloured materials (no textures, no glow, no shader tweaks of their own) are folded together:
 * their colour is baked into vertex colours, so a white wall, a red column and a gold trim with the
 * same finish become one mesh.
 */
export function mergeStatic(scene: THREE.Scene, roots: THREE.Object3D[], opts: { skip: Set<THREE.Object3D>; keepForRaycast: Set<THREE.Object3D> }) {
  const CELL = 96;
  const found: { m: THREE.Mesh; root: THREE.Object3D }[] = [];
  const perRoot = new Map<THREE.Object3D, number>();
  const visit = (o: THREE.Object3D, root: THREE.Object3D) => {
    if (o.userData.dynamic || opts.skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && mergeable(m)) {
      found.push({ m, root });
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    }
    for (const c of o.children) visit(c, root);
  };
  for (const r of roots) {
    r.updateWorldMatrix(true, true);
    visit(r, r);
  }
  const groups = new Map<string, THREE.Mesh[]>();
  for (const { m, root } of found) {
    const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    const where = (perRoot.get(root) ?? 0) >= 20 ? root.uuid : `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    const key = `${matKey(m.material as THREE.Material)}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${where}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  let before = 0, after = 0;
  for (const meshes of groups.values()) {
    before += meshes.length;
    if (meshes.length < 2) {
      after += meshes.length;
      continue;
    }
    const first = meshes[0].material as THREE.MeshStandardMaterial;
    const baked = isPlain(first);
    const mat = baked ? plainMaterial(first) : first;
    let merged: THREE.BufferGeometry | null = null;
    try {
      merged = mergeGeometries(meshes.map((m) => prep(m, baked || !!first.vertexColors, baked ? (m.material as THREE.MeshStandardMaterial).color : null)), false);
    } catch {
      merged = null;
    }
    if (!merged) {
      after += meshes.length;
      continue;
    }
    const out = new THREE.Mesh(merged, mat);
    out.castShadow = meshes[0].castShadow;
    out.receiveShadow = meshes[0].receiveShadow;
    out.name = 'merged';
    scene.add(out);
    after++;
    for (const m of meshes) {
      if (opts.keepForRaycast.has(m)) m.visible = false;
      else m.removeFromParent();
    }
  }
  return { before, after };
}

/** A flat-coloured standard material whose colour can live in the vertices instead. */
function isPlain(mat: THREE.Material): boolean {
  const m = mat as THREE.MeshStandardMaterial;
  return (
    m.type === 'MeshStandardMaterial' && !Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.userData.live &&
    !m.map && !m.emissiveMap && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.alphaMap && !m.aoMap && !m.envMap &&
    m.emissive.r + m.emissive.g + m.emissive.b === 0 && m.opacity === 1
  );
}

/** Plain materials group by finish (roughness, metalness, shading, sides); others by identity. */
function matKey(mat: THREE.Material) {
  if (!isPlain(mat)) return mat.uuid;
  const m = mat as THREE.MeshStandardMaterial;
  return `plain:${m.roughness.toFixed(2)}:${m.metalness.toFixed(2)}:${m.flatShading ? 1 : 0}:${m.side}`;
}

const plainMats = new Map<string, THREE.MeshStandardMaterial>();
function plainMaterial(like: THREE.MeshStandardMaterial) {
  const k = matKey(like);
  let m = plainMats.get(k);
  if (!m) plainMats.set(k, (m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: like.roughness, metalness: like.metalness, flatShading: like.flatShading, side: like.side })));
  return m;
}

function mergeable(m: THREE.Mesh, matrix = m.matrixWorld) {
  const mat = m.material;
  if (Array.isArray(mat) || !mat || mat.transparent || !mat.visible || !m.visible) return false;
  if (!m.geometry.attributes.position || Object.keys(m.geometry.morphAttributes).length) return false;
  return matrix.determinant() > 0; // mirrored meshes would turn inside out once baked
}

/**
 * For things that move as a whole or in parts (a swaying lantern, a deer's legs/neck/head): within
 * each node, its leaf meshes that share a finish become one mesh in that node's own space — the
 * node can still move; the pieces never moved relative to it anyway.
 */
export function mergeRigid(root: THREE.Object3D) {
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => o.children.length && nodes.push(o));
  let saved = 0;
  for (const node of nodes) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const c of node.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.children.length || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.dynamic) continue;
      m.updateMatrix();
      if (!mergeable(m, m.matrix)) continue;
      const key = `${matKey(m.material as THREE.Material)}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0].material as THREE.MeshStandardMaterial, baked = isPlain(first);
      let geo: THREE.BufferGeometry | null = null;
      try {
        geo = mergeGeometries(meshes.map((m) => prep(m, baked || !!first.vertexColors, baked ? (m.material as THREE.MeshStandardMaterial).color : null, m.matrix)), false);
      } catch {
        geo = null;
      }
      if (!geo) continue;
      const out = new THREE.Mesh(geo, baked ? plainMaterial(first) : first);
      out.castShadow = meshes[0].castShadow;
      out.receiveShadow = meshes[0].receiveShadow;
      node.add(out);
      for (const m of meshes) m.removeFromParent();
      saved += meshes.length - 1;
    }
  }
  return saved;
}

/**
 * World-space copy with a uniform set of attributes (position, normal, uv, and colour if wanted).
 * `tint` multiplies the colour in (a plain material's colour, baked into its vertices).
 */
function prep(m: THREE.Mesh, color: boolean, tint: THREE.Color | null = null, matrix = m.matrixWorld) {
  const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  src.applyMatrix4(matrix);
  if (!src.attributes.normal) src.computeVertexNormals();
  const n = src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position);
  g.setAttribute('normal', src.attributes.normal);
  g.setAttribute('uv', src.attributes.uv ?? new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (color) {
    const c = (m.material as THREE.MeshStandardMaterial).vertexColors ? src.attributes.color : undefined;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = c ? c.getX(i) : 1, gg = c ? c.getY(i) : 1, b = c ? c.getZ(i) : 1;
      arr.set(tint ? [r * tint.r, gg * tint.g, b * tint.b] : [r, gg, b], i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  return g;
}
