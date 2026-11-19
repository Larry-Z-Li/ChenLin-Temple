import { BAMBOO_PATH, BASIN, BODHI_TREE, HALLS, MOUNTAIN_GATE, ORCHARD, PAVED, PLAY_RADIUS, POND, POND_PAVILION, RIVERS, TEA_CORNER, WHEEL_ROWS, WISH_GARDEN, ZEN_GARDEN } from '../config/layout';
import { t, type I18nKey } from '../i18n';

export interface MapMarks {
  me?: { x: number; z: number; yaw: number };
  others?: { x: number; z: number }[];
  /** "You are here" pin (the map board). */
  here?: { x: number; z: number };
  /** Place names (big map and board). */
  labels?: boolean;
}

/**
 * The temple map, drawn SOUTH-UP (traditional orientation: south at the top, east on the left)
 * into an S×S square of `g`. screenX = cx − x·s, screenY = cy − z·s.
 */
export function drawTempleMap(g: CanvasRenderingContext2D, S: number, marks: MapMarks = {}) {
  const k = S / 200; // line/dot scale relative to the 200px minimap
  const s = (S / 2 - 8 * k) / PLAY_RADIUS;
  const cx = S / 2 + BASIN.x * s, cy = S / 2 + BASIN.z * s;
  const X = (x: number) => cx - x * s, Y = (z: number) => cy - z * s;
  const dot = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  g.fillStyle = 'rgba(48,72,40,0.88)';
  dot(X(BASIN.x), Y(BASIN.z), PLAY_RADIUS * s);

  g.strokeStyle = '#4c8fa3';
  g.lineWidth = 1.6 * k;
  for (const r of RIVERS) {
    g.lineWidth = (r.falls ? 1.6 : 2.2) * k;
    g.beginPath();
    r.points.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.stroke();
  }

  // Garden rooms
  g.fillStyle = 'rgba(70,110,45,0.95)';
  dot(X(TEA_CORNER.x), Y(TEA_CORNER.z), TEA_CORNER.r * s);
  g.fillStyle = 'rgba(222,215,200,0.9)';
  for (const r of [ZEN_GARDEN, WISH_GARDEN]) g.fillRect(X(r.maxX), Y(r.maxZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s);
  g.strokeStyle = 'rgba(120,160,70,0.95)';
  g.lineWidth = 3.2 * k;
  g.beginPath();
  BAMBOO_PATH.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
  g.stroke();

  g.fillStyle = 'rgba(190,182,166,0.92)';
  for (const r of PAVED) g.fillRect(X(r.maxX), Y(r.maxZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s);

  g.fillStyle = '#4c8fa3';
  dot(X(POND.x), Y(POND.z), POND.radius * s);

  g.fillStyle = 'rgba(232,140,40,0.75)';
  for (let z = ORCHARD.minZ; z <= ORCHARD.maxZ; z += ORCHARD.spacing) for (let x = ORCHARD.minX; x <= ORCHARD.maxX; x += ORCHARD.spacing) dot(X(x), Y(z), 1.3 * k);

  g.fillStyle = 'rgba(80,140,60,0.95)';
  dot(X(BODHI_TREE.x), Y(BODHI_TREE.z), 3 * k);
  g.fillStyle = '#a3291f';
  dot(X(POND_PAVILION.x), Y(POND_PAVILION.z), POND_PAVILION.r * s);
  g.fillRect(X(POND_PAVILION.walkX1), Y(POND_PAVILION.walkZ1), (POND_PAVILION.walkX1 - POND_PAVILION.walkX0) * s, (POND_PAVILION.walkZ1 - POND_PAVILION.walkZ0) * s);

  g.fillStyle = '#d9a441';
  for (const w of WHEEL_ROWS) g.fillRect(X(w.x) - k, Y(w.zStart + (w.count - 1) * w.spacing), 2 * k, (w.count - 1) * w.spacing * s);

  for (const hall of HALLS) {
    g.fillStyle = hall.kind === 'shrine' ? '#b0473a' : '#8e2b1f';
    g.fillRect(X(hall.x + hall.width / 2), Y(hall.z + hall.depth / 2), hall.width * s, hall.depth * s);
  }
  g.fillStyle = '#a3291f';
  g.fillRect(X(MOUNTAIN_GATE.x + MOUNTAIN_GATE.width / 2), Y(MOUNTAIN_GATE.z) - k, MOUNTAIN_GATE.width * s, 2.5 * k);

  if (marks.labels) {
    const label = (key: I18nKey, x: number, z: number, dy = 0) => {
      g.font = `600 ${Math.round(7.5 * k)}px "Noto Serif TC", "Songti TC", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3 * k;
      g.strokeStyle = 'rgba(20,14,10,0.85)';
      g.fillStyle = '#f6ecd8';
      g.strokeText(t(key), X(x), Y(z) + dy * k);
      g.fillText(t(key), X(x), Y(z) + dy * k);
    };
    for (const hall of HALLS) label(hall.nameKey as I18nKey, hall.x, hall.z, hall.kind === 'shrine' ? -10 : 0);
    label('map.pond', POND.x, POND.z);
    label('map.orchard', (ORCHARD.minX + ORCHARD.maxX) / 2, (ORCHARD.minZ + ORCHARD.maxZ) / 2);
    label('map.gate', MOUNTAIN_GATE.x, MOUNTAIN_GATE.z, -7);
    label('map.bodhi', BODHI_TREE.x, BODHI_TREE.z, 7);
    label('map.zen', (ZEN_GARDEN.minX + ZEN_GARDEN.maxX) / 2, (ZEN_GARDEN.minZ + ZEN_GARDEN.maxZ) / 2);
    label('map.wishes', (WISH_GARDEN.minX + WISH_GARDEN.maxX) / 2, (WISH_GARDEN.minZ + WISH_GARDEN.maxZ) / 2);
    label('map.tea', TEA_CORNER.x, TEA_CORNER.z);
    label('map.bamboo', BAMBOO_PATH[4][0], BAMBOO_PATH[4][1] - 6);
    label('map.pavilion', POND_PAVILION.x, POND_PAVILION.z, 8);
  }

  g.fillStyle = '#fff';
  for (const o of marks.others ?? []) dot(X(o.x), Y(o.z), 2 * k);

  if (marks.here) {
    const px = X(marks.here.x), py = Y(marks.here.z);
    g.fillStyle = '#e8343a';
    dot(px, py, 3.5 * k);
    g.strokeStyle = '#fff';
    g.lineWidth = 1.2 * k;
    g.stroke();
    g.font = `700 ${Math.round(7 * k)}px system-ui, sans-serif`;
    g.textAlign = 'left';
    g.lineWidth = 3 * k;
    g.strokeStyle = 'rgba(20,14,10,0.85)';
    g.strokeText(t('map.here'), px + 6 * k, py);
    g.fillStyle = '#ffd36b';
    g.fillText(t('map.here'), px + 6 * k, py);
  }

  if (marks.me) {
    // World forward (−sin ψ, −cos ψ) → screen (+sin ψ, +cos ψ) after the south-up flip.
    const px = X(marks.me.x), py = Y(marks.me.z), fx = Math.sin(marks.me.yaw) * k, fy = Math.cos(marks.me.yaw) * k;
    g.fillStyle = '#ffd36b';
    g.beginPath();
    g.moveTo(px + fx * 6, py + fy * 6);
    g.lineTo(px - fy * 3.5 - fx * 3, py + fx * 3.5 - fy * 3);
    g.lineTo(px + fy * 3.5 - fx * 3, py - fx * 3.5 - fy * 3);
    g.closePath();
    g.fill();
  }

  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `600 ${Math.round(11 * k)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(t('map.s'), S / 2, 12 * k);
  g.fillText(t('map.n'), S / 2, S - 4 * k);
  g.fillText(t('map.e'), 9 * k, S / 2 + 4 * k);
  g.fillText(t('map.w'), S - 9 * k, S / 2 + 4 * k);
}
