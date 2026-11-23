// Wire protocol shared by client and server. No outside dependencies (only ./moderation, beside it).
import { isBlocked } from './moderation';

export const PROTOCOL_VERSION = 12;
/** Longest incense line at one table (the one offering counts). */
export const QUEUE_MAX = 8;
export const SNAPSHOT_HZ = 10;
export const MAX_NAME_LEN = 20;
/** The temple's own clock: day/night and the midnight offering reset follow this time zone. */
export const DEFAULT_TEMPLE_TZ = 'Asia/Taipei';

/** Animation states sent over the wire (by index, to keep packets small). Append only. */
export const ANIMS = [
  'idle', 'walk', 'run', 'kneel', 'beads', 'read', 'sit', 'sitRead',
  'sitBeads', 'bow', 'kneelBow', 'sitBow',
  // Prostration keyframes: palms at crown / mouth / heart, kneel upright, forehead down (palms down), palms up
  'pCrown', 'pMouth', 'pHeart', 'pKneelUp', 'pDown', 'pUp',
  'reach', // reaching to the offering table (incense)
  // sitting cross-legged on a cushion: plain, with beads, reading, bowing
  'cross', 'crossBeads', 'crossRead', 'crossBow',
  // standing with prayer beads / reading a sutra
  'standBeads', 'standRead',
  // reading with the beads in the other hand: seated cross-legged, on a bench, standing
  'crossReadBeads', 'sitReadBeads', 'standReadBeads',
] as const;
export type Anim = (typeof ANIMS)[number];

/** [x, y, z, yaw, animIndex, flags] */
export type Transform = [number, number, number, number, number, number];

/** Transform flag bits: visible state shown on the avatar. */
export const FLAG_LISTENING = 1; // playing chants → headphones
export const FLAG_INCENSE = 2; // holding a stick of incense
export const FLAG_INCENSE_LIT = 4; // …and it is lit
export const FLAG_CLOUD = 8; // riding a cloud

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

// ---- Prayer wheel physics (shared so server and clients agree) ----
/** Speed (rev/s) added by each push. Mash to go faster. */
export const WHEEL_PUSH = 0.3;
/** Top speed (rev/s). */
export const WHEEL_MAX = 3.5;
/** Coasting time constant (s): speed falls to 37% after this long without pushes. */
export const WHEEL_TAU = 5;
/** Minimum ms between counted pushes from one person (caps auto-clickers). */
export const WHEEL_PUSH_COOLDOWN_MS = 60;

export function wheelSpeedAfter(speed: number, dtSec: number) {
  const s = speed * Math.exp(-dtSec / WHEEL_TAU);
  return s < 0.01 ? 0 : s;
}

// ---- Fruit & offerings ----
export const FRUITS = ['orange', 'apple', 'peach', 'pear', 'pomegranate', 'persimmon'] as const;
export type Fruit = (typeof FRUITS)[number];
/** Picked fruit grows back after this long. */
export const FRUIT_REGROW_MS = 10 * 60 * 1000;
/** Most fruit one person can carry. */
export const INVENTORY_MAX = 10;
/** A stick of incense burns this long, then is gone. */
export const INCENSE_BURN_MS = 30 * 60 * 1000;
export const MAX_INCENSE_PER_HALL = 40;
export const MAX_FRUIT_PER_HALL = 96; // four offering bowls × 24
/** Fruit ids look like `fruit-orange-12`. */
export const FRUIT_ID_RE = /^fruit-([a-z]+)-(\d{1,4})$/;

export interface Offering {
  id: string;
  kind: 'incense' | 'fruit';
  fruit?: Fruit;
  /** How long ago it was offered (ms), so clients don't depend on clock sync. */
  ago: number;
}

/**
 * Wish lanterns: anyone can hang one; they stay 30 days. Two walls: the garden racks on the plaza
 * (when full, the oldest comes down) and the lantern wall in the first hall (when full, it says so).
 */
/** 'garden' (the old racks), or the id of the hall whose lantern wall it's on ('hall' = baosheng, from before every hall had one). */
export type WishBoard = string;
export const WISH_SLOTS = 90;
/** The hall's lantern wall: two 7×7 grids either side of the back door. */
export const HALL_WISH_SLOTS = 98;
export const WISH_TTL_MS = 30 * 24 * 3600 * 1000;
export const WISH_TITLE_MAX = 24;
export const WISH_TEXT_MAX = 140;
export const WISH_COLOURS = 8;
export const WISH_COOLDOWN_MS = 60 * 1000;
export interface Wish {
  id: string;
  /** Which wall it hangs on (absent: the garden — lanterns saved before the hall wall existed). */
  board?: WishBoard;
  /** Which hook on that wall (0 … its slot count − 1). */
  slot: number;
  title: string;
  text: string;
  /** Index into the lantern palette. */
  color: number;
  name: string;
  /** When it was hung (epoch ms). */
  at: number;
}

/** slow: your cooldown · busy: many lanterns just went up · limit: you have enough up already · blocked: the word filter. */
export type WishDenyReason = 'slow' | 'empty' | 'full' | 'blocked' | 'limit' | 'busy';

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; color: string }
  | { t: 'move'; tr: Transform }
  | { t: 'seat'; seat: string | null }
  | { t: 'push'; wheel: string }
  | { t: 'pick'; fruit: string }
  /** Strike a hall instrument (bell, drum, singing bowl, wooden fish). */
  | { t: 'strike'; inst: string }
  /** `side`: the hall's left (0) or right (1) wall. */
  | { t: 'wish'; title: string; text: string; color: number; board?: WishBoard; side?: number }
  /** Flag a lantern as unkind; enough different people and it comes down. */
  | { t: 'report'; id: string }
  /** Join (or leave) the line to offer incense at a hall's table. The front of the line is the one offering. */
  | { t: 'queue'; hall: string; join: boolean }
  /** Give one fruit from your basket to a deer (they eat any kind). */
  | { t: 'feed'; deer: string; fruit: Fruit }
  | { t: 'offer'; hall: string; kind: 'incense' }
  /** Offer everything in the basket at once. */
  | { t: 'offer'; hall: string; kind: 'fruit'; fruits: Fruit[] };

export type ServerMsg =
  | {
      t: 'welcome';
      id: string;
      /** The temple's time zone (sky and the midnight reset follow it). */
      tz: string;
      players: (PlayerInfo & { tr: Transform })[];
      seats: Record<string, string>;
      /** wheelId -> current speed (rev/s), only wheels still turning */
      wheels: Record<string, number>;
      /** fruitId -> ms since it was picked (still regrowing) */
      picked: Record<string, number>;
      /** hallId -> today's offerings */
      offerings: Record<string, Offering[]>;
      wishes: Wish[];
      /** Incense lines with anyone in them: hall → player ids, front first. */
      queues: Record<string, string[]>;
    }
  | { t: 'join'; player: PlayerInfo & { tr: Transform } }
  | { t: 'leave'; id: string }
  | { t: 'snap'; tr: Record<string, Transform> }
  | { t: 'seat'; seat: string; by: string | null }
  | { t: 'seatDenied'; seat: string }
  /** A push landed; `speed` is the wheel's authoritative speed right after it. */
  | { t: 'push'; wheel: string; by: string; speed: number }
  | { t: 'picked'; fruit: string; by: string }
  | { t: 'strike'; inst: string; by: string }
  | { t: 'wishAdded'; wish: Wish }
  | { t: 'wishRemoved'; id: string }
  /** A hall's incense line, front first. */
  | { t: 'queue'; hall: string; ids: string[] }
  | { t: 'wishDenied'; reason: WishDenyReason }
  | { t: 'fed'; deer: string; by: string; fruit: Fruit }
  | { t: 'pickDenied'; fruit: string; reason: 'gone' | 'full' }
  | { t: 'offered'; hall: string; offering: Offering; by: string }
  | { t: 'offerDenied'; reason: 'noFruit' | 'full' }
  /** Midnight in the temple's time zone: today's offerings are cleared. */
  | { t: 'newDay' }
  | { t: 'full' };

export type WelcomeMsg = Extract<ServerMsg, { t: 'welcome' }>;

/** Seat / wheel / object ids. */
export const ID_RE = /^[a-z0-9-]{1,48}$/;
export const COLOR_RE = /^#[0-9a-f]{6}$/i;

export const isFruit = (v: unknown): v is Fruit => typeof v === 'string' && (FRUITS as readonly string[]).includes(v);

/** Free text (wish titles and wishes): no control chars or angle brackets, trimmed, length-capped. */
/** Zero-width and text-direction characters (used to fake names or hide words). */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

export function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return [...raw.replace(INVISIBLE, '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/[ \t]+/g, ' ').trim()].slice(0, max).join('');
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Pilgrim';
  // Strip control chars and angle brackets; collapse whitespace.
  const clean = raw.replace(INVISIBLE, '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
  return clean && !isBlocked(clean) ? clean : 'Pilgrim';
}

export function isTransform(v: unknown): v is Transform {
  return (
    Array.isArray(v) &&
    v.length === 6 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(v[0]) < 2000 &&
    Math.abs(v[1]) < 2000 &&
    Math.abs(v[2]) < 2000 &&
    Number.isInteger(v[4]) &&
    v[4] >= 0 &&
    v[4] < ANIMS.length &&
    Number.isInteger(v[5]) &&
    v[5] >= 0 &&
    v[5] < 256
  );
}
