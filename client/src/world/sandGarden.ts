import * as THREE from 'three';
import { mat } from '../buildings/materials';
import { SAND_GARDEN } from '../config/layout';
import type { WorldContext } from '../core/context';
import { mulberry32, range } from '../core/math';
import { canvasTexture } from '../core/textures';

/**
 * 枯山水, the dry garden on the plaza's west side: white sand raked in straight lines, rippling in
 * rings around three groups of rocks set in moss, inside a low stone kerb. You look over it; you
 * don't walk in it.
 */
export function buildSandGarden(ctx: WorldContext) {
  const G = SAND_GARDEN, W = G.maxX - G.minX, D = G.maxZ - G.minZ, cx = (G.minX + G.maxX) / 2, cz = (G.minZ + G.maxZ) / 2;
  const y = ctx.ground.heightAt(cx, cz) + 0.14; // above the plaza's paving slab (top at ~0.07)
  const rng = mulberry32(1515);

  // ---- The raked sand: a texture of grooves (straight across, rings round the rocks) ----
  const PX = 40; // pixels per metre
  const tex = canvasTexture(Math.round(W * PX), Math.round(D * PX), (g) => {
    const w = W * PX, d = D * PX;
    g.fillStyle = '#e9e3d3';
    g.fillRect(0, 0, w, d);
    const groove = (draw: () => void) => {
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(150,138,115,0.55)'; // shadow side of each furrow
      draw();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,250,0.7)'; // lit ridge beside it
      g.save();
      g.translate(0, 3);
      draw();
      g.restore();
    };
    const rings = G.rocks.map((r) => ({ x: (r.x - G.minX) * PX, y: (r.z - G.minZ) * PX, r: (r.r + 1.1) * PX, n: 4 }));
    // straight furrows, broken where the ring ripples take over
    for (let row = 12; row < d; row += 18)
      groove(() => {
        g.beginPath();
        let pen = false;
        for (let x = 0; x <= w; x += 4) {
          const inside = rings.some((c) => Math.hypot(x - c.x, row - c.y) < c.r + c.n * 18);
          if (inside) pen = false;
          else if (!pen) (g.moveTo(x, row), (pen = true));
          else g.lineTo(x, row);
        }
        g.stroke();
      });
    for (const c of rings)
      for (let k = 0; k <= c.n; k++)
        groove(() => {
          g.beginPath();
          g.arc(c.x, c.y, c.r + k * 18, 0, Math.PI * 2);
          g.stroke();
        });
  });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  sand.position.set(cx, y, cz);
  sand.receiveShadow = true;
  ctx.scene.add(sand);

  // ---- The kerb: low dark stone all round (it keeps feet off the sand) ----
  const kerb = mat(0x6d6a62, { roughness: 0.95 });
  const k = 0.35, kh = 0.28;
  for (const [x, z, sx, sz] of [
    [cx, G.minZ - k / 2, W + k * 2, k], [cx, G.maxZ + k / 2, W + k * 2, k],
    [G.minX - k / 2, cz, k, D], [G.maxX + k / 2, cz, k, D],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, kh, sz), kerb);
    m.position.set(x, y - 0.08 + kh / 2, z);
    m.receiveShadow = m.castShadow = true;
    ctx.scene.add(m);
    ctx.collisions.addBoxCentered(x, z, sx, sz);
  }
  // nobody walks across the sand itself either
  ctx.collisions.addBoxCentered(cx, cz, W, D);

  // ---- Rocks set in moss ----
  const stone = mat(0x8a877d, { roughness: 0.9, flatShading: true });
  const dark = mat(0x5f5d57, { roughness: 0.95, flatShading: true });
  const moss = mat(0x4f7a35, { roughness: 1, flatShading: true });
  for (const r of G.rocks) {
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const s = r.r * (i ? range(rng, 0.45, 0.65) : 1);
      const a = rng() * Math.PI * 2, off = i ? r.r * range(rng, 0.7, 1.0) : 0;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), i % 2 ? dark : stone);
      rock.scale.set(s * range(rng, 0.8, 1.1), s * range(rng, 0.55, 0.9), s * range(rng, 0.7, 1.0));
      rock.rotation.set(range(rng, -0.2, 0.2), rng() * 6, range(rng, -0.2, 0.2));
      rock.position.set(r.x + Math.cos(a) * off, y + rock.scale.y * 0.45, r.z + Math.sin(a) * off);
      rock.castShadow = rock.receiveShadow = true;
      ctx.scene.add(rock);
    }
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(r.r * 1.35, r.r * 1.5, 0.12, 9), moss);
    bed.position.set(r.x, y + 0.02, r.z);
    bed.receiveShadow = true;
    ctx.scene.add(bed);
  }
}
