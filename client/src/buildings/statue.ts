import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEITIES, type DeityId } from '../config/deities';
import { THEME } from '../config/theme';
import { assetUrl } from '../content/manifest';
import { box, mat } from './materials';

const loader = new GLTFLoader();

/**
 * An altar position for one deity. No figure is drawn in code: until a model is provided
 * in /assets/models/index.json this is a plain plinth (the name plate on the altar identifies it).
 * glTF models face +Z by convention, which is south here, so no rotation is needed.
 */
export function buildStatueSlot(id: DeityId, x: number, y: number, z: number, modelFile?: string, sizeK = 1) {
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
      },
      undefined,
      (err) => console.warn(`[statue] could not load ${modelFile}`, err),
    );
  }
  return g;
}
