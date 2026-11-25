import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { lerp, smoothstep } from '../core/math';
import { canvasTexture } from '../core/textures';
import { ridgePlan } from '../world/ridgeWalk';
import { terrainHeight } from '../world/terrain';
import { mat } from './materials';
import { haloPoints, nightGlow } from '../world/nightGlow';
import { addLampAt } from '../world/lightPool';

export interface StupaSpot { x: number; z: number; y: number; yaw: number; s: number }

/*
 * A Kalachakra chörten (Tibetan white stupa): a tall square body with three painted windows a side,
 * a red Tibetan cornice set with white dentils, four stepped tiers, the vase dome (bumpa) bearing the
 * Kalachakra emblem in its flame-arched niche on all four sides, a harmika, and a golden spire of
 * thirteen rings under a parasol, crescent moon, sun disc and jewel.
 *
 * Modelled in design units (the body is 6 du square) and scaled so the whole is STUPA_H metres tall.
 * Everything white, red or painted is one mesh on one small canvas atlas; the gold is a second mesh,
 * the emblem (an image, never drawn in code) a third.
 */

/** Height of the chörten as built, metres; callers scale from this. */
export const STUPA_H = 9.9;
const TOP = 12.3; // finial tip, du
const NORM = STUPA_H / TOP;
const BUMPA_Y = 6.2; // du, where the dome rises from its seat
const JEWEL_Y = 12.1; // du

// ---------------------------------------------------------------------------------------------
// The atlas: horizontal strips (each tiles across the full width) and the window panes.

const A = 512;
const ROWS = { white: [0, 40], red: [40, 64], dentil: [64, 128], lintel: [128, 192], panes: [192, 512] } as const;
const PANE_W = 128, PANE_FRAME = 24;
const C = { white: '#f2eee5', red: '#8a2a1e', redDark: '#5e1a12', gold: '#d8a93e', blue: '#23509c', green: '#2c7a4c', vermilion: '#b8392b', sky: '#3f7fc4' };

let atlas: THREE.Texture | null = null;
function stupaAtlas() {
  if (atlas) return atlas;
  atlas = canvasTexture(A, A, (g) => {
    g.fillStyle = C.white;
    g.fillRect(0, ROWS.white[0], A, ROWS.white[1] - ROWS.white[0]);
    g.fillStyle = C.red;
    g.fillRect(0, ROWS.red[0], A, ROWS.red[1] - ROWS.red[0]);

    // Cornice band: deep red, darker at its edges, a row of white square dentils every 32 px.
    const [d0, d1] = ROWS.dentil;
    g.fillStyle = C.red;
    g.fillRect(0, d0, A, d1 - d0);
    g.fillStyle = C.redDark;
    g.fillRect(0, d0, A, 5);
    g.fillRect(0, d1 - 5, A, 5);
    for (let x = 0; x < A; x += 32) {
      g.fillStyle = 'rgba(30,6,3,0.45)';
      g.fillRect(x + 8, d0 + 24, 20, 20);
      g.fillStyle = C.white;
      g.fillRect(x + 6, d0 + 22, 20, 20);
      g.fillStyle = 'rgba(120,100,80,0.25)';
      g.fillRect(x + 6, d0 + 39, 20, 3);
    }

    // Window lintel: two rows of little blocks in red, green, blue and gold, a red band between.
    const [l0, l1] = ROWS.lintel;
    g.fillStyle = C.redDark;
    g.fillRect(0, l0, A, l1 - l0);
    const blocks = (y: number, h: number, shift: number, cols: string[]) => {
      for (let i = -1; i <= A / 16; i++) {
        g.fillStyle = cols[(i + 4) % 4];
        g.fillRect(i * 16 + shift + 1, y, 14, h);
      }
    };
    blocks(l0 + 4, 19, 0, [C.vermilion, C.green, C.blue, C.gold]);
    g.fillStyle = C.red;
    g.fillRect(0, l0 + 26, A, 11);
    g.fillStyle = C.gold;
    g.fillRect(0, l0 + 30, A, 3);
    blocks(l0 + 40, 19, 8, [C.blue, C.gold, C.vermilion, C.green]);

    // Window panes: a thick red frame, then three painted panels in a gold surround. Abstract only.
    const designs = [
      [[C.blue, 'roundel', C.green], [C.vermilion, 'diamond', C.blue], [C.green, 'roundel', C.vermilion]],
      [[C.green, 'diamond', C.vermilion], [C.blue, 'roundel', C.gold], [C.green, 'diamond', C.vermilion]],
      [[C.vermilion, 'roundel', C.blue], [C.green, 'diamond', C.vermilion], [C.blue, 'roundel', C.green]],
    ] as const;
    designs.forEach((panels, d) => {
      const x0 = d * PANE_W, y0 = ROWS.panes[0], h = ROWS.panes[1] - y0;
      g.fillStyle = C.red;
      g.fillRect(x0, y0, PANE_W, h);
      g.fillStyle = C.redDark;
      g.fillRect(x0 + PANE_FRAME - 4, y0 + PANE_FRAME - 4, PANE_W - 2 * PANE_FRAME + 8, h - 2 * PANE_FRAME + 8);
      const ix = x0 + PANE_FRAME, iy = y0 + PANE_FRAME, iw = PANE_W - 2 * PANE_FRAME, ih = h - 2 * PANE_FRAME;
      g.fillStyle = C.gold;
      g.fillRect(ix, iy, iw, ih);
      const gap = 5, ph = (ih - gap * 4) / 3;
      panels.forEach(([bg, motif, fill], k) => {
        const px = ix + gap, py = iy + gap + k * (ph + gap), pw = iw - 2 * gap, cx = px + pw / 2, cy = py + ph / 2;
        g.fillStyle = bg;
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = 'rgba(255,240,200,0.55)';
        g.lineWidth = 2;
        g.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
        g.fillStyle = C.gold;
        for (const [qx, qy] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) {
          g.beginPath();
          g.arc(qx, qy, 11, 0, Math.PI * 2);
          g.fill();
        }
        const r = Math.min(pw, ph) * 0.34;
        g.beginPath();
        if (motif === 'roundel') g.arc(cx, cy, r, 0, Math.PI * 2);
        else (g.moveTo(cx, cy - r * 1.35), g.lineTo(cx + r, cy), g.lineTo(cx, cy + r * 1.35), g.lineTo(cx - r, cy), g.closePath());
        g.fillStyle = fill;
        g.fill();
        g.lineWidth = 5;
        g.strokeStyle = C.gold;
        g.stroke();
        g.beginPath();
        g.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
        g.fillStyle = C.gold;
        g.fill();
      });
    });
  });
  atlas.wrapS = THREE.RepeatWrapping;
  atlas.anisotropy = 8;
  return atlas;
}

type Rows = readonly [number, number];
type Paint =
  | { k: 'solid'; rows: Rows }
  /** Repeats along the face; `period` px of pattern, kept square to the strip's height. */
  | { k: 'strip'; rows: Rows; period: number }
  | { k: 'rect'; x0: number; x1: number; rows: Rows };

const WHITE: Paint = { k: 'solid', rows: ROWS.white };
const RED: Paint = { k: 'solid', rows: ROWS.red };
const DENTIL: Paint = { k: 'strip', rows: ROWS.dentil, period: 32 };
const LINTEL: Paint = { k: 'strip', rows: ROWS.lintel, period: 64 };
const pane = (design: number, inner: boolean): Paint => {
  const i = inner ? PANE_FRAME : 0, x0 = design * PANE_W;
  return { k: 'rect', x0: x0 + i, x1: x0 + PANE_W - i, rows: [ROWS.panes[0] + i, ROWS.panes[1] - i] };
};

/** Atlas uv for a point at (s, q) ∈ [0,1]² on a face `w` wide and `h` tall. */
function atlasUv(p: Paint, s: number, q: number, w: number, h: number): [number, number] {
  const [r0, r1] = p.rows;
  if (p.k === 'solid') return [0.5, 1 - (r0 + r1) / 2 / A]; // constant uv: sampled at full resolution
  const v = 1 - (r1 - 0.5 - q * (r1 - r0 - 1)) / A;
  if (p.k === 'rect') return [(p.x0 + s * (p.x1 - p.x0)) / A, v];
  const n = Math.max(1, Math.round(w / ((h * p.period) / (r1 - r0))));
  return [(s * n * p.period) / A, v];
}

interface BoxPaint { side: Paint; top?: Paint; bottom?: Paint; front?: Paint }
const ALL_WHITE: BoxPaint = { side: WHITE, top: WHITE, bottom: WHITE };
const ALL_RED: BoxPaint = { side: RED, top: RED, bottom: RED };
const BAND: BoxPaint = { side: DENTIL, top: WHITE, bottom: RED };

/** A box centred on the origin with its faces painted from the atlas (`front` is the +z face). */
function paintedBox(w: number, h: number, d: number, p: BoxPaint) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    let res: [number, number];
    if (ny > 0.5) res = atlasUv(p.top ?? WHITE, 0, 0, 1, 1);
    else if (ny < -0.5) res = atlasUv(p.bottom ?? RED, 0, 0, 1, 1);
    else {
      const facingZ = Math.abs(nz) > 0.5, fw = facingZ ? w : d;
      const along = nz > 0.5 ? x : nz < -0.5 ? -x : nx > 0.5 ? -z : z; // left to right, seen from outside
      res = atlasUv(nz > 0.5 && p.front ? p.front : p.side, along / fw + 0.5, y / h + 0.5, fw, h);
    }
    uv.setXY(i, res[0], res[1]);
  }
  return g;
}

/** Square slab `w` wide from height y up. */
const slab = (w: number, h: number, y: number, p: BoxPaint) => paintedBox(w, h, w, p).translate(0, y + h / 2, 0);

/** Paint a whole geometry one flat atlas colour. */
function solid(g: THREE.BufferGeometry, p: Paint) {
  const uv = g.attributes.uv, [u, v] = atlasUv(p, 0, 0, 1, 1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

/** A short drum whose side carries the dentil band. */
function dentilDrum(r: number, h: number, y: number, seg: number) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  const nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const res = Math.abs(nor.getY(i)) > 0.5 ? atlasUv(WHITE, 0, 0, 1, 1) : atlasUv(DENTIL, uv.getX(i), uv.getY(i), Math.PI * 2 * r, h);
    uv.setXY(i, res[0], res[1]);
  }
  return g.translate(0, y + h / 2, 0);
}

/** Windows on the +z face of a wall standing at z = 0: a painted pane in a proud red frame, a lintel of coloured blocks. */
function windowParts(cx: number, design: number, full: boolean) {
  const W = 0.8, H = 2.0, y0 = 0.72;
  const proud = (w: number, h: number, depth: number, y: number, p: BoxPaint) => paintedBox(w, h, depth + 0.06, p).translate(cx, y + h / 2, (depth - 0.06) / 2);
  const parts: THREE.BufferGeometry[] = [];
  if (full) {
    const b = 0.15;
    parts.push(proud(W - 2 * b, H - 2 * b, 0.07, y0 + b, { ...ALL_RED, front: pane(design, true) }));
    for (const s of [-1, 1]) parts.push(proud(b, H, 0.16, y0, ALL_RED).translate((s * (W - b)) / 2, 0, 0));
    for (const y of [y0, y0 + H - b]) parts.push(proud(W - 2 * b, b, 0.16, y, ALL_RED));
    parts.push(proud(W + 0.16, 0.08, 0.22, y0 - 0.08, ALL_RED)); // sill
  } else {
    parts.push(proud(W, H, 0.1, y0, { ...ALL_RED, front: pane(design, false) }));
  }
  parts.push(proud(W + 0.32, 0.26, 0.26, y0 + H, { side: LINTEL, top: RED, bottom: RED }));
  return parts;
}

/** The dome's outline, [radius, height above its seat] (du): nearly upright, widening to the shoulder, then rounded. */
const BUMPA: [number, number][] = [
  [1.36, 0], [1.38, 0.2], [1.42, 0.6], [1.47, 1.0], [1.52, 1.35], [1.55, 1.6], [1.55, 1.72], [1.5, 1.92],
  [1.38, 2.1], [1.18, 2.25], [0.9, 2.36], [0.55, 2.43], [0.001, 2.46],
];
const bumpaR = (y: number) => {
  for (let i = 1; i < BUMPA.length; i++) {
    const [r0, y0] = BUMPA[i - 1], [r1, y1] = BUMPA[i];
    if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return 0;
};

/** Four copies of the Kalachakra niche (an image), each bent round the dome on one side. */
function emblemGeometry(seg: number) {
  const H = 1.72, W = H * (170 / 231), y0 = 0.08, off = 1.55 * (1 - Math.cos(Math.PI / seg)) + 0.02;
  const rRef = bumpaR(y0 + H / 2) + off;
  const quads: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.PlaneGeometry(1, 1, 8, 10);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i), y = y0 + v * H, r = bumpaR(y) + off, a = (k * Math.PI) / 2 + ((u - 0.5) * W) / rRef;
      pos.setXYZ(i, Math.sin(a) * r, BUMPA_Y + y, Math.cos(a) * r);
    }
    g.computeVertexNormals();
    quads.push(g);
  }
  return quads;
}

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
const disc = (rt: number, rb: number, h: number, y: number, seg: number) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y + h / 2, 0);

type Detail = 'full' | 'lite';
const geoCache = new Map<Detail, ReturnType<typeof buildGeometries>>();
/** `full` for the great stupa and 多寶塔; `lite` (plainer windows, fewer segments) for the many small ones. */
function stupaGeometries(detail: Detail) {
  let g = geoCache.get(detail);
  if (!g) geoCache.set(detail, (g = buildGeometries(detail === 'full')));
  return g;
}

function buildGeometries(full: boolean) {
  const seg = full ? 36 : 20, ringSeg = full ? 20 : 12;
  const body: THREE.BufferGeometry[] = [
    slab(6.12, 0.14, 0, ALL_WHITE), // footing
    slab(6.0, 3.26, 0.14, ALL_WHITE), // the body, to 3.4
    // cornice: two red bands of dentils, a white moulding between, a white cap
    slab(6.16, 0.22, 3.4, BAND),
    slab(6.26, 0.06, 3.62, ALL_WHITE),
    slab(6.42, 0.26, 3.68, BAND),
    slab(6.62, 0.14, 3.94, ALL_WHITE),
  ];
  // four stepped tiers, each with a dentil band along its top edge
  let y = 4.08;
  for (const w of [5.3, 4.65, 4.0, 3.35]) {
    body.push(slab(w, 0.39, y, ALL_WHITE), slab(w + 0.04, 0.11, y + 0.39, BAND));
    y += 0.5;
  }
  body.push(dentilDrum(1.62, 0.12, y, seg)); // the dome's seat, to BUMPA_Y
  body.push(solid(new THREE.LatheGeometry(BUMPA.map(([r, h]) => new THREE.Vector2(r, h)), seg), WHITE).translate(0, BUMPA_Y, 0));
  // harmika
  body.push(slab(1.15, 0.55, 8.5, ALL_WHITE), slab(1.19, 0.1, 9.05, BAND), slab(1.4, 0.12, 9.15, ALL_WHITE));
  // windows: three on each side
  for (let k = 0; k < 4; k++)
    for (let i = 0; i < 3; i++) for (const p of windowParts((i - 1) * 1.75, i, full)) body.push(p.translate(0, 0, 3.0).rotateY((k * Math.PI) / 2));

  // the gold: thirteen rings on a lotus seat, the parasol with its hangings, moon, sun and jewel
  const gold: THREE.BufferGeometry[] = [disc(0.62, 0.7, 0.1, 9.27, ringSeg), disc(0.12, 0.24, 1.72, 9.37, 10)];
  for (let i = 0; i < 13; i++) {
    const r = lerp(0.6, 0.27, i / 12);
    gold.push(disc(r * 0.8, r, 0.085, 9.37 + i * 0.13, ringSeg));
  }
  gold.push(disc(0.74, 0.74, 0.09, 11.07, ringSeg), new THREE.ConeGeometry(0.76, 0.3, ringSeg).translate(0, 11.31, 0));
  const hangings = full ? 16 : 8;
  for (let i = 0; i < hangings; i++) {
    const a = ((i + 0.5) / hangings) * Math.PI * 2;
    gold.push(new THREE.ConeGeometry(0.035, 0.2, 5).rotateX(Math.PI).translate(Math.sin(a) * 0.7, 10.97, Math.cos(a) * 0.7));
  }
  gold.push(
    disc(0.04, 0.05, 0.3, 11.38, 8),
    new THREE.TorusGeometry(0.2, 0.05, 6, 16, Math.PI).rotateZ(Math.PI).translate(0, 11.85, 0), // crescent moon, cupped upward
    new THREE.SphereGeometry(0.13, 16, 10).scale(1, 1, 0.45).translate(0, 11.87, 0), // sun disc
    new THREE.SphereGeometry(0.09, 12, 8).translate(0, JEWEL_Y, 0), // jewel, drawn up to a flame point
    new THREE.ConeGeometry(0.08, 0.22, 12).translate(0, JEWEL_Y + 0.09, 0),
  );

  const scaled = (g: THREE.BufferGeometry) => g.scale(NORM, NORM, NORM);
  return {
    stone: scaled(paintedBox(7.9, 9.9, 7.9, ALL_WHITE).translate(0, -9.9 / 2, 0)), // terrace under the base, deep enough for steep slopes
    body: scaled(merge(body)),
    gold: scaled(merge(gold)),
    emblem: scaled(merge(emblemGeometry(seg))),
  };
}

let mats: { stone: THREE.Material; body: THREE.MeshStandardMaterial; gold: THREE.Material; emblem: THREE.MeshStandardMaterial } | null = null;
function stupaMaterials() {
  if (mats) return mats;
  const map = stupaAtlas();
  // After dark the whitewash glows warm.
  const body = new THREE.MeshStandardMaterial({ map, roughness: 0.85, emissive: 0xffd9a0, emissiveMap: map, emissiveIntensity: 0 });
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/stupa/kalachakra.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const emblem = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  nightGlow.track((n) => {
    body.emissiveIntensity = 0.62 * n;
    emblem.emissiveIntensity = 0.3 * n;
  });
  return (mats = { stone: mat(0x8f8a80, { roughness: 1 }), body, gold: mat(THEME.goldLeaf, { metalness: 0.8, roughness: 0.3 }), emblem });
}

// ---------------------------------------------------------------------------------------------
// Uplights (the great stupa): small projectors round the foot of the body that wash the walls after dark

/** Where the projectors stand along each wall (du from its centre line): between the windows and near the corners. */
const UPLIGHT_ALONG = [-2.6, -0.875, 0.875, 2.6];
const UPLIGHT_OUT = 3.0 + 0.5; // du from the centre: half a du in front of the wall
const UP_LEVEL = { value: 0 };
nightGlow.track((n) => (UP_LEVEL.value = smoothstep(0.15, 0.6, n)));

const glsl = (x: number) => x.toFixed(4);
/**
 * The body's material with the uplights' light painted on: a fan of warm light rising from each
 * projector up the wall to the cornice (brightest low, spreading and fading as it climbs), the
 * undersides of the cornice caught too, and a softer wash up the tiers and the dome. Emissive, so it
 * costs nothing like real lights; it keeps the lamplight every standard material gets.
 */
function uplitMaterial(base: THREE.MeshStandardMaterial) {
  const m = base.clone();
  const nightLight = THREE.MeshStandardMaterial.prototype.onBeforeCompile;
  const fix = UPLIGHT_ALONG.map((a) => glsl(a * NORM)).join(', ');
  const corniceTop = glsl(4.08 * NORM), domeTop = glsl((BUMPA_Y + 2.46) * NORM);
  m.onBeforeCompile = (shader, renderer) => {
    nightLight.call(m, shader, renderer);
    shader.uniforms.upLevel = UP_LEVEL;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUpPos;\nvarying vec3 vUpN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvUpPos = transformed;\n\tvUpN = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUpPos;\nvarying vec3 vUpN;\nuniform float upLevel;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	if ( upLevel > 0.001 ) {
		vec3 up = vUpPos, un = normalize( vUpN );
		float upLit = 0.0;
		if ( un.y < 0.5 && up.y < ${corniceTop} ) {
			// the wall this point belongs to, and how squarely it faces out of it (cornice undersides count)
			bool onX = abs( up.x ) > abs( up.z );
			float along = onX ? up.z : up.x;
			float facing = un.y < -0.5 ? 1.0 : ( onX ? un.x * sign( up.x ) : un.z * sign( up.z ) );
			float fan = 0.0;
			float fixAt[ 4 ] = float[ 4 ]( ${fix} );
			for ( int i = 0; i < 4; i ++ ) {
				float spread = 0.05 + up.y * 0.42;
				fan += 1.0 - smoothstep( 0.25, 1.0, abs( along - fixAt[ i ] ) / spread );
			}
			upLit = min( fan, 1.4 ) * smoothstep( 0.0, 0.5, facing ) * smoothstep( -0.02, 0.18, up.y ) * mix( 1.5, 0.22, smoothstep( 0.0, ${corniceTop}, up.y ) );
		} else if ( un.y < 0.5 ) {
			float facing = dot( normalize( un.xz + 1e-4 ), normalize( up.xz + 1e-4 ) );
			upLit = 0.32 * smoothstep( 0.0, 0.6, facing ) * ( 1.0 - smoothstep( ${corniceTop}, ${domeTop}, up.y ) );
		}
		totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.84, 0.62 ) * ( upLit * upLevel );
	}`,
      );
  };
  m.customProgramCacheKey = () => 'stupaUplit';
  return m;
}

let uplit: THREE.MeshStandardMaterial | null = null;


/**
 * A chörten `height` metres tall as a plain group (the great stupa, 多寶塔, the pond pavilion's).
 * `uplit`: projectors round its foot wash it with light after dark (register their glow on the
 * ground with `lightStupaBase` once it's placed).
 */
export function smallStupa(height: number, opts: { uplit?: boolean } = {}) {
  const geos = stupaGeometries(height >= 6 ? 'full' : 'lite'), m = stupaMaterials(), k = height / STUPA_H;
  const g = new THREE.Group();
  const bodyMat = opts.uplit ? (uplit ??= (() => {
    const u = uplitMaterial(m.body);
    nightGlow.track((n) => (u.emissiveIntensity = 0.06 * n)); // little all-over glow, so the light from below reads
    return u;
  })()) : m.body;
  const body = new THREE.Mesh(geos.body, bodyMat), gold = new THREE.Mesh(geos.gold, m.gold), emblem = new THREE.Mesh(geos.emblem, m.emblem);
  body.castShadow = body.receiveShadow = gold.castShadow = gold.receiveShadow = emblem.receiveShadow = true;
  g.add(body, gold, emblem);
  // (no projector housings drawn at the foot: the light just washes up the walls)
  g.scale.setScalar(k);
  return g;
}

/** Pools of light on the platform round an uplit stupa's projectors (call once it is in place, before the night lights are built). */
export function lightStupaBase(stupa: THREE.Object3D) {
  for (let side = 0; side < 4; side++)
    for (const a of UPLIGHT_ALONG) {
      const p = new THREE.Vector3(a * NORM, 0.05, UPLIGHT_OUT * NORM).applyAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2);
      addLampAt(stupa, { color: 0xffd9a8, intensity: 0, range: 2.4, ground: true }, p);
    }
}

export function buildStupas(ctx: WorldContext) {
  // Placed by the ridge plan; they stand on its level terrace (the stone foundation covers any edge).
  const spots: StupaSpot[] = ridgePlan().stupas.map((p) => {
    let y = terrainHeight(p.x, p.z);
    for (let k = 0; k < 12; k++) y = Math.max(y, terrainHeight(p.x + Math.cos(k * 0.5236) * 3.1 * p.s, p.z + Math.sin(k * 0.5236) * 3.1 * p.s));
    return { ...p, y: y + 0.05 };
  });

  const geos = stupaGeometries('lite'), mats = stupaMaterials();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const key of ['stone', 'body', 'gold', 'emblem'] as const) {
    const mesh = new THREE.InstancedMesh(geos[key], mats[key], spots.length);
    spots.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(p.s, p.s, p.s))));
    mesh.castShadow = key !== 'emblem';
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    ctx.scene.add(mesh);
  }
  // After dark each chörten wears a soft halo, and a spark at its jewel.
  const pos: number[] = [], col: number[] = [], spark: number[] = [], sparkCol: number[] = [];
  for (const p of spots) {
    pos.push(p.x, p.y + 4 * p.s, p.z);
    col.push(1, 0.82, 0.55);
    spark.push(p.x, p.y + JEWEL_Y * NORM * p.s, p.z);
    sparkCol.push(1, 0.9, 0.6);
  }
  ctx.scene.add(haloPoints(pos, col, 16, 0.55), haloPoints(spark, sparkCol, 3.5, 0.9));
  return spots;
}
