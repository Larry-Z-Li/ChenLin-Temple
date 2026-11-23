import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  COLOR_RE,
  DEFAULT_TEMPLE_TZ,
  ID_RE,
  PROTOCOL_VERSION,
  FRUIT_ID_RE,
  FRUIT_REGROW_MS,
  INCENSE_BURN_MS,
  INVENTORY_MAX,
  MAX_FRUIT_PER_HALL,
  MAX_INCENSE_PER_HALL,
  SNAPSHOT_HZ,
  WHEEL_MAX,
  WHEEL_PUSH,
  WHEEL_PUSH_COOLDOWN_MS,
  isFruit,
  FRUITS,
  isTransform,
  wheelSpeedAfter,
  type Fruit,
  type Offering,
  sanitizeName,
  sanitizeText,
  WISH_COLOURS,
  WISH_COOLDOWN_MS,
  WISH_SLOTS,
  HALL_WISH_SLOTS,
  WISH_TEXT_MAX,
  WISH_TITLE_MAX,
  WISH_TTL_MS,
  QUEUE_MAX,
  type Wish,
  type ClientMsg,
  type PlayerInfo,
  type ServerMsg,
  type Transform,
} from '../../shared/protocol';
import { isBlocked } from '../../shared/moderation';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 150);
const MAX_MSG_BYTES = 2048;
const MAX_MSGS_PER_SEC = 40;
/** Sockets from one address (a family or a class on one network still fits) and in all. */
const MAX_CONN_PER_IP = 20;
const MAX_SOCKETS = MAX_PLAYERS + 50;
/** A socket has this long to say hello. */
const HELLO_TIMEOUT_MS = 15_000;
/** Lanterns: live ones per person on the hall wall, new ones per hour across the wall, reports that take one down. */
const WISHES_PER_PERSON = 4;
const HALL_WISHES_PER_HOUR = 20;
const REPORTS_TO_REMOVE = 3;
const REPORTS_PER_HOUR = 10;
/** Set ADMIN_KEY to take a lantern down by hand: POST /api/remove-wish?id=…&key=… */
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
/** Offerings last until midnight in this time zone. */
const TEMPLE_TZ = process.env.TEMPLE_TZ ?? DEFAULT_TEMPLE_TZ;

const here = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(here, '../../client/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

// ---------- Static hosting of the built client (production) ----------
const server = http.createServer((req, res) => {
  // Headcount only (no names), e.g. curl https://<host>/api/status
  res.setHeader('x-content-type-options', 'nosniff');
  if (req.method === 'POST' && req.url?.startsWith('/api/remove-wish')) return removeWishByHand(req, res);
  if (req.url === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ present: [...clients.values()].filter((c) => c.info).length }));
    return;
  }
  if (!fs.existsSync(STATIC_DIR)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Temple server running. Build the client (npm run build) to serve it from here.');
    return;
  }
  let urlPath: string;
  try {
    urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400).end(); // e.g. "/%" — malformed escapes used to throw and take the server down
    return;
  }
  let file = path.normalize(path.join(STATIC_DIR, urlPath));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------- Realtime state ----------
interface Client {
  id: string;
  ws: WebSocket;
  info: PlayerInfo | null;
  tr: Transform;
  dirty: boolean;
  seat: string | null;
  lastPush: number;
  lastOffer: number;
  lastStrike: number;
  lastWish: number;
  lastFeed: number;
  /** Fruit this person picked and hasn't offered yet (server-authoritative). */
  inventory: Partial<Record<Fruit, number>>;
  alive: boolean;
  msgWindowStart: number;
  msgCount: number;
  /** Who they are for limits and reports: a salted hash of their address, never the address itself. */
  who: string;
  ip: string;
}

const clients = new Map<string, Client>();
const seats = new Map<string, string>(); // seatId -> playerId
/** wheelId -> speed (rev/s) as of time t (ms). Speed decays analytically between pushes. */
const wheels = new Map<string, { speed: number; t: number }>();
const MAX_TRACKED_WHEELS = 500;

function wheelSpeedNow(id: string, now: number) {
  const w = wheels.get(id);
  return w ? wheelSpeedAfter(w.speed, (now - w.t) / 1000) : 0;
}

function turningWheels(now: number) {
  const out: Record<string, number> = {};
  for (const id of wheels.keys()) {
    const s = wheelSpeedNow(id, now);
    if (s > 0) out[id] = Math.round(s * 1000) / 1000;
  }
  return out;
}

/** fruitId -> time picked (ms). Regrows after FRUIT_REGROW_MS. */
const picked = new Map<string, number>();
const MAX_TRACKED_FRUIT = 3000;
/** hallId -> today's offerings, with absolute timestamps. */
const offerings = new Map<string, (Omit<Offering, 'ago'> & { at: number })[]>();
const MAX_HALLS = 32;
/** hallId -> the incense line, front first (the front is the one offering), and since when the front has been there. */
const queues = new Map<string, { ids: string[]; since: number }>();
/** The front gets this long to offer (a hidden tab stops its clock) before the line moves on without them. */
const QUEUE_TURN_MS = 25_000;
function setQueue(hall: string, ids: string[]) {
  const q = queues.get(hall);
  if (q && q.ids[0] === ids[0]) q.ids = ids;
  else queues.set(hall, { ids, since: Date.now() });
  if (!ids.length) queues.delete(hall);
  broadcast({ t: 'queue', hall, ids });
}
/** Out of every line (left, joined another, or gone). */
function leaveQueues(id: string, except?: string) {
  for (const [hall, q] of queues) if (hall !== except && q.ids.includes(id)) setQueue(hall, q.ids.filter((x) => x !== id));
}
let offeringSeq = 0;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TEMPLE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = () => dayFormat.format(new Date());
let currentDay = dayKey();

// ---------- Wish lanterns (persisted to a JSON file; see README for hosting caveats) ----------
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(here, '../data');
const WISH_FILE = path.join(DATA_DIR, 'wishes.json');
/** Saved with who hung it and who reported it (hashes); `pub` strips those before anything is sent. */
type StoredWish = Wish & { owner?: string; reports?: string[] };
const wishes = new Map<string, StoredWish>();
const pub = ({ owner: _o, reports: _r, ...w }: StoredWish): Wish => w;
try {
  const list = JSON.parse(fs.readFileSync(WISH_FILE, 'utf8')) as StoredWish[];
  for (const w of list) if (w && typeof w.id === 'string' && Date.now() - w.at < WISH_TTL_MS) wishes.set(w.id, w.board === 'hall' ? { ...w, board: 'baosheng' } : w); // the first wall was baosheng's
  console.log(`Loaded ${wishes.size} wish lanterns`);
} catch {
  /* none yet */
}
let saveTimer: NodeJS.Timeout | null = null;
function saveWishes() {
  saveTimer ??= setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(WISH_FILE, JSON.stringify([...wishes.values()]), (e) => e && console.warn('[wishes] save failed', e.message));
  }, 2000);
}
function pruneWishes(now = Date.now()) {
  for (const w of wishes.values()) {
    if (now - w.at >= WISH_TTL_MS) {
      wishes.delete(w.id);
      broadcast({ t: 'wishRemoved', id: w.id });
      saveWishes();
    }
  }
}
setInterval(pruneWishes, 10 * 60 * 1000);

/** The salt that keeps the address hashes from being reversed; kept beside the lanterns so limits survive restarts. */
const SALT = (() => {
  const f = path.join(DATA_DIR, 'salt');
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    const s = randomBytes(16).toString('hex');
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(f, s);
    } catch {
      /* read-only disk: limits just reset on restart */
    }
    return s;
  }
})();
const hashWho = (ip: string) => createHash('sha256').update(SALT + ip).digest('hex').slice(0, 16);
/** The visitor's address: the first X-Forwarded-For entry behind Render's proxy, else the socket's. */
const ipOf = (req: http.IncomingMessage) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const connsByIp = new Map<string, number>();
const lastWishBy = new Map<string, number>();
/** Recent times, per key, for "n per hour" limits. */
const recent = new Map<string, number[]>();
function underLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  const list = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.set(key, list);
  return list.length < max;
}
const noteHit = (key: string, now = Date.now()) => recent.get(key)?.push(now) ?? recent.set(key, [now]);

const onBoardExists = (board: string) => [...wishes.values()].some((w) => w.board === board);

function removeWishByHand(req: http.IncomingMessage, res: http.ServerResponse) {
  const q = new URL(req.url ?? '', 'http://x').searchParams, key = Buffer.from(q.get('key') ?? ''), want = Buffer.from(ADMIN_KEY);
  if (!ADMIN_KEY || key.length !== want.length || !timingSafeEqual(key, want)) return res.writeHead(403).end();
  const w = wishes.get(q.get('id') ?? '');
  if (!w) return res.writeHead(404).end();
  wishes.delete(w.id);
  broadcast({ t: 'wishRemoved', id: w.id });
  saveWishes();
  res.writeHead(200).end('removed');
}

const inventoryCount = (c: Client) => Object.values(c.inventory).reduce((a, b) => a + (b ?? 0), 0);

function liveOfferings(now: number) {
  const out: Record<string, Offering[]> = {};
  for (const [hall, list] of offerings) {
    const live = list.filter((o) => o.kind === 'fruit' || now - o.at < INCENSE_BURN_MS);
    if (live.length) out[hall] = live.map(({ at, ...o }) => ({ ...o, ago: now - at }));
  }
  return out;
}

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg, except?: string) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    if (c.info && c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}

function releaseSeat(c: Client) {
  if (c.seat && seats.get(c.seat) === c.id) {
    seats.delete(c.seat);
    broadcast({ t: 'seat', seat: c.seat, by: null });
  }
  c.seat = null;
}

function handle(c: Client, msg: ClientMsg) {
  if (!c.info) {
    if (msg.t !== 'hello' || msg.v !== PROTOCOL_VERSION) return c.ws.close(4000, 'bad hello');
    const joined = [...clients.values()].filter((o) => o.info).length;
    if (joined >= MAX_PLAYERS) {
      send(c, { t: 'full' });
      return c.ws.close(4001, 'full');
    }
    c.info = {
      id: c.id,
      name: sanitizeName(msg.name),
      color: typeof msg.color === 'string' && COLOR_RE.test(msg.color) ? msg.color : '#c0392b',
    };
    const others = [...clients.values()]
      .filter((o) => o.info && o.id !== c.id)
      .map((o) => ({ ...o.info!, tr: o.tr }));
    const now = Date.now();
    const pickedAgo: Record<string, number> = {};
    for (const [id, at] of picked) if (now - at < FRUIT_REGROW_MS) pickedAgo[id] = now - at;
    send(c, {
      t: 'welcome',
      id: c.id,
      tz: TEMPLE_TZ,
      players: others,
      seats: Object.fromEntries(seats),
      wheels: turningWheels(now),
      picked: pickedAgo,
      offerings: liveOfferings(now),
      wishes: [...wishes.values()].map(pub),
      queues: Object.fromEntries([...queues].map(([hall, q]) => [hall, q.ids])),
    });
    broadcast({ t: 'join', player: { ...c.info, tr: c.tr } }, c.id);
    return;
  }

  switch (msg.t) {
    case 'move':
      if (isTransform(msg.tr)) {
        c.tr = msg.tr;
        c.dirty = true;
      }
      break;
    case 'seat': {
      if (msg.seat === null) return releaseSeat(c);
      if (typeof msg.seat !== 'string' || !ID_RE.test(msg.seat)) return;
      const holder = seats.get(msg.seat);
      if (holder && holder !== c.id) return send(c, { t: 'seatDenied', seat: msg.seat });
      releaseSeat(c);
      seats.set(msg.seat, c.id);
      c.seat = msg.seat;
      broadcast({ t: 'seat', seat: msg.seat, by: c.id });
      break;
    }
    case 'push': {
      if (typeof msg.wheel !== 'string' || !ID_RE.test(msg.wheel)) return;
      const now = Date.now();
      if (now - c.lastPush < WHEEL_PUSH_COOLDOWN_MS) return;
      if (!wheels.has(msg.wheel) && wheels.size >= MAX_TRACKED_WHEELS) return;
      c.lastPush = now;
      const speed = Math.min(WHEEL_MAX, wheelSpeedNow(msg.wheel, now) + WHEEL_PUSH);
      wheels.set(msg.wheel, { speed, t: now });
      broadcast({ t: 'push', wheel: msg.wheel, by: c.id, speed });
      break;
    }
    case 'strike': {
      if (typeof msg.inst !== 'string' || !ID_RE.test(msg.inst)) return;
      const now = Date.now();
      if (now - c.lastStrike < 300) return;
      c.lastStrike = now;
      broadcast({ t: 'strike', inst: msg.inst, by: c.id }, c.id);
      break;
    }
    case 'wish': {
      const now = Date.now();
      const title = sanitizeText(msg.title, WISH_TITLE_MAX), text = sanitizeText(msg.text, WISH_TEXT_MAX);
      if (!title) return send(c, { t: 'wishDenied', reason: 'empty' });
      if (isBlocked(`${title} ${text}`)) return send(c, { t: 'wishDenied', reason: 'blocked' });
      // every hall has its own lantern wall (board = the hall's id; 'hall' from older clients = baosheng)
      const board = typeof msg.board === 'string' && msg.board !== 'garden' && ID_RE.test(msg.board) ? (msg.board === 'hall' ? 'baosheng' : msg.board) : 'garden';
      const isHall = board !== 'garden';
      if (isHall && !onBoardExists(board) && new Set([...wishes.values()].map((w) => w.board)).size >= MAX_HALLS) return;
      const onBoard = () => [...wishes.values()].filter((w) => (w.board ?? 'garden') === board);
      pruneWishes(now);
      const used = new Set(onBoard().map((w) => w.slot));
      // The hall has two walls (left, right), each filling on its own; the garden is one set of racks.
      const half = HALL_WISH_SLOTS / 2, side = isHall && (msg.side === 0 || msg.side === 1) ? msg.side : null;
      const [lo, hi] = board === 'garden' ? [0, WISH_SLOTS] : side === null ? [0, HALL_WISH_SLOTS] : [side * half, side * half + half];
      let slot = [...Array(hi - lo).keys()].map((s) => s + lo).find((s) => !used.has(s));
      // The hall's wall turns you away when every hook is taken.
      if (slot === undefined && isHall) return send(c, { t: 'wishDenied', reason: 'full' });
      // The cooldown follows the person (their address), not the connection: reloading doesn't reset it.
      if (now - Math.max(c.lastWish, lastWishBy.get(c.who) ?? 0) < WISH_COOLDOWN_MS) return send(c, { t: 'wishDenied', reason: 'slow' });
      if (isHall) {
        if (onBoard().filter((w) => w.owner === c.who).length >= WISHES_PER_PERSON) return send(c, { t: 'wishDenied', reason: 'limit' });
        if (!underLimit('hall-wishes', HALL_WISHES_PER_HOUR, 3600_000, now)) return send(c, { t: 'wishDenied', reason: 'busy' });
        noteHit('hall-wishes', now);
      }
      c.lastWish = now;
      lastWishBy.set(c.who, now);
      // The garden, when full: take down the oldest lantern and reuse its hook.
      if (slot === undefined) {
        const oldest = onBoard().reduce((a, b) => (a.at <= b.at ? a : b));
        wishes.delete(oldest.id);
        broadcast({ t: 'wishRemoved', id: oldest.id });
        slot = oldest.slot;
      }
      const color = Number.isInteger(msg.color) && msg.color >= 0 && msg.color < WISH_COLOURS ? msg.color : 0;
      const wish: StoredWish = { id: randomUUID().slice(0, 12), board, slot, title, text, color, name: c.info.name, at: now, owner: c.who };
      wishes.set(wish.id, wish);
      saveWishes();
      broadcast({ t: 'wishAdded', wish: pub(wish) });
      break;
    }
    case 'queue': {
      if (typeof msg.hall !== 'string' || !ID_RE.test(msg.hall)) return;
      const ids = queues.get(msg.hall)?.ids ?? [];
      if (!msg.join) return ids.includes(c.id) ? setQueue(msg.hall, ids.filter((x) => x !== c.id)) : undefined;
      if (ids.includes(c.id) || ids.length >= QUEUE_MAX || (!queues.has(msg.hall) && queues.size >= MAX_HALLS)) return;
      leaveQueues(c.id, msg.hall); // one line at a time
      setQueue(msg.hall, [...ids, c.id]);
      break;
    }
    case 'report': {
      const w = typeof msg.id === 'string' ? wishes.get(msg.id) : undefined;
      if (!w || w.owner === c.who || w.reports?.includes(c.who)) return;
      if (!underLimit(`report:${c.who}`, REPORTS_PER_HOUR, 3600_000)) return;
      noteHit(`report:${c.who}`);
      w.reports = [...(w.reports ?? []), c.who];
      if (w.reports.length >= REPORTS_TO_REMOVE) {
        wishes.delete(w.id);
        broadcast({ t: 'wishRemoved', id: w.id });
        console.log(`[wishes] took down ${w.id} after ${w.reports.length} reports`);
      }
      saveWishes();
      break;
    }
    case 'feed': {
      if (typeof msg.deer !== 'string' || !ID_RE.test(msg.deer)) return;
      const now = Date.now();
      if (now - c.lastFeed < 800) return;
      // The fruit they offered, or whatever else they're carrying.
      const fruit = isFruit(msg.fruit) && c.inventory[msg.fruit] ? msg.fruit : FRUITS.find((f) => c.inventory[f]);
      if (!fruit) return;
      c.lastFeed = now;
      c.inventory[fruit]!--;
      broadcast({ t: 'fed', deer: msg.deer, by: c.id, fruit });
      break;
    }
    case 'pick': {
      const m = typeof msg.fruit === 'string' ? FRUIT_ID_RE.exec(msg.fruit) : null;
      if (!m || !isFruit(m[1])) return;
      const now = Date.now();
      const at = picked.get(msg.fruit);
      if (at !== undefined && now - at < FRUIT_REGROW_MS) return send(c, { t: 'pickDenied', fruit: msg.fruit, reason: 'gone' });
      if (inventoryCount(c) >= INVENTORY_MAX) return send(c, { t: 'pickDenied', fruit: msg.fruit, reason: 'full' });
      if (at === undefined && picked.size >= MAX_TRACKED_FRUIT) return;
      picked.set(msg.fruit, now);
      c.inventory[m[1]] = (c.inventory[m[1]] ?? 0) + 1;
      broadcast({ t: 'picked', fruit: msg.fruit, by: c.id });
      break;
    }
    case 'offer': {
      if (typeof msg.hall !== 'string' || !ID_RE.test(msg.hall)) return;
      const now = Date.now();
      if (now - c.lastOffer < 800) return;
      if (!offerings.has(msg.hall) && offerings.size >= MAX_HALLS) return;
      // Drop burnt-out incense as we go so the list stays small.
      const list = (offerings.get(msg.hall) ?? []).filter((o) => o.kind === 'fruit' || now - o.at < INCENSE_BURN_MS);
      const added: Omit<Offering, 'ago'>[] = [];
      if (msg.kind === 'incense') {
        const burning = list.filter((o) => o.kind === 'incense').length;
        if (burning >= MAX_INCENSE_PER_HALL) return send(c, { t: 'offerDenied', reason: 'full' });
        added.push({ id: `o${++offeringSeq}`, kind: 'incense' });
      } else if (msg.kind === 'fruit' && Array.isArray(msg.fruits)) {
        // The whole basket at once, as much as there's room for on the plates.
        let room = MAX_FRUIT_PER_HALL - list.filter((o) => o.kind === 'fruit').length;
        for (const f of msg.fruits.slice(0, INVENTORY_MAX)) {
          if (!isFruit(f) || !c.inventory[f]) continue;
          if (room <= 0) break;
          c.inventory[f]!--;
          room--;
          added.push({ id: `o${++offeringSeq}`, kind: 'fruit', fruit: f });
        }
        if (!added.length) return send(c, { t: 'offerDenied', reason: room <= 0 ? 'full' : 'noFruit' });
      } else return;
      c.lastOffer = now;
      offerings.set(msg.hall, [...list, ...added.map((o) => ({ ...o, at: now }))]);
      for (const o of added) broadcast({ t: 'offered', hall: msg.hall, offering: { ...o, ago: 0 }, by: c.id });
      break;
    }
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  if ((connsByIp.get(ip) ?? 0) >= MAX_CONN_PER_IP || clients.size >= MAX_SOCKETS) return ws.close(1013, 'busy');
  connsByIp.set(ip, (connsByIp.get(ip) ?? 0) + 1);
  const c: Client = {
    id: randomUUID().slice(0, 8),
    ws,
    info: null,
    tr: [0, 0, 55, 0, 0, 0],
    dirty: false,
    seat: null,
    lastPush: 0,
    lastOffer: 0,
    lastStrike: 0,
    lastWish: 0,
    lastFeed: 0,
    inventory: {},
    alive: true,
    msgWindowStart: Date.now(),
    msgCount: 0,
    who: hashWho(ip),
    ip,
  };
  clients.set(c.id, c);
  setTimeout(() => !c.info && ws.close(4002, 'no hello'), HELLO_TIMEOUT_MS);

  ws.on('pong', () => (c.alive = true));
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - c.msgWindowStart > 1000) {
      c.msgWindowStart = now;
      c.msgCount = 0;
    }
    if (++c.msgCount > MAX_MSGS_PER_SEC) return;
    try {
      handle(c, JSON.parse(raw.toString()) as ClientMsg);
    } catch {
      /* ignore malformed */
    }
  });
  ws.on('close', () => {
    leaveQueues(c.id);
    const n = (connsByIp.get(c.ip) ?? 1) - 1;
    if (n > 0) connsByIp.set(c.ip, n);
    else connsByIp.delete(c.ip);
    releaseSeat(c);
    clients.delete(c.id);
    if (c.info) broadcast({ t: 'leave', id: c.id });
  });
});

// Position snapshots
setInterval(() => {
  const tr: Record<string, Transform> = {};
  let any = false;
  for (const c of clients.values()) {
    if (c.info && c.dirty) {
      tr[c.id] = c.tr;
      c.dirty = false;
      any = true;
    }
  }
  if (any) broadcast({ t: 'snap', tr });
}, 1000 / SNAPSHOT_HZ);

// An incense line whose front has stalled (tab hidden, crashed) moves on.
setInterval(() => {
  const now = Date.now();
  for (const [hall, q] of queues) if (now - q.since > QUEUE_TURN_MS) setQueue(hall, q.ids.slice(1));
}, 2000);

// New day in the temple's time zone: clear offerings.
setInterval(() => {
  const today = dayKey();
  if (today !== currentDay) {
    currentDay = today;
    offerings.clear();
    broadcast({ t: 'newDay' });
  }
}, 30_000);

// Drop dead connections; forget wheels that have stopped and fruit that has regrown.
setInterval(() => {
  const now = Date.now();
  for (const id of wheels.keys()) if (wheelSpeedNow(id, now) === 0) wheels.delete(id);
  for (const [id, at] of picked) if (now - at >= FRUIT_REGROW_MS) picked.delete(id);
  for (const [k, at] of lastWishBy) if (now - at >= WISH_COOLDOWN_MS) lastWishBy.delete(k);
  for (const [k, list] of recent) if (!list.some((t) => now - t < 3600_000)) recent.delete(k);
  for (const c of clients.values()) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

server.listen(PORT, () => console.log(`Temple server listening on http://localhost:${PORT} (ws: /ws, day resets at midnight ${TEMPLE_TZ})`));
