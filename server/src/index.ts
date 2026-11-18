import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  COLOR_RE,
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
  isTransform,
  wheelSpeedAfter,
  type Fruit,
  type Offering,
  sanitizeName,
  type ClientMsg,
  type PlayerInfo,
  type ServerMsg,
  type Transform,
} from '../../shared/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 150);
const MAX_MSG_BYTES = 2048;
const MAX_MSGS_PER_SEC = 40;
/** Offerings last until midnight in this time zone. */
const TEMPLE_TZ = process.env.TEMPLE_TZ ?? 'Asia/Taipei';

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
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(STATIC_DIR, urlPath));
  if (!file.startsWith(STATIC_DIR)) {
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
  /** Fruit this person picked and hasn't offered yet (server-authoritative). */
  inventory: Partial<Record<Fruit, number>>;
  alive: boolean;
  msgWindowStart: number;
  msgCount: number;
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
let offeringSeq = 0;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TEMPLE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = () => dayFormat.format(new Date());
let currentDay = dayKey();

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
      players: others,
      seats: Object.fromEntries(seats),
      wheels: turningWheels(now),
      picked: pickedAgo,
      offerings: liveOfferings(now),
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
      const list = offerings.get(msg.hall) ?? [];
      let offering: Omit<Offering, 'ago'>;
      if (msg.kind === 'incense') {
        const burning = list.filter((o) => o.kind === 'incense' && now - o.at < INCENSE_BURN_MS).length;
        if (burning >= MAX_INCENSE_PER_HALL) return send(c, { t: 'offerDenied', reason: 'full' });
        offering = { id: `o${++offeringSeq}`, kind: 'incense' };
      } else if (msg.kind === 'fruit' && isFruit(msg.fruit)) {
        if (!c.inventory[msg.fruit]) return send(c, { t: 'offerDenied', reason: 'noFruit' });
        if (list.filter((o) => o.kind === 'fruit').length >= MAX_FRUIT_PER_HALL) return send(c, { t: 'offerDenied', reason: 'full' });
        c.inventory[msg.fruit]!--;
        offering = { id: `o${++offeringSeq}`, kind: 'fruit', fruit: msg.fruit };
      } else return;
      c.lastOffer = now;
      // Drop burnt-out incense as we go so the list stays small.
      offerings.set(msg.hall, [...list.filter((o) => o.kind === 'fruit' || now - o.at < INCENSE_BURN_MS), { ...offering, at: now }]);
      broadcast({ t: 'offered', hall: msg.hall, offering: { ...offering, ago: 0 }, by: c.id });
      break;
    }
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });

wss.on('connection', (ws) => {
  const c: Client = {
    id: randomUUID().slice(0, 8),
    ws,
    info: null,
    tr: [0, 0, 110, 0, 0, 0],
    dirty: false,
    seat: null,
    lastPush: 0,
    lastOffer: 0,
    inventory: {},
    alive: true,
    msgWindowStart: Date.now(),
    msgCount: 0,
  };
  clients.set(c.id, c);

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
