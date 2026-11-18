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
  SNAPSHOT_HZ,
  WHEEL_MAX,
  WHEEL_PUSH,
  WHEEL_PUSH_COOLDOWN_MS,
  isTransform,
  wheelSpeedAfter,
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
    send(c, {
      t: 'welcome',
      id: c.id,
      now: Date.now(),
      players: others,
      seats: Object.fromEntries(seats),
      wheels: turningWheels(Date.now()),
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

// Drop dead connections; forget wheels that have coasted to a stop.
setInterval(() => {
  const now = Date.now();
  for (const id of wheels.keys()) if (wheelSpeedNow(id, now) === 0) wheels.delete(id);
  for (const c of clients.values()) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

server.listen(PORT, () => console.log(`Temple server listening on http://localhost:${PORT} (ws: /ws)`));
