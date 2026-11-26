import * as THREE from 'three';
import { BASIN } from '../config/layout';
import { DEITIES, type DeityId } from '../config/deities';
import type { WorldContext } from '../core/context';
import { buildStatueSlot } from '../buildings/statue';
import { t } from '../i18n';
import { buildGaruda } from './garuda';

/** Where the gallery floats: high over the valley (built only on the screen of whoever asks for it). */
const G = { x: BASIN.x, y: 300, z: BASIN.z };

/**
 * A test gallery of the models (entered with the name "model"): a walled platform high in the sky with every deity's
 * altar slot on its plinth and named (bare where no model has been given yet), and Garuda. Returns where to stand.
 */
export function buildModelGallery(ctx: WorldContext, models: Record<string, string>) {
  const ids = Object.keys(DEITIES) as DeityId[], slots: (DeityId | 'garuda')[] = [...ids, 'garuda'];
  const K = 2, per = Math.ceil(slots.length / 2), GAP = 3.6 * K, W = per * GAP + 8, D = 15 * K; // (everything twice life on the altars, to see it well)
  const group = new THREE.Group();
  group.position.set(G.x, G.y, G.z);
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.9 }), wallMat = new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), stone);
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  group.add(floor);
  for (const [w, d, x, z] of [[W, 0.4, 0, -D / 2], [W, 0.4, 0, D / 2], [0.4, D, -W / 2, 0], [0.4, D, W / 2, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), wallMat);
    wall.position.set(x, 0.45, z);
    group.add(wall);
    ctx.collisions.addBoxCentered(G.x + x, G.z + z, w + 0.3, d + 0.3, true);
  }
  ctx.ground.addSurface(G.x - W / 2, G.x + W / 2, G.z - D / 2, G.z + D / 2, () => G.y);

  const label = (text: string, x: number, y: number, z: number) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 112;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(20,16,12,0.72)';
    g.fillRect(0, 0, 512, 112);
    g.fillStyle = '#f3e6c8';
    g.font = '600 46px "Noto Serif TC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 58, 490);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
    s.material.map!.colorSpace = THREE.SRGBColorSpace;
    s.scale.set(2.6 * 1.6, 0.57 * 1.6, 1);
    s.position.set(x, y, z);
    group.add(s);
  };
  slots.forEach((id, i) => {
    const row = i < per ? 0 : 1, k = row ? i - per : i, x = -((per - 1) * GAP) / 2 + k * GAP, z = (row ? 1 : -1) * 4 * K, face = row ? Math.PI : 0;
    if (id === 'garuda') {
      const g = buildGaruda();
      g.root.position.set(x, 0, z);
      g.root.rotation.y = face;
      g.root.scale.setScalar(K);
      group.add(g.root);
      ctx.updaters.push((dt) => g.update(dt, 'idle'));
      label('Garuda', x, 4.6 * K, z);
    } else {
      const s = buildStatueSlot(id, x, 0, z, models[id]);
      s.rotation.y = face;
      s.scale.setScalar(K);
      group.add(s);
      label(`${t(DEITIES[id].nameKey as Parameters<typeof t>[0])}${models[id] ? '' : '  (—)'}`, x, 4.6 * K, z);
    }
    ctx.collisions.addCircle(G.x + x, G.z + z, 1.2 * K, true);
  });
  ctx.scene.add(group);
  return { x: G.x - W / 2 + 3, y: G.y, z: G.z, yaw: -Math.PI / 2 }; // at one end, looking down the aisle (+x)
}
