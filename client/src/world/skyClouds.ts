import * as THREE from 'three';

/**
 * Clouds: soft puffs across the whole sky, overhead too, drifting on one wind — each 50–80% see-through
 * (opacity 0.2–0.5) by day, warmer at dawn and dusk; moonlit blue-grey and fainter by night. Flat, lying level
 * in the sky (fixed, so they don't turn as you look round; seen near the horizon they're thin, as clouds are).
 * Near the edge of their disc they fade out, and come back in on the far side.
 */
const COUNT = 36, R = 980;
const WIND = new THREE.Vector2(1, 0.35).normalize();

/** A puff of cloud: overlapping soft white blobs, flatter underneath. */
function puffTexture(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const x = 50 + rnd() * 156, y = 58 + rnd() * 26 - Math.abs(x - 128) * 0.12, r = 24 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSkyClouds(scene: THREE.Scene) {
  const textures = [puffTexture(7), puffTexture(19), puffTexture(31)];
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2); // level, facing down
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clouds = Array.from({ length: COUNT }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: textures[i % textures.length], transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const sprite = new THREE.Mesh(plane, mat); // a level sheet, seen from below
    const w = 260 + rnd() * 260;
    sprite.scale.set(w, 1, w * (0.5 + rnd() * 0.2));
    sprite.rotation.y = rnd() * Math.PI * 2;
    sprite.renderOrder = -0.4; // over the sky, under everything else
    scene.add(sprite);
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R; // spread evenly over the disc
    return { sprite, mat, x: Math.cos(a) * r, z: Math.sin(a) * r, y: 150 + rnd() * 130, opacity: 0.2 + rnd() * 0.3, speed: 2.5 + rnd() * 3 };
  });
  const warm = new THREE.Color(1, 0.82, 0.68), white = new THREE.Color(1, 1, 1), moonlit = new THREE.Color(0.12, 0.15, 0.24), tint = new THREE.Color();
  return {
    /** `day` 0 (night: moonlit, fainter) … 1 (day); `dusk` 0 … 1 near sunrise and sunset (warms them). */
    update(dt: number, day: number, dusk: number) {
      tint.copy(moonlit).lerp(white, day).lerp(warm, dusk * 0.8);
      const fade = day + (1 - day) * 0.4; // fainter by night
      for (const c of clouds) {
        c.x += WIND.x * c.speed * dt; // drifting on the wind
        c.z += WIND.y * c.speed * dt;
        let r = Math.hypot(c.x, c.z);
        if (r > R) { // gone over the far edge (faded out): back in at the near edge, still faded
          c.x = (-c.x / r) * (R - 0.5);
          c.z = (-c.z / r) * (R - 0.5);
          r = R - 0.5;
        }
        c.sprite.position.set(c.x, c.y, c.z);
        const edge = Math.min(1, (R - r) / 160); // fade near the rim of the disc
        c.mat.opacity = c.opacity * fade * Math.max(0, edge);
        c.mat.color.copy(tint);
      }
    },
  };
}
