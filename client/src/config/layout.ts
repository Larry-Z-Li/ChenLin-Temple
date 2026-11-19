/**
 * World layout — the single source of truth for where everything is.
 *
 * Axes:  +X = east,  -X = west,  -Z = north,  +Z = south,  +Y = up.
 * The minimap is drawn SOUTH-UP (so east appears on the left).
 * All buildings and statues face SOUTH (+Z). Players spawn in the south and walk north.
 *
 *            (minimap, south at top)
 *                    SPAWN · gate
 *        [ lantern canopy + prayer wheels ]
 *     rock garden               wish lanterns
 *               COURTYARD (incense burner)
 *  ORCHARD (E)                      LOTUS POND (W) ~~ stream ~~ waterfall
 *           HALL OF THE FIVE TATHĀGATAS (N)
 *     bamboo grove (NE)         tea corner (NW)
 */
import type { DeityId } from './deities';

export const BASIN = { x: 0, z: 10, radius: 110 }; // flat valley floor (circle)
export const PLAY_RADIUS = 120; // soft boundary, measured from BASIN center
export const TERRAIN_SIZE = 780;

export const SPAWN = { x: 0, z: 55, yaw: 0 }; // yaw 0 = facing north

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

/** One temple: the Hall of the Five Tathāgatas at the north end of the courtyard. */
export const HALLS: HallDef[] = [
  {
    id: 'center', kind: 'hall', nameKey: 'hall.center',
    x: 0, z: -26, width: 54, depth: 26, wallHeight: 8,
    // ⚠ Placeholder ordering — confirm with your lineage's arrangement.
    deities: ['amitabha', 'amoghasiddhi', 'vairocana', 'ratnasambhava', 'akshobhya'],
    frontDoor: true, backDoor: true, seats: 60, thangkas: 4, roofTiers: 2,
    couplet: ['五智圓明周法界', '一心清淨即蓮邦'],
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
  { minX: -9, maxX: 9, minZ: 48, maxZ: 61 }, // spawn plaza
  { minX: -3, maxX: 3, minZ: 18, maxZ: 48 }, // the approach
  { minX: -15, maxX: 15, minZ: -13, maxZ: 18 }, // courtyard before the hall
  { minX: -35.5, maxX: -15, minZ: 0, maxZ: 4 }, // to the lotus pond
  { minX: 15, maxX: 35, minZ: 0, maxZ: 4 }, // to the orchard
];

export const MOUNTAIN_GATE = { x: 0, z: 47, width: 8, height: 6, couplet: ['佛日增輝光普照', '法輪常轉道恆昌'] as [string, string] };

export const POND = { x: -50.5, z: 2, radius: 15 };

export const ORCHARD: Rect & { spacing: number } = { minX: 37, maxX: 59.5, minZ: -22, maxZ: 15.5, spacing: 7.5 };

export const BODHI_TREE = { x: -24, z: 12 };

/** Waterfall in the western mountains, facing east toward the temple. */
export const WATERFALL = { x: -146, z: 18, width: 10, height: 48 };

/**
 * Stream from the foot of the falls down to the lotus pond (x, z), first point at the falls.
 * Terrain is carved along it: a ravine through the slope, then a shallow swale across the valley.
 */
export const STREAM: [number, number][] = [
  [-144, 18], [-131, 21], [-119, 16], [-107, 14], [-95, 10], [-84, 6], [-74, 4], [-66, 2.5],
];

/**
 * All rivers, upstream first. The falls stream feeds the pond; the west river leaves the pond to the
 * south; the east river comes down a gorge from the north-east mountains, runs south past the orchard
 * and joins the west river below the spawn; together they leave the valley through a southern gorge.
 * Where a river runs outside the valley floor its bed is carved into the slopes (upstream ends rise,
 * downstream ends fall), so the water always runs downhill.
 */
export interface RiverDef { id: string; points: [number, number][]; halfWidth: number; falls?: boolean }
export const RIVERS: RiverDef[] = [
  { id: 'falls', points: STREAM, halfWidth: 1.5, falls: true },
  { id: 'west', halfWidth: 2.1, points: [[-50.5, 16.5], [-45, 26], [-39.5, 36], [-39.5, 47], [-36, 57], [-27, 65], [-15, 73], [-4, 78], [4, 80], [4, 92], [6, 108], [3, 130], [5, 150], [1, 175], [0, 215]] },
  { id: 'east', halfWidth: 1.8, points: [[98, -124], [83, -90], [71, -63], [64, -38], [63, -14], [63, 12], [56, 30], [54, 48], [48, 60], [38, 67], [24, 74], [12, 79], [4, 80]] },
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

/** Rows of prayer wheels along the approach path and in the courtyard. */
export const WHEEL_ROWS: WheelRowDef[] = [
  { id: 'aw', x: -4.4, zStart: 30, count: 8, spacing: 1.3, side: 'east' },
  { id: 'ae', x: 4.4, zStart: 30, count: 8, spacing: 1.3, side: 'west' },
  { id: 'mw', x: -9.5, zStart: -5, count: 7, spacing: 1.3, side: 'east' },
  { id: 'me', x: 9.5, zStart: -5, count: 7, spacing: 1.3, side: 'west' },
];

export interface BenchDef {
  x: number;
  z: number;
  /** Direction the sitter faces (radians): 0 = south, π/2 = east, π = north, −π/2 = west. */
  face: number;
}

const E = Math.PI / 2, W = -Math.PI / 2;
/** Benches on a circle, all facing its centre. */
const ring = (cx: number, cz: number, r: number, angles: number[]): BenchDef[] =>
  angles.map((a) => ({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }));

export const BENCHES: BenchDef[] = [
  // spawn plaza
  { x: -7.5, z: 57, face: E }, { x: 7.5, z: 57, face: W },
  // courtyard front
  { x: -13.5, z: 15, face: E }, { x: 13.5, z: 15, face: W },
  // under the Bodhi tree
  { x: BODHI_TREE.x + 4, z: BODHI_TREE.z, face: W }, { x: BODHI_TREE.x - 4, z: BODHI_TREE.z, face: E },
  // a few around the lotus pond (path from the east at angle 0, falls stream at π, river out at π/2)
  ...ring(POND.x, POND.z, POND.radius + 3.5, [0.75, 2.3, 5.5]),
  // viewing benches at the rock garden, facing west over the gravel
  { x: -16, z: 30, face: -Math.PI / 2 }, { x: -16, z: 36, face: -Math.PI / 2 },
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
  // across the spawn plaza, just outside the mountain gate
  [pole(-9.6, 50.5), pole(9.6, 50.5)],
  // a ring around the lotus pond, crossing the path and the streams
  ...pondPoles.map((p, i) => [p, pondPoles[(i + 1) % pondPoles.length]] as [FlagAnchor, FlagAnchor]),
  // across the courtyard entrance
  [pole(-11, 17.5, 4.8), pole(11, 17.5, 4.8)],
  // from the Bodhi tree's crown
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 7, BODHI_TREE.z + 7, 4.5)],
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 6, BODHI_TREE.z - 5.5, 4.5)],
  // across the ravine below the waterfall
  [pole(WATERFALL.x + 16, WATERFALL.z - 14, 6), pole(WATERFALL.x + 16, WATERFALL.z + 16, 6)],
];

/** Stone lanterns (石燈籠) along the paths. */
export const STONE_LANTERNS: [number, number][] = [
  [-3.8, 22], [3.8, 22], [-3.8, 26], [3.8, 26], [-3.8, 45], [3.8, 45], // approach
  [-14.3, -5], [14.3, -5], [-14.3, 3], [14.3, 3], // courtyard
  [-5.5, -8.4], [5.5, -8.4], // before the hall
  [-20, 5.3], [-31, 5.3], [20, 5.3], [31, 5.3], // paths to the pond and orchard
  [-87.7, -0.6], [-84.3, 14], // ends of the stream bridge
  [-54.6, -39.2], [-68, -42], // tea corner
  [21.4, 25.6], [21.4, 50.4], [44.6, 25.6], [44.6, 50.4], // wish-lantern garden corners
];

/** Large bronze incense burner (香爐) at the front of the courtyard, on the axis, with its incense table. */
export const INCENSE_BURNER = { x: 0, z: 11, tableZ: 13, standZ: 14 };

/** Arched stone bridge over the stream (runs north–south across it). */
export const BRIDGE = { x: -86, z0: 0.8, z1: 12.8, width: 2.6, rise: 1.15 };

/** Stone tablet (石碑) at the mountain gate, facing arriving visitors. */
export const STELE = { x: -7, z: 49.5 };

/**
 * Canopy of colourful lotus lanterns (燃燈, as at Buddha's Birthday) over the approach:
 * two rows of posts carry a beam each; wires strung across between them hold the lanterns.
 */
export const LANTERN_CANOPY = { x: 5.9, z0: 20, z1: 44, posts: 5, height: 4.8, wireSpacing: 1.6, lanternSpacing: 1.45 };

/** More strings of lotus lanterns, [x, z, height] to [x, z, height], each between two red posts. */
export const LANTERN_STRINGS: [[number, number, number], [number, number, number]][] = [
  [[-14.5, -9, 4.2], [-14.5, 11, 4.2]],
  [[14.5, -9, 4.2], [14.5, 11, 4.2]],
];

/** Low paper path lanterns (行燈): straight runs [x0, z0] → [x1, z1] with a light every `step` metres. */
export const PATH_LIGHT_RUNS: { from: [number, number]; to: [number, number]; step: number }[] = [
  // paths to the lotus pond and the orchard (both edges)
  { from: [-34, -0.4], to: [-16, -0.4], step: 6 }, { from: [-34, 4.4], to: [-16, 4.4], step: 6 },
  { from: [16, -0.4], to: [34, -0.4], step: 6 }, { from: [16, 4.4], to: [34, 4.4], step: 6 },
  // spawn plaza edges
  { from: [-9.4, 52], to: [-9.4, 60], step: 8 }, { from: [9.4, 52], to: [9.4, 60], step: 8 },
];
/** And a ring of them around the lotus pond. */
export const POND_LIGHT_RING = { radius: 17.2, count: 22 };

/** Map board (告示牌) on the right as you arrive, angled toward the spawn point. */
export const MAP_BOARD = { x: 4.8, z: 51.6 };

// ---------- Garden rooms ----------

/** Winding gravel path through a bamboo grove north-east of the hall. */
export const BAMBOO_PATH: [number, number][] = [[18, -44], [24, -54], [34, -58], [42, -67], [52, -70], [60, -77]];

/** Raked-gravel rock garden (枯山水) on the south lawn, west of the approach. */
export const ZEN_GARDEN = { minX: -32, maxX: -17.5, minZ: 24, maxZ: 42 };

/** Pavilion (亭) out on the lotus pond, reached by a covered walkway continuing the courtyard path. */
export const POND_PAVILION = { x: POND.x + 6.6, z: POND.z, r: 2.6, walkX0: POND.x + 9, walkX1: POND.x + 15.6, walkZ0: POND.z - 1.4, walkZ1: POND.z + 1.4 };

/** Maple and moss corner with a little tea hut (north-west). */
export const TEA_CORNER = { x: -60, z: -48, r: 10, hut: { x: -64.5, z: -50.5 } };

/** Wish-lantern garden (south-east): racks of lanterns over gravel, with a writing desk. */
export const WISH_GARDEN = {
  minX: 20, maxX: 46, minZ: 24, maxZ: 52, racks: [28, 33, 38, 43, 48], rackX0: 24, rackX1: 42, desk: { x: 22.6, z: 40.5 },
  /** Gaps in the stepped stone border, as [from, to] along each side. */
  openings: { west: [39.5, 43.5], east: [36, 40], north: [31, 35], south: [31, 35] } as Record<'west' | 'east' | 'north' | 'south', [number, number]>,
};

/** Lawns where the deer roam (each deer keeps to one). */
export const DEER_RANGES: Rect[] = [
  { minX: -50, maxX: -32, minZ: -34, maxZ: -16 }, // north of the pond
  { minX: -62, maxX: -48, minZ: 42, maxZ: 60 }, // west of the river, south of the pond
  { minX: 66, maxX: 80, minZ: -30, maxZ: -10 }, // east bank
  { minX: 32, maxX: 56, minZ: -36, maxZ: -26 }, // north of the orchard
  { minX: -34, maxX: -22, minZ: 82, maxZ: 102 }, // south meadow
  { minX: 36, maxX: 52, minZ: 78, maxZ: 96 }, // south-east meadow
  { minX: -10, maxX: 14, minZ: -62, maxZ: -50 }, // behind the hall
  { minX: -82, maxX: -70, minZ: -36, maxZ: -18 }, // west lawn by the tea corner
];

/** Cats napping about the place (`h` = height they lie at). */
export const CAT_SPOTS = [
  { x: 2.9, z: -10.35, h: 0.4, color: 0xd98a3a }, // the hall's front steps (ginger)
  { x: -23.4, z: 45.6, h: 0.35, color: 0x8a8a8a }, // south-west hut porch (grey)
  { x: 26.6, z: 17.0, h: 0.35, color: 0x2a2a2a }, // east hut porch (black)
  { x: -63.2, z: -50.5, h: 0.49, color: 0xe8d8b8 }, // tea hut floor (cream)
  { x: -21.6, z: 15.2, h: 0, color: 0x7a5a3a }, // under the Bodhi tree (tabby)
];

/** Small decorative huts in the temple style (not enterable). yaw 0 = front faces south. */
export const HUTS = [
  { id: 'sw', x: -24.75, z: 48.6, yaw: Math.PI }, // behind the rock garden, looking over it
  { id: 'e', x: 28, z: 14, yaw: 0 }, // between the orchard path and the wish-lantern garden
];

/** Informal gravel footpaths tying the places together. */
export const FOOTPATHS: [number, number][][] = [
  [[-3, 43.5], [-10, 44.2], [-17, 43.8], [-24.75, 44], [-30.5, 43.2], [-34.5, 41.5]], // approach → south-west hut → west bridge
  [[-44.5, 41.5], [-49, 39.5], [-55, 33], [-58.5, 26]], // west bridge → pond's south shore
  [[26, 4.6], [25, 10], [24.2, 16], [27, 19.2], [31.5, 20.6], [33, 23.4]], // orchard path → east hut → wish garden
  [[-33, -0.6], [-34.5, -9], [-37.5, -16], [-40, -22]], // pond path → tea corner stepping stones
  [[0, -43.5], [5, -47], [11, -47.5], [18, -44]], // hall back door → bamboo grove
  [[-5, 61], [-8, 66], [-9, 71.2]], // spawn → south bridge
  [[-9, 80.2], [-10, 86], [-12, 91]], // → picnic meadow
  [[33, 52.6], [33, 58], [31.5, 65.6]], // wish garden's south gate → east bridge
  [[31.5, 75], [30, 81], [27, 87]], // → south-east meadow
  [[35, 3], [45, 3], [52, 3], [58.3, 3]], // through the orchard → orchard bridge
  [[67.7, 3], [71, 4.5]], // → east bank
];

/** Wooden footbridges over the rivers (flat decks, red rails). `axis` = the direction you walk across. */
export const FOOT_BRIDGES: { x: number; z: number; axis: 'x' | 'z'; length: number }[] = [
  { x: -39.5, z: 41.5, axis: 'x', length: 9.5 }, // west river, by the south-west hut
  { x: -9, z: 75.7, axis: 'z', length: 8.5 }, // west river, south of the spawn
  { x: 31.5, z: 70.3, axis: 'z', length: 9 }, // east river, below the wish garden
  { x: 63, z: 3, axis: 'x', length: 9 }, // east river, past the orchard
];

/** Picnic tables with benches (you can sit at them). yaw turns the table. */
export const PICNIC_TABLES = [
  { x: -17, z: 54, yaw: 0.15 }, { x: 16.5, z: 56, yaw: -0.15 }, // lawns either side of the spawn
  { x: 32, z: -9, yaw: Math.PI / 2 }, { x: 32, z: -16, yaw: Math.PI / 2 }, // orchard edge
  { x: -26, z: -6, yaw: 0.3 }, // lawn west of the hall
  { x: -14, z: 93, yaw: 0.2 }, { x: -20, z: 88, yaw: -0.3 }, // south meadow, over the bridge
  { x: 26, z: 90, yaw: 0.2 }, // south-east meadow
  { x: 73, z: 9, yaw: Math.PI / 2 }, // east bank
  { x: -61, z: 33, yaw: 0.5 }, // pond's south shore
];

/** A stupa at the heart of the courtyard, between the hall steps and the incense burner. */
export const COURTYARD_STUPA = { x: 0, z: 1.5 };
