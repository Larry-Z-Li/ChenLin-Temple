import * as THREE from 'three';
import { COURT_CARPET, HALLS, PLATFORM_H, hallYaw } from '../config/layout';

/**
 * The nine syllables (九字) written big in gold leaf on the front slope of the gate halls, one to each
 * gate, with 皆 in the middle on a carpet under the great incense burner in the stupa court. Each roof
 * character follows the roof's curve so it never sinks into the tiles.
 */
const ON_HALL: Record<string, string> = {
  wenshu: '者', // 杜門
  guoxue: '前', // 景門
  dizang: '兵', // 死門
  zangmi: '列', // 驚門
  dongmi: '鬪', // 傷門
  caishen: '在', // 生門
  yangsheng: '臨', // 休門
  guanyin: '陣', // 開門
};
/** The middle of the nine: the stupa court, on the carpet under the incense burner. */
const MIDDLE = '皆';

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
  await document.fonts.load('700 400px "Noto Serif TC"', Object.values(ON_HALL).join('') + MIDDLE).catch(() => null);
  // the middle syllable: a big square carpet on the walk between the south gate and the incense burner, the character in gold on deep red
  const rug = new THREE.Group();
  rug.add(new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.03, 6.4).translate(0, 0.015, 0), new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.8 })));
  // (the layers only centimetres apart: from far off the depth buffer can't tell them apart, so each is drawn a step
  // nearer than the one under it, and they never flicker into each other)
  rug.add(new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.05, 6.0).translate(0, 0.025, 0), new THREE.MeshStandardMaterial({ color: 0x6e1410, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4).rotateX(-Math.PI / 2).translate(0, 0.056, 0), new THREE.MeshStandardMaterial({ map: charTexture(MIDDLE), transparent: true, alphaTest: 0.2, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  rug.add(top);
  // on the court's paving (its slabs' top is 0.07 above the ground; see decor.ts); reads upright walking in from the south gate
  rug.scale.set(COURT_CARPET.scale, 1, COURT_CARPET.scale);
  rug.position.set(COURT_CARPET.x, groundAt(COURT_CARPET.x, COURT_CARPET.z) + 0.075, COURT_CARPET.z);
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
