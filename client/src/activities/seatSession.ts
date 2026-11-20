import type { Anim } from '../../../shared/protocol';
import type { Seat, WorldContext } from '../core/context';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import type { Focus, Hud, SeatAction } from '../ui/hud';
import { BEAD_COUNT, type Mala } from './beads';
import type { SutraReader } from './sutraReader';

/** What each kind of seat offers, and the pose for each activity. (Chants are global, not seat-bound.) */
const SEAT_KINDS: Record<Seat['kind'], { focuses: Focus[]; anim: Record<Focus, Anim>; bow: Anim; camPitch: number; camDist: number }> = {
  cushion: {
    focuses: ['beads', 'sutra', 'prostrate'],
    anim: { none: 'cross', beads: 'crossBeads', sutra: 'crossRead', prostrate: 'cross' }, // sitting cross-legged
    bow: 'crossBow', camPitch: 0.18, camDist: 3.4,
  },
  bench: {
    focuses: ['beads', 'sutra'],
    anim: { none: 'sit', beads: 'sitBeads', sutra: 'sitRead', prostrate: 'sit' },
    bow: 'sitBow', camPitch: 0.25, camDist: 4,
  },
};

/**
 * One full prostration: stand, palms together at the crown, mouth and heart, kneel upright,
 * forehead to the floor with palms down beside the head, turn the palms up, rise.
 * Done three times; after the third the practitioner stays kneeling.
 */
const PROSTRATION: [Anim, number][] = [
  ['idle', 1.0], ['pCrown', 1.0], ['pMouth', 0.8], ['pHeart', 0.9],
  ['pKneelUp', 1.1], ['pDown', 1.8], ['pUp', 1.3], ['pKneelUp', 1.0],
];
const PROSTRATION_REPS = 3;

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
 * Sitting down (cushion or bench) and the seated activities. Simply kneeling is sitting in silence;
 * cushions add prayer beads, sutras and prostrations; benches add prayer beads and sutras.
 */
export class SeatSession {
  seat: Seat | null = null;
  focus: Focus = 'none';
  private pending: string | null = null;
  private prost: { rep: number; step: number; t: number } | null = null;
  private bowLeft = 0;

  constructor(private d: Deps) {
    for (const s of d.ctx.seats.values()) {
      d.ctx.interactions.add({
        id: s.id, x: s.x, z: s.z, radius: s.kind === 'bench' ? 1.0 : 0.9,
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
    d.net.on('welcome', (msg) => {
      for (const s of d.ctx.seats.values()) s.occupiedBy = msg.seats[s.id] ?? null;
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
    this.focus = f;
    mala.show(f === 'beads');
    void sutra.show(f === 'sutra');
    hud.showBeadButtons(f === 'beads');
    this.prost = f === 'prostrate' ? { rep: 0, step: 0, t: 0 } : null;
    this.bowLeft = 0;
    if (f === 'beads') this.renderBeads(mala.count, mala.round);
    if (f !== 'beads' && f !== 'prostrate') hud.setInfo(null);
    player.setAnchorAnim(kind.anim[f]);
    hud.setSeatState(f);
  }

  action(a: SeatAction) {
    if (!this.seat) return;
    if (a === 'stand') return this.stand();
    this.setFocus(a);
  }

  /** Seated bow (合掌). Not during prostrations, which already include bowing. */
  bow() {
    if (!this.seat || this.focus === 'prostrate') return;
    this.bowLeft = 2.4;
    this.d.player.setAnchorAnim(SEAT_KINDS[this.seat.kind].bow);
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
      case 'Digit1': this.action('beads'); return true;
      case 'Digit2': this.action('sutra'); return true;
      case 'Digit3': this.action('prostrate'); return true;
      case 'KeyB': if (!e.repeat) this.bow(); return true;
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

  update(dt: number) {
    if (this.bowLeft > 0 && (this.bowLeft -= dt) <= 0 && this.seat) this.d.player.setAnchorAnim(SEAT_KINDS[this.seat.kind].anim[this.focus]);
    const p = this.prost;
    if (p) {
      p.t += dt;
      if (p.t >= PROSTRATION[p.step][1]) {
        p.t = 0;
        if (++p.step >= PROSTRATION.length) {
          p.step = 0;
          if (++p.rep >= PROSTRATION_REPS) return this.setFocus('none'); // back to sitting
        }
      }
      this.d.player.setAnchorAnim(PROSTRATION[p.step][0]);
      this.d.hud.setInfo(t('prostrate.progress', { n: p.rep + 1, total: PROSTRATION_REPS }));
    }
  }
}
