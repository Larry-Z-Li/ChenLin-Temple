import {
  PROTOCOL_VERSION,
  type ClientMsg,
  type Fruit,
  type Offering,
  type PlayerInfo,
  type ServerMsg,
  type Transform,
  type WelcomeMsg,
  type Wish,
  type WishBoard,
  type WishDenyReason,
} from '../../../shared/protocol';

export type NetStatus = 'connecting' | 'online' | 'offline';

export interface NetEvents {
  status: (s: NetStatus) => void;
  welcome: (msg: WelcomeMsg) => void;
  join: (p: PlayerInfo & { tr: Transform }) => void;
  leave: (id: string) => void;
  snap: (tr: Record<string, Transform>) => void;
  seat: (seat: string, by: string | null) => void;
  seatDenied: (seat: string) => void;
  push: (wheel: string, by: string, speed: number) => void;
  picked: (fruit: string, by: string) => void;
  strike: (inst: string, by: string) => void;
  wishAdded: (wish: Wish) => void;
  wishRemoved: (id: string) => void;
  wishDenied: (reason: WishDenyReason) => void;
  fed: (deer: string, by: string, fruit: Fruit) => void;
  pickDenied: (fruit: string, reason: 'gone' | 'full') => void;
  offered: (hall: string, offering: Offering, by: string) => void;
  offerDenied: (reason: 'noFruit' | 'full') => void;
  newDay: () => void;
  queue: (hall: string, ids: string[]) => void;
}

/**
 * WebSocket client. When the server is unreachable it falls back to offline mode and
 * answers requests locally, so the temple is always usable.
 */
export class NetClient {
  id = 'local';
  status: NetStatus = 'connecting';
  private ws: WebSocket | null = null;
  private handlers = new Map<keyof NetEvents, Function[]>();
  private retry = 1000;
  private hello: ClientMsg | null = null;
  private localSeq = 0;

  on<K extends keyof NetEvents>(ev: K, fn: NetEvents[K]) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, []);
    this.handlers.get(ev)!.push(fn);
  }

  private emit<K extends keyof NetEvents>(ev: K, ...args: Parameters<NetEvents[K]>) {
    this.handlers.get(ev)?.forEach((fn) => fn(...args));
  }

  private setStatus(s: NetStatus) {
    this.status = s;
    this.emit('status', s);
  }

  connect(name: string, color: string) {
    this.hello = { t: 'hello', v: PROTOCOL_VERSION, name, color };
    this.open();
  }

  private open() {
    const url = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return this.goOffline();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      ws.send(JSON.stringify(this.hello));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.goOffline();
      setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 30_000);
    };
  }

  private goOffline() {
    if (this.status !== 'offline') {
      this.id = 'local';
      this.setStatus('offline');
    }
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.setStatus('online');
        return this.emit('welcome', msg);
      case 'join': return this.emit('join', msg.player);
      case 'leave': return this.emit('leave', msg.id);
      case 'snap': return this.emit('snap', msg.tr);
      case 'seat': return this.emit('seat', msg.seat, msg.by);
      case 'seatDenied': return this.emit('seatDenied', msg.seat);
      case 'push': return this.emit('push', msg.wheel, msg.by, msg.speed);
      case 'picked': return this.emit('picked', msg.fruit, msg.by);
      case 'strike': return this.emit('strike', msg.inst, msg.by);
      case 'wishAdded': return this.emit('wishAdded', msg.wish);
      case 'wishRemoved': return this.emit('wishRemoved', msg.id);
      case 'queue': return this.emit('queue', msg.hall, msg.ids);
      case 'wishDenied': return this.emit('wishDenied', msg.reason);
      case 'fed': return this.emit('fed', msg.deer, msg.by, msg.fruit);
      case 'pickDenied': return this.emit('pickDenied', msg.fruit, msg.reason);
      case 'offered': return this.emit('offered', msg.hall, msg.offering, msg.by);
      case 'offerDenied': return this.emit('offerDenied', msg.reason);
      case 'newDay': return this.emit('newDay');
      case 'full': console.warn('[net] server full'); break;
    }
  }

  private send(msg: ClientMsg) {
    if (this.status === 'online' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  sendMove(tr: Transform) {
    this.send({ t: 'move', tr });
  }

  requestSeat(seat: string | null, previous: string | null) {
    if (this.send({ t: 'seat', seat })) return;
    // Offline: grant locally
    if (seat) this.emit('seat', seat, this.id);
    else if (previous) this.emit('seat', previous, null);
  }

  /** The push is already applied locally; offline there's nothing else to do. */
  pushWheel(wheel: string) {
    this.send({ t: 'push', wheel });
  }

  /** Already played locally; the server relays it to everyone else. */
  strike(inst: string) {
    this.send({ t: 'strike', inst });
  }

  /** Offline the lantern goes up locally (lost on reload). */
  hangWish(title: string, text: string, color: number, name: string, slot: number, board: WishBoard = 'garden', side?: number) {
    if (!this.send({ t: 'wish', title, text, color, board, side })) this.emit('wishAdded', { id: `l${++this.localSeq}`, board, slot, title, text, color, name, at: Date.now() });
  }

  /** Flag a lantern as unkind (the server takes it down after enough different people do). */
  /** Join or leave a hall's incense line. False when offline (then there's no line to wait in). */
  queue(hall: string, join: boolean) {
    return this.send({ t: 'queue', hall, join });
  }

  reportWish(id: string) {
    this.send({ t: 'report', id });
  }

  feedDeer(deer: string, fruit: Fruit) {
    if (!this.send({ t: 'feed', deer, fruit })) this.emit('fed', deer, this.id, fruit);
  }

  /** Callers check inventory space first; offline the pick is granted locally. */
  pickFruit(fruit: string) {
    if (!this.send({ t: 'pick', fruit })) this.emit('picked', fruit, this.id);
  }

  offerIncense(hall: string) {
    if (!this.send({ t: 'offer', hall, kind: 'incense' })) this.emit('offered', hall, { id: `l${++this.localSeq}`, kind: 'incense', ago: 0 }, this.id);
  }

  /** Offer the whole basket. */
  offerFruits(hall: string, fruits: Fruit[]) {
    if (!this.send({ t: 'offer', hall, kind: 'fruit', fruits })) for (const fruit of fruits) this.emit('offered', hall, { id: `l${++this.localSeq}`, kind: 'fruit', fruit, ago: 0 }, this.id);
  }
}
