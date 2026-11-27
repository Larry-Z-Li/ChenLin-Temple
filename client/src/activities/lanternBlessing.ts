import * as THREE from 'three';
import { FLAG_GLOW_SHIFT, FLAG_LANTERN } from '../../../shared/protocol';
import type { WorldContext } from '../core/context';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import type { Hud } from '../ui/hud';
import { chaliceGeometries, lanternGeometries } from './wishLanterns';

export type LampKind = 'lantern' | 'chalice';

/** Where to go, and how, for one blessing (all world space; the wall supplies it). */
export interface BlessRoute {
  /** The lantern's hook on the wall, and where you stand facing it. */
  hook: THREE.Vector3;
  /** The lantern's size on the wall (it keeps it all the way down, in your hands and back up). */
  scale: number;
  /** A hanging lantern, or a butter lamp off a shelf (the mock hall). */
  kind?: LampKind;
  start: { x: number; z: number; yaw: number };
  /** The way from `start` to the spot, ending at it, and which way the spot faces (the altar). */
  to: (spot: number) => { path: { x: number; z: number }[]; yaw: number };
}

type Phase = 'wait' | 'down' | 'walk' | 'bow' | 'dim' | 'back' | 'up';
const DOWN = 1.3, BOW = 3.6, BOWS = 3, DIM = 1.0, UP = 1.1, SPEED = 3.2;
/** How brightly the lantern glows at the height of the prayer (× its usual glow). */
export const BLESS_GLOW = 20;

/**
 * 祝福願望: the lantern floats down from its hook into your hands; you walk to a place before the altar
 * (one the server picked, away from the incense stand and from anyone else blessing), bow three times as
 * it brightens to twenty times its glow, let it dim, walk back and hang it up again. Everyone sees it:
 * it's off the wall while you hold it, and how brightly it glows travels with your position.
 */
export class LanternBlessing {
  /** Lanterns off their walls: wish id → who holds it (everyone's, from the server). */
  readonly held = new Map<string, { by: string; spot: number }>();
  private job: { id: string; color: number; route: BlessRoute; phase: Phase; t: number; path: { x: number; z: number }[]; leg: number; yaw: number; back: { x: number; z: number }[] } | null = null;
  private glow = 1;
  private floaters = {} as Record<LampKind, { g: THREE.Group; mat: THREE.MeshStandardMaterial }>;
  /** The one floating down / back up for the current blessing (a lantern, or a lamp). */
  private get floater() {
    return this.floaters[this.job?.route.kind ?? 'lantern'].g;
  }
  private get floaterMat() {
    return this.floaters[this.job?.route.kind ?? 'lantern'].mat;
  }
  /** A wall's lantern changed hands (hide it on the wall, or show it again). */
  onHeld: (id: string) => void = () => {};
  /** The count went up (refresh an open panel). */
  onCount: (id: string, prayers: number) => void = () => {};
  /** You finished praying for a lantern (功德). */
  onBlessed: () => void = () => {};

  constructor(private ctx: WorldContext, private net: NetClient, private player: LocalPlayer, private hud: Hud) {
    for (const kind of ['lantern', 'chalice'] as const) {
      const { body, trim } = kind === 'chalice' ? chaliceGeometries() : lanternGeometries();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, mat), new THREE.Mesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));
      g.visible = false;
      ctx.scene.add(g);
      this.floaters[kind] = { g, mat };
    }

    net.on('welcome', (msg) => {
      const was = [...this.held.keys()];
      this.held.clear();
      for (const [id, b] of Object.entries(msg.blessings ?? {})) this.held.set(id, b);
      for (const id of new Set([...was, ...this.held.keys()])) this.onHeld(id);
    });
    net.on('blessing', (id, by, spot, prayers) => {
      if (by) this.held.set(id, { by, spot });
      else this.held.delete(id);
      this.onHeld(id);
      if (prayers !== undefined) this.onCount(id, prayers);
      const j = this.job;
      if (j && j.id === id && j.phase === 'wait') {
        if (by === net.id) this.begin(spot);
        else this.cancel(t('lantern.busy'));
      }
    });
  }

  get active() {
    return this.job !== null;
  }

  /** Whose hands a lantern is in (null: on its wall). */
  holder(id: string) {
    return this.held.get(id)?.by ?? null;
  }

  /** The colour of the lantern a player is carrying (for drawing it in their hands), if any. */
  /** The wish whose lantern `player` is carrying, if any. */
  heldBy(player: string) {
    for (const [id, b] of this.held) if (b.by === player) return id;
    return null;
  }

  colourHeldBy(player: string, colourOf: (id: string) => number | null) {
    for (const [id, b] of this.held) if (b.by === player) return colourOf(id);
    return null;
  }

  /** Bits for your transform: carrying a lantern, and how brightly (0–3). */
  get flags() {
    const j = this.job;
    if (!j || j.phase === 'wait' || j.phase === 'down' || j.phase === 'up') return 0;
    return FLAG_LANTERN | (Math.round(((this.glow - 1) / (BLESS_GLOW - 1)) * 3) << FLAG_GLOW_SHIFT);
  }

  /** Ask for the lantern; the server answers with a spot (or someone else got there first). */
  start(id: string, color: number, route: BlessRoute) {
    if (this.job || this.player.mode !== 'free') return;
    this.job = { id, color, route, phase: 'wait', t: 0, path: [], leg: 0, yaw: route.start.yaw, back: [] };
    this.player.anchor(route.start.x, this.ground(route.start), route.start.z, route.start.yaw, 'ritual', 'idle');
    this.ctx.interactions.enabled = false;
    if (!this.net.bless(id)) this.begin(0); // offline: nobody to wait for
  }

  /** Esc: hang it straight back. */
  cancel(message?: string) {
    const j = this.job;
    if (!j) return;
    if (j.phase !== 'wait') this.net.bless(j.id, true);
    this.finish();
    if (message) this.hud.toast(message);
  }

  private begin(spot: number) {
    const j = this.job!;
    const way = j.route.to(spot);
    j.path = way.path;
    j.yaw = way.yaw;
    j.back = [...way.path].reverse().slice(1).concat([{ x: j.route.start.x, z: j.route.start.z }]);
    this.go('down');
    this.floaterMat.color.setHex(j.color);
    this.floaterMat.emissive.setHex(j.color);
    this.floaterMat.emissiveIntensity = 0.45;
    this.floaters[j.route.kind === 'chalice' ? 'lantern' : 'chalice'].g.visible = false;
    this.floater.scale.setScalar(j.route.scale);
    this.floater.visible = true;
  }

  private go(phase: Phase) {
    const j = this.job!;
    j.phase = phase;
    j.t = 0;
    j.leg = 0;
  }

  private ground(p: { x: number; z: number }) {
    return this.ctx.ground.heightAt(p.x, p.z);
  }

  private handAt(out: THREE.Vector3) {
    const p = this.player.pos, yaw = this.player.yaw;
    return out.set(p.x - Math.sin(yaw) * 0.38, p.y + 1.35, p.z - Math.cos(yaw) * 0.38);
  }

  /** Walk along `path`; true when there. */
  private walk(path: { x: number; z: number }[], dt: number) {
    const j = this.job!;
    let step = SPEED * dt;
    const p = this.player.pos;
    while (j.leg < path.length && step > 0) {
      const q = path[j.leg], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d <= step) {
        p.x = q.x;
        p.z = q.z;
        step -= d;
        j.leg++;
        continue;
      }
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.player.anchor(p.x, this.ground(p), p.z, Math.atan2(-dx, -dz), 'ritual', 'walk', SPEED);
      return false;
    }
    return j.leg >= path.length;
  }

  update(dt: number) {
    const j = this.job;
    if (!j || j.phase === 'wait') return;
    j.t += dt;
    const v = new THREE.Vector3();
    switch (j.phase) {
      case 'down': { // from the hook into your hands
        const k = Math.min(1, j.t / DOWN), e = k * k * (3 - 2 * k);
        this.floater.position.lerpVectors(j.route.hook, this.handAt(v), e);
        if (k < 1) break;
        this.floater.visible = false;
        this.player.avatar.holdLantern(j.color, 1, j.route.scale, j.route.kind);
        this.go('walk');
        break;
      }
      case 'walk':
        if (this.walk(j.path, dt)) {
          const s = j.path[j.path.length - 1];
          this.player.anchor(s.x, this.ground(s), s.z, j.yaw, 'ritual', 'bow');
          this.go('bow');
        }
        break;
      case 'bow': { // three bows, the lantern brightening to twenty times its glow
        const k = Math.min(1, j.t / (BOW * BOWS));
        this.glow = 1 + (BLESS_GLOW - 1) * k;
        this.player.setAnchorAnim(j.t % BOW < BOW * 0.75 ? 'bow' : 'idle');
        if (k >= 1) this.go('dim');
        break;
      }
      case 'dim':
        this.glow = BLESS_GLOW - (BLESS_GLOW - 1) * Math.min(1, j.t / DIM);
        this.player.setAnchorAnim('idle');
        if (j.t >= DIM) this.go('back');
        break;
      case 'back':
        if (this.walk(j.back, dt)) {
          this.player.anchor(j.route.start.x, this.ground(j.route.start), j.route.start.z, j.route.start.yaw, 'ritual', 'idle');
          this.player.avatar.holdLantern(null);
          this.floater.visible = true;
          this.go('up');
        }
        break;
      case 'up': { // back onto its hook
        const k = Math.min(1, j.t / UP), e = k * k * (3 - 2 * k);
        this.floater.position.lerpVectors(this.handAt(v), j.route.hook, e);
        if (k >= 1) {
          this.net.bless(j.id, true);
          this.hud.toast(t('lantern.blessed'));
          this.onBlessed();
          this.finish();
        }
        break;
      }
    }
    if (this.job && (j.phase === 'walk' || j.phase === 'bow' || j.phase === 'dim' || j.phase === 'back')) this.player.avatar.holdLantern(j.color, this.glow, j.route.scale, j.route.kind);
  }

  private finish() {
    this.job = null;
    this.glow = 1;
    for (const f of Object.values(this.floaters)) f.g.visible = false;
    this.player.avatar.holdLantern(null);
    this.player.release();
    this.ctx.interactions.enabled = true;
  }
}
