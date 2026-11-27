import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { queueLoad } from '../core/loadQueue';
import { DEITIES, type DeityId } from '../config/deities';
import { THEME } from '../config/theme';
import { assetUrl } from '../content/manifest';
import { box, mat } from './materials';
import { interiorLayer } from '../core/interiorCull';

const gltf = new GLTFLoader();
/** Load a model in its turn (after what you see first; two at a time: see loadQueue). */
const loader = {
  load(url: string, onLoad: (g: GLTF) => void, _p?: unknown, onError?: (e: unknown) => void) {
    queueLoad(() => new Promise<void>((done) => gltf.load(url, (g) => (onLoad(g), done()), undefined, (e) => (onError?.(e), done()))));
  },
};

/**
 * An altar position for one deity. No figure is drawn in code: until a model is provided
 * in /assets/models/index.json this is a plain plinth (the name plate on the altar identifies it).
 * glTF models face +Z by convention, which is south here, so no rotation is needed.
 */
export function buildStatueSlot(id: DeityId, x: number, y: number, z: number, modelFile?: string, sizeK = 1, haloFile?: string) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = `statue-${id}`;

  const plinth = new THREE.Group();
  plinth.add(box(1.7, 0.35, 1.5, mat(THEME.altar, { roughness: 0.6 })));
  plinth.add(box(1.5, 0.08, 1.3, mat(THEME.altarTrim, { metalness: 0.7, roughness: 0.35 }), 0, 0.35));
  g.add(plinth);

  if (modelFile) {
    loader.load(
      assetUrl('models', modelFile),
      (gltf) => {
        const model = gltf.scene;
        // Fit to target height, centre on the plinth, rest the base on its top.
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const s = (DEITIES[id].height * sizeK) / Math.max(size.y, 1e-3);
        model.scale.setScalar(s);
        bbox.setFromObject(model);
        const c = bbox.getCenter(new THREE.Vector3());
        model.position.set(-c.x, 0.43 - bbox.min.y, -c.z);
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
        });
        g.add(model);
        toHallLayer(model);
        if (haloFile) addHalo(g, model, haloFile, HALO_NUDGE[id]);
      },
      undefined,
      (err) => console.warn(`[statue] could not load ${modelFile}`, err),
    );
  }
  return g;
}

/**
 * A halo (its own model, a disc facing +Z) hung behind the statue's head: the head found as the highest point near the
 * statue's centre line (so a staff held out to one side doesn't count), the halo centred near the top of the head and
 * almost half the statue's height across.
 */
/** Small per-statue shifts to a halo (m, in the statue's own frame: +x is its left, +y up, +z toward you). */
const HALO_NUDGE: Partial<Record<DeityId, [number, number, number]>> = { ksitigarbha: [0.076, 0.076, 0] }; // (3 inches to his left, 3 up)
function addHalo(g: THREE.Group, model: THREE.Object3D, haloFile: string, nudge: [number, number, number] = [0, 0, 0]) {
  g.updateMatrixWorld(true);
  const toG = new THREE.Matrix4(), inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3(), pts: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    toG.multiplyMatrices(inv, m.matrixWorld);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(toG); box.expandByPoint(v); pts.push(v.clone()); }
  });
  const H = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2;
  let top = -Infinity;
  for (const q of pts) if (Math.abs(q.x - cx) < 0.06 * H && q.y > top) top = q.y;
  let back = Infinity;
  for (const q of pts) if (Math.abs(q.x - cx) < 0.08 * H && q.y > top - 0.16 * H) back = Math.min(back, q.z);
  loader.load(
    assetUrl('models', haloFile),
    (gltf) => {
      const halo = gltf.scene, hb = new THREE.Box3().setFromObject(halo), hs = hb.getSize(new THREE.Vector3());
      const k = (0.44 * H) / Math.max(hs.y, 1e-3);
      halo.scale.setScalar(k);
      hb.setFromObject(halo);
      const hc = hb.getCenter(new THREE.Vector3());
      halo.position.set(cx - hc.x + nudge[0], top - 0.02 * H - hc.y + nudge[1], back - 0.02 * H - hb.max.z + nudge[2]);
      halo.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
      g.add(halo);
      toHallLayer(halo);
    },
    undefined,
    (err) => console.warn(`[statue] could not load ${haloFile}`, err),
  );
}

/**
 * A model that arrives after the world was built: onto the render layer of the hall it stands in (if any), like the
 * rest of that hall's inside, so it is only drawn when you're near or in the hall (see core/interiorCull).
 */
function toHallLayer(o: THREE.Object3D) {
  o.updateWorldMatrix(true, true);
  o.traverse((c) => { const k = interiorLayer(c); if (k) c.layers.set(k); });
}
