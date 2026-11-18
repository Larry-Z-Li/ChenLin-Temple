import type { Anim } from '../../../shared/protocol';
import { bell } from '../audio/sfx';
import type { Seat, WorldContext } from '../core/context';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import type { Focus, Hud, SeatAction } from '../ui/hud';
import { BEAD_COUNT, type Mala } from './beads';
import type { SutraReader } from './sutraReader';

/** What each kind of seat offers, and the pose for each activity. (Chants are global, not seat-bound.) */
const SEAT_KINDS: Record<Seat['kind'], { focuses: Focus[]; anim: Record<Focus, Anim>; camPitch: number; camDist: number }> = {
  cushion: { focuses: ['silence', 'beads', 'sutra'], anim: { none: 'kneel', silence: 'kneel', beads: 'beads', sutra: 'read' }, camPitch: 0.18, camDist: 3.4 },
  bench: { focuses: ['sutra'], anim: { none: 'sit', silence: 'sit', beads: 'sit', sutra: 'sitRead' }, camPitch: 0.25, camDist: 4 },
};

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

interface Deps {
  ctx: WorldContext;
  net: NetClient;
  player: LocalPlayer;
  rig: CameraRig;
  hud: Hud;
  mala: Mala;
  sutra: SutraReader;
}

/**
 * Sitting down (cushion or bench) and the seated activities:
 * cushions → silence, prayer beads, sutras; benches → sutras.
 */
export class SeatSession {
  seat: Seat | null = null;
  focus: Focus = 'none';
  private pending: string | null = null;
  private silenceStart = 0;

  constructor(private d: Deps) {
    for (const s of d.ctx.seats.values()) {
      d.ctx.interactions.add({
        id: s.id, x: s.x, z: s.z, radius: s.kind === 'bench' ? 1.0 : 0.75,
        prompt: () => (s.occupiedBy ? { text: t('prompt.seatTaken'), busy: true } : { text: t(s.kind === 'bench' ? 'prompt.bench' : 'prompt.sit') }),
        onInteract: () => this.request(s),
      });
    }
    d.net.on('seat', (seat, by) => this.onSeat(seat, by));
    d.net.on('seatDenied', (seat) => {
      if (this.pending === seat) {
        this.pending = null;
        d.hud.toast(t('seat.denied'));
      }
    });
    d.net.on('welcome', (_p, seats) => {
      for (const s of d.ctx.seats.values()) s.occupiedBy = seats[s.id] ?? null;
      // Reconnected while seated: re-claim the seat.
      if (this.seat) d.net.requestSeat(this.seat.id, null);
    });
    d.mala.onCount = (n, round) => this.renderBeads(n, round);
  }

  get seated() {
    return !!this.seat;
  }

  private request(s: Seat) {
    if (this.seat || this.d.player.mode !== 'free') return;
    this.pending = s.id;
    this.d.net.requestSeat(s.id, null);
  }

  private onSeat(id: string, by: string | null) {
    const s = this.d.ctx.seats.get(id);
    if (!s) return;
    s.occupiedBy = by;
    if (by === this.d.net.id && this.pending === id) {
      this.pending = null;
      this.sit(s);
    } else if (this.seat === s && by !== this.d.net.id && by !== null) {
      this.leave(); // lost the seat (e.g. server restart race)
    }
  }

  private sit(s: Seat) {
    const { player, rig, hud, ctx } = this.d;
    const kind = SEAT_KINDS[s.kind];
    this.seat = s;
    player.anchor(s.x, s.y, s.z, s.yaw, 'seated', kind.anim.none);
    ctx.interactions.enabled = false;
    hud.setPrompt(null);
    hud.showSeatBar(s.kind);
    rig.lookAlong(s.yaw, kind.camPitch, kind.camDist);
    this.setFocus('none');
  }

  stand() {
    if (!this.seat) return;
    this.d.net.requestSeat(null, this.seat.id);
    this.leave();
  }

  private leave() {
    const { player, hud, ctx, rig, net } = this.d;
    this.setFocus('none');
    if (this.seat) {
      player.pos.x += this.seat.exit[0];
      player.pos.z += this.seat.exit[1];
      if (this.seat.occupiedBy === net.id) this.seat.occupiedBy = null;
    }
    this.seat = null;
    player.release();
    ctx.interactions.enabled = true;
    hud.showSeatBar(null);
    rig.lookAlong(rig.yaw, 0.3, 6);
  }

  setFocus(f: Focus) {
    const { mala, sutra, hud, player } = this.d;
    const kind = SEAT_KINDS[this.seat?.kind ?? 'cushion'];
    if (f !== 'none' && !kind.focuses.includes(f)) return;
    if (f !== 'none' && this.focus === f) f = 'none'; // toggle off
    const prev = this.focus;
    this.focus = f;
    mala.show(f === 'beads');
    void sutra.show(f === 'sutra');
    hud.setQuiet(f === 'silence');
    if (f === 'silence' && prev !== 'silence') {
      this.silenceStart = performance.now();
      bell(174, 7);
    }
    if (f === 'beads') this.renderBeads(mala.count, mala.round);
    if (f !== 'beads' && f !== 'silence') hud.setInfo(null);
    player.setAnchorAnim(kind.anim[f]);
    hud.setSeatState(f);
  }

  action(a: SeatAction) {
    if (!this.seat) return;
    if (a === 'stand') return this.stand();
    this.setFocus(a);
  }

  private renderBeads(n: number, round: number) {
    if (this.focus !== 'beads') return;
    this.d.hud.setInfo(`${t('beads.count', { n, total: BEAD_COUNT })} · ${t('beads.rounds', { n: round + 1 })} · ${t('beads.hint')}`);
  }

  /** Keyboard while seated; returns true if consumed. */
  handleKey(e: KeyboardEvent) {
    if (!this.seat) return false;
    if (this.focus === 'sutra' && this.d.sutra.handleKey(e)) return true;
    switch (e.code) {
      case 'Digit1': this.action('silence'); return true;
      case 'Digit2': this.action('beads'); return true;
      case 'Digit3': this.action('sutra'); return true;
      case 'Escape':
      case 'KeyE':
        if (e.repeat) return true;
        if (e.code === 'Escape' && this.focus !== 'none') this.setFocus('none');
        else this.stand();
        return true;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (this.focus === 'beads') this.d.mala.step(e.code === 'ArrowRight' ? 1 : -1);
        return true;
    }
    return false;
  }

  update() {
    if (this.focus === 'silence') this.d.hud.setInfo(t('silence.elapsed', { time: fmt((performance.now() - this.silenceStart) / 1000) }));
  }
}
