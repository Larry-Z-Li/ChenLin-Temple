import * as THREE from 'three';
import { assetUrl, type ThangkaEntry } from '../content/manifest';
import { box, cylinder, mat } from './materials';

const loader = new THREE.TextureLoader();

/**
 * A hanging scroll mount: brocade border, silk panel, top & bottom rods.
 * The panel is blank silk until an image is supplied via /assets/thangkas/index.json.
 * Built facing +Z; the caller rotates it onto a wall.
 */
export function buildThangka(entry: ThangkaEntry | null, width = 1.5, height = 2.3) {
  const g = new THREE.Group();
  const border = 0.16;
  g.add(box(width + border * 2, height + border * 2.6, 0.03, mat(0x7a1f1f, { roughness: 0.7 }), 0, -(height + border * 2.6) / 2));
  g.add(box(width + border, height + border, 0.035, mat(0x2b4c8c, { roughness: 0.7 }), 0, -(height + border) / 2 - border * 0.3));

  const panelMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 0.85 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMat);
  panel.position.set(0, -height / 2 - border * 0.8, 0.025);
  g.add(panel);

  const rodMat = mat(0xc9a24a, { metalness: 0.6, roughness: 0.4 });
  const top = cylinder(0.035, 0.035, width + border * 3, rodMat, 0, 0, 0.02, 8);
  top.rotation.z = Math.PI / 2;
  top.position.y = 0.02;
  const bottom = top.clone();
  bottom.position.y = -(height + border * 2.6);
  g.add(top, bottom);

  if (entry) {
    loader.load(
      assetUrl('thangkas', entry.file),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        // Letterbox inside the frame to preserve the image's aspect ratio.
        const img = tex.image as { width: number; height: number };
        const aspect = img.width / img.height, frame = width / height;
        panel.scale.set(aspect < frame ? aspect / frame : 1, aspect < frame ? 1 : frame / aspect, 1);
        panelMat.map = tex;
        panelMat.color.set(0xffffff);
        panelMat.needsUpdate = true;
      },
      undefined,
      () => console.warn(`[thangka] could not load ${entry.file}`),
    );
  }
  return g;
}
