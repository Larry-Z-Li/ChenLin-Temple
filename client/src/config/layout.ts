/**
 * World layout — the single source of truth for where everything is.
 *
 * Axes:  +X = east,  -X = west,  -Z = north,  +Z = south,  +Y = up.
 * The minimap is drawn SOUTH-UP (so east appears on the left).
 * All buildings and statues face SOUTH (+Z). Players spawn in the south and walk north.
 *
 *            (minimap, south at top)
 *                    SPAWN
 *               [ prayer wheels ]
 *               SOUTH HALL (Mañjuśrī)
 *                 MARĪCĪ SHRINE
 *  ORCHARD (E)    CENTER HALL     LOTUS POND (W)
 *              (Five Tathāgatas)
 *   NE Daikokuten   N Cundī   NW Cintāmaṇicakra
 *                 ~ waterfall ~
 */
import type { DeityId } from './deities';

export const BASIN = { x: 0, z: 10, radius: 110 }; // flat valley floor (circle)
export const PLAY_RADIUS = 120; // soft boundary, measured from BASIN center
export const TERRAIN_SIZE = 780;

export const SPAWN = { x: 0, z: 110, yaw: 0 }; // yaw 0 = facing north

/** Height of hall platforms above ground. */
export const PLATFORM_H = 0.6;

export interface HallDef {
  id: string;
  kind: 'hall' | 'shrine';
  nameKey: string;
  x: number;
  z: number;
  /** east–west size */
  width: number;
  /** north–south size */
  depth: number;
  wallHeight: number;
  /** Statues ordered west → east (visitor's left → right when facing the altar). */
  deities: DeityId[];
  frontDoor: boolean;
  backDoor: boolean;
  seats: number;
  /** Thangkas per side wall. */
  thangkas: number;
  roofTiers: 1 | 2;
}

export const HALLS: HallDef[] = [
  {
    id: 'south', kind: 'hall', nameKey: 'hall.south',
    x: 0, z: 62, width: 26, depth: 24, wallHeight: 6.5,
    deities: ['manjushri'], frontDoor: true, backDoor: true, seats: 40, thangkas: 3, roofTiers: 1,
  },
  {
    id: 'marici', kind: 'shrine', nameKey: 'hall.marici',
    x: 0, z: 30, width: 9, depth: 9, wallHeight: 4.2,
    deities: ['marici'], frontDoor: true, backDoor: false, seats: 0, thangkas: 0, roofTiers: 1,
  },
  {
    id: 'center', kind: 'hall', nameKey: 'hall.center',
    x: 0, z: 0, width: 54, depth: 26, wallHeight: 8,
    // ⚠ Placeholder ordering — confirm with your lineage's arrangement.
    deities: ['amitabha', 'amoghasiddhi', 'vairocana', 'ratnasambhava', 'akshobhya'],
    frontDoor: true, backDoor: true, seats: 40, thangkas: 4, roofTiers: 2,
  },
  {
    id: 'northwest', kind: 'hall', nameKey: 'hall.northwest',
    x: -44, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['cintamanicakra'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
  },
  {
    id: 'north', kind: 'hall', nameKey: 'hall.north',
    x: 0, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['cundi'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
  },
  {
    id: 'northeast', kind: 'hall', nameKey: 'hall.northeast',
    x: 44, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['daikokuten'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
  },
];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Stone-paved walkways and courtyards. */
export const PAVED: Rect[] = [
  { minX: -9, maxX: 9, minZ: 102, maxZ: 116 }, // spawn plaza
  { minX: -3, maxX: 3, minZ: 74, maxZ: 102 }, // approach to South Hall
  { minX: -15, maxX: 15, minZ: 13, maxZ: 50 }, // Marīcī courtyard
  { minX: -3, maxX: 3, minZ: -38, maxZ: -13 }, // center → north hall
  { minX: -50, maxX: 50, minZ: -34, maxZ: -28 }, // north cross path
  { minX: -47, maxX: -41, minZ: -38, maxZ: -28 },
  { minX: 41, maxX: 47, minZ: -38, maxZ: -28 },
  { minX: -38.5, maxX: -15, minZ: 19, maxZ: 23 }, // to the lotus pond
  { minX: 15, maxX: 39, minZ: 19, maxZ: 23 }, // to the orchard
];

export const MOUNTAIN_GATE = { x: 0, z: 100, width: 8, height: 6 };

export const POND = { x: -54, z: 21, radius: 15 };

export const ORCHARD: Rect & { spacing: number } = { minX: 41, maxX: 64, minZ: -4, maxZ: 36, spacing: 7.5 };

export const BODHI_TREE = { x: -24, z: 38 };

/** `ravineFrom`: z where the valley floor starts dipping into the ravine below the falls. */
export const WATERFALL = { x: -24, z: -148, width: 11, height: 55, ravineFrom: -76 };

export interface WheelRowDef {
  id: string;
  /** x of the wheel axles */
  x: number;
  zStart: number;
  count: number;
  spacing: number;
  /** Which side the visitor stands on. */
  side: 'east' | 'west';
}

/** Rows of prayer wheels along the approach path and around the Marīcī shrine. */
export const WHEEL_ROWS: WheelRowDef[] = [
  { id: 'aw', x: -4.4, zStart: 84, count: 8, spacing: 1.3, side: 'east' },
  { id: 'ae', x: 4.4, zStart: 84, count: 8, spacing: 1.3, side: 'west' },
  { id: 'mw', x: -9.5, zStart: 25.5, count: 7, spacing: 1.3, side: 'east' },
  { id: 'me', x: 9.5, zStart: 25.5, count: 7, spacing: 1.3, side: 'west' },
];

export interface BenchDef {
  x: number;
  z: number;
  /** Direction the sitter faces (radians): 0 = south, π/2 = east, π = north, −π/2 = west. */
  face: number;
}

const E = Math.PI / 2, W = -Math.PI / 2, N = Math.PI;
/** Benches on a circle, all facing its centre. */
const ring = (cx: number, cz: number, r: number, angles: number[]): BenchDef[] =>
  angles.map((a) => ({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }));

export const BENCHES: BenchDef[] = [
  // spawn plaza
  { x: -7.5, z: 109, face: E }, { x: 7.5, z: 109, face: W },
  // approach, between the prayer-wheel galleries and the cherry trees
  { x: -7.5, z: 97, face: E }, { x: 7.5, z: 97, face: W },
  { x: -7.5, z: 79, face: E }, { x: 7.5, z: 79, face: W },
  // Marīcī courtyard
  { x: -13.5, z: 44, face: E }, { x: 13.5, z: 44, face: W },
  { x: -13.5, z: 16, face: E }, { x: 13.5, z: 16, face: W },
  // under the Bodhi tree
  { x: BODHI_TREE.x + 4, z: BODHI_TREE.z, face: W }, { x: BODHI_TREE.x - 4, z: BODHI_TREE.z, face: E },
  // north path, facing the northern halls
  { x: -22, z: -25, face: N }, { x: 22, z: -25, face: N },
  // orchard edge
  { x: 37.5, z: 10, face: E }, { x: 37.5, z: 30, face: E },
  // around the lotus pond (the path arrives from the east, angle 0)
  ...ring(POND.x, POND.z, POND.radius + 3.5, [0.75, 1.57, 2.4, 3.14, 3.9, 4.71, 5.5]),
];

/**
 * A loose string of ~10 m stupas along the western mountain tops. Bearings are measured from the
 * valley centre (0 = south, −π/2 = west); each stupa sits on a local knoll near that bearing,
 * with irregular spacing so it reads as natural rather than planned.
 */
export const STUPA_RIDGE = { count: 15, bearingFrom: -2.35, bearingTo: -0.75, rMin: 150, rMax: 225, seed: 108 };
