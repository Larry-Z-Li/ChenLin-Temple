/** Palette for the graybox. Swap these during the art pass. */
export const THEME = {
  platformStone: 0xb8b2a6,
  pavedStone: 0xa8a294,
  wall: 0xefe6d2,
  wallBase: 0x8c3b2a,
  column: 0xa3291f,
  beam: 0x2f7a6b, // dancheong-style teal band under the eaves
  beamAccent: 0x2b4c8c,
  roof: 0x3b4048,
  roofRidge: 0x2a2d33,
  ceiling: 0x6b3a2a,
  floor: 0x8a5a36,
  altar: 0x7a2418,
  altarTrim: 0xc9a24a,
  table: 0x5a2b1a,
  cushion: 0xb8402e,
  cushionTop: 0xd9a441,
  bronze: 0x8c6a3a,
  wood: 0x6b4426,
  goldLeaf: 0xd4af37,
  skyTop: 0x5d97d3,
  skyHorizon: 0xd7e6ee,
  groundGrass: 0x5f8f3e,
};

export const FRUIT_TYPES = {
  orange: { nameKey: 'fruit.orange', color: 0xf28c1e },
  apple: { nameKey: 'fruit.apple', color: 0xc8312b },
  peach: { nameKey: 'fruit.peach', color: 0xf5a38a },
  pear: { nameKey: 'fruit.pear', color: 0xd7d24a },
  pomegranate: { nameKey: 'fruit.pomegranate', color: 0x9e1b32 },
  persimmon: { nameKey: 'fruit.persimmon', color: 0xe8691c },
} as const;
export type FruitType = keyof typeof FRUIT_TYPES;

export const AVATAR_COLORS = ['#8e2b1f', '#c9701c', '#d9a441', '#5b3a29', '#2f6b5b', '#3a4f8c', '#6b3a7a', '#7a7a7a'];
