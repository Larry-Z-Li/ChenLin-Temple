// Wire protocol shared by client and server. Keep this file dependency-free.

export const PROTOCOL_VERSION = 3;
export const SNAPSHOT_HZ = 10;
export const MAX_NAME_LEN = 20;

/** Animation states sent over the wire (by index, to keep packets small). */
export const ANIMS = ['idle', 'walk', 'run', 'kneel', 'beads', 'read', 'sit', 'sitRead'] as const;
export type Anim = (typeof ANIMS)[number];

/** [x, y, z, yaw, animIndex, flags] */
export type Transform = [number, number, number, number, number, number];

/** Transform flag bits: visible state shown on the avatar. */
export const FLAG_LISTENING = 1; // playing chants → headphones

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

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; color: string }
  | { t: 'move'; tr: Transform }
  | { t: 'seat'; seat: string | null }
  | { t: 'push'; wheel: string };

export type ServerMsg =
  | {
      t: 'welcome';
      id: string;
      now: number;
      players: (PlayerInfo & { tr: Transform })[];
      seats: Record<string, string>;
      /** wheelId -> current speed (rev/s), only wheels still turning */
      wheels: Record<string, number>;
    }
  | { t: 'join'; player: PlayerInfo & { tr: Transform } }
  | { t: 'leave'; id: string }
  | { t: 'snap'; tr: Record<string, Transform> }
  | { t: 'seat'; seat: string; by: string | null }
  | { t: 'seatDenied'; seat: string }
  /** A push landed; `speed` is the wheel's authoritative speed right after it. */
  | { t: 'push'; wheel: string; by: string; speed: number }
  | { t: 'full' };

/** Seat / wheel / object ids. */
export const ID_RE = /^[a-z0-9-]{1,48}$/;
export const COLOR_RE = /^#[0-9a-f]{6}$/i;

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
