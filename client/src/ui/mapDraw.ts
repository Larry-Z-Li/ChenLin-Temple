import { hallHalf, ABBOT, PLAZA, type TravelSpot, BASIN, BODHI_TREE, DORM, FOOT_BRIDGES, FOOTPATHS, GREAT_STUPA, HALLS, MOUNTAIN_GATE, ORCHARD, PAGODAS, PAVED, PLAY_RADIUS, POND, RIVERS, STUPA_COURT, WHEEL_ROWS } from '../config/layout';
import { t, type I18nKey } from '../i18n';

export interface MapMarks {
  me?: { x: number; z: number; yaw: number };
  others?: { x: number; z: number }[];
  /** "You are here" pin (the map board). */
  here?: { x: number; z: number };
  /** Place names (big map and board). */
  labels?: boolean;
  /** Fast-travel mode: gold rings on every destination, the hovered one highlighted. */
  travel?: { spots: TravelSpot[]; hovered: TravelSpot | null };
}

/** World → map pixel mapping for an S×S map (south-up). */
export function mapProjector(S: number) {
  const k = S / 200;
  const s = (S / 2 - 8 * k) / PLAY_RADIUS;
  const cx = S / 2 + BASIN.x * s, cy = S / 2 + BASIN.z * s;
  return { k, s, X: (x: number) => cx - x * s, Y: (z: number) => cy - z * s };
}

/**
 * The temple map, drawn SOUTH-UP (traditional orientation: south at the top, east on the left)
 * into an S×S square of `g`. screenX = cx − x·s, screenY = cy − z·s.
 */
export function drawTempleMap(g: CanvasRenderingContext2D, S: number, marks: MapMarks = {}) {
  const { k, s, X, Y } = mapProjector(S); // k: line/dot scale relative to the 200px minimap
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

  g.strokeStyle = 'rgba(205,195,170,0.85)';
  g.lineWidth = 1.4 * k;
  for (const p of FOOTPATHS) {
    g.beginPath();
    p.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.stroke();
  }
  g.fillStyle = '#a3291f';
  for (const b of FOOT_BRIDGES) {
    const [w, d] = b.axis === 'x' ? [b.length, 2.4] : [2.4, b.length];
    g.fillRect(X(b.x + w / 2), Y(b.z + d / 2), w * s, d * s);
  }
  // Abbot's and monks' quarters
  g.fillStyle = '#8e2b1f';
  g.fillRect(X(ABBOT.x) - 4.5 * s, Y(ABBOT.z) - 3.5 * s, 9 * s, 7 * s);
  const d = DORM;
  for (const [x0, x1, z0, z1] of [[d.minX, d.maxX, d.minZ, d.minZ + d.wing], [d.minX, d.maxX, d.maxZ - d.wing, d.maxZ], [d.maxX - d.wing, d.maxX, d.minZ, d.maxZ]])
    g.fillRect(X(x1), Y(z1), (x1 - x0) * s, (z1 - z0) * s);
  // Pagodas
  g.fillStyle = '#c9b48a';
  for (const p of PAGODAS) dot(X(p.x), Y(p.z), (p.stories ? 4 : 6) * s);

  g.fillStyle = 'rgba(190,182,166,0.92)';
  for (const r of PAVED) g.fillRect(X(r.maxX), Y(r.maxZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s);

  g.fillStyle = '#4c8fa3';
  dot(X(POND.x), Y(POND.z), POND.radius * s);

  g.fillStyle = 'rgba(232,140,40,0.75)';
  for (let z = ORCHARD.minZ; z <= ORCHARD.maxZ; z += ORCHARD.spacing) for (let x = ORCHARD.minX; x <= ORCHARD.maxX; x += ORCHARD.spacing) dot(X(x), Y(z), 1.3 * k);

  g.fillStyle = 'rgba(80,140,60,0.95)';
  dot(X(BODHI_TREE.x), Y(BODHI_TREE.z), 3 * k);
  g.fillStyle = '#a3291f';

  g.fillStyle = '#d9a441';
  for (const w of WHEEL_ROWS) g.fillRect(X(w.x) - k, Y(w.zStart + (w.count - 1) * w.spacing), 2 * k, (w.count - 1) * w.spacing * s);

  // The stupa court (walls) and the great stupa
  const sc = STUPA_COURT;
  g.strokeStyle = '#efe6d2';
  g.lineWidth = 1.6 * k;
  g.strokeRect(X(sc.x + sc.half), Y(sc.z + sc.half), sc.half * 2 * s, sc.half * 2 * s);
  g.fillStyle = '#f4efe2';
  dot(X(GREAT_STUPA.x), Y(GREAT_STUPA.z), (GREAT_STUPA.base / 2) * s);
  g.fillStyle = '#d4af37';
  dot(X(GREAT_STUPA.x), Y(GREAT_STUPA.z), 2.2 * s);
  for (const hall of HALLS) {
    g.fillStyle = hall.kind === 'shrine' ? '#b0473a' : '#8e2b1f';
    const [hx, hz] = hallHalf(hall);
    g.fillRect(X(hall.x + hx), Y(hall.z + hz), hx * 2 * s, hz * 2 * s);
  }
  g.fillStyle = '#a3291f';
  g.fillRect(X(MOUNTAIN_GATE.x + MOUNTAIN_GATE.width / 2), Y(MOUNTAIN_GATE.z) - k, MOUNTAIN_GATE.width * s, 2.5 * k);

  if (marks.labels) {
    const label = (key: I18nKey, x: number, z: number, dy = 0) => {
      g.font = `600 ${Math.round(6.8 * k)}px "Noto Serif TC", "Songti TC", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3 * k;
      g.strokeStyle = 'rgba(20,14,10,0.85)';
      g.fillStyle = '#f6ecd8';
      g.strokeText(t(key), X(x), Y(z) + dy * k);
      g.fillText(t(key), X(x), Y(z) + dy * k);
    };
    for (const hall of HALLS) label(hall.nameKey as I18nKey, hall.x, hall.z, hall.kind === 'shrine' ? -10 : 0);
    label('map.stupa', GREAT_STUPA.x, GREAT_STUPA.z);
    // pagoda names sit on the far side of each pagoda, away from the halls
    for (const p of PAGODAS) {
      const dx = p.x - GREAT_STUPA.x, dz = p.z - GREAT_STUPA.z, l = Math.hypot(dx, dz) || 1;
      label(p.nameKey as I18nKey, p.x + (dx / l) * 10, p.z + (dz / l) * 10);
    }
    label('map.abbot', ABBOT.x, ABBOT.z);
    label('map.dorm', (DORM.minX + DORM.maxX) / 2, (DORM.minZ + DORM.maxZ) / 2);
    label('map.plaza', PLAZA.x, PLAZA.z);
    label('map.pond', POND.x, POND.z);
    label('map.orchard', (ORCHARD.minX + ORCHARD.maxX) / 2, (ORCHARD.minZ + ORCHARD.maxZ) / 2);
    label('map.bodhi', BODHI_TREE.x, BODHI_TREE.z, 7);
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

  if (marks.travel) {
    for (const spot of marks.travel.spots) {
      const on = spot === marks.travel.hovered;
      g.strokeStyle = on ? '#fff3c4' : 'rgba(217,164,65,0.95)';
      g.lineWidth = (on ? 2.6 : 1.6) * k;
      g.beginPath();
      g.arc(X(spot.at.x), Y(spot.at.z), (on ? 6.5 : 4.5) * k, 0, Math.PI * 2);
      g.stroke();
    }
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
