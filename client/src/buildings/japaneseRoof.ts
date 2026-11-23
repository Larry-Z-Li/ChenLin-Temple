import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Japanese temple roofs and details (禅宗様 halls, 方丈-style buildings). */

/** Tile size on the roof (metres): one channel of round tiles across, one course down the slope. */
const TILE_W = 0.38, TILE_L = 0.5;

/**
 * 入母屋 (hip-and-gable) roof: hipped below `gable` of its height, gabled above, with the Japanese
 * concave curve (`curve` > 1: steep near the ridge, flattening to the eaves) and up-turned corners.
 * Footprint W×D (including the eaves), height H, base at y = 0. Returns the roof surface (UVs run the
 * tiles down every slope), the gable ends, and the eave and barge boards (`edge`) that give it thickness.
 */
export function irimoyaRoof(W: number, D: number, H: number, o: { gable?: number; curve?: number; upturn?: number; seg?: number } = {}) {
  const g = o.gable ?? 0.55, curve = o.curve ?? 1.5, up = o.upturn ?? 0.3, seg = o.seg ?? 28;
  const hd = D / 2, hw = W / 2, xg = hw - g * hd; // where the gable faces stand
  const a = (z: number) => 1 - Math.abs(z) / hd; // long sides' slope: 0 at the eaves, 1 at the ridge
  const b = (x: number) => (hw - Math.abs(x)) / hd; // the hipped ends (same pitch)
  const shape = (t: number, x: number, z: number) => H * Math.pow(Math.max(0, t), curve) + up * H * Math.pow(Math.abs(x) / hw, 6) * Math.pow(1 - a(z), 2) * 0.9;
  // tiles run down whichever slope a point is on: across x on the long sides, across z on the hipped ends
  const tileUV = (x: number, z: number): [number, number] => (a(z) <= b(x) ? [x / TILE_W, (hd - Math.abs(z)) / TILE_L] : [z / TILE_W, (hw - Math.abs(x)) / TILE_L]);
  const grid = (x0: number, x1: number, z0: number, z1: number, h: (x: number, z: number) => number, nx: number, nz: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
        pos.push(x, h(x, z), z);
        uv.push(...tileUV(x, z));
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const p = j * (nx + 1) + i;
        idx.push(p, p + nx + 1, p + 1, p + 1, p + nx + 1, p + nx + 2);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo.toNonIndexed();
  };
  // the hipped skirt (capped at the gable's foot: hidden under the gable where it would rise above it)
  const hipH = (x: number, z: number) => shape(Math.min(a(z), b(x), g), x, z);
  const hip = grid(-hw, hw, -hd, hd, hipH, seg * 2, seg);
  // the gable roof on top, over |x| ≤ xg (a little past it for a verge overhang), from its foot to the ridge
  const zf = (1 - g) * hd, xv = xg + 0.35;
  const topH = (x: number, z: number) => shape(a(z), x, z) + 0.02;
  const top = grid(-xv, xv, -zf, zf, topH, seg, Math.max(4, Math.round(seg / 2)));
  // the gable ends: vertical triangles (plaster or wood; draw them double-sided)
  const tri: number[] = [];
  for (const s of [-1, 1]) {
    const x = s * xg, y0 = shape(g, x, zf), y1 = shape(1, x, 0);
    tri.push(x, y0, -zf, x, y0, zf, x, y1, 0);
  }
  const gable = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  // boards round the edges: the eaves (all four sides) and the barge boards up the gable roof's verges
  const edge: number[] = [], drop = Math.max(0.18, H * 0.05);
  const strip = (pts: [number, number, number][]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
      edge.push(x0, y0 + 0.02, z0, x1, y1 + 0.02, z1, x1, y1 - drop, z1, x0, y0 + 0.02, z0, x1, y1 - drop, z1, x0, y0 - drop, z0);
    }
  };
  const n = seg * 2;
  for (const s of [-1, 1]) {
    strip(Array.from({ length: n + 1 }, (_, i) => { const x = -hw + (2 * hw * i) / n; return [x, hipH(x, s * hd), s * hd] as [number, number, number]; }));
    strip(Array.from({ length: seg + 1 }, (_, i) => { const z = -hd + (2 * hd * i) / seg; return [s * hw, hipH(s * hw, z), z] as [number, number, number]; }));
    strip(Array.from({ length: 13 }, (_, i) => { const z = -zf + (2 * zf * i) / 12; return [s * xv, topH(s * xv, z), z] as [number, number, number]; }));
  }
  const edges = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  edges.computeVertexNormals();
  return { roof: mergeGeometries([hip, top])!, gable, edge: edges, ridge: shape(1, 0, 0) };
}

/**
 * Roof texture, tiling with the roof's UVs. 'tile': 本瓦葺 — rows of round cover tiles over flat pan tiles,
 * each course overlapping the next; 'bark': 檜皮葺 — fine layered cypress bark.
 */
export function roofTexture(kind: 'tile' | 'bark', base: number) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!, col = new THREE.Color(base);
  const css = (k: number) => `rgb(${Math.min(255, col.r * 255 * k)},${Math.min(255, col.g * 255 * k)},${Math.min(255, col.b * 255 * k)})`;
  if (kind === 'tile') {
    // across: a flat pan (darker) then a round cover tile (shaded like a half cylinder)
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, css(0.5));
    grad.addColorStop(0.18, css(0.62));
    grad.addColorStop(0.3, css(0.45));
    grad.addColorStop(0.38, css(0.9));
    grad.addColorStop(0.54, css(1.55));
    grad.addColorStop(0.7, css(1.15));
    grad.addColorStop(0.82, css(0.55));
    grad.addColorStop(1, css(0.5));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    // down: each course's lower lip, with its shadow on the course below
    g.fillStyle = css(0.32);
    g.fillRect(0, 0, 64, 6);
    g.fillStyle = css(1.35);
    g.fillRect(0, 6, 64, 2);
  } else {
    g.fillStyle = css(1);
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) {
      g.fillStyle = css(y % 8 ? 0.82 : 1.12);
      g.fillRect(0, y, 64, 1.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; // the slopes are seen at a glancing angle from the ground
  return t;
}

/** A bell-shaped 花頭窓 window outline (flat sill, flame-arched head), w wide, h tall. */
export function bellWindow(w: number, h: number) {
  const s = new THREE.Shape(), hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, h * 0.6);
  s.bezierCurveTo(hw, h * 0.8, hw * 0.35, h * 0.78, hw * 0.25, h * 0.92);
  s.quadraticCurveTo(0, h * 1.08, -hw * 0.25, h * 0.92);
  s.bezierCurveTo(-hw * 0.35, h * 0.78, -hw, h * 0.8, -hw, h * 0.6);
  s.lineTo(-hw, 0);
  return new THREE.ShapeGeometry(s, 12);
}

/** Shōji: white paper in a fine wooden lattice. */
export function shojiTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3eee2';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#8a6a4a';
  g.lineWidth = 3;
  for (let x = 0; x <= 128; x += 32) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, 256), g.stroke());
  for (let y = 0; y <= 256; y += 36) (g.beginPath(), g.moveTo(0, y), g.lineTo(128, y), g.stroke());
  g.fillStyle = '#8a6a4a';
  g.fillRect(0, 220, 128, 36); // kick board
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}


/** Drop the triangles whose middle lies inside |x| < hx, |z| < hz: a skirt roof (裳階) becomes a ring round the walls. */
export function cutHole(geo: THREE.BufferGeometry, hx: number, hz: number) {
  const src = geo.index ? geo.toNonIndexed() : geo, p = src.attributes.position, uv = src.attributes.uv, keep: number[] = [], keepUv: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (Math.abs(cx) < hx && Math.abs(cz) < hz) continue;
    for (let v = 0; v < 3; v++) {
      keep.push(p.getX(i + v), p.getY(i + v), p.getZ(i + v));
      if (uv) keepUv.push(uv.getX(i + v), uv.getY(i + v));
    }
  }
  const out = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(keepUv, 2));
  return out;
}
