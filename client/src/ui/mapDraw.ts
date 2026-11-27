import { hallHalf, ABBOT, CHERRY_GROVE, GREAT_STUPA, PLAZA, type TravelSpot, DORM, HALLS, MOUNTAIN_GATE, ORCHARD, PAGODAS, POND } from '../config/layout';
import { getLocale, onLocaleChange, t, type I18nKey } from '../i18n';
import { drawLabel, drawStyledMap, labelSpots } from './mapStyles';

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

/** The map's middle (the great stupa) and reach: everything that's on the map, plus a margin. */
const GROUNDS = (() => {
  const pts: [number, number, number][] = [
    ...HALLS.map((h) => [h.x, h.z, Math.max(...hallHalf(h))] as [number, number, number]),
    ...PAGODAS.map((p) => [p.x, p.z, 12] as [number, number, number]),
    [PLAZA.x, PLAZA.z, PLAZA.halfW], [MOUNTAIN_GATE.x, MOUNTAIN_GATE.z, 8], [POND.x, POND.z, POND.radius + 4],
    [(ORCHARD.minX + ORCHARD.maxX) / 2, (ORCHARD.minZ + ORCHARD.maxZ) / 2, (ORCHARD.maxX - ORCHARD.minX) / 2 + 4],
    [(DORM.minX + DORM.maxX) / 2, (DORM.minZ + DORM.maxZ) / 2, 16], [ABBOT.x, ABBOT.z, 8], [CHERRY_GROVE.x, CHERRY_GROVE.z, CHERRY_GROVE.r],
  ];
  // centred on the great stupa, the temple's heart; wide enough to take in everything round it
  const cx = GREAT_STUPA.x, cz = GREAT_STUPA.z;
  const R = Math.max(...pts.map(([x, z, r]) => Math.hypot(x - cx, z - cz) + r)) + 8;
  return { cx, cz, R };
})();

/** World → map pixel mapping for an S×S map (south-up), centred on the grounds. */
export function mapProjector(S: number) {
  const k = S / 200, { cx, cz, R } = GROUNDS;
  const s = (S / 2 - 8 * k) / R;
  return { k, s, cx, cz, R, X: (x: number) => S / 2 - (x - cx) * s, Y: (z: number) => S / 2 - (z - cz) * s };
}

/** The painted map without the moving marks, drawn once per size and language (fonts permitting). */
const bases = new Map<string, HTMLCanvasElement>();
if (typeof document !== 'undefined') void document.fonts?.ready.then(() => bases.clear());
onLocaleChange(() => bases.clear());
/** The map's still part, drawn once at `r` device pixels per CSS pixel (so it's as sharp as the screen it goes on). */
function base(S: number, labels: boolean, r: number) {
  const key = `${S}|${labels}|${r}|${getLocale()}`;
  let c = bases.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = Math.round(S * r);
    const cg = c.getContext('2d')!;
    cg.scale(r, r);
    drawStyledMap(cg, S, 'garden', { labels });
    bases.set(key, c);
  }
  return c;
}

/**
 * The temple map, drawn SOUTH-UP (traditional orientation: south at the top, east on the left)
 * into an S×S square of `g`. screenX = cx − x·s, screenY = cy − z·s.
 */
export function drawTempleMap(g: CanvasRenderingContext2D, S: number, marks: MapMarks = {}) {
  const { k, X, Y } = mapProjector(S); // k: line/dot scale relative to the 200px minimap
  const dot = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  g.drawImage(base(S, !!marks.labels, Math.max(1, g.getTransform().a)), 0, 0, S, S); // (at the screen's own sharpness)

  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(60,40,20,0.8)';
  g.lineWidth = 0.8 * k;
  for (const o of marks.others ?? []) (dot(X(o.x), Y(o.z), 2 * k), g.stroke());

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
    // the hovered destination's plaque lights up (no rings: the plaques are the targets)
    const h = marks.travel.hovered, at = h && labelSpots.get(h.nameKey);
    if (h && at) drawLabel(g, S, 'garden', h.nameKey as I18nKey, at.x, at.z, at.big, true);
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
    g.strokeStyle = 'rgba(90,40,10,0.9)';
    g.lineWidth = 0.9 * k;
    g.stroke();
  }

}
