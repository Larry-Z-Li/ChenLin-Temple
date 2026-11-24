import { ABBOT, DORM, FOOT_BRIDGES, FOOTPATHS, GREAT_STUPA, HALLS, hallHalf, MOUNTAIN_GATE, ORCHARD, PAGODAS, PAVED, PLAZA, POND, RIVERS, STUPA_COURT } from '../config/layout';
import { t, type I18nKey } from '../i18n';
import { mapProjector } from './mapDraw';

/**
 * Mock map styles (dev: /mocks.html), drawn from the same layout as the real map:
 *  ink     — 水墨: brush-ink paths and walls on rice paper, red seals for the names
 *  lacquer — 金漆: gold linework on deep indigo, halls in cinnabar
 *  garden  — 庭園: a painted garden plan: soft greens, stone paths, little roofs, name plaques
 */
export type MapStyle = 'ink' | 'lacquer' | 'garden';

interface Look {
  paper: string; edge: string; land: string; water: string; waterEdge: string; path: string; pathW: number; paved: string;
  hall: string; hallEdge: string; roof: string; court: string; stupa: string; text: string; textEdge: string; seal: string; pagoda: string; tree: string;
}
const LOOKS: Record<MapStyle, Look> = {
  ink: { paper: '#efe6d2', edge: '#cdbf9f', land: 'rgba(120,130,100,0.10)', water: 'rgba(70,95,110,0.28)', waterEdge: 'rgba(40,50,55,0.55)', path: 'rgba(30,28,26,0.78)', pathW: 1.3, paved: 'rgba(30,28,26,0.14)', hall: 'rgba(255,250,238,0.9)', hallEdge: '#1e1c1a', roof: '#1e1c1a', court: '#1e1c1a', stupa: '#1e1c1a', text: '#1e1c1a', textEdge: 'rgba(239,230,210,0.9)', seal: '#b3281e', pagoda: '#1e1c1a', tree: 'rgba(40,52,38,0.22)' },
  lacquer: { paper: '#141a2e', edge: '#c9a24a', land: 'rgba(201,162,74,0.05)', water: 'rgba(60,120,140,0.35)', waterEdge: '#c9a24a', path: 'rgba(221,183,98,0.85)', pathW: 1.0, paved: 'rgba(221,183,98,0.22)', hall: '#8e2b1f', hallEdge: '#e3be6a', roof: '#e3be6a', court: '#e3be6a', stupa: '#f3dca0', text: '#f3dca0', textEdge: 'rgba(10,12,24,0.9)', seal: '#c0392b', pagoda: '#e3be6a', tree: 'rgba(221,183,98,0.12)' },
  garden: { paper: '#dfe7c8', edge: '#7b8f5a', land: 'rgba(110,150,80,0.35)', water: '#8cc3cf', waterEdge: '#5f9fae', path: '#efe3c4', pathW: 2.2, paved: '#e6dcc2', hall: '#f4ecdc', hallEdge: '#8a6a4a', roof: '#4b5563', court: '#c9b48a', stupa: '#fbf6ea', text: '#4a2f1d', textEdge: 'rgba(255,250,240,0.95)', seal: '#b3281e', pagoda: '#a3291f', tree: 'rgba(70,120,60,0.55)' },
};

/** Deterministic jitter for brush and leaf placement. */
function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Where each name was drawn (so a hovered destination's plaque can be lit up on top). */
export const labelSpots = new Map<string, { x: number; z: number; big: boolean }>();

export function drawStyledMap(g: CanvasRenderingContext2D, S: number, style: MapStyle, opts: { labels?: boolean } = {}) {
  const L = LOOKS[style], { k, s, X, Y, R, cx, cz } = mapProjector(S), r = rand(7);
  const frame = () => circle(S / 2, S / 2, R * s);
  const circle = (x: number, y: number, rad: number) => (g.beginPath(), g.arc(x, y, rad, 0, Math.PI * 2));
  const line = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
  };

  // ---- ground: paper / lacquer / painted lawn, inside a round frame
  g.fillStyle = L.paper;
  g.fillRect(0, 0, S, S);
  g.save();
  frame();
  g.clip();
  g.fillStyle = L.land;
  g.fillRect(0, 0, S, S);
  if (style !== 'lacquer') {
    // soft blotches: paper fibres, or patches of lawn
    for (let i = 0; i < 260; i++) {
      g.fillStyle = style === 'ink' ? `rgba(120,100,70,${0.02 + r() * 0.03})` : `rgba(${80 + r() * 40},${130 + r() * 40},${60 + r() * 30},${0.08 + r() * 0.1})`;
      circle(r() * S, r() * S, (4 + r() * 18) * k);
      g.fill();
    }
  }
  // trees round the edge of the grounds
  g.fillStyle = L.tree;
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = R * (0.8 + r() * 0.22), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    circle(X(x), Y(z), (1.4 + r() * 2.2) * k);
    g.fill();
  }

  // ---- water: rivers as washes, the pond
  g.lineCap = g.lineJoin = 'round';
  for (const rv of RIVERS) {
    g.strokeStyle = L.water;
    g.lineWidth = (rv.falls ? 2.4 : 4.2) * k;
    line(rv.points);
    g.stroke();
    g.strokeStyle = L.waterEdge;
    g.lineWidth = 0.5 * k;
    line(rv.points);
    g.stroke();
  }
  g.fillStyle = L.water;
  circle(X(POND.x), Y(POND.z), POND.radius * s);
  g.fill();
  g.strokeStyle = L.waterEdge;
  g.lineWidth = 0.8 * k;
  g.stroke();

  // ---- paths: brush strokes (ink: drawn twice, a little off, like a dry brush), gold threads, or stone walks
  for (const p of FOOTPATHS) {
    g.strokeStyle = L.path;
    g.lineWidth = L.pathW * k;
    line(p);
    g.stroke();
    if (style === 'ink') {
      g.lineWidth = 0.5 * k;
      g.beginPath();
      p.forEach(([x, z], i) => (i ? g.lineTo(X(x) + (r() - 0.5) * 1.2 * k, Y(z) + (r() - 0.5) * 1.2 * k) : g.moveTo(X(x), Y(z))));
      g.stroke();
    }
    if (style === 'garden') {
      g.strokeStyle = 'rgba(140,120,90,0.35)';
      g.lineWidth = 0.4 * k;
      g.setLineDash([1.2 * k, 1.6 * k]); // stepping stones
      line(p);
      g.stroke();
      g.setLineDash([]);
    }
  }
  g.fillStyle = L.paved;
  for (const p of PAVED) g.fillRect(X(p.maxX), Y(p.maxZ), (p.maxX - p.minX) * s, (p.maxZ - p.minZ) * s);
  g.fillStyle = L.seal;
  for (const b of FOOT_BRIDGES) {
    const [w, d] = b.axis === 'x' ? [b.length, 2.4] : [2.4, b.length];
    g.fillRect(X(b.x + w / 2), Y(b.z + d / 2), w * s, d * s);
  }

  // ---- buildings: halls with their roofs (a ridge and four hips), the stupa court, pagodas
  const roofed = (x: number, z: number, hx: number, hz: number) => {
    const x0 = X(x + hx), y0 = Y(z + hz), w = hx * 2 * s, d = hz * 2 * s;
    g.fillStyle = L.hall;
    g.fillRect(x0, y0, w, d);
    g.strokeStyle = L.hallEdge;
    g.lineWidth = (style === 'ink' ? 1.1 : 0.8) * k;
    g.strokeRect(x0, y0, w, d);
    // hip roof seen from above: ridge along the long side, hips to the corners
    const long = w >= d, inset = Math.min(w, d) / 2;
    const a = long ? [x0 + inset, y0 + d / 2] : [x0 + w / 2, y0 + inset], b = long ? [x0 + w - inset, y0 + d / 2] : [x0 + w / 2, y0 + d - inset];
    g.strokeStyle = L.roof;
    g.lineWidth = 0.5 * k;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    for (const [cx, cy, e] of [[x0, y0, a], [x0, y0 + d, a], [x0 + w, y0, b], [x0 + w, y0 + d, b]] as const) {
      g.moveTo(cx, cy);
      g.lineTo(e[0], e[1]);
    }
    g.stroke();
  };
  for (const h of HALLS) {
    const [hx, hz] = hallHalf(h);
    roofed(h.x, h.z, hx, hz);
  }
  roofed(ABBOT.x, ABBOT.z, 4.5, 3.5);
  const d = DORM;
  for (const [x0, x1, z0, z1] of [[d.minX, d.maxX, d.minZ, d.minZ + d.wing], [d.minX, d.maxX, d.maxZ - d.wing, d.maxZ], [d.maxX - d.wing, d.maxX, d.minZ, d.maxZ]])
    roofed((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
  const sc = STUPA_COURT;
  g.strokeStyle = L.court;
  g.lineWidth = 1.2 * k;
  g.strokeRect(X(sc.x + sc.half), Y(sc.z + sc.half), sc.half * 2 * s, sc.half * 2 * s);
  g.fillStyle = L.stupa;
  circle(X(GREAT_STUPA.x), Y(GREAT_STUPA.z), (GREAT_STUPA.base / 2) * s);
  g.fill();
  g.strokeStyle = L.court;
  g.lineWidth = 0.6 * k;
  for (const f of [1, 0.66, 0.33]) (circle(X(GREAT_STUPA.x), Y(GREAT_STUPA.z), (GREAT_STUPA.base / 2) * s * f), g.stroke());
  for (const p of PAGODAS) {
    g.fillStyle = L.pagoda;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, R = 4.2 * s;
      (i ? g.lineTo : g.moveTo).call(g, X(p.x) + Math.cos(a) * R, Y(p.z) + Math.sin(a) * R);
    }
    g.fill();
  }
  g.fillStyle = style === 'garden' ? 'rgba(232,140,40,0.85)' : L.path;
  for (let z = ORCHARD.minZ; z <= ORCHARD.maxZ; z += ORCHARD.spacing) for (let x = ORCHARD.minX; x <= ORCHARD.maxX; x += ORCHARD.spacing) (circle(X(x), Y(z), 1.2 * k), g.fill());
  g.fillStyle = L.seal;
  g.fillRect(X(MOUNTAIN_GATE.x + MOUNTAIN_GATE.width / 2), Y(MOUNTAIN_GATE.z) - k, MOUNTAIN_GATE.width * s, 2.2 * k);
  g.restore();

  // ---- frame
  g.strokeStyle = L.edge;
  g.lineWidth = (style === 'lacquer' ? 2.2 : 3) * k;
  frame();
  g.stroke();
  if (style === 'lacquer') {
    g.lineWidth = 0.6 * k;
    circle(S / 2, S / 2, R * s - 3 * k);
    g.stroke();
  }

  // ---- names
  if (opts.labels !== false) {
    labelSpots.clear();
    const label = (key: I18nKey, x: number, z: number, big = false) => {
      labelSpots.set(key, { x, z, big });
      drawLabel(g, S, style, key, x, z, big);
    };
    for (const h of HALLS) label(h.nameKey as I18nKey, h.x, h.z, h.kind === 'hall');
    label('map.stupa', GREAT_STUPA.x, GREAT_STUPA.z, true);
    for (const p of PAGODAS) {
      const dx = p.x - GREAT_STUPA.x, dz = p.z - GREAT_STUPA.z, l = Math.hypot(dx, dz) || 1;
      label(p.nameKey as I18nKey, p.x + (dx / l) * 10, p.z + (dz / l) * 10);
    }
    label('map.plaza', PLAZA.x, PLAZA.z);
    label('map.pond', POND.x, POND.z);
    label('map.orchard', (ORCHARD.minX + ORCHARD.maxX) / 2, (ORCHARD.minZ + ORCHARD.maxZ) / 2);
  }

  // ---- compass: four seals
  const seal = (txt: string, x: number, y: number) => {
    g.fillStyle = style === 'lacquer' ? '#c9a24a' : L.seal;
    g.beginPath();
    g.roundRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k, 2 * k);
    g.fill();
    g.fillStyle = style === 'lacquer' ? '#141a2e' : '#fff6e6';
    g.font = `700 ${Math.round(8 * k)}px "Noto Serif TC", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, x, y + 0.5 * k);
  };
  seal(t('map.s'), S / 2, 9 * k);
  seal(t('map.n'), S / 2, S - 9 * k);
  seal(t('map.e'), 9 * k, S / 2);
  seal(t('map.w'), S - 9 * k, S / 2);
}

/** A place name: calligraphy with a red seal (ink), gold (lacquer), a little wooden plaque (garden; `lit` when hovered). */
/** A long name on two lines: a gate hall's gate over its name (生門 / 財富苑), English at its last space. */
function labelLines(text: string) {
  const gate = /^(.門)(.{3,})$/.exec(text);
  if (gate) return [gate[1], gate[2]];
  const sp = text.lastIndexOf(' ');
  return sp > 0 && text.length > 10 ? [text.slice(0, sp), text.slice(sp + 1)] : [text];
}

export function drawLabel(g: CanvasRenderingContext2D, S: number, style: MapStyle, key: I18nKey, x: number, z: number, big = false, lit = false) {
  const L = LOOKS[style], { k, X, Y } = mapProjector(S);
  const px = X(x), py = Y(z), lines = labelLines(t(key)), size = Math.round((big ? 5.4 : 4.7) * k), lh = size * 1.12;
  const font = (n: number) => `600 ${Math.round(n)}px "Noto Serif TC", "Songti TC", serif`;
  // a first line over a second is a little smaller (the gate over the hall's name)
  const sizeOf = (i: number) => (lines.length > 1 && i === 0 ? size * 0.82 : size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.max(...lines.map((l, i) => ((g.font = font(sizeOf(i))), g.measureText(l).width)));
  const top = py - ((lines.length - 1) * lh) / 2; // the first line's middle
  if (style === 'garden') {
    if (lit) {
      g.shadowColor = 'rgba(255,214,110,0.95)';
      g.shadowBlur = 10 * k;
    }
    g.fillStyle = lit ? '#ffe7a6' : 'rgba(255,250,240,0.92)';
    g.strokeStyle = lit ? '#c98a16' : 'rgba(138,106,74,0.9)';
    g.lineWidth = (lit ? 1.2 : 0.6) * k;
    g.beginPath();
    g.roundRect(px - w / 2 - 2.6 * k, top - size * 0.6, w + 5.2 * k, size * 1.2 + (lines.length - 1) * lh, 2.5 * k);
    g.fill();
    g.shadowBlur = 0;
    g.stroke();
  }
  lines.forEach((l, i) => {
    g.font = font(sizeOf(i));
    if (style !== 'garden') {
      g.strokeStyle = L.textEdge;
      g.lineWidth = 2.6 * k;
      g.strokeText(l, px, top + i * lh);
    }
    g.fillStyle = L.text;
    g.fillText(l, px, top + i * lh);
  });
  if (style === 'ink' && big) {
    g.fillStyle = L.seal;
    g.fillRect(px + w / 2 + 1.5 * k, py - 2.2 * k, 3.6 * k, 4.4 * k);
  }
}
