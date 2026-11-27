/**
 * The ring of prayer-flag lines round the temples: empty to begin with, filled one flag at a time by Garuda, who
 * carries each visitor's flag up to it (what they wrote on it isn't kept; only its colour and place). Poles in world
 * (x, z) on a rounded ring round the halls, each checked clear of buildings, paths and rivers; a line from each pole to
 * the next. Shared so the server can hand out places and the client can draw them.
 */
export const FLAG_RING_POLES: [number, number][] = [
  [-8, 146], [21.6, 142.9], [42.3, 133.7], [61.1, 118.9], [84, 106], [100, 76], [98.9, 47.9], [103.4, 18.8],
  [103.4, -10.8], [98.9, -39.9], [92.8, -68.2], [77.3, -91], [61.1, -110.9], [42.3, -125.7], [17.8, -136], [0, -138],
  [-17.8, -136], [-42.3, -125.7], [-59, -108.8], [-74.8, -89.4], [-92.8, -68.2], [-98.9, -39.9], [-103.4, -10.8],
  [-103.4, 18.8], [-98.9, 47.9], [-100, 76], [-84, 106], [-61.1, 118.9], [-42.3, 133.7], [-21.6, 142.9],
];
/** How high each pole holds its strings (m above the ground there). */
export const FLAG_POLE_H = 5.2;
/** Flags along a line: one every this many metres, clear of the poles at each end. */
export const FLAG_STEP = 0.7;
/** The five colours, as they're strung (blue, white, red, green, yellow). */
export const FLAG_COLOURS = [0x2a5ad8, 0xf2f2f2, 0xd8322a, 0x2f9a4a, 0xf2c524];

/** Line i runs from pole i to pole i + 1 (round the ring). */
export const flagLine = (i: number): [[number, number], [number, number]] => [FLAG_RING_POLES[i], FLAG_RING_POLES[(i + 1) % FLAG_RING_POLES.length]];
export const FLAG_LINES_N = FLAG_RING_POLES.length;
/** How many flags line i holds. */
export function flagSlots(i: number) {
  const [a, b] = flagLine(i);
  return Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / FLAG_STEP) - 2);
}

/** Where the flags begin (the table hut where they're written): the ring fills from the places nearest it outward. */
export const FLAG_START: [number, number] = [-8.5, 152];
/** Every place on the ring, nearest the table hut first (so it fills from there round both ways). */
export const FLAG_ORDER: [number, number][] = (() => {
  const all: { at: [number, number]; d: number }[] = [];
  for (let i = 0; i < FLAG_LINES_N; i++) {
    const [a, b] = flagLine(i), n = flagSlots(i);
    for (let s = 0; s < n; s++) {
      const t = (s + 1.5) / (n + 2);
      all.push({ at: [i, s], d: Math.hypot(a[0] + (b[0] - a[0]) * t - FLAG_START[0], a[1] + (b[1] - a[1]) * t - FLAG_START[1]) });
    }
  }
  return all.sort((p, q) => p.d - q.d).map((p) => p.at);
})();
