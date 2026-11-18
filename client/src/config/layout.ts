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
 *  ORCHARD (E)    CENTER HALL     LOTUS POND (W) ~~ stream ~~ waterfall (W mountains)
 *              (Five Tathāgatas)
 *   NE Daikokuten   N Cundī   NW Cintāmaṇicakra
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
  /**
   * Column couplet (楹聯) beside the door: [right column (上聯), left column (下聯)], read top to bottom.
   * Placeholder compositions; replace with your lineage's texts.
   */
  couplet?: [string, string];
}

export const HALLS: HallDef[] = [
  {
    id: 'south', kind: 'hall', nameKey: 'hall.south',
    x: 0, z: 62, width: 26, depth: 24, wallHeight: 6.5,
    deities: ['manjushri'], frontDoor: true, backDoor: true, seats: 40, thangkas: 3, roofTiers: 1,
    couplet: ['妙德慈光開智慧', '吉祥法雨潤群生'],
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
    couplet: ['五智圓明周法界', '一心清淨即蓮邦'],
  },
  {
    id: 'northwest', kind: 'hall', nameKey: 'hall.northwest',
    x: -44, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['cintamanicakra'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
    couplet: ['寶珠如意隨心滿', '慈航普渡出迷津'],
  },
  {
    id: 'north', kind: 'hall', nameKey: 'hall.north',
    x: 0, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['cundi'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
    couplet: ['準提神咒消災障', '佛母慈心護眾生'],
  },
  {
    id: 'northeast', kind: 'hall', nameKey: 'hall.northeast',
    x: 44, z: -50, width: 24, depth: 24, wallHeight: 6.5,
    deities: ['daikokuten'], frontDoor: true, backDoor: false, seats: 40, thangkas: 3, roofTiers: 1,
    couplet: ['福德莊嚴資道業', '慈悲護法佑僧伽'],
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

export const MOUNTAIN_GATE = { x: 0, z: 100, width: 8, height: 6, couplet: ['佛日增輝光普照', '法輪常轉道恆昌'] as [string, string] };

export const POND = { x: -54, z: 21, radius: 15 };

export const ORCHARD: Rect & { spacing: number } = { minX: 41, maxX: 64, minZ: -4, maxZ: 36, spacing: 7.5 };

export const BODHI_TREE = { x: -24, z: 38 };

/** Waterfall in the western mountains, facing east toward the temple. */
export const WATERFALL = { x: -146, z: 18, width: 10, height: 48 };

/**
 * Stream from the foot of the falls down to the lotus pond (x, z), first point at the falls.
 * Terrain is carved along it: a ravine through the slope, then a shallow swale across the valley.
 */
export const STREAM: [number, number][] = [
  [-144, 18], [-131, 21], [-119, 16], [-107, 19], [-95, 24], [-83, 20], [-73, 21], [-66.5, 21],
];

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
  // around the lotus pond (path arrives from the east at angle 0, the stream from the west at π)
  ...ring(POND.x, POND.z, POND.radius + 3.5, [0.75, 1.57, 2.3, 3.95, 4.71, 5.5]),
];

/**
 * A loose string of ~10 m stupas along the western mountain tops. Bearings are measured from the
 * valley centre (0 = south, −π/2 = west); each stupa sits on a local knoll near that bearing,
 * with irregular spacing so it reads as natural rather than planned.
 */
export const STUPA_RIDGE = { count: 15, bearingFrom: -2.35, bearingTo: -0.75, rMin: 150, rMax: 225, seed: 108 };

/** A prayer-flag anchor: (x, z) and height above the ground there; `pole` puts a wooden pole under it. */
export interface FlagAnchor { x: number; z: number; h: number; pole?: boolean }

const pole = (x: number, z: number, h = 5): FlagAnchor => ({ x, z, h, pole: true });
const pondPoles = [0.4, 1.95, 2.75, 3.55, 4.3, 5.9].map((a) => pole(POND.x + Math.cos(a) * (POND.radius + 6.5), POND.z + Math.sin(a) * (POND.radius + 6.5), 5.5));

/** Strings of prayer flags in the temple grounds (the ridge strings between stupas are added automatically). */
export const FLAG_LINES: [FlagAnchor, FlagAnchor][] = [
  // across the approach just inside the mountain gate
  [pole(-9.6, 97), pole(9.6, 97)],
  // a ring around the lotus pond, crossing the path and the stream
  ...pondPoles.map((p, i) => [p, pondPoles[(i + 1) % pondPoles.length]] as [FlagAnchor, FlagAnchor]),
  // radiating from the Marīcī shrine roof to the courtyard corners
  ...[pole(-14.5, 20, 4.5), pole(14.5, 20, 4.5), pole(-14.5, 40, 4.5), pole(14.5, 40, 4.5)].map((p) => [{ x: 0, z: 30, h: 9.6 }, p] as [FlagAnchor, FlagAnchor]),
  // from the Bodhi tree's crown
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 7, BODHI_TREE.z + 7, 4.5)],
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 7, BODHI_TREE.z - 7, 4.5)],
  // across the ravine below the waterfall
  [pole(WATERFALL.x + 16, WATERFALL.z - 14, 6), pole(WATERFALL.x + 16, WATERFALL.z + 16, 6)],
  // along the north path between the northern halls
  [pole(-29.5, -35, 5), pole(-14.5, -35, 5)],
  [pole(14.5, -35, 5), pole(29.5, -35, 5)],
];

/**
 * Cloud rides: a cloud bobs to the right of the entrance and another just right of the
 * Cundī hall's front steps; each carries you to the other along a scenic route.
 */
export const CLOUD_STATIONS = {
  gate: { x: 6, z: 103.5 },
  cundi: { x: 9, z: -31.5 },
};

/**
 * Fast travel (~5 s): waypoints (x, height, z) from the gate to Cundī; the return flies it backwards.
 * One swooping arc that peaks over the courtyard for a view of the whole temple, pond and waterfall.
 */
export const CLOUD_ROUTE: [number, number, number][] = [
  [8.5, 8, 99], // lift off beside the mountain gate
  [0, 24, 76], // over the Hall of Mañjuśrī
  [-12, 40, 46],
  [-14, 46, 10], // peak above the courtyard
  [-4, 32, -16], // over the Hall of the Five Tathāgatas
  [6, 12, -25], // glide down to Cundī
];
export const CLOUD_RIDE_SECONDS = 5;

/** Stone lanterns (石燈籠) along the paths. */
export const STONE_LANTERNS: [number, number][] = [
  [-3.8, 77], [3.8, 77], [-3.8, 81], [3.8, 81], [-3.8, 98], [3.8, 98], // approach
  [-14.3, 26], [14.3, 26], [-14.3, 34], [14.3, 34], // Marīcī courtyard
  [-5.5, 17.6], [5.5, 17.6], // before the Hall of the Five Tathāgatas
  [-20, 24.3], [-32, 24.3], [20, 24.3], [32, 24.3], // paths to the pond and orchard
  [-36, -26.6], [-8, -26.6], [8, -26.6], [36, -26.6], // north path
  [-87.7, 13.6], [-84.3, 28.4], // ends of the stream bridge
];

/** Large bronze incense burner (香爐) on the axis between the Hall of Mañjuśrī and the Marīcī shrine, with its incense table. */
export const INCENSE_BURNER = { x: 0, z: 41.4, tableZ: 43.4, standZ: 44.4 };

/** Arched stone bridge over the stream (runs north–south across it). */
export const BRIDGE = { x: -86, z0: 15, z1: 27, width: 2.6, rise: 1.15 };

/** Stone tablet (石碑) at the mountain gate, facing arriving visitors. */
export const STELE = { x: -7, z: 104 };
