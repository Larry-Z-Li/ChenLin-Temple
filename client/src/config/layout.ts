/**
 * World layout — the single source of truth for where everything is.
 *
 * Axes:  +X = east,  -X = west,  -Z = north,  +Z = south,  +Y = up.
 * The minimap is drawn SOUTH-UP (so east appears on the left).
 * Buildings face south unless noted. Players arrive at the plaza in the south.
 *
 * Modelled on the client's site plan: the Ten Thousand Buddha Stupa (萬佛塔) in a walled court at the
 * centre, ringed by eight halls on the eight gates (八門) of the nine-palace grid, with Chengjiu Court
 * to the north, Baosheng Court and the plaza to the south, four pagodas at the corners, the release
 * pond to the north-west, the monks' quarters to the east and a cherry grove at the back.
 *
 * Coordinates below are written in the plan's proportions; `at()` / `moved()` / `P()` spread them
 * SPREAD× apart around the great stupa (sizes stay the same) so the grounds have room to breathe.
 */
import type { DeityId } from './deities';

/** How far apart everything is spaced, around the great stupa. */
export const SPREAD = 1.5;
const MID = { x: 0, z: 9 };

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A plan point spread out around the stupa. */
export const spreadPoint = (x: number, z: number): [number, number] => [MID.x + (x - MID.x) * SPREAD, MID.z + (z - MID.z) * SPREAD];
const at = (x: number, z: number) => {
  const [sx, sz] = spreadPoint(x, z);
  return { x: sx, z: sz };
};
/** A rectangle moved to its spread-out position (same size). */
const moved = (r: Rect): Rect => {
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, [nx, nz] = spreadPoint(cx, cz);
  return { minX: r.minX + nx - cx, maxX: r.maxX + nx - cx, minZ: r.minZ + nz - cz, maxZ: r.maxZ + nz - cz };
};
/** The stupa court and the walk around it don't move. */
const inCourtZone = (x: number, z: number) => Math.abs(x - MID.x) <= 29.5 && z >= -16.5 && z <= 35;
/** A path point: spread out unless it's on the walk round the court. */
const P = ([x, z]: [number, number]): [number, number] => (inCourtZone(x, z) ? [x, z] : spreadPoint(x, z));
/** The plaza, its gate and the arrival area move south together. */
const DZ = spreadPoint(0, 97)[1] - 97;

export const BASIN = { x: 0, z: -8, radius: 182 }; // flat valley floor (circle)
export const PLAY_RADIUS = 194; // soft boundary, measured from BASIN center
export const TERRAIN_SIZE = 860;

export const SPAWN = { x: 0, z: 114.5 + DZ, yaw: 0 }; // yaw 0 = facing north

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
  /** Which way the front door faces (default south). East/west halls are built facing south and turned. */
  facing?: 'south' | 'east' | 'west';
}

/** Rotation applied to a hall built facing south (Three.js Y rotation). */

/** Rotation applied to a hall built facing south (Three.js Y rotation). */
export const hallYaw = (h: HallDef) => (h.facing === 'east' ? Math.PI / 2 : h.facing === 'west' ? -Math.PI / 2 : 0);
/** The hall's half extents on the ground (east–west, north–south), allowing for its facing. */
export const hallHalf = (h: HallDef): [number, number] => (h.facing === 'east' || h.facing === 'west' ? [h.depth / 2, h.width / 2] : [h.width / 2, h.depth / 2]);

/** An inner-ring hall on one of the eight gates. */
const gateHall = (id: string, px: number, pz: number, deities: DeityId[], extra: Partial<HallDef> = {}): HallDef => ({
  id, kind: 'hall', nameKey: `hall.${id}`, ...at(px, pz), width: 18, depth: 15, wallHeight: 6.2,
  deities, frontDoor: true, backDoor: false, seats: 18, thangkas: 2, roofTiers: 1, ...extra,
});

export const HALLS: HallDef[] = [
  gateHall('guanyin', -39.5, -27, ['cintamanicakra']), // 開門 NW · 如意輪觀音
  gateHall('yangsheng', 0, -28, ['sarvanivarana'], { depth: 17, backDoor: true }), // 休門 N · 除蓋障菩薩 (a back door through to Chengjiu)
  gateHall('caishen', 39.5, -27, ['akashagarbha', 'daikokuten']), // 生門 NE · 虛空藏菩薩, 大黑天財神
  gateHall('zangmi', -39.5, 9, ['samantabhadra', 'amitabha'], { facing: 'east' }), // 驚門 W · 普賢菩薩, 阿彌陀佛 — faces the stupa
  gateHall('dongmi', 39.5, 9, ['bhaisajyaguru', 'akshobhya', 'vajrapani'], { facing: 'west' }), // 傷門 E · 藥師佛, 阿閦佛, 金剛手菩薩 — faces the stupa
  gateHall('dizang', -39.5, 45, ['ksitigarbha']), // 死門 SW · 地藏王菩薩
  gateHall('guoxue', 0, 45, ['maitreya'], { depth: 17, backDoor: true }), // 景門 S · 彌勒菩薩 (a back door from the stupa court)
  gateHall('wenshu', 39.5, 45, ['manjushri']), // 杜門 SE · 文殊菩薩
  {
    id: 'chengjiu', kind: 'hall', nameKey: 'hall.chengjiu', ...at(0, -58), width: 26, depth: 20, wallHeight: 7.5,
    deities: ['amoghasiddhi'], frontDoor: true, backDoor: false, seats: 30, thangkas: 3, roofTiers: 2,
    couplet: ['五智圓明周法界', '一心清淨即蓮邦'],
  },
  {
    id: 'baosheng', kind: 'hall', nameKey: 'hall.baosheng', ...at(0, 70.4), width: 24, depth: 18, wallHeight: 7.5,
    deities: ['ratnasambhava'], frontDoor: true, backDoor: true, seats: 24, thangkas: 3, roofTiers: 2,
    couplet: ['寶光普照開福慧', '法雨均霑潤群生'],
  },
];
const hall = (id: string) => HALLS.find((h) => h.id === id)!;
/** The hall with the lantern wall (光明燈): the first one in from the plaza. */
export const WISH_HALL = 'baosheng';
const STAIRS = 1.6 + 2.1; // porch + steps beyond the walls

/** The walled court around the great stupa (gates in the middle of each side). */
export const STUPA_COURT = { x: MID.x, z: MID.z, half: 21, gate: 6 };
/** 萬佛塔: the great stupa on its stepped platform; Vairocana's altar stands at its south face. */
export const GREAT_STUPA = { x: MID.x, z: MID.z, base: 24, height: 26 };

/** The plaza 廣場 (its centre and half sizes). */
export const PLAZA = { x: 0, z: 97 + DZ, halfW: 27, halfD: 13 };

/** Stone-paved ground: the plaza, the stupa court, the walk around it, and straight walks to the doors. */
export const PAVED: Rect[] = [
  { minX: -8, maxX: 8, minZ: 110 + DZ, maxZ: 119 + DZ }, // where you arrive, outside the gate
  { minX: -27, maxX: 27, minZ: 84 + DZ, maxZ: 110 + DZ }, // the plaza 廣場
  { minX: -21, maxX: 21, minZ: -12, maxZ: 30 }, // the stupa court
  { minX: -28.5, maxX: 28.5, minZ: -16, maxZ: -12 }, // ring walk: north
  { minX: -28.5, maxX: 28.5, minZ: 30, maxZ: 34.5 }, // ring walk: south
  { minX: -28.5, maxX: -21, minZ: -16, maxZ: 34.5 }, // ring walk: west
  { minX: 21, maxX: 28.5, minZ: -16, maxZ: 34.5 }, // ring walk: east
  // straight walks
  { minX: -3, maxX: 3, minZ: hall('yangsheng').z + hall('yangsheng').depth / 2 + STAIRS, maxZ: -16 }, // ring → Yangsheng's door
  { minX: -3, maxX: 3, minZ: hall('chengjiu').z + hall('chengjiu').depth / 2 + STAIRS, maxZ: hall('yangsheng').z - hall('yangsheng').depth / 2 - STAIRS }, // Yangsheng's back door → Chengjiu
  { minX: hall('zangmi').x + 7.5 + STAIRS, maxX: -28.5, minZ: 6.5, maxZ: 11.5 }, // west gate → Zangmi's door
  { minX: 28.5, maxX: hall('dongmi').x - 7.5 - STAIRS, minZ: 6.5, maxZ: 11.5 }, // east gate → Dongmi's door
  { minX: -3, maxX: 3, minZ: 34.5, maxZ: hall('guoxue').z - hall('guoxue').depth / 2 - STAIRS }, // ring → Guoxue's back door
  { minX: -3, maxX: 3, minZ: hall('guoxue').z + hall('guoxue').depth / 2 + STAIRS, maxZ: hall('baosheng').z - hall('baosheng').depth / 2 - STAIRS }, // Guoxue → Baosheng's back door
  { minX: -3, maxX: 3, minZ: hall('baosheng').z + hall('baosheng').depth / 2 + STAIRS, maxZ: 84 + DZ }, // Baosheng → the plaza
];

export const MOUNTAIN_GATE = { x: 0, z: 110.5 + DZ, width: 8, height: 6, couplet: ['佛日增輝光普照', '法輪常轉道恆昌'] as [string, string] };

/** 放生池, the release pond (north-west). */
export const POND = { ...at(-70, -24), radius: 14 };

export const ORCHARD: Rect & { spacing: number } = { ...moved({ minX: 88, maxX: 110.5, minZ: -8, maxZ: 29.5 }), spacing: 7.5 };

/** 菩提樹: on the lawn just north of the Wenchang pagoda. */
export const BODHI_TREE = at(58, 51.3);
/** The great bell (梵鐘) in its frame on the west meadow, by the path to the west bridge; rung when a wish lantern is hung. */
export const BODHI_BELL = { ...at(-62.5, 23), yaw: 0 };

/** Waterfall in the western mountains, facing east toward the temple. */
export const WATERFALL = { x: -200, z: 12, width: 10, height: 48 };

/** Stream from the foot of the falls down to the release pond (x, z), first point at the falls. */
export const STREAM: [number, number][] = [
  [-198, 12], [-184, 5], [-170, -4], [-156, -14], [-143, -24], [-132, -31], [-124, -35.5], [POND.x - POND.radius + 1.5, POND.z],
];

/**
 * All rivers, upstream first. The falls stream feeds the pond; the west river leaves the pond and runs
 * south past the Linggu pagoda; the east river comes down a north-east gorge, past the monks' quarters
 * and the orchard; they meet below the arrival plaza and leave through the southern gorge.
 */
export interface RiverDef { id: string; points: [number, number][]; halfWidth: number; falls?: boolean }
export const RIVERS: RiverDef[] = [
  { id: 'falls', points: STREAM, halfWidth: 1.5, falls: true },
  {
    id: 'west', halfWidth: 2.1,
    points: [[POND.x, POND.z + POND.radius - 1], ...([[-72, 5], [-76, 25], [-77, 45], [-72, 65], [-62, 85], [-46, 102], [-26, 116], [-8, 124], [0, 126], [3, 142], [1, 170], [0, 230]] as [number, number][]).map(([x, z]) => spreadPoint(x, z))],
  },
  { id: 'east', halfWidth: 1.8, points: ([[112, -112], [96, -84], [88, -56], [83, -28], [82, 0], [82, 28], [78, 56], [64, 82], [44, 104], [22, 118], [8, 124], [0, 126]] as [number, number][]).map(([x, z]) => spreadPoint(x, z)) },
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

/** Prayer-wheel galleries inside the stupa court's east and west walls, for walking round the stupa. */
export const WHEEL_ROWS: WheelRowDef[] = [
  { id: 'nw', x: -18.3, zStart: -9, count: 9, spacing: 1.3, side: 'east' },
  { id: 'sw', x: -18.3, zStart: 16.6, count: 9, spacing: 1.3, side: 'east' },
  { id: 'ne', x: 18.3, zStart: -9, count: 9, spacing: 1.3, side: 'west' },
  { id: 'se', x: 18.3, zStart: 16.6, count: 9, spacing: 1.3, side: 'west' },
];

/** 櫻花樹林: cherry trees all round the wish garden. */
export const CHERRY_GROVE = { ...at(0, -98), r: 27 };
/** 泰山龍池: a small pool with a tall Taishan rock, behind Chengjiu Court. */
export const DRAGON_POOL = { ...at(0, -80), r: 5 };
/** 清澈龍泉: a stone spring basin in the south-west. */
export const DRAGON_SPRING = at(-50, 56);

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
  { x: -7.4, z: 117 + DZ, face: E }, { x: 7.4, z: 117 + DZ, face: W }, // arrival
  { x: 25, z: 93 + DZ, face: W }, { x: 25, z: 101 + DZ, face: W }, // plaza (east side; the wish lanterns fill the west)
  { x: BODHI_TREE.x + 4, z: BODHI_TREE.z, face: W }, { x: BODHI_TREE.x - 4, z: BODHI_TREE.z, face: E }, // Bodhi tree
  ...ring(POND.x, POND.z, POND.radius + 3.5, [0.75, 2.3, 5.5]), // release pond
  { x: DRAGON_POOL.x - 7, z: DRAGON_POOL.z, face: E }, { x: DRAGON_POOL.x + 7, z: DRAGON_POOL.z, face: W }, // dragon pool
  { ...at(-10, -35), face: N }, // behind Yangsheng Court, facing Chengjiu
];

/**
 * A loose string of ~10 m stupas along the western mountain tops. Bearings are measured from the
 * valley centre (0 = south, −π/2 = west); each stupa sits on a local knoll near that bearing,
 * with irregular spacing so it reads as natural rather than planned.
 */
export const STUPA_RIDGE = { count: 15, bearingFrom: -2.35, bearingTo: -0.75, rMin: 222, rMax: 300, seed: 108 };

/** A prayer-flag anchor: (x, z) and height above the ground there; `pole` puts a wooden pole under it. */
export interface FlagAnchor { x: number; z: number; h: number; pole?: boolean }

const pole = (x: number, z: number, h = 5): FlagAnchor => ({ x, z, h, pole: true });
const pondPoles = [0.4, 1.95, 2.75, 3.55, 4.3, 5.9].map((a) => pole(POND.x + Math.cos(a) * (POND.radius + 6.5), POND.z + Math.sin(a) * (POND.radius + 6.5), 5.5));
const stupaTop: FlagAnchor = { x: GREAT_STUPA.x, z: GREAT_STUPA.z, h: 23 };

/** Strings of prayer flags (the ridge strings between stupas are added automatically). */
export const FLAG_LINES: [FlagAnchor, FlagAnchor][] = [
  // from the great stupa's spire down to the corners of its court
  ...[pole(-19.3, -10.3), pole(19.3, -10.3), pole(-19.3, 28.3), pole(19.3, 28.3)].map((p) => [stupaTop, p] as [FlagAnchor, FlagAnchor]),
  // across the plaza by the gate
  [pole(-12, 108.5 + DZ, 4.8), pole(12, 108.5 + DZ, 4.8)],
  // a ring around the release pond
  ...pondPoles.map((p, i) => [p, pondPoles[(i + 1) % pondPoles.length]] as [FlagAnchor, FlagAnchor]),
  // from the Bodhi tree's crown
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 7, BODHI_TREE.z + 7, 4.5)],
  [{ x: BODHI_TREE.x, z: BODHI_TREE.z, h: 6.5 }, pole(BODHI_TREE.x - 6, BODHI_TREE.z - 5.5, 4.5)],
  // across the ravine below the waterfall
  [pole(WATERFALL.x + 16, WATERFALL.z - 14, 6), pole(WATERFALL.x + 16, WATERFALL.z + 16, 6)],
];

/** Arched stone bridge over the falls stream. */
export const BRIDGE = { x: -163, z0: -15, z1: -3, width: 2.6, rise: 1.15 };

/** 枯山水: a dry garden of raked sand and rocks on the plaza's west (left) side, viewed from its stone kerb. */
export const SAND_GARDEN = {
  minX: -23.2, maxX: -11.8, minZ: 89.2 + DZ, maxZ: 104.8 + DZ,
  /** Rock groups: centre and size (the sand is raked in rings around each). */
  rocks: [
    { x: -20.9, z: 92.9 + DZ, r: 1.2 }, { x: -14.3, z: 96.6 + DZ, r: 0.85 }, { x: -19.5, z: 101.3 + DZ, r: 1.0 },
  ],
};

/** Stone lanterns (石燈籠). */
/** A pair of stone lanterns beside a hall's front (or back) steps, turned with the hall. */
const stairLanterns = (h: HallDef, back = false): [number, number][] => {
  const yaw = hallYaw(h), c = Math.cos(yaw), s = Math.sin(yaw);
  const lz = (h.depth / 2 + 1.6 + 1.2) * (back ? -1 : 1), half = (back ? 5 : h.kind === 'shrine' ? 4 : 7) / 2 + 1.2;
  return [-1, 1].map((k): [number, number] => [h.x + k * half * c + lz * s, h.z - k * half * s + lz * c]);
};

export const STONE_LANTERNS: [number, number][] = [
  ...HALLS.flatMap((h) => [...stairLanterns(h), ...(h.backDoor ? stairLanterns(h, true) : [])]),
  // round the sand garden (corners and halfway along the long sides, just outside the kerb), and the same
  // frame mirrored on the plaza's east side, round its rows of trees
  ...([[SAND_GARDEN.minX - 1, SAND_GARDEN.minZ - 1], [SAND_GARDEN.maxX + 1, SAND_GARDEN.minZ - 1], [SAND_GARDEN.minX - 1, SAND_GARDEN.maxZ + 1], [SAND_GARDEN.maxX + 1, SAND_GARDEN.maxZ + 1],
    [SAND_GARDEN.minX - 1, (SAND_GARDEN.minZ + SAND_GARDEN.maxZ) / 2], [SAND_GARDEN.maxX + 1, (SAND_GARDEN.minZ + SAND_GARDEN.maxZ) / 2]] as [number, number][]).flatMap(([x, z]): [number, number][] => [[x, z], [-x, z]]),
  [-4.2, -13.5], [4.2, -13.5], [-4.2, 31.6], [4.2, 31.6], [-22.6, 4.8], [-22.6, 13.2], [22.6, 4.8], [22.6, 13.2], // the court's gates
  [-9.5, 106 + DZ], [9.5, 106 + DZ], // plaza, by the gate
  [DRAGON_POOL.x - 6.5, DRAGON_POOL.z + 6], [DRAGON_POOL.x + 6.5, DRAGON_POOL.z + 6], // dragon pool
  [BRIDGE.x - 1.7, BRIDGE.z0 - 1.4], [BRIDGE.x + 1.7, BRIDGE.z1 + 1.4], // ends of the stone bridge
];

/** Large bronze incense burner (香爐) just inside the court's south gate, with its incense table. */
export const INCENSE_BURNER = { x: 0, z: 25.2, tableZ: 27.2, standZ: 28.2 };

/** Stone tablet (石碑) where you arrive, left of the gate. */
export const STELE = { x: -6.5, z: 116.5 + DZ };

/** Canopy of colourful lotus lanterns over the plaza's central walk. */
export const LANTERN_CANOPY = { x: 5.9, z0: 86 + DZ, z1: 108 + DZ, posts: 5, height: 4.8, wireSpacing: 1.6, lanternSpacing: 1.45 };

/** More strings of lotus lanterns, [x, z, height] to [x, z, height], each between two red posts. */
export const LANTERN_STRINGS: [[number, number, number], [number, number, number]][] = [
  [[24, 86 + DZ, 4.2], [24, 108 + DZ, 4.2]],
];

/** Low paper path lanterns (行燈): straight runs [x0, z0] → [x1, z1] with a light every `step` metres. */
export const PATH_LIGHT_RUNS: { from: [number, number]; to: [number, number]; step: number }[] = [
  { from: [-8.4, 112 + DZ], to: [-8.4, 118 + DZ], step: 6 }, { from: [8.4, 112 + DZ], to: [8.4, 118 + DZ], step: 6 },
  // along the straight walks to the four facing doors
  { from: [-4.2, -18], to: [-4.2, hall('yangsheng').z + 13], step: 5 }, { from: [4.2, -18], to: [4.2, hall('yangsheng').z + 13], step: 5 },
  { from: [-31, 4.8], to: [hall('zangmi').x + 12.5, 4.8], step: 5 }, { from: [31, 4.8], to: [hall('dongmi').x - 12.5, 4.8], step: 5 },
  { from: [-31, 13.2], to: [hall('zangmi').x + 12.5, 13.2], step: 5 }, { from: [31, 13.2], to: [hall('dongmi').x - 12.5, 13.2], step: 5 },
];
/** And a ring of them around the release pond. */
export const POND_LIGHT_RING = { radius: POND.radius + 2.2, count: 22 };

/** Map board (告示牌) on the right as you arrive, angled toward the spawn point. */
export const MAP_BOARD = { x: 6, z: 117 + DZ };

/** Pavilion (亭) out on the release pond, reached by a covered walkway from the east. */
export const POND_PAVILION = { x: POND.x + 6.6, z: POND.z, r: 2.6, walkX0: POND.x + 9, walkX1: POND.x + 15.6, walkZ0: POND.z - 1.4, walkZ1: POND.z + 1.4 };

/** Pagodas at the corners of the grounds. */
export const PAGODAS = [
  { id: 'ruyi', nameKey: 'map.ruyi', ...at(-90, -52), stories: 7, height: 24 }, // 如意塔
  { id: 'duobao', nameKey: 'map.duobao', ...at(55, -48), stories: 0, height: 18 }, // 多寶塔 (a stupa on a high platform)
  { id: 'wenchang', nameKey: 'map.wenchang', ...at(58, 62), stories: 7, height: 22 }, // 文昌塔
  { id: 'linggu', nameKey: 'map.linggu', ...at(-58, 68), stories: 5, height: 15 }, // 靈骨塔
];

/** 住持 (abbot's quarters, north-west) and 僧舍 (monks' quarters, a U round a courtyard, east). Decorative. */
export const ABBOT = at(-64, -60);
export const DORM = { ...moved({ minX: 52, maxX: 76, minZ: -2, maxZ: 30 }), wing: 6 };

/** Lawns where the deer roam (each deer keeps to one). */
export const DEER_RANGES: Rect[] = [
  { minX: -56, maxX: -44, minZ: -52, maxZ: -42 }, // between the pond and the abbot
  { minX: -34, maxX: -18, minZ: -64, maxZ: -48 }, // west of Chengjiu
  { minX: 18, maxX: 34, minZ: -64, maxZ: -48 }, // east of Chengjiu
  { minX: 64, maxX: 80, minZ: -40, maxZ: -20 }, // north-east lawn
  { minX: 54, maxX: 74, minZ: 36, maxZ: 52 }, // between the monks' quarters and Wenchang
  { minX: 30, maxX: 50, minZ: 60, maxZ: 78 }, // south-east lawn
  { minX: -48, maxX: -30, minZ: 60, maxZ: 78 }, // south-west lawn
  { minX: -66, maxX: -50, minZ: 0, maxZ: 20 }, // west lawn, by the pond
  { minX: -66, maxX: -48, minZ: 34, maxZ: 50 }, // west lawn, by the Bodhi tree
  { minX: -90, maxX: -80, minZ: 64, maxZ: 80 }, // over the west river, south
  { minX: -96, maxX: -84, minZ: 26, maxZ: 46 }, // over the west river, west
  { minX: 78, maxX: 90, minZ: 60, maxZ: 76 }, // over the east river, south-east
  { minX: 86, maxX: 104, minZ: 32, maxZ: 44 }, // below the orchard
  { minX: -40, maxX: -29, minZ: 86, maxZ: 104 }, // beside the plaza (west)
  { minX: 29, maxX: 40, minZ: 86, maxZ: 104 }, // beside the plaza (east)
  { minX: -30, maxX: -16, minZ: -100, maxZ: -88 }, // in the cherry grove
].map(moved);

/** On a south-facing hall's front steps, `dx` from its centre line (`h` = height of that step). */
const onSteps = (id: string, dx: number) => {
  const h = hall(id);
  return { x: h.x + dx, z: h.z + h.depth / 2 + 1.6 + 1.05, h: 0.4 };
};

/** Cats napping about the place (`h` = height they lie at). */
export const CAT_SPOTS = [
  { ...onSteps('guanyin', 2.9), color: 0xd98a3a }, // Guanyin Court's steps (ginger)
  { ...onSteps('wenshu', 2.9), color: 0x8a8a8a }, // Mañjuśrī Court's steps (grey)
  { ...onSteps('baosheng', 2.9), color: 0x2a2a2a }, // Baosheng Court's steps (black)
  { x: DORM.minX + 8, z: (DORM.minZ + DORM.maxZ) / 2, h: 0, color: 0xe8d8b8 }, // the monks' courtyard (cream)
  { x: BODHI_TREE.x + 2.4, z: BODHI_TREE.z + 3.2, h: 0, color: 0x7a5a3a }, // under the Bodhi tree (tabby)
];

/** Wooden footbridges over the rivers (flat decks, red rails). `axis` = the direction you walk across. */
export const FOOT_BRIDGES: { x: number; z: number; axis: 'x' | 'z'; length: number }[] = [
  { ...at(-76.7, 38), axis: 'x', length: 9 }, // west river, west of the Bodhi tree
  { ...at(-68.4, 72), axis: 'x', length: 9.5 }, // west river, by the Linggu pagoda
  { ...at(82.2, -4.25), axis: 'x', length: 9 }, // east river, to the orchard
  { ...at(72.6, 66), axis: 'x', length: 10 }, // east river, by the Wenchang pagoda
];

/** Path ends that should meet something exactly: bridge ends, the pond walkway, the wish garden's gate. */
const SNAP: [number, number][] = [
  ...FOOT_BRIDGES.flatMap((b) => (b.axis === 'x' ? [[b.x - b.length / 2, b.z], [b.x + b.length / 2, b.z]] : [[b.x, b.z - b.length / 2], [b.x, b.z + b.length / 2]]) as [number, number][]),
  [POND_PAVILION.walkX1, POND.z],
];
const snapEnds = (path: [number, number][]) => {
  const ends = [0, path.length - 1].map((i) => {
    const [x, z] = path[i];
    const best = SNAP.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? b : a));
    return { i, best, d: Math.hypot(best[0] - x, best[1] - z) };
  });
  for (const e of ends) {
    const other = ends.find((o) => o !== e)!;
    // snap only the end nearer the target (never both ends of one path onto the same point)
    if (e.d < 10 && !(other.best === e.best && other.d < e.d)) path[e.i] = [e.best[0], e.best[1]];
  }
  return path;
};

/** Informal gravel footpaths tying the places together (traced from the site plan). */
export const FOOTPATHS: [number, number][][] = ([
  [[-29, -14], [-40, -13], [-50, -14.5], [-54, -21], [-54.2, -24]], // the ring walk's north-west corner → the pond pavilion
  // west loop: from the pond's south shore past Zangmi and the Bodhi tree, round the spring to Baosheng
  [[-64, -7], [-56, -3], [-51.5, 6], [-51, 22], [-52.5, 36], [-53, 48], [-54, 56], [-50, 60.5], [-44.5, 58.8], [-36, 59], [-24, 59.2], [-14, 60.5]],
  [[-29, 22], [-51, 22]], // ring → west loop
  [[-29, 34], [-29, 50], [-36, 57.6], [-44.5, 58.8]], // ring → Dizang's door
  [[-24, -16], [-31, -21], [-39.5, -18.5]], [[24, -16], [31, -21], [39.5, -18.5]], // ring → Guanyin's and Caishen's doors
  [[-62, -40.5], [-57, -46], [-50, -47]], // pond's north shore → the abbot's path
  [[-52.5, 31], [-59, 31.5], [-66, 35], [-72, 38]], [[-81.4, 38], [-86, 39.5]], // west loop → west bridge → west meadow
  [[-50, 60.5], [-52.5, 76], [-60, 74.5], [-63.4, 72]], [[-73.4, 72], [-79, 75]], // round Linggu to the south-west bridge
  [[-27, 106], [-36, 104], [-44, 96], [-50, 86], [-52.5, 76]], // riverside walk from the plaza's corner
  // east: from Caishen down behind Dongmi, past the monks' courtyard, to the ring's south-east corner
  [[46, -16], [50.5, -6], [50.8, 8], [50.6, 24], [44, 27.5], [36, 31], [28.5, 32.5]],
  [[50.5, -6], [66, -7.5], [77.5, -4.25]], [[86.9, -4.25], [92, -4.25], [99, -4.25]], // → orchard bridge, into the orchard
  [[29, 34], [29, 50], [36, 57.6], [46, 58.5], [50.5, 69.5], [62, 70.5], [67.4, 66]], [[77.8, 66], [83, 68.5]], // → Wenshu → Wenchang → SE bridge
  [[27, 86], [38, 80], [46, 74], [50.5, 69.5]], // plaza's north-east corner → Wenchang
  [[-12, 34], [-12, 56.5], [-4, 57.5]], [[12, 34], [12, 56.5], [4, 57.5]], // round Guoxue to Baosheng
  [[-20, -16], [-20, -40], [-12, -46], [-4, -44.5]], [[20, -16], [20, -40], [12, -46], [4, -44.5]], // ring → Chengjiu
  [[20, -40], [36, -44], [47, -47]], // → Duobao pagoda
  [[-20, -40], [-36, -42], [-50, -47], [-64, -53.5], [-74, -52.5], [-83, -51.5]], // → abbot → Ruyi pagoda
  [[-14, -50], [-15, -70], [-8, -83], [-1.5, -92]], // round the dragon pool into the cherry grove
] as [number, number][][])
  .map((p) => snapEnds(p.map(([x, z]) => (z >= 84 && Math.abs(x) <= 30 ? [x, z + DZ] : P([x, z])) as [number, number])))
  // short walks from the south-row doors (which kept their size) out to the spread paths
  .concat((['dizang', 'wenshu'] as const).map((id) => {
    const h = hall(id), door = h.z + h.depth / 2 + STAIRS;
    return [[h.x, door + 0.2], [h.x, door + 8.5]] as [number, number][];
  }));

/** Picnic tables with benches (you can sit at them). yaw turns the table. */
export const PICNIC_TABLES = [
  { x: 16, z: 90 + DZ, yaw: 0 }, { x: 16, z: 102 + DZ, yaw: 0 }, // plaza (east side)
  { ...at(-88, 42), yaw: Math.PI / 2 }, // west meadow
  { ...at(-82, 78), yaw: 0.3 }, // south-west meadow
  { ...at(86, 71), yaw: Math.PI / 2 }, // south-east meadow
  { ...at(98, 36), yaw: 0 }, // below the orchard
  { ...at(-60, -4), yaw: 0.4 }, // by the pond
  { ...at(-22, -96), yaw: 0.3 }, { ...at(22, -96), yaw: -0.3 }, // cherry grove
];

/** Sign at the orchard's entrance from the bridge: the fruit is for offering. */
export const ORCHARD_SIGN = { x: FOOT_BRIDGES[2].x + FOOT_BRIDGES[2].length / 2 + 2.5, z: FOOT_BRIDGES[2].z + 2.6 };

/** Fast travel: every place you can fly to by cloud — where it is on the map, and where (and which way) you land. */
export interface TravelSpot { key: string; nameKey: string; at: { x: number; z: number }; arrive: { x: number; z: number; yaw: number } }
const frontOf = (h: HallDef) => {
  const yw = hallYaw(h), d = h.depth / 2 + STAIRS + 1.6;
  return { x: h.x + Math.sin(yw) * d, z: h.z + Math.cos(yw) * d, yaw: yw }; // standing in front, facing the door
};
const centre = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
export const TRAVEL_SPOTS: TravelSpot[] = [
  { key: 'plaza', nameKey: 'map.plaza', at: PLAZA, arrive: { x: SPAWN.x, z: SPAWN.z, yaw: 0 } },
  { key: 'stupa', nameKey: 'map.stupa', at: GREAT_STUPA, arrive: { x: STUPA_COURT.x, z: STUPA_COURT.z + STUPA_COURT.half + 2.5, yaw: 0 } },
  ...HALLS.map((h) => ({ key: h.id, nameKey: h.nameKey, at: { x: h.x, z: h.z }, arrive: frontOf(h) })),
  ...PAGODAS.map((p) => ({ key: p.id, nameKey: p.nameKey, at: { x: p.x, z: p.z }, arrive: { x: p.x, z: p.z + 9, yaw: 0 } })),
  { key: 'pond', nameKey: 'map.pond', at: POND, arrive: { x: POND_PAVILION.walkX1 + 1.5, z: POND.z, yaw: Math.PI / 2 } },
  { key: 'orchard', nameKey: 'map.orchard', at: centre(ORCHARD), arrive: { x: ORCHARD.minX - 2.5, z: FOOT_BRIDGES[2].z, yaw: -Math.PI / 2 } },
  { key: 'abbot', nameKey: 'map.abbot', at: ABBOT, arrive: { x: ABBOT.x, z: ABBOT.z + 9.5, yaw: 0 } },
  { key: 'dorm', nameKey: 'map.dorm', at: centre(DORM), arrive: { x: DORM.minX - 2, z: centre(DORM).z, yaw: -Math.PI / 2 } },
  { key: 'bodhi', nameKey: 'map.bodhi', at: BODHI_TREE, arrive: { x: BODHI_TREE.x + 6.5, z: BODHI_TREE.z, yaw: Math.PI / 2 } },
];
