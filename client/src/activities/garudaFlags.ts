import * as THREE from 'three';
import { FLAG_COLOURS, FLAG_LINES_N, flagLine } from '../../../shared/flagRing';
import { GREAT_STUPA, TABLE_HUT } from '../config/layout';
import type { WorldContext } from '../core/context';
import { glowTexture } from '../core/textures';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import { h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import type { FlagRing } from '../world/flagRing';
import { buildGaruda, type Garuda } from '../world/garuda';
import { isReserved } from '../world/zones';

type Phase = 'light' | 'emerge' | 'fly' | 'descend' | 'snatch' | 'carry' | 'hang' | 'leave' | 'outro';
const SECONDS: Record<Phase, number> = { light: 2.8, emerge: 1.8, fly: 4.6, descend: 3.0, snatch: 1.4, carry: 0, hang: 2.2, leave: 2.6, outro: 1.3 };
const NEXT: Record<Phase, Phase | null> = { light: 'emerge', emerge: 'fly', fly: 'descend', descend: 'snatch', snatch: 'carry', carry: 'hang', hang: 'leave', leave: 'outro', outro: null };
const G_SCALE = 2.3; // (Garuda, a little over twice a person's height)
const WALK = 2.4; // (m/s, out onto the grass)
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
const ease = (k: number) => k * k * (3 - 2 * k);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const bez3 = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, k: number, out: THREE.Vector3) => {
  const u = 1 - k;
  return out.copy(a).multiplyScalar(u * u * u).addScaledVector(b, 3 * u * u * k).addScaledVector(c, 3 * u * k * k).addScaledVector(d, k * k * k);
};

/**
 * 風馬旗 at the table hut: write a prayer on the back of a flag (it isn't kept: no one can read it once it's hung)
 * and choose its colour; then Garuda comes out of a light far off over the temples, flies in and swoops down, takes
 * the flag from your raised hand with his feet and hangs it on the ring of lines round the temples (where it stays,
 * for everyone). A cinematic: the camera is the ceremony's while it runs.
 */
export class GarudaFlags {
  private panel: HTMLElement;
  private phase: Phase | null = null;
  private t = 0;
  private garuda: Garuda | null = null;
  private light: THREE.Sprite;
  private held: THREE.Mesh | null = null;
  private color = 0;
  private target: [number, number] | null = null;
  private waited = 0;
  // the visitor: a way out onto the grass (round the hut's posts and the poles), walked while Garuda comes
  private path: THREE.Vector3[] = [];
  private walked = 0;
  private pathLen = 0;
  private pYaw = 0;
  private spot = new THREE.Vector3();
  private arrived = false;
  // Garuda: where he comes from, the leg he's flying (a cubic's four points), his posture
  private far = new THREE.Vector3();
  private toTemple = new THREE.Vector3();
  private legs: THREE.Vector3[] = [];
  private route: THREE.CurvePath<THREE.Vector3> | null = null;
  private carryLen = 0;
  private hang = new THREE.Vector3();
  private slot = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  private flagFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  private gPrev = new THREE.Vector3();
  private gYaw = 0;
  private gLevel = 0;
  private gRoll = 0;
  private gDive = 0;
  private v = new THREE.Vector3();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camFresh = false;
  /** Called when a flag has been hung (for merit). */
  onHung: () => void = () => {};

  constructor(private ctx: WorldContext, private net: NetClient, private player: LocalPlayer, private hud: Hud, private ring: FlagRing) {
    this.panel = h('div', { class: 'wish-overlay hidden', onclick: (e: MouseEvent) => e.target === this.panel && this.close() });
    document.body.appendChild(this.panel);
    this.light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.light.visible = false;
    this.light.renderOrder = 5;
    ctx.scene.add(this.light);
    // the table (in front of it): give a flag
    const c = Math.round(Math.cos(TABLE_HUT.yaw)), s = Math.round(Math.sin(TABLE_HUT.yaw)), lz = 0.15;
    ctx.interactions.add({ id: 'garuda-flags', x: TABLE_HUT.x + lz * s, z: TABLE_HUT.z + lz * c, radius: 1.5, prompt: () => (this.active ? null : { text: t('flag.prompt') }), onInteract: () => this.open() });
    net.on('flag', (line, slot, color, by) => (by === net.id && this.phase ? (this.target = [line, slot]) : ring.hang(line, slot, color)));
  }

  get active() {
    return this.phase !== null;
  }

  private close() {
    this.panel.classList.add('hidden');
  }

  /** The form: the prayer (kept by no one), the flag's colour, and giving it to Garuda. */
  private open() {
    if (this.active) return;
    let color = 0;
    const text = h('textarea', { class: 'wish-input wish-text', maxlength: '200', placeholder: t('flag.text'), rows: '5' }) as HTMLTextAreaElement;
    const swatches = FLAG_COLOURS.map((c, i) =>
      h('button', {
        class: `wish-swatch${i === 0 ? ' on' : ''}`,
        style: `background:#${c.toString(16).padStart(6, '0')}`,
        onclick: (e: MouseEvent) => {
          color = i;
          swatches.forEach((b) => b.classList.remove('on'));
          (e.currentTarget as HTMLElement).classList.add('on');
        },
      }),
    );
    const give = () => {
      if (!text.value.trim()) return this.hud.toast(t('flag.empty'));
      this.close();
      this.start(color);
    };
    this.panel.replaceChildren(
      h('div', { class: 'wish-card' },
        h('div', { class: 'wish-heading', i18n: 'flag.heading' }),
        h('div', { class: 'wish-note', i18n: 'flag.note' }),
        text,
        h('div', { class: 'wish-swatches' }, ...swatches),
        h('div', { class: 'wish-actions' },
          h('button', { class: 'pill-btn', i18n: 'wish.cancel', onclick: () => this.close() }),
          h('button', { class: 'primary-btn', i18n: 'flag.give', onclick: give }),
        ),
      ),
    );
    this.panel.classList.remove('hidden');
    text.focus();
  }

  /** Begin: the light far off and Garuda out of it, while you walk out onto open grass with the flag in hand. */
  private start(color: number) {
    const p = this.player;
    this.color = color;
    this.target = null;
    this.waited = 0;
    if (!this.net.flagHang(color)) this.target = this.ring.freeSlot(); // (offline: place it ourselves)
    this.path = this.planWalk(p.pos);
    this.spot.copy(this.path[this.path.length - 1]);
    this.spot.y = this.ctx.ground.heightAt(this.spot.x, this.spot.z);
    this.pathLen = 0;
    for (let i = 1; i < this.path.length; i++) this.pathLen += this.path[i - 1].distanceTo(this.path[i]);
    this.walked = 0;
    this.arrived = this.pathLen < 0.05;
    this.pYaw = p.yaw;
    // the light: far off over the temples, high in the sky
    this.toTemple.set(GREAT_STUPA.x - this.spot.x, 0, GREAT_STUPA.z - this.spot.z).normalize();
    this.far.copy(this.spot).addScaledVector(this.toTemple, 150).add(new THREE.Vector3(0, 78, 0));
    // the flag in the right hand
    this.held = this.ring.makeFlag(color);
    this.held.scale.setScalar(0.9);
    this.held.position.set(0, -0.12, 0);
    this.held.rotation.set(Math.PI, 0, 0);
    p.avatar.rightHand.add(this.held);
    this.ctx.interactions.enabled = false;
    this.camFresh = true; // (picked up from the rig's camera in the first frame: see applyCamera)
    this.go('light');
  }

  private free(x: number, z: number, r: number) {
    const q = { x, z };
    this.ctx.collisions.resolve(q, r);
    return Math.hypot(q.x - x, q.z - z) < 0.005;
  }
  /** Can you walk straight from a to b? (`fromStart`: not minding what's within half a metre of a, where you stand.) */
  private clear(a: THREE.Vector3, b: THREE.Vector3, fromStart: boolean) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.25));
    for (let i = 0; i <= n; i++) {
      if (fromStart && (i / n) * L < 0.5) continue;
      if (!this.free(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, 0.42)) return false;
    }
    return true;
  }
  /** How far (x, z) is from the nearest of the ring's lines (Garuda's wings want room under them). */
  private lineGap(x: number, z: number) {
    let best = Infinity;
    for (let i = 0; i < FLAG_LINES_N; i++) {
      const [[ax, az], [bx, bz]] = flagLine(i), dx = bx - ax, dz = bz - az, k = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
    }
    return best;
  }
  /**
   * Where to stand and how to get there: open grass near the hut, clear all round (of trees, posts and the ring's
   * lines), reached by the shortest way round anything in between (through a few points round the hut).
   */
  private planWalk(at: THREE.Vector3): THREE.Vector3[] {
    const from = new THREE.Vector3(at.x, 0, at.z), spots: THREE.Vector3[] = [];
    for (const [r, room] of [[9, 4], [12, 4], [15, 4], [18, 4], [12, 2.5], [18, 2.5]] as const) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = TABLE_HUT.x + Math.sin(a) * r, z = TABLE_HUT.z + Math.cos(a) * r;
      if (!isReserved(x, z, 2.5) && this.free(x, z, room) && this.lineGap(x, z) > 5) spots.push(new THREE.Vector3(x, 0, z));
    }
    spots.sort((a, b) => a.distanceToSquared(from) - b.distanceToSquared(from));
    const ring = (r: number) => Array.from({ length: 16 }, (_, k) => new THREE.Vector3(TABLE_HUT.x + Math.sin((k / 16) * Math.PI * 2) * r, 0, TABLE_HUT.z + Math.cos((k / 16) * Math.PI * 2) * r));
    const nodes = [from, ...[...ring(4.2), ...ring(7)].filter((v) => this.free(v.x, v.z, 0.45))], n = nodes.length;
    const edge = nodes.map(() => new Array<number>(n).fill(Infinity));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (this.clear(nodes[i], nodes[j], i === 0)) edge[i][j] = edge[j][i] = nodes[i].distanceTo(nodes[j]);
    const dist = new Array<number>(n).fill(Infinity), prev = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (let w = 0; w < n; w++) if (dist[u] + edge[u][w] < dist[w]) (dist[w] = dist[u] + edge[u][w]), (prev[w] = u);
    }
    for (const spot of spots.slice(0, 12)) {
      let best = -1, cost = Infinity;
      nodes.forEach((v, i) => {
        if (dist[i] === Infinity) return;
        const c = dist[i] + v.distanceTo(spot);
        if (c < cost && this.clear(v, spot, i === 0)) (cost = c), (best = i);
      });
      if (best < 0) continue;
      const path = [spot];
      for (let i = best; i >= 0; i = prev[i]) path.unshift(nodes[i]);
      return path;
    }
    return [from, from.clone()];
  }

  /** The highest ground under the straight line from a to b (to fly well clear of the roofs on it). */
  private groundMax(a: THREE.Vector3, b: THREE.Vector3) {
    let m = -Infinity;
    for (let i = 0; i <= 24; i++) m = Math.max(m, this.ctx.ground.heightAt(a.x + ((b.x - a.x) * i) / 24, a.z + ((b.z - a.z) * i) / 24));
    return m;
  }

  private go(ph: Phase) {
    this.phase = ph;
    this.t = 0;
    const g = this.garuda, up = (y: number) => new THREE.Vector3(0, y, 0);
    if (ph === 'emerge') {
      const ng = (this.garuda = buildGaruda());
      ng.root.position.copy(this.far);
      ng.root.scale.setScalar(0.01);
      this.ctx.scene.add(ng.root);
      this.gPrev.copy(this.far);
      this.gYaw = Math.atan2(this.spot.x - this.far.x, this.spot.z - this.far.z);
      this.gLevel = this.gRoll = this.gDive = 0;
    }
    if (ph === 'fly') { // high over the temples, clear of every roof, to a point above and before you
      const above = this.spot.clone().addScaledVector(this.toTemple, 20).add(up(34));
      const top = Math.max(this.far.y, above.y, this.groundMax(this.far, above) + 38);
      this.legs = [this.far.clone(), this.far.clone().lerp(above, 0.35).setY(top), this.far.clone().lerp(above, 0.75).setY(top), above];
    }
    if (ph === 'descend') { // the dive, flattening out just over your raised hand
      const swoop = this.player.avatar.rightHand.getWorldPosition(new THREE.Vector3()).add(up(1.25));
      this.legs = [g!.root.position.clone(), this.spot.clone().addScaledVector(this.toTemple, 13).setY(this.spot.y + 15), swoop.clone().addScaledVector(this.toTemple, 5).add(up(0.8)), swoop];
    }
    if (ph === 'carry') { // up, high over the temples, and down onto the line
      const [line, slot] = this.target!, s = this.ring.slotAt(line, slot);
      this.slot.p.copy(s.p);
      this.slot.q.copy(s.q);
      this.hang.copy(s.p).add(up(1.7));
      // (steeply up off the grass, straight across well over every roof, and down onto the line almost from straight
      // above it, so never low over the halls on either side)
      const from = g!.root.position.clone(), to = s.p.clone().add(up(0.35));
      const d = Math.hypot(to.x - from.x, to.z - from.z), dir = d > 1 ? new THREE.Vector3(to.x - from.x, 0, to.z - from.z).divideScalar(d) : this.toTemple.clone();
      const cruise = Math.max(Math.max(from.y, to.y) + 12, this.groundMax(from, to) + 38);
      const h1 = Math.min(16, d * 0.4), h2 = Math.min(12, d * 0.3);
      const top1 = from.clone().addScaledVector(dir, h1).setY(cruise), top2 = to.clone().addScaledVector(dir, -h2).setY(cruise);
      const route = new THREE.CurvePath<THREE.Vector3>();
      route.add(new THREE.CubicBezierCurve3(from, from.clone().setY(from.y + (cruise - from.y) * 0.5), top1.clone().addScaledVector(dir, -h1 * 0.5), top1));
      if (top1.distanceTo(top2) > 0.5) route.add(new THREE.LineCurve3(top1, top2));
      route.add(new THREE.CubicBezierCurve3(top2, top2.clone().addScaledVector(dir, h2 * 0.66), to.clone().setY(to.y + (cruise - to.y) * 0.6), to));
      this.route = route;
      this.carryLen = Math.max(5, route.getLength() / 20);
    }
    if (ph === 'hang' && this.held) { // into the world: lowered from here onto its place, his foot keeping hold of it
      this.ctx.scene.attach(this.held);
      this.flagFrom.p.copy(this.held.position);
      this.flagFrom.q.copy(this.held.quaternion);
      this.flagFrom.s = this.held.scale.x;
    }
    if (ph === 'leave') this.legs = [g!.root.position.clone()];
  }

  /** The visitor: along the way out, then facing Garuda with the flag held high till he has it. */
  private walk(dt: number) {
    const p = this.player, g = this.garuda;
    let x = this.spot.x, z = this.spot.z, speed = 0, yaw = this.pYaw;
    if (!this.arrived) {
      this.walked = Math.min(this.pathLen, this.walked + WALK * dt);
      let d = this.walked, i = 1;
      while (i < this.path.length - 1 && d > this.path[i - 1].distanceTo(this.path[i])) d -= this.path[i - 1].distanceTo(this.path[i++ ]);
      const a = this.path[i - 1], b = this.path[i], f = Math.min(1, d / Math.max(1e-6, a.distanceTo(b)));
      x = a.x + (b.x - a.x) * f;
      z = a.z + (b.z - a.z) * f;
      yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      speed = WALK;
      if (this.walked >= this.pathLen) this.arrived = true;
    } else {
      const to = g ? g.root.position : this.far;
      if (Math.hypot(to.x - x, to.z - z) > 3) yaw = Math.atan2(-(to.x - x), -(to.z - z));
    }
    this.pYaw += wrap(yaw - this.pYaw) * (1 - Math.exp(-dt * 8));
    const holding = this.arrived && !!g && this.held?.parent === p.avatar.rightHand;
    p.puppet(dt, x, this.ctx.ground.heightAt(x, z), z, this.pYaw, speed, false, holding ? 'offerUp' : 'idle');
  }

  /** Garuda's bearing: flat out and beating his wings in flight (banking into turns), upright when he hovers. */
  private pose(g: Garuda, dt: number, ph: Phase) {
    const at = g.root.position, v = this.v.copy(at).sub(this.gPrev).divideScalar(Math.max(dt, 1e-3)), hs = Math.hypot(v.x, v.z);
    this.gPrev.copy(at);
    const hover = ph === 'emerge' || ph === 'snatch' || ph === 'hang';
    let yaw = this.gYaw;
    if (!hover && hs > 1.5) yaw = Math.atan2(v.x, v.z);
    if (ph === 'hang') yaw = Math.atan2(this.slot.p.x - GREAT_STUPA.x, this.slot.p.z - GREAT_STUPA.z); // (facing out of the ring, to the camera)
    const turn = wrap(yaw - this.gYaw) * (1 - Math.exp(-dt * 3));
    this.gYaw += turn;
    this.gLevel += ((hover ? 0 : THREE.MathUtils.smoothstep(hs, 2, 9)) - this.gLevel) * (1 - Math.exp(-dt * 3)); // (rising or sinking straight, upright)
    this.gRoll += (THREE.MathUtils.clamp((-turn / Math.max(dt, 1e-3)) * 0.35, -0.6, 0.6) * this.gLevel - this.gRoll) * (1 - Math.exp(-dt * 4));
    this.gDive += (THREE.MathUtils.clamp(Math.atan2(-v.y, Math.max(hs, 0.1)), -0.5, 0.7) * 0.7 - this.gDive) * (1 - Math.exp(-dt * 4));
    g.root.quaternion.setFromAxisAngle(UP, this.gYaw).multiply(this.qa.setFromAxisAngle(XA, THREE.MathUtils.lerp(0.22, Math.PI / 2 + this.gDive, this.gLevel))).multiply(this.qb.setFromAxisAngle(UP, this.gRoll));
    g.update(dt, 'flap', this.gLevel);
  }

  /** Move Garuda so his right foot is at `want` (eased in by `follow`; 1 = exactly). */
  private footTo(g: Garuda, want: THREE.Vector3, follow: number) {
    g.root.updateMatrixWorld(true);
    const off = g.bones['foot.R'].getWorldPosition(new THREE.Vector3()).sub(g.root.position);
    g.root.position.lerp(want.sub(off), follow);
  }

  update(dt: number) {
    if (!this.phase) return;
    this.t += dt;
    const ph = this.phase, k = Math.min(1, this.t / (ph === 'carry' ? this.carryLen : SECONDS[ph]));
    const g = this.garuda;
    this.walk(dt);
    // the light far off, growing; out of it, Garuda
    if (ph === 'light' || ph === 'emerge' || ph === 'leave') {
      this.light.visible = true;
      if (ph === 'light') this.light.position.copy(this.far), this.light.scale.setScalar(4 + 56 * ease(k) * (0.92 + 0.08 * Math.sin(this.t * 13))), (this.light.material.opacity = 1);
      if (ph === 'emerge') this.light.scale.setScalar(60 * (1 - 0.75 * ease(k))), (this.light.material.opacity = 1 - 0.6 * k);
      if (ph === 'leave') this.light.position.copy(g!.root.position), this.light.scale.setScalar(30 * Math.sin(Math.PI * k)), (this.light.material.opacity = 1);
    } else this.light.visible = false;
    if (g) {
      const at = g.root.position, foot = g.bones['foot.R'];
      if (ph === 'emerge') at.copy(this.far), g.root.scale.setScalar(Math.max(0.01, G_SCALE * ease(k)));
      if (ph === 'carry') this.route!.getPointAt(ease(k), at);
      if (ph === 'fly' || ph === 'descend') bez3(this.legs[0], this.legs[1], this.legs[2], this.legs[3], ease(k), at);
      if (ph === 'leave') {
        const out = new THREE.Vector3(this.hang.x - GREAT_STUPA.x, 0, this.hang.z - GREAT_STUPA.z).normalize();
        at.copy(this.legs[0]).add(new THREE.Vector3(0, 30 * ease(k), 0)).addScaledVector(out, 25 * ease(k));
        g.root.scale.setScalar(G_SCALE * (1 - 0.95 * ease(Math.max(0, (k - 0.4) / 0.6))));
      }
      this.pose(g, dt, ph);
      if (ph === 'snatch') { // down to your hand, the flag into his talons, and up again
        const hand = this.player.avatar.rightHand.getWorldPosition(new THREE.Vector3());
        this.footTo(g, hand.add(new THREE.Vector3(0, 0.12 + 1.1 * (1 - Math.sin(Math.PI * k)), 0)), 1 - Math.exp(-dt * 10));
        if (k >= 0.5 && this.held && this.held.parent !== foot) {
          foot.add(this.held);
          this.held.position.set(0, -0.06, 0.05);
          this.held.scale.setScalar(0.9 / G_SCALE);
        }
        if (k >= 1) {
          if (!this.target && (this.waited += dt) < 3) return this.applyFrame(); // (waiting to hear where it hangs)
          this.target ??= this.ring.freeSlot() ?? [0, 0];
          this.go('carry');
        }
      }
      if (ph === 'hang') { // the flag lowered onto its place with his foot on it, let go, and he lifts off it
        if (this.held) {
          const kk = ease(Math.min(1, k / 0.55));
          this.held.position.lerpVectors(this.flagFrom.p, this.slot.p, kk);
          this.held.quaternion.slerpQuaternions(this.flagFrom.q, this.slot.q, kk);
          this.held.scale.setScalar(THREE.MathUtils.lerp(this.flagFrom.s, 1, kk));
          this.footTo(g, this.held.position.clone().add(new THREE.Vector3(0, 0.06, 0)), 1);
          if (k >= 0.55) {
            const [line, slot] = this.target!;
            this.held.removeFromParent();
            this.held = null;
            this.ring.hang(line, slot, this.color);
            this.onHung();
          }
        } else this.footTo(g, this.slot.p.clone().add(new THREE.Vector3(0, 0.06 + 1.6 * ease((k - 0.55) / 0.45), 0)), 1 - Math.exp(-dt * 10));
      }
      // carried: hanging straight down from his foot, whatever his bearing
      if (this.held && this.held.parent === foot) {
        g.root.updateMatrixWorld(true);
        this.held.quaternion.copy(foot.getWorldQuaternion(this.qa).invert().multiply(this.qb.setFromAxisAngle(UP, this.gYaw + Math.PI / 2)));
      }
    }
    if (ph !== 'snatch' && k >= 1 && !(ph === 'fly' && !this.arrived)) { // (he holds above you till you're out on the grass)
      const n = NEXT[ph];
      if (n) this.go(n);
      else return this.finish();
    }
    this.applyFrame();
  }

  private finish() {
    if (this.garuda) this.ctx.scene.remove(this.garuda.root), (this.garuda = null);
    this.held?.removeFromParent();
    this.held = null;
    this.light.visible = false;
    this.phase = null;
    this.ctx.interactions.enabled = true;
  }

  private shot = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  /** Where the camera wants to be this moment (the ceremony's shots). */
  private applyFrame() {
    const ph = this.phase!, P = this.player.pos, g = this.garuda?.root.position, s = this.shot;
    const toFar = new THREE.Vector3(this.far.x - this.spot.x, 0, this.far.z - this.spot.z).normalize(), side = new THREE.Vector3(-toFar.z, 0, toFar.x);
    const head = P.clone().add(new THREE.Vector3(0, 1.5, 0));
    switch (ph) {
      case 'light': s.pos.copy(P).addScaledVector(toFar, -5).addScaledVector(side, 1.4).add(new THREE.Vector3(0, 1.3, 0)), s.look.copy(this.far); break; // (behind you as you walk out, the light ahead)
      case 'emerge': s.pos.copy(this.far).addScaledVector(toFar, -38).addScaledVector(side, 12).add(new THREE.Vector3(0, -10, 0)), s.look.copy(this.far); break;
      case 'fly': s.pos.copy(g!).addScaledVector(side, 16).addScaledVector(toFar, 8).add(new THREE.Vector3(0, -3, 0)), s.look.copy(g!); break;
      case 'descend': s.pos.copy(this.spot).addScaledVector(side, 7).addScaledVector(toFar, -2).add(new THREE.Vector3(0, 0.6, 0)), s.look.copy(g!); break;
      case 'snatch': s.pos.copy(this.spot).addScaledVector(side, 3.6).addScaledVector(toFar, -2.2).add(new THREE.Vector3(0, 2.0, 0)), s.look.copy(this.legs[3]).add(new THREE.Vector3(0, -0.6, 0)); break;
      case 'carry': { const back = g!.clone().sub(this.gPrev).setY(0).normalize(); s.pos.copy(g!).addScaledVector(back.lengthSq() ? back : toFar, -11).add(new THREE.Vector3(0, 4, 0)), s.look.copy(g!); break; }
      case 'hang': case 'leave': { const out = new THREE.Vector3(this.hang.x - GREAT_STUPA.x, 0, this.hang.z - GREAT_STUPA.z).normalize(); s.pos.copy(this.hang).addScaledVector(out, 9).add(new THREE.Vector3(0, -2.2, 0)), s.look.copy(ph === 'leave' ? g! : this.hang); break; }
      case 'outro': s.pos.copy(P).addScaledVector(toFar, -4.5).add(new THREE.Vector3(0, 2.4, 0)), s.look.copy(head); break;
    }
  }

  /** After the camera rig has placed the camera: while the ceremony runs, its shots instead (eased between). */
  applyCamera(camera: THREE.Camera, dt: number) {
    if (!this.phase) return;
    if (this.camFresh) (this.camFresh = false), this.camPos.copy(camera.position), this.camLook.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
    const k = 1 - Math.exp(-dt * (this.phase === 'outro' ? 3 : 2.2));
    if (this.phase === 'outro') this.shot.pos.copy(camera.position), this.shot.look.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()));
    this.camPos.lerp(this.shot.pos, k);
    this.camLook.lerp(this.shot.look, k);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }
}
