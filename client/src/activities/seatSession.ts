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
const SEAT_KINDS: Record<Seat['kind'], { focuses: Focus[]; anim: Record<Focus, Anim>; readBeads: Anim; bow: Anim; camPitch: number; camDist: number }> = {
  cushion: {
    focuses: ['beads', 'sutra', 'prostrate'],
    anim: { none: 'cross', beads: 'crossBeads', sutra: 'crossRead', prostrate: 'cross' }, // sitting cross-legged
    readBeads: 'crossReadBeads',
    bow: 'crossBow', camPitch: 0.18, camDist: 3.4,
  },
  bench: {
    focuses: ['beads', 'sutra'],
    anim: { none: 'sit', beads: 'sitBeads', sutra: 'sitRead', prostrate: 'sit' },
    readBeads: 'sitReadBeads',
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

/** Standing in place with beads or a sutra (no seat): walk away, press it again or Esc to stop. */
const STANDING = {
  focuses: ['beads', 'sutra'] as Focus[],
  anim: { none: 'idle', beads: 'standBeads', sutra: 'standRead', prostrate: 'idle' } as Record<Focus, Anim>,
  readBeads: 'standReadBeads' as Anim,
  bow: 'bow' as Anim,
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
 * Sitting down (cushion or bench) and the seated activities. Simply kneeling is sitting in silence;
 * cushions add prayer beads, sutras and prostrations; benches add prayer beads and sutras.
 */
export class SeatSession {
  seat: Seat | null = null;
  focus: Focus = 'none';
  /** Beads and the sutra can be in hand together. */
  private beads = false;
  private reading = false;
  private standing = false;
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

  /** Beads or a sutra while standing. */
  get standingFocus() {
    return this.standing;
  }

  private kind() {
    return this.standing ? STANDING : SEAT_KINDS[this.seat?.kind ?? 'cushion'];
  }

  /** Beads or a sutra on your feet: stay where you are; the same button again stops. Seated, it's the seat's. */
  standAction(f: 'beads' | 'sutra') {
    if (this.seat) return this.setFocus(f);
    const { player } = this.d;
    if (!this.standing) {
      if (player.mode !== 'free') return;
      this.standing = true;
      player.anchor(player.pos.x, player.pos.y, player.pos.z, player.yaw, 'ritual', STANDING.anim[f]);
    }
    this.setFocus(f);
  }

  /** Put the beads or sutra away and walk on. */
  endStanding() {
    if (this.standing) this.setFocus('none');
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

  /**
   * Beads and a sutra each toggle, and can be held together (the beads move to the left hand);
   * prostrations put both away; 'none' stops everything.
   */
  setFocus(f: Focus) {
    const { mala, sutra, hud, player } = this.d;
    const kind = this.kind();
    if (f !== 'none' && !kind.focuses.includes(f)) return;
    const prostrate = f === 'prostrate' && this.focus !== 'prostrate';
    if (f === 'beads') this.beads = !this.beads;
    else if (f === 'sutra') this.reading = !this.reading;
    else this.beads = this.reading = false; // 'none', or prostrations
    this.focus = prostrate ? 'prostrate' : this.reading ? 'sutra' : this.beads ? 'beads' : 'none';
    mala.show(this.beads);
    mala.setLeftHand(this.reading);
    void sutra.show(this.reading);
    hud.showBeadButtons(this.beads);
    document.body.classList.toggle('beads-sutra', this.beads && this.reading); // make room on screen for both
    this.prost = prostrate ? { rep: 0, step: 0, t: 0 } : null;
    this.bowLeft = 0;
    if (this.beads) this.renderBeads(mala.count, mala.round);
    else if (!prostrate) hud.setInfo(null);
    hud.setSeatState([this.beads && 'beads', this.reading && 'sutra', prostrate && 'prostrate'].filter(Boolean) as Focus[]);
    if (this.standing && this.focus === 'none') {
      this.standing = false;
      player.release();
      return;
    }
    player.setAnchorAnim(this.pose());
  }

  /** The pose for what's in hand now. */
  private pose(): Anim {
    const kind = this.kind();
    return this.beads && this.reading ? kind.readBeads : kind.anim[this.focus];
  }

  action(a: SeatAction) {
    if (!this.seat) return;
    if (a === 'stand') return this.stand();
    this.setFocus(a);
  }

  /** Seated bow (合掌). Not during prostrations, which already include bowing. */
  bow() {
    if ((!this.seat && !this.standing) || this.focus === 'prostrate') return;
    this.bowLeft = 2.4;
    this.d.player.setAnchorAnim(this.kind().bow);
  }

  private renderBeads(n: number, round: number) {
    if (!this.beads) return;
    this.d.hud.setInfo(`${t('beads.count', { n, total: BEAD_COUNT })} · ${t('beads.rounds', { n: round + 1 })} · ${t('beads.hint')}`);
  }

  /** Keyboard while seated; returns true if consumed. */
  handleKey(e: KeyboardEvent) {
    if (this.standing) {
      if (this.reading && this.d.sutra.handleKey(e)) return true;
      if (e.code === 'Escape') return this.endStanding(), true;
      if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && this.beads) return this.d.mala.step(e.code === 'ArrowRight' ? 1 : -1), true;
      return false;
    }
    if (!this.seat) return false;
    if (this.reading && this.d.sutra.handleKey(e)) return true;
    switch (e.code) {
      case 'Digit1': this.action('prostrate'); return true;
      case 'Digit2': this.action('beads'); return true;
      case 'Digit3': this.action('sutra'); return true;
      case 'KeyB': if (!e.repeat) this.bow(); return true;
      case 'Escape':
      case 'KeyE':
        if (e.repeat) return true;
        if (e.code === 'Escape' && this.focus !== 'none') this.setFocus('none');
        else this.stand();
        return true;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (this.beads) this.d.mala.step(e.code === 'ArrowRight' ? 1 : -1);
        return true;
    }
    return false;
  }

  update(dt: number) {
    if (this.bowLeft > 0 && (this.bowLeft -= dt) <= 0 && (this.seat || this.standing)) this.d.player.setAnchorAnim(this.pose());
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
