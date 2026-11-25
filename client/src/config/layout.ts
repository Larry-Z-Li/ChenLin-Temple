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
import type { CatCoat, CatPose } from '../world/cat';

/** How far apart everything is spaced, around the great stupa. */
export const SPREAD = 1.87;
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
/** The plaza, its gate and the arrival area move south together. */
const DZ = spreadPoint(0, 97)[1] - 97;

export const BASIN = { x: 0, z: -8, radius: 225 }; // flat valley floor (circle)
export const PLAY_RADIUS = 237; // soft boundary, measured from BASIN center
export const TERRAIN_SIZE = 1080;

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
  id, kind: 'hall', nameKey: `hall.${id}`, ...at(px, pz), width: 24, depth: 19, wallHeight: 6.2,
  deities, frontDoor: true, backDoor: false, seats: 18, thangkas: 2, roofTiers: 1, ...extra,
});

export const HALLS: HallDef[] = [
  gateHall('guanyin', -39.5, -27, ['cintamanicakra']), // 開門 NW · 如意輪觀音
  gateHall('yangsheng', 0, -28, ['sarvanivarana'], { depth: 21, backDoor: true }), // 休門 N · 除蓋障菩薩 (a back door through to Chengjiu)
  gateHall('caishen', 39.5, -27, ['akashagarbha', 'daikokuten']), // 生門 NE · 虛空藏菩薩, 大黑天財神
  gateHall('zangmi', -39.5, 9, ['samantabhadra', 'amitabha']), // 驚門 W · 普賢菩薩, 阿彌陀佛
  gateHall('dongmi', 39.5, 9, ['bhaisajyaguru', 'akshobhya', 'vajrapani']), // 傷門 E · 藥師佛, 阿閦佛, 金剛手菩薩
  gateHall('dizang', -39.5, 45, ['ksitigarbha']), // 死門 SW · 地藏王菩薩
  gateHall('guoxue', 0, 45, ['maitreya'], { depth: 21, backDoor: true }), // 景門 S · 彌勒菩薩 (a back door from the stupa court)
  gateHall('wenshu', 39.5, 45, ['manjushri']), // 杜門 SE · 文殊菩薩
  {
    id: 'chengjiu', kind: 'hall', nameKey: 'hall.chengjiu', ...at(0, -58), width: 32, depth: 24, wallHeight: 7.5,
    deities: ['amoghasiddhi'], frontDoor: true, backDoor: false, seats: 30, thangkas: 3, roofTiers: 2,
    couplet: ['五智圓明周法界', '一心清淨即蓮邦'],
  },
  {
    id: 'baosheng', kind: 'hall', nameKey: 'hall.baosheng', ...at(0, 70.4), width: 30, depth: 22, wallHeight: 7.5,
    deities: ['ratnasambhava'], frontDoor: true, backDoor: true, seats: 24, thangkas: 3, roofTiers: 2,
    couplet: ['寶光普照開福慧', '法雨均霑潤群生'],
  },
];
const hall = (id: string) => HALLS.find((h) => h.id === id)!;
/** The hall with the lantern wall (光明燈): the first one in from the plaza. */
const STAIRS = 1.6 + 2.1; // porch + steps beyond the walls

/** The walled court around the great stupa (gates in the middle of each side). Its walls stand 22.5 m from the stupa's base. */
export const STUPA_COURT = { x: MID.x, z: MID.z, half: 34.5, gate: 6 };
const CH = STUPA_COURT.half;
/** The paved walk round the court: how far out it reaches east/west, and its north and south edges. */
const RING_X = CH + 7.5, RING_N = MID.z - CH - 4, RING_S = MID.z + CH + 4.5;
/** x of the east/west gate halls' centres (the outer loop is laid 15.25 m inside it). */
const HALL_X = spreadPoint(39.5, 0)[0];
/** 萬佛塔: the great stupa on its stepped platform; Vairocana's altar stands at its south face. */
export const GREAT_STUPA = { x: MID.x, z: MID.z, base: 24, height: 26 };

/** The plaza 廣場 (its centre and half sizes). */
export const PLAZA = { x: 0, z: 97 + DZ, halfW: 27, halfD: 13 };

/** Stone-paved ground: the plaza, the stupa court, the walk around it, and straight walks to the doors. */
/** The outer gravel loop's east/west line; the straight walks out of the court's side gates end on it. */
const SIDE_WALK_X = HALL_X - 15.25;
export const PAVED: Rect[] = [
  { minX: -8, maxX: 8, minZ: 110 + DZ, maxZ: 119 + DZ }, // where you arrive, outside the gate
  { minX: -27, maxX: 27, minZ: 84 + DZ, maxZ: 110 + DZ }, // the plaza 廣場
  { minX: -CH, maxX: CH, minZ: MID.z - CH, maxZ: MID.z + CH }, // the stupa court
  { minX: -RING_X, maxX: RING_X, minZ: RING_N, maxZ: MID.z - CH }, // ring walk: north
  { minX: -RING_X, maxX: RING_X, minZ: MID.z + CH, maxZ: RING_S }, // ring walk: south
  { minX: -RING_X, maxX: -CH, minZ: RING_N, maxZ: RING_S }, // ring walk: west
  { minX: CH, maxX: RING_X, minZ: RING_N, maxZ: RING_S }, // ring walk: east
  // straight walks
  { minX: -3, maxX: 3, minZ: hall('yangsheng').z + hall('yangsheng').depth / 2 + STAIRS, maxZ: RING_N }, // ring → Yangsheng's door
  { minX: -3, maxX: 3, minZ: hall('chengjiu').z + hall('chengjiu').depth / 2 + STAIRS, maxZ: hall('yangsheng').z - hall('yangsheng').depth / 2 - STAIRS }, // Yangsheng's back door → Chengjiu
  { minX: -SIDE_WALK_X, maxX: -RING_X, minZ: 6.5, maxZ: 11.5 }, // west gate → the outer loop (on round to Zangmi's door)
  { minX: RING_X, maxX: SIDE_WALK_X, minZ: 6.5, maxZ: 11.5 }, // east gate → the outer loop (on round to Dongmi's door)
  { minX: -3, maxX: 3, minZ: RING_S, maxZ: hall('guoxue').z - hall('guoxue').depth / 2 - STAIRS }, // ring → Guoxue's back door
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
export const WATERFALL = { x: -(BASIN.radius + 18), z: 12, width: 10, height: 48 };

/** Stream from the foot of the falls down to the release pond (x, z), first point at the falls. */
const STREAM_FROM = [WATERFALL.x + 2, WATERFALL.z], STREAM_TO = [POND.x - POND.radius + 1.5, POND.z];
/** The stream's shape was drawn from (-198, 12) to (-117.5, -40.5); this stretches/turns it to run from the falls to the pond. */
const streamMap = (() => {
  const o: [number, number] = [-198, 12], vo: [number, number] = [80.5, -52.5], vn = [STREAM_TO[0] - STREAM_FROM[0], STREAM_TO[1] - STREAM_FROM[1]];
  const m = Math.hypot(vn[0], vn[1]) / Math.hypot(vo[0], vo[1]), a = Math.atan2(vn[1], vn[0]) - Math.atan2(vo[1], vo[0]), c = Math.cos(a) * m, s = Math.sin(a) * m;
  return ([x, z]: [number, number]): [number, number] => [STREAM_FROM[0] + (x - o[0]) * c - (z - o[1]) * s, STREAM_FROM[1] + (x - o[0]) * s + (z - o[1]) * c];
})();
export const STREAM: [number, number][] = [
  ...([[-198, 12], [-184, 5], [-170, -4], [-156, -14], [-143, -24], [-132, -31], [-124, -35.5]] as [number, number][]).map(streamMap), [STREAM_TO[0], STREAM_TO[1]],
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
  { id: 'nw', x: -(CH - 2.7), zStart: MID.z - (CH - 3), count: 19, spacing: 1.3, side: 'east' },
  { id: 'sw', x: -(CH - 2.7), zStart: MID.z + 7.6, count: 19, spacing: 1.3, side: 'east' },
  { id: 'ne', x: CH - 2.7, zStart: MID.z - (CH - 3), count: 19, spacing: 1.3, side: 'west' },
  { id: 'se', x: CH - 2.7, zStart: MID.z + 7.6, count: 19, spacing: 1.3, side: 'west' },
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
  { x: 7.4, z: 117 + DZ, face: W }, // arrival (the left one gave way to the stele)
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
export const STUPA_RIDGE = { count: 15, bearingFrom: -2.35, bearingTo: -0.75, rMin: 278, rMax: 375, seed: 108 };

/** A prayer-flag anchor: (x, z) and height above the ground there; `pole` puts a wooden pole under it. */
export interface FlagAnchor { x: number; z: number; h: number; pole?: boolean }

const pole = (x: number, z: number, h = 5): FlagAnchor => ({ x, z, h, pole: true });
const pondPoles = [0.4, 1.95, 2.75, 3.55, 4.3, 5.9].map((a) => pole(POND.x + Math.cos(a) * (POND.radius + 6.5), POND.z + Math.sin(a) * (POND.radius + 6.5), 5.5));
const stupaTop: FlagAnchor = { x: GREAT_STUPA.x, z: GREAT_STUPA.z, h: 23 };

/** Strings of prayer flags (the ridge strings between stupas are added automatically). */
export const FLAG_LINES: [FlagAnchor, FlagAnchor][] = [
  // from the great stupa's spire down to the corners of its court
  ...[pole(-(CH - 1.7), MID.z - (CH - 1.7)), pole(CH - 1.7, MID.z - (CH - 1.7)), pole(-(CH - 1.7), MID.z + CH - 1.7), pole(CH - 1.7, MID.z + CH - 1.7)].map((p) => [stupaTop, p] as [FlagAnchor, FlagAnchor]),
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
export const BRIDGE = (() => { const [x, z] = streamMap([-163, -9]); return { x, z0: z - 6, z1: z + 6, width: 2.6, rise: 1.15 }; })();

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
  [-4.2, MID.z - CH - 1.5], [4.2, MID.z - CH - 1.5], [-4.2, MID.z + CH + 1.6], [4.2, MID.z + CH + 1.6], [-(CH + 1.6), 4.8], [-(CH + 1.6), 13.2], [CH + 1.6, 4.8], [CH + 1.6, 13.2], // the court's gates
  [-9.5, 106 + DZ], [9.5, 106 + DZ], // plaza, by the gate
  [DRAGON_POOL.x - 6.5, DRAGON_POOL.z + 6], [DRAGON_POOL.x + 6.5, DRAGON_POOL.z + 6], // dragon pool
  [BRIDGE.x - 1.7, BRIDGE.z0 - 1.4], [BRIDGE.x + 1.7, BRIDGE.z1 + 1.4], // ends of the stone bridge
];

/** Large bronze incense burner (香爐) a few steps south of the stupa's altar, with its incense table on its south side. */
export const INCENSE_BURNER = { x: 0, z: MID.z + 17.5, tableZ: MID.z + 19.5, standZ: MID.z + 20.5 };
/** The middle syllable's carpet: halfway from the burner to the court's south gate. */
export const COURT_CARPET = { x: 0, z: MID.z + (20.5 + CH) / 2 + 0.5, scale: 1.5 };

/** Stone tablet (石碑) where you arrive, left of the gate. */
export const STELE = { x: -6.5, z: 116.5 + DZ };

/** Canopy of colourful lotus lanterns over the plaza's central walk. */
export const LANTERN_CANOPY = { x: 5.9, z0: 86 + DZ, z1: 108 + DZ, posts: 5, height: 4.8, wireSpacing: 1.6, lanternSpacing: 1.45 };

/** More strings of lotus lanterns, [x, z, height] to [x, z, height], each between two red posts. */
export const LANTERN_STRINGS: [[number, number, number], [number, number, number]][] = [
  [[24, 86 + DZ, 4.2], [24, 108 + DZ, 4.2]],
];

/** Low paper path lanterns (行燈): straight runs [x0, z0] → [x1, z1] with a light every `step` metres. */
/** Where a south-facing hall's front stairs end. */
const doorZ = (id: string) => hall(id).z + hall(id).depth / 2 + STAIRS;
const sideDoorX = SIDE_WALK_X;
export const PATH_LIGHT_RUNS: { from: [number, number]; to: [number, number]; step: number }[] = [
  { from: [-8.4, 112 + DZ], to: [-8.4, 118 + DZ], step: 6 }, { from: [8.4, 112 + DZ], to: [8.4, 118 + DZ], step: 6 },
  // along the straight walks to the four facing doors
  { from: [-4.2, RING_N - 2], to: [-4.2, doorZ('yangsheng') + 0.7], step: 5 }, { from: [4.2, RING_N - 2], to: [4.2, doorZ('yangsheng') + 0.7], step: 5 },
  { from: [-RING_X - 2.5, 4.8], to: [-sideDoorX + 1.3, 4.8], step: 5 }, { from: [RING_X + 2.5, 4.8], to: [sideDoorX - 1.3, 4.8], step: 5 },
  { from: [-RING_X - 2.5, 13.2], to: [-sideDoorX + 1.3, 13.2], step: 5 }, { from: [RING_X + 2.5, 13.2], to: [sideDoorX - 1.3, 13.2], step: 5 },
  // the orchard at night: one in the middle of each square of four trees, and a row along its entrance side
  ...[0.5, 1.5, 2.5].map((k) => ({ from: [ORCHARD.minX + k * ORCHARD.spacing, ORCHARD.minZ + ORCHARD.spacing / 2] as [number, number], to: [ORCHARD.minX + k * ORCHARD.spacing, ORCHARD.maxZ - ORCHARD.spacing / 2] as [number, number], step: ORCHARD.spacing })),
  { from: [ORCHARD.minX - 2.2, ORCHARD.minZ], to: [ORCHARD.minX - 2.2, ORCHARD.maxZ], step: ORCHARD.spacing },
];
/** And a ring of them around the release pond. */
export const POND_LIGHT_RING = { radius: POND.radius + 2.2, count: 22 };

/** Map board (告示牌) on the grass just right of the walk up to Baosheng Court, parallel to it (facing the walk). */
export const MAP_BOARD = { x: 4.4, z: hall('baosheng').z + hall('baosheng').depth / 2 + STAIRS + 6, yaw: -Math.PI / 2 };

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
export const CAT_SPOTS: { x: number; z: number; h: number; coat: CatCoat; pose: CatPose }[] = [
  { ...onSteps('guanyin', 2.9), coat: 'ginger', pose: 'loaf' }, // Guanyin Court's steps
  { ...onSteps('wenshu', 2.9), coat: 'silver', pose: 'loaf' }, // Mañjuśrī Court's steps
  { ...onSteps('baosheng', 2.9), coat: 'tuxedo', pose: 'loaf' }, // Baosheng Court's steps
  { x: DORM.minX + 8, z: (DORM.minZ + DORM.maxZ) / 2, h: 0, coat: 'calico', pose: 'sit' }, // the monks' courtyard
  { x: BODHI_TREE.x + 2.4, z: BODHI_TREE.z + 3.2, h: 0, coat: 'brown', pose: 'sit' }, // under the Bodhi tree
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

/**
 * Gravel footpaths, laid out symmetrically round the central axis (which is paved): an outer loop past
 * every hall's front door, diagonals out from the stupa court's corners, a pair round Chengjiu to the
 * cherry grove, a pair down to the plaza's corners, and spurs out to the corner pagodas, the bridges,
 * the pond, the bell, the spring and the monks' and abbot's quarters. World coordinates.
 */
const LOOP_X = SIDE_WALK_X;
/** Just outside the corner halls' outer eaves (walls at ±(HALL_X + 12) plus 2.4 of eaves). */
const CORNER_X = HALL_X + 17.25;
/** Raw points on the outer paths were drawn on the 1.5× plan: this puts them where that spot is at the current spread. */
const respread = (x: number, z: number): [number, number] => spreadPoint(MID.x + (x - MID.x) / 1.5, MID.z + (z - MID.z) / 1.5);
const mirror = (p: [number, number][]) => p.map(([x, z]) => [-x, z] as [number, number]);
const both = (p: [number, number][]) => [p, mirror(p)];
const hallDoor = (id: string): [number, number] => {
  const h = hall(id), [ex] = hallHalf(h);
  return h.facing === 'east' ? [h.x + ex + STAIRS, h.z] : h.facing === 'west' ? [h.x - ex - STAIRS, h.z] : [h.x, h.z + h.depth / 2 + STAIRS];
};
const NORTH_Z = hallDoor('guanyin')[1] + 2.8, SOUTH_Z = hallDoor('dizang')[1] + 3.3;
const bridgeEnd = (i: number, side: -1 | 1): [number, number] => [FOOT_BRIDGES[i].x + (side * FOOT_BRIDGES[i].length) / 2, FOOT_BRIDGES[i].z];
const nearP = (p: { x: number; z: number }, dx: number, dz: number): [number, number] => [p.x + dx, p.z + dz];
const pagoda = (id: string) => PAGODAS.find((p) => p.id === id)!;
/** Where the ring walk's south-west diagonal meets the loop. */
const SOUTH_JOIN = RING_S + (LOOP_X - RING_X);
const CJ = hall('chengjiu').z;
export const FOOTPATHS: [number, number][][] = [
  // the outer loop, door to door
  [[hallDoor('guanyin')[0], hallDoor('guanyin')[1]], [hallDoor('guanyin')[0], NORTH_Z], [-hallDoor('guanyin')[0], NORTH_Z], [hallDoor('caishen')[0], hallDoor('caishen')[1]]],
  [[hallDoor('dizang')[0], hallDoor('dizang')[1]], [hallDoor('dizang')[0], SOUTH_Z], [-hallDoor('dizang')[0], SOUTH_Z], [hallDoor('wenshu')[0], hallDoor('wenshu')[1]]],
  // the loop's sides, on down to the plaza's corners (points along the straight so the smooth curve through
  // them stays straight beside the halls: with only the ends it bowed ~3 m out, into their floors)
  ...both([[-LOOP_X, NORTH_Z], [-LOOP_X, -20], [-LOOP_X, 10], [-LOOP_X, 37], [-LOOP_X, SOUTH_JOIN], [-LOOP_X, SOUTH_Z - 4], [-LOOP_X, SOUTH_Z + 12.5], [-LOOP_X, SOUTH_Z + 20.5], [-27, 84 + DZ]]),
  ...both([[hallDoor('zangmi')[0], 30], hallDoor('zangmi')]), // the side halls' doors, straight up from the path below them (z = 30)
  [[0, NORTH_Z], hallDoor('yangsheng')], [[0, SOUTH_Z], hallDoor('guoxue')],
  // diagonals from the stupa court's ring walk
  ...both([[-RING_X, RING_N], [-LOOP_X, NORTH_Z]]),
  ...both([[-RING_X, RING_S], [-LOOP_X, SOUTH_JOIN]]),
  // round Chengjiu: to its door, and on to the dragon pool and the cherry grove
  ...both([[-22, NORTH_Z], [-22, (NORTH_Z + CJ + 21.5) / 2], [-22, CJ + 21.5], [-6, CJ + 17.5]]),
  ...both([[-22, CJ + 21.5], [-24, CJ - 18.5], [-12, DRAGON_POOL.z - 3.5]]),
  // north-west: the pond, the abbot, Ruyi pagoda · north-east: Duobao pagoda
  // (along the loop past the hall's corner first: cutting across, they ran over its front porch)
  [[-HALL_X, NORTH_Z], [-CORNER_X, NORTH_Z], [-CORNER_X, POND.z + 4.5], [POND_PAVILION.walkX1, POND.z]],
  [[-CORNER_X, POND.z + 4.5], respread(-90, -70), respread(-96, -88), respread(-120, -84), nearP(pagoda('ruyi'), 7, 0)],
  [[HALL_X, NORTH_Z], [CORNER_X, NORTH_Z], [CORNER_X, POND.z + 4.5], nearP(pagoda('duobao'), 0, 6.5)],
  // west: the great bell and the west bridge · east: the monks' courtyard and the orchard bridge
  [[-LOOP_X, 30], respread(-90, 30), respread(-104, 44), bridgeEnd(0, 1)],
  [[LOOP_X, bridgeEnd(2, -1)[1] - 1], [(LOOP_X + bridgeEnd(2, -1)[0]) / 2, bridgeEnd(2, -1)[1]], bridgeEnd(2, -1)],
  [[LOOP_X, 30], respread(80, 30), [DORM.minX, (DORM.minZ + DORM.maxZ) / 2 + 1.5]], // (mirrors the way to the bell)
  // south-west: the spring, Linggu pagoda, the bridge · south-east: the Bodhi tree, Wenchang pagoda, the bridge
  [[-HALL_X, SOUTH_Z], respread(-76, 85), nearP(pagoda('linggu'), 5.5, -5)], [respread(-76, 85), respread(-90, 106), bridgeEnd(1, 1)], [[(-HALL_X + respread(-76, 85)[0]) / 2, (SOUTH_Z + respread(-76, 85)[1]) / 2], nearP(DRAGON_SPRING, 1.5, 0.5)],
  [[HALL_X, SOUTH_Z], respread(76, 85), nearP(pagoda('wenchang'), -5.5, -1.5)], [respread(76, 85), respread(90, 100), bridgeEnd(3, -1)], [respread(76, 85), nearP(pagoda('wenchang'), -5, -11)],
].map((p) => snapEnds(p.map(([x, z]) => [x, z] as [number, number])));

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
];
