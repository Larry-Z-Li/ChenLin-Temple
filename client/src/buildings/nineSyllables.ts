import * as THREE from 'three';
import { HALLS, INCENSE_BURNER, PLATFORM_H, hallYaw } from '../config/layout';

/**
 * The nine syllables (九字) written big in gold leaf on the front slope of the gate halls,
 * laid out like the 3×3 square on the map (south at the top): 臨 兵 鬪 / 在 前 者 / 列 陣 皆, with 前 in the
 * middle on a carpet under the great incense burner in the stupa court. Each roof character follows the
 * roof's curve so it never sinks into the tiles.
 */
const ON_HALL: Record<string, string> = {
  wenshu: '臨', guoxue: '兵', dizang: '鬪', // the map's top row (south)
  dongmi: '在', zangmi: '者', // either side of the stupa (前)
  caishen: '列', yangsheng: '陣', guanyin: '皆', // the bottom row (north)
};

/** A character in gold leaf with a dark edge, on a transparent ground. */
function charTexture(ch: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 400px "Noto Serif TC", "Songti TC", serif';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,20,8,0.85)';
  g.lineWidth = 22;
  g.strokeText(ch, 256, 270);
  const gold = g.createLinearGradient(0, 60, 0, 460);
  gold.addColorStop(0, '#ffe39a');
  gold.addColorStop(0.5, '#e0b04e');
  gold.addColorStop(1, '#b8822a');
  g.fillStyle = gold;
  g.fillText(ch, 256, 270);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function buildNineSyllables(scene: THREE.Scene, groundAt: (x: number, z: number) => number) {
  await document.fonts.load('700 400px "Noto Serif TC"', Object.values(ON_HALL).join('') + '前').catch(() => null);
  // 前: a square carpet under the incense burner, the character in gold on deep red
  const rug = new THREE.Group();
  rug.add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.03, 4.6).translate(0, 0.015, 0), new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.8 })));
  rug.add(new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.05, 4.25).translate(0, 0.025, 0), new THREE.MeshStandardMaterial({ color: 0x6e1410, roughness: 0.95 })));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7).rotateX(-Math.PI / 2).translate(0, 0.056, 0), new THREE.MeshStandardMaterial({ map: charTexture('前'), transparent: true, alphaTest: 0.2, roughness: 0.85 }));
  rug.add(top);
  // on the court's paving (its slabs' top is 0.07 above the ground; see decor.ts); reads upright walking in from the south gate
  rug.position.set(INCENSE_BURNER.x, groundAt(INCENSE_BURNER.x, INCENSE_BURNER.z) + 0.075, INCENSE_BURNER.z);
  scene.add(rug);
  for (const def of HALLS) {
    const ch = ON_HALL[def.id];
    if (!ch) continue;
    // the gate halls' roof (see hall.ts addRoof): eaves 2.4 m out, rising D × 0.36 with a 1.7 curve
    const D = def.depth + 4.8, hd = D / 2, H = D * 0.36, base = PLATFORM_H + def.wallHeight;
    const span = hd * 0.8, zc = hd * 0.45; // centred on the slope as you see it (a little above its middle)
    const geo = new THREE.PlaneGeometry(span, span, 1, 24).rotateX(-Math.PI / 2).translate(0, 0, zc);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, base + H * Math.pow(1 - pos.getZ(i) / hd, 1.7) + 0.12);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: charTexture(ch), transparent: true, alphaTest: 0.2, metalness: 0.5, roughness: 0.45, emissive: 0x6a4a12 }));
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = hallYaw(def);
    scene.add(mesh);
  }
}
