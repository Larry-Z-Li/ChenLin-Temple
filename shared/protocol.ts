// Wire protocol shared by client and server. Keep this file dependency-free.

export const PROTOCOL_VERSION = 4;
export const SNAPSHOT_HZ = 10;
export const MAX_NAME_LEN = 20;

/** Animation states sent over the wire (by index, to keep packets small). Append only. */
export const ANIMS = [
  'idle', 'walk', 'run', 'kneel', 'beads', 'read', 'sit', 'sitRead',
  'sitBeads', 'bow', 'kneelBow', 'sitBow',
  // Prostration keyframes: palms at crown / mouth / heart, kneel upright, forehead down (palms down), palms up
  'pCrown', 'pMouth', 'pHeart', 'pKneelUp', 'pDown', 'pUp',
] as const;
export type Anim = (typeof ANIMS)[number];

/** [x, y, z, yaw, animIndex, flags] */
export type Transform = [number, number, number, number, number, number];

/** Transform flag bits: visible state shown on the avatar. */
export const FLAG_LISTENING = 1; // playing chants → headphones
export const FLAG_INCENSE = 2; // holding a stick of incense
export const FLAG_INCENSE_LIT = 4; // …and it is lit

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
export const INVENTORY_MAX = 5;
/** A stick of incense burns this long, then is gone. */
export const INCENSE_BURN_MS = 30 * 60 * 1000;
export const MAX_INCENSE_PER_HALL = 40;
export const MAX_FRUIT_PER_HALL = 30;
/** Fruit ids look like `fruit-orange-12`. */
export const FRUIT_ID_RE = /^fruit-([a-z]+)-(\d{1,4})$/;

export interface Offering {
  id: string;
  kind: 'incense' | 'fruit';
  fruit?: Fruit;
  /** How long ago it was offered (ms), so clients don't depend on clock sync. */
  ago: number;
}

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; color: string }
  | { t: 'move'; tr: Transform }
  | { t: 'seat'; seat: string | null }
  | { t: 'push'; wheel: string }
  | { t: 'pick'; fruit: string }
  | { t: 'offer'; hall: string; kind: 'incense' }
  | { t: 'offer'; hall: string; kind: 'fruit'; fruit: Fruit };

export type ServerMsg =
  | {
      t: 'welcome';
      id: string;
      players: (PlayerInfo & { tr: Transform })[];
      seats: Record<string, string>;
      /** wheelId -> current speed (rev/s), only wheels still turning */
      wheels: Record<string, number>;
      /** fruitId -> ms since it was picked (still regrowing) */
      picked: Record<string, number>;
      /** hallId -> today's offerings */
      offerings: Record<string, Offering[]>;
    }
  | { t: 'join'; player: PlayerInfo & { tr: Transform } }
  | { t: 'leave'; id: string }
  | { t: 'snap'; tr: Record<string, Transform> }
  | { t: 'seat'; seat: string; by: string | null }
  | { t: 'seatDenied'; seat: string }
  /** A push landed; `speed` is the wheel's authoritative speed right after it. */
  | { t: 'push'; wheel: string; by: string; speed: number }
  | { t: 'picked'; fruit: string; by: string }
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

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Pilgrim';
  // Strip control chars and angle brackets; collapse whitespace.
  const clean = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, MAX_NAME_LEN) || 'Pilgrim';
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
