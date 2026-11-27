// Wire protocol shared by client and server. No outside dependencies (only ./moderation, beside it).
import type { GreatWheelState } from './greatWheel';
import { isBlocked } from './moderation';

export const PROTOCOL_VERSION = 13;
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
  // prostration, the long form: palms at the forehead, lying flat (arms ahead / palms joined at the head), pushing up
  'pForehead', 'pFlat', 'pFlatHands', 'pRise', 'pPush',
  // holding a prayer flag up high for Garuda to take
  'offerUp',
] as const;
export type Anim = (typeof ANIMS)[number];

/** [x, y, z, yaw, animIndex, flags] */
export type Transform = [number, number, number, number, number, number];

/** Transform flag bits: visible state shown on the avatar. */
export const FLAG_LISTENING = 1; // playing chants → headphones
export const FLAG_INCENSE = 2; // holding a stick of incense
export const FLAG_INCENSE_LIT = 4; // …and it is lit
export const FLAG_CLOUD = 8; // riding a cloud
export const FLAG_LANTERN = 16; // carrying a lantern to bless it…
export const FLAG_GLOW_SHIFT = 5; // …and how brightly it glows: 2 bits (0–3) from here
export const FLAG_WHEEL = 1024; // turning the great prayer wheel: right hand out on its rail
export const FLAG_CIRCLE = 2048; // circling the great stupa on autopilot (its lane is told from where they stand)
export const FLAG_TRAIL_SHIFT = 7; // the trail of light from walking round the stupa: 3 bits (0–4) from here
/** Places before a hall's altar where people bless lanterns (more than this share). */
export const BLESS_SPOTS = 6;

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
export const WISH_TTL_MS = 182 * 24 * 3600 * 1000; // six months
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
  /** How many times people have blessed it (祝福願望). */
  prayers?: number;
}

/** slow: your cooldown · busy: many lanterns just went up · limit: you have enough up already · blocked: the word filter · taken: someone just claimed that hook. */
export type WishDenyReason = 'slow' | 'empty' | 'full' | 'blocked' | 'limit' | 'busy' | 'taken';

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; color: string }
  | { t: 'move'; tr: Transform }
  | { t: 'seat'; seat: string | null }
  | { t: 'push'; wheel: string }
  /** The great prayer wheel: join the queue at a stair (0–3 = N E S W), or (queued) leave or (riding) get off at once. */
  | { t: 'gw'; wheel: string; op: 'join'; stair: number }
  | { t: 'gw'; wheel: string; op: 'leave' }
  /** A rider's press of E: all riders' presses are pooled to turn the wheel. */
  | { t: 'gw'; wheel: string; op: 'press' }
  | { t: 'pick'; fruit: string }
  /** Strike a hall instrument (bell, drum, singing bowl, wooden fish). */
  | { t: 'strike'; inst: string }
  /** `side`: the hall's left (0) or right (1) wall. */
  | { t: 'wish'; title: string; text: string; color: number; board?: WishBoard; side?: number; slot?: number }
  /** Take a lantern down to bless it (and, done, hang it back: the blessing counts). */
  | { t: 'bless'; id: string; done?: boolean }
  /** Flag a lantern as unkind; enough different people and it comes down. */
  | { t: 'report'; id: string }
  /** Give a prayer flag (of one of the five colours) to Garuda, to hang on the ring of lines round the temples. */
  | { t: 'flagHang'; color: number }
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
      /** The great prayer wheel: its angle, who is in its openings and in its queues. */
      gw?: Record<string, GreatWheelState>;
      /** fruitId -> ms since it was picked (still regrowing) */
      picked: Record<string, number>;
      /** hallId -> today's offerings */
      offerings: Record<string, Offering[]>;
      wishes: Wish[];
      /** Lanterns off their walls being blessed: wish id → who has it, and at which spot. */
      blessings: Record<string, { by: string; spot: number }>;
      /** The prayer flags hung on the ring round the temples: [line, slot, colour]. */
      flags?: [number, number, number][];
    }
  /** A prayer flag given to Garuda: where it will hang (`by` gave it). */
  | { t: 'flag'; line: number; slot: number; color: number; by: string }
  | { t: 'join'; player: PlayerInfo & { tr: Transform } }
  | { t: 'leave'; id: string }
  | { t: 'snap'; tr: Record<string, Transform> }
  | { t: 'seat'; seat: string; by: string | null }
  | { t: 'seatDenied'; seat: string }
  /** A push landed; `speed` is the wheel's authoritative speed right after it. */
  | { t: 'push'; wheel: string; by: string; speed: number }
  /** The great prayer wheel's state: sent on every change, and about twice a second while it turns. */
  | ({ t: 'gw'; wheel: string } & GreatWheelState)
  /** To one person: walk into opening `opening`; step out at `stair`; or the request was refused. */
  | { t: 'gwDo'; wheel: string; ev: 'board'; opening: number; stair: number }
  | { t: 'gwDo'; wheel: string; ev: 'exit' }
  | { t: 'gwDo'; wheel: string; ev: 'denied' }
  | { t: 'picked'; fruit: string; by: string }
  | { t: 'strike'; inst: string; by: string }
  | { t: 'wishAdded'; wish: Wish }
  | { t: 'wishRemoved'; id: string }
  /** A lantern taken down to be blessed (by) or hung back (by null, with its new count). */
  | { t: 'blessing'; id: string; by: string | null; spot: number; prayers?: number }
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
    v[5] < 4096
  );
}
