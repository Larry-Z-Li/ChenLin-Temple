import * as THREE from 'three';
import { MAP_BOARD, SPAWN } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { canvasTexture } from '../core/textures';
import { inscription, onLocaleChange, t } from '../i18n';
import { drawTempleMap } from '../ui/mapDraw';
import { box, cylinder, mat } from './materials';

const W = 2.6, H = 2.9; // panel size (title band + square map)

/** Notice board with the temple map; walk up and press E for the big map. */
export function buildMapBoard(ctx: WorldContext, openMap: () => void) {
  const { x, z } = MAP_BOARD;
  const yaw = Math.atan2(SPAWN.x - x, SPAWN.z - z); // face the arrivals
  const g = new THREE.Group();
  g.position.set(x, ctx.ground.heightAt(x, z), z);
  g.rotation.y = yaw;
  ctx.scene.add(g);

  const red = mat(THEME.column, { roughness: 0.55 });
  const wood = mat(0x4a2214, { roughness: 0.6 });
  const gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });
  for (const s of [-1, 1]) {
    g.add(box(0.36, 0.3, 0.36, mat(0x9a958a, { roughness: 0.95 }), s * (W / 2 + 0.2), 0, 0));
    g.add(cylinder(0.1, 0.12, 4.2, red, s * (W / 2 + 0.2), 0, 0, 10));
  }
  g.add(box(W + 0.3, H + 0.3, 0.12, wood, 0, 0.75, -0.02));
  g.add(box(W + 0.42, 0.1, 0.2, gold, 0, 0.7, 0));
  // little tiled roof
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, W + 1.4, 4, 1).rotateZ(Math.PI / 2).scale(1, 0.45, 1), mat(THEME.roof, { roughness: 0.75, flatShading: true }));
  roof.position.set(0, 4.25, 0);
  g.add(roof);
  g.add(box(W + 1.5, 0.08, 0.12, mat(THEME.roofRidge), 0, 4.48, 0));

  const panelMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), panelMat);
  panel.position.set(0, 0.9 + H / 2, 0.05);
  g.add(panel);
  const draw = () => {
    panelMat.map?.dispose();
    panelMat.map = canvasTexture(1024, Math.round((1024 * H) / W), (c) => {
      const S = 1024, top = c.canvas.height - S;
      c.fillStyle = '#efe3c8';
      c.fillRect(0, 0, S, c.canvas.height);
      c.fillStyle = '#7a1f16';
      c.fillRect(0, 0, S, top);
      c.fillStyle = '#e8c76a';
      c.font = '700 92px "Noto Serif TC", "Songti TC", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(inscription(t('map.title')), S / 2, top / 2 + 4);
      c.save();
      c.translate(0, top);
      c.fillStyle = '#d9cdb2';
      c.fillRect(0, 0, S, S);
      drawTempleMap(c, S, { here: MAP_BOARD, labels: true });
      c.restore();
    });
    panelMat.needsUpdate = true;
  };
  draw();
  onLocaleChange(draw);

  ctx.collisions.addBoxCentered(x, z, 2.2, 2.2);
  const fx = Math.sin(yaw) * 1.6, fz = Math.cos(yaw) * 1.6;
  ctx.interactions.add({ id: 'map-board', x: x + fx, z: z + fz, radius: 1.9, prompt: () => ({ text: t('prompt.viewMap') }), onInteract: openMap });
}
