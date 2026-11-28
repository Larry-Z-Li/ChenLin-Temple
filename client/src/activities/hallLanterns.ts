import * as THREE from 'three';
import { HALL_WISH_SLOTS, type Wish } from '../../../shared/protocol';
import { box, cylinder, mat } from '../buildings/materials';
import { HALLS, hallYaw, PLATFORM_H } from '../config/layout';
import { rug } from '../buildings/hallFurnishings';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { canvasTexture } from '../core/textures';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import type { LanternShot } from './bodhiBell';
import type { BlessRoute, LanternBlessing } from './lanternBlessing';
import { h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import { addLamp, type Lamp } from '../world/lightPool';
import { colourGlowMaterial, haloPoints } from '../world/nightGlow';
import { chaliceGeometries, lanternGeometries, lanternHex, markHung, showWishForm, wishMeta, wishWait } from './wishLanterns';

const GRID = 7; // 7 × 7 per side
const COL = 0.95, ROW = 0.8, SCALE = 0.9;
/** Mock: this hall's walls are butter lamps on shelves instead of hanging lanterns (same grid, same wishes). */
/** Butter lamps on shelves in every hall (false: the paper lanterns on hooks). */
const CHALICES = true;
/** How far below a lantern's hook a lamp's shelf sits (the lamps fill the same band of wall). */
const SHELF_DROP = 0.7;
const PER_WALL = GRID * GRID; // slots 0–48 the left wall (west), 49–97 the right
const wallOf = (slot: number) => (slot < PER_WALL ? 0 : 1);
/** An unclaimed lantern, unlit: a deep maroon. Kept very dark, as the lanterns' shared material also glows in its colour. */
const DARK = new THREE.Color(0x3c1210);
/** Where people stand to bless, either side of the incense stand (metres from the middle). */
const SPOT_X = [-2.2, 2.2, -3.6, 3.6, -5, 5];

/**
 * A hall's lantern wall (光明燈) — every hall has one: two 7×7 grids on the back wall either side of the
 * middle, every hook hung with a dark red lantern. The wall and the writing table in its corner both open
 * the grid of its 49 lanterns, numbered, with whose wish each is (– if nobody's): a free one lets you write
 * a wish (title, wish, colour) and light it, for six months; a claimed one shows the wish, how many times
 * it's been blessed, and 祝福願望 — carry it to the altar and bow three times with it (see LanternBlessing).
 */
export class HallLanterns {
  private wishes = new Map<string, Wish>();
  private bySlot = new Map<number, Wish>();
  private bodies: THREE.InstancedMesh;
  private trims: THREE.InstancedMesh;
  private halos: THREE.Points;
  private hooks: THREE.Vector3[] = [];
  private panel: HTMLElement;
  private pending: string | null = null;
  /** Wish id whose title/text/colour you're saving (so a deny toast lands here). */
  private editing: string | null = null;
  /** Lanterns you've reported this visit. */
  private reported = new Set<string>();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Butter lamps on shelves (the mock hall) rather than lanterns on hooks. */
  readonly chalices: boolean;
  /** Your own lantern just went up (the great bell rings for you, and the camera visits it). */
  onHung: (shot: LanternShot) => void = () => {};
  /** Lanterns being shaken: slot → start (ms). */
  private shakes = new Map<number, number>();
  private glow: Lamp[];
  private walls: { at: THREE.Vector3; view: THREE.Vector3 }[] = [];
  /** How wide a wall's framing must be, and how far back the camera can go and stay in the room. */
  private wallSpan = 0;
  private viewMax = 7.4;
  /** Lantern size (smaller in lower halls, where the rows are closer). */
  private scale = SCALE;
  private root: THREE.Group;
  /** What's open in the panel (to refresh it when a lantern changes). */
  private view: { side: number } | { wish: string } | null = null;
  private routes: { start: { x: number; z: number; yaw: number }; side: number }[] = [];
  private spotAt: (spot: number, side: number) => { path: { x: number; z: number }[]; yaw: number };

  constructor(ctx: WorldContext, private net: NetClient, private hud: Hud, private player: LocalPlayer, ui: HTMLElement, public myName: string, readonly hallId: string, private blessing: LanternBlessing) {
    const hall = HALLS.find((x) => x.id === hallId)!;
    this.chalices = CHALICES;
    const F = PLATFORM_H, hw = hall.width / 2, wall = -hall.depth / 2 + 0.2; // inner face of the back wall
    this.viewMax = hall.depth - 1.5;
    const cx = (2 + hw) / 2; // middle of each wall stretch beside the middle 4 m
    // Built in the hall's own space (as if it faced south), then turned with the hall; W() gives world positions.
    const root = (this.root = new THREE.Group());
    root.position.set(hall.x, 0, hall.z);
    root.rotation.y = hallYaw(hall);
    root.updateMatrixWorld();
    root.userData.interiorAt = [hall.x, hall.z]; // (inside its hall: drawn only near it, like the statues)
    ctx.scene.add(root);
    const W = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(root.matrixWorld);
    // Each grid casts real light into the hall, brighter as it fills.
    this.glow = [-1, 1].map((s) => {
      const p = W(s * cx, F + 3.4, wall + 1.2);
      return addLamp({ x: p.x, y: p.y, z: p.z, color: 0xffb27a, intensity: 0, range: 8, decay: 1.6, indoor: true });
    });

    // ---- The hangers: lacquered rails on the wall with gold hooks, under a 光明燈 board ----
    const red = mat(THEME.column, { roughness: 0.55 });
    const gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });
    // Fit the grid under the ceiling: lower halls start the bottom row lower and space the rows closer.
    const low = (hall.wallHeight - 2.575) / (GRID - 1) < ROW;
    const rail0 = F + (low ? 1.2 : 1.6), row = Math.min(ROW, (hall.wallHeight - (low ? 2.175 : 2.575)) / (GRID - 1)), w = (GRID - 1) * COL + 0.7;
    this.scale = SCALE * Math.min(1, row / ROW);
    for (const s of [-1, 1]) {
      const gx = s * cx;
      if (this.chalices) {
        // shelves: a lacquered board under each row with a gold lip, deep sides; a ladder leaning beside them
        for (let r = 0; r < GRID; r++) {
          const y = rail0 + r * row - SHELF_DROP;
          root.add(box(w, 0.05, 0.46, red, gx, y - 0.05, wall + 0.23), box(w, 0.035, 0.025, gold, gx, y - 0.06, wall + 0.47));
        }
        for (const e of [-1, 1]) root.add(box(0.1, GRID * row + 0.3, 0.48, red, gx + (e * w) / 2, rail0 - 0.9, wall + 0.24));
        root.add(ladder(gx + s * (w / 2 + 0.42), F, wall));
        // solid: you can't walk into the shelves (or the ladder on the outer end)
        const a = W(gx - w / 2 - (s < 0 ? 0.8 : 0.05), 0, wall), b = W(gx + w / 2 + (s > 0 ? 0.8 : 0.05), 0, wall + 0.62);
        ctx.collisions.addBox(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z));
      } else {
        for (let r = 0; r < GRID; r++) root.add(box(w, 0.07, 0.08, red, gx, rail0 + r * row - 0.035, wall + 0.06));
        for (const e of [-1, 1]) root.add(box(0.12, GRID * row + 0.3, 0.12, red, gx + (e * w) / 2, rail0 - 0.9, wall + 0.06));
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.55), new THREE.MeshStandardMaterial({ map: signTexture() }));
      sign.position.set(gx, rail0 + (GRID - 1) * row + 0.55, wall + 0.04);
      root.add(sign);
      // The camera's framing of this whole wall, from the room.
      const cy = rail0 + ((GRID - 1) * row) / 2 + 0.2;
      this.walls.push({ at: W(gx, cy, wall), view: W(gx, cy - 0.3, wall + 7.4) });
      this.wallSpan = w + (this.chalices ? 1.8 : 0.8); // the shelves and their ladder (or the rails), with a margin
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) this.hooks.push(new THREE.Vector3(gx + (c - (GRID - 1) / 2) * COL, rail0 + (GRID - 1 - r) * row - (this.chalices ? SHELF_DROP : 0), wall + (this.chalices ? 0.25 : 0.36)));
    }
    const hookMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 5).rotateX(Math.PI / 2).translate(0, 0, -0.13), gold, HALL_WISH_SLOTS);
    this.hooks.forEach((p, i) => hookMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    if (!this.chalices) root.add(hookMesh); // (lamps stand on shelves: no hooks)

    // ---- Lanterns: one on every hook, dark red until someone lights it with a wish ----
    const { body, trim } = this.chalices ? chaliceGeometries() : lanternGeometries();
    this.bodies = new THREE.InstancedMesh(body, colourGlowMaterial({ roughness: 0.6 }, (n) => 1.0 + 0.5 * n), HALL_WISH_SLOTS);
    this.trims = new THREE.InstancedMesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), HALL_WISH_SLOTS);
    const halo: number[] = [];
    const still = new THREE.Matrix4();
    this.hooks.forEach((p, i) => {
      still.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)), new THREE.Vector3(this.scale, this.scale, this.scale));
      this.bodies.setMatrixAt(i, this.chalices ? this.hidden : still); // an unlit lamp has no flame
      this.trims.setMatrixAt(i, still);
      this.bodies.setColorAt(i, DARK);
      halo.push(p.x, p.y + (this.chalices ? 0.47 : -0.55) * this.scale, p.z);
    });
    this.halos = haloPoints(halo, new Array(halo.length).fill(0), 0.95, 0.85, 0.6);
    root.add(this.bodies, this.trims, this.halos);

    // ---- Writing tables in the back corners; table and wall both open that wall's grid ----
    [-1, 1].forEach((s, side) => {
      const tx = s * (hw - 1.4), tz = wall + 1.5;
      writingTable(ctx, root, tx, F, tz, W, this.chalices);
      rug(root, tx, F, tz + 1.05, 1.6, 1.1); // to stand on while you write
      const ti = W(tx, 0, tz + 0.9), wi = W(s * cx, 0, wall + 1.5);
      for (const [key, p, r] of [['table', ti, 1.2], ['wall', wi, 2.1]] as const)
        ctx.interactions.add({
          id: `hallwish-${hallId}-${key}${s}`, x: p.x, z: p.z, radius: r,
          prompt: () => ({ text: t('prompt.hallList', { n: this.onWall(side).length }) }),
          onInteract: () => this.openGrid(side),
        });
      // where you stand to take a lantern down from this wall (facing it)
      const st = W(s * cx, 0, wall + 1.7);
      this.routes.push({ start: { x: st.x, z: st.z, yaw: root.rotation.y }, side: s });
    });

    // ---- Places to bless, before the altar either side of the incense stand ----
    const table = ctx.offeringTables.find((o) => o.hallId === hallId);
    const tl = table ? root.worldToLocal(new THREE.Vector3(table.x, 0, table.z)) : new THREE.Vector3(0, 0, 0);
    this.spotAt = (spot, s) => {
      const sx = Math.max(-hw + 1.3, Math.min(hw - 1.3, tl.x + SPOT_X[spot % SPOT_X.length])), sz = tl.z + 1.9, aisle = s * (hw - 2.2);
      // along the side of the hall (round the altar), then in to the spot
      const path = [W(aisle, 0, wall + 1.7), W(aisle, 0, sz), W(sx, 0, sz)].map((v) => ({ x: v.x, z: v.z }));
      return { path, yaw: root.rotation.y };
    };

    this.panel = h('div', { class: 'wish-overlay hidden', onclick: (e: MouseEvent) => e.target === this.panel && this.close() });
    ui.append(this.panel);

    const mine = (w: Wish) => (w.board === 'hall' ? 'baosheng' : w.board) === hallId; // 'hall': saved before every hall had a wall
    net.on('welcome', (msg) => {
      for (const id of [...this.wishes.keys()]) this.remove(id);
      for (const w of msg.wishes) if (mine(w)) this.add(w);
      this.refresh();
    });
    net.on('wishAdded', (w) => {
      if (!mine(w)) return;
      this.add(w);
      this.refresh();
      const yours = this.pending !== null && w.title === this.pending && w.name === this.myName;
      if (this.chalices && !yours) this.shakes.set(w.slot, performance.now()); // lit: it swirls (yours when the camera gets there)
      if (yours) {
        this.pending = null;
        this.close(); // hung: back to the hall (the "six months" note comes after the bell)
        markHung();
        this.onHung(this.shotFor(w.slot));
      }
    });
    net.on('wishUpdated', (w) => {
      if (!mine(w)) return;
      this.update(w);
      if (this.editing === w.id) {
        this.editing = null;
        this.hud.toast(t('wish.saved'));
        this.openWish(w.id);
      } else this.refresh();
    });
    net.on('wishRemoved', (id) => {
      this.remove(id);
      this.refresh();
    });
    net.on('wishDenied', (reason) => {
      const toast = () => this.hud.toast(t(reason === 'full' ? 'hallWish.full' : reason === 'empty' ? 'wish.empty' : (`wish.${reason}` as 'wish.slow' | 'wish.blocked' | 'wish.limit' | 'wish.busy' | 'wish.taken')));
      if (this.editing !== null) {
        this.editing = null;
        return toast();
      }
      if (this.pending === null) return; // another wall's
      this.pending = null;
      toast();
    });

    // Gentle sway (lit lanterns only); every frame while one is shaking or swirling.
    let acc = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(this.scale, this.scale, this.scale), flame = new THREE.Vector3();
    const sw = { tilt: 0, dir: 0, spin: 0 }, lean = new THREE.Quaternion(), axis = new THREE.Vector3(), rim = new THREE.Vector3(), at = new THREE.Vector3();
    ctx.updaters.push((dt, time) => {
      if (!this.bySlot.size || ((acc += dt) < 0.05 && !this.shakes.size)) return;
      acc = 0;
      for (const w of this.bySlot.values()) {
        if (this.blessing.holder(w.id)) continue; // off the wall
        if (this.chalices) { // a lamp stays put (once it has swirled); its flame flickers
          at.copy(this.hooks[w.slot]);
          if (this.swirlAt(w.slot, sw)) { // leaning toward `dir`, rolling round on its base's rim
            q.setFromEuler(e.set(0, w.slot + sw.spin, 0));
            lean.setFromAxisAngle(axis.set(Math.sin(sw.dir), 0, -Math.cos(sw.dir)), sw.tilt);
            q.premultiply(lean);
            rim.set(Math.cos(sw.dir), 0, Math.sin(sw.dir)).multiplyScalar(0.162 * this.scale);
            at.add(rim); // the rim touching the shelf stays put
            at.sub(rim.applyQuaternion(lean));
          } else q.setFromEuler(e.set(0, w.slot, 0));
          m.compose(at, q, sc);
          this.trims.setMatrixAt(w.slot, m);
          const f = 1 + Math.sin(time * 9 + w.slot * 2.3) * 0.08 + Math.sin(time * 23 + w.slot) * 0.05;
          m.compose(at, q, flame.set(this.scale * f, this.scale, this.scale * f));
          this.bodies.setMatrixAt(w.slot, m);
          continue;
        }
        const k = this.shakeAt(w.slot);
        q.setFromEuler(e.set(Math.sin(time * 1.1 + w.slot) * 0.04 + k, w.slot, Math.sin(time * 0.8 + w.slot * 1.7) * 0.05 + k * 0.7));
        m.compose(this.hooks[w.slot], q, sc);
        this.bodies.setMatrixAt(w.slot, m);
        this.trims.setMatrixAt(w.slot, m);
      }
      this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    });
  }

  /** A wish's lantern was taken down (or hung back) somewhere: show or hide it on this wall. */
  heldChanged(id: string) {
    const w = this.wishes.get(id);
    if (!w) return;
    const away = !!this.blessing.holder(id);
    if (away) {
      this.bodies.setMatrixAt(w.slot, this.hidden);
      this.trims.setMatrixAt(w.slot, this.hidden);
      this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    }
    this.halo(w.slot, away ? new THREE.Color(0, 0, 0) : new THREE.Color(lanternHex(w.color)));
    this.refresh();
  }

  /** A wish's blessing count went up. */
  counted(id: string, prayers: number) {
    const w = this.wishes.get(id);
    if (w) w.prayers = prayers;
    this.refresh();
  }

  /** Its colour, if it's one of this wall's (for drawing it in someone's hands). */
  colourOf(id: string) {
    const w = this.wishes.get(id);
    return w ? lanternHex(w.color) : null;
  }

  /** The camera's view of the whole wall your lantern is on (from the room), and how to shake it. */
  private shotFor(slot: number): LanternShot {
    const w = this.walls[wallOf(slot)];
    // a tall, narrow screen (a phone held upright) sees less across: back off until the whole wall fits (60° lens)
    const d = Math.min(this.viewMax, Math.max(7.4, this.wallSpan / (2 * Math.tan(Math.PI / 6) * (innerWidth / innerHeight))));
    const view = w.view.clone().sub(w.at).multiplyScalar(d / 7.4).add(w.at);
    return { at: w.at.clone(), view, shake: () => this.shakes.set(slot, performance.now()) };
  }

  /**
   * A just-lit butter lamp spins down like Euler's disk: rolling round on the rim of its base, its lean dying away
   * as the roll gets faster and faster, until it settles flat with a whirr. false once it's still.
   */
  private swirlAt(slot: number, out: { tilt: number; dir: number; spin: number }) {
    const start = this.shakes.get(slot);
    if (start === undefined) return false;
    const T = 2.8, left = 1 - (performance.now() - start) / 1000 / T;
    if (left <= 0) return this.shakes.delete(slot), false;
    const r = Math.sqrt(left);
    out.tilt = 0.24 * r; // the lean falls away …
    out.dir = 2 * 7 * T * (1 - r); // … as it rolls round ever faster (rate ∝ 1/√time left)
    out.spin = -out.dir * 0.06; // the lamp itself only turns slowly, the other way
    return true;
  }

  /** Extra swing of a lantern that was just shaken (a few quick, dying wobbles). */
  private shakeAt(slot: number) {
    const start = this.shakes.get(slot);
    if (start === undefined) return 0;
    const age = (performance.now() - start) / 1000;
    if (age > 2.5) return this.shakes.delete(slot), 0;
    return 0.35 * Math.exp(-age * 2.2) * Math.sin(age * 15);
  }

  get isOpen() {
    return !this.panel.classList.contains('hidden');
  }

  close() {
    this.panel.classList.add('hidden');
    this.view = null;
  }

  private onWall(side: number) {
    return [...this.wishes.values()].filter((w) => wallOf(w.slot) === side);
  }

  private add(w: Wish) {
    if (this.wishes.has(w.id) || w.slot < 0 || w.slot >= HALL_WISH_SLOTS) return;
    const prev = this.bySlot.get(w.slot);
    if (prev) this.remove(prev.id);
    this.wishes.set(w.id, w);
    this.bySlot.set(w.slot, w);
    const c = new THREE.Color(lanternHex(w.color));
    this.bodies.setColorAt(w.slot, c);
    this.bodies.instanceColor!.needsUpdate = true;
    this.halo(w.slot, c);
    this.relight();
  }

  /** Title, wish or light colour changed on a lantern already on this wall. */
  private update(w: Wish) {
    if (!this.wishes.has(w.id) || w.slot < 0 || w.slot >= HALL_WISH_SLOTS) return;
    this.wishes.set(w.id, w);
    this.bySlot.set(w.slot, w);
    const c = new THREE.Color(lanternHex(w.color));
    this.bodies.setColorAt(w.slot, c);
    this.bodies.instanceColor!.needsUpdate = true;
    // Off the wall for a blessing: keep the halo dark until it's hung back.
    this.halo(w.slot, this.blessing.holder(w.id) ? new THREE.Color(0, 0, 0) : c);
  }

  private remove(id: string) {
    const w = this.wishes.get(id);
    if (!w) return;
    this.wishes.delete(id);
    if (this.bySlot.get(w.slot)?.id !== id) return;
    this.bySlot.delete(w.slot);
    // back to a dark lantern, still on its hook (a lamp, its flame out)
    const m = new THREE.Matrix4().compose(this.hooks[w.slot], new THREE.Quaternion().setFromEuler(new THREE.Euler(0, w.slot, 0)), new THREE.Vector3(this.scale, this.scale, this.scale));
    this.bodies.setMatrixAt(w.slot, this.chalices ? this.hidden : m);
    this.trims.setMatrixAt(w.slot, m);
    this.bodies.setColorAt(w.slot, DARK);
    this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    this.bodies.instanceColor!.needsUpdate = true;
    this.halo(w.slot, new THREE.Color(0, 0, 0));
    this.relight();
  }

  private relight() {
    for (let side = 0; side < 2; side++) {
      let n = 0;
      for (const s of this.bySlot.keys()) if (wallOf(s) === side) n++;
      this.glow[side].intensity = 7 * Math.min(1, n / 18);
    }
  }

  private halo(slot: number, c: THREE.Color) {
    const col = this.halos.geometry.attributes.color as THREE.BufferAttribute;
    col.setXYZ(slot, c.r * 0.8, c.g * 0.8, c.b * 0.8);
    col.needsUpdate = true;
  }

  private refresh() {
    const v = this.view;
    if (!v || !this.isOpen) return;
    if ('side' in v) this.openGrid(v.side);
    else if (this.wishes.has(v.wish)) this.openWish(v.wish);
    else this.close();
  }

  /** The wall's 49 lanterns, numbered: whose wish each is, or – for a free one. */
  private openGrid(side: number) {
    this.view = { side };
    const cells = Array.from({ length: PER_WALL }, (_, i) => {
      const slot = side * PER_WALL + i, w = this.bySlot.get(slot), away = w && this.blessing.holder(w.id);
      const cell = h('button', { class: `lg-cell${w ? ' claimed' : ''}${away ? ' away' : ''}`, title: w ? w.title : t('lantern.free') },
        h('span', { class: 'lg-num' }, String(i + 1)),
        h('span', { class: 'lg-name' }, w ? w.name : '–'),
      ) as HTMLButtonElement;
      if (w) cell.style.setProperty('--lc', `#${lanternHex(w.color).toString(16).padStart(6, '0')}`);
      cell.addEventListener('click', () => (w ? this.openWish(w.id) : this.claim(side, slot, note)));
      return cell;
    });
    // just lit one: how long until the next, in the menu itself (counting down; flashes if you try a free place)
    const note = h('div', { class: 'wish-note hidden' });
    const tick = () => {
      const s = wishWait();
      note.classList.toggle('hidden', !s);
      note.textContent = s ? t('wish.wait', { s }) : '';
      if (s && note.isConnected) setTimeout(tick, 1000);
    };
    this.panel.replaceChildren(
      h('div', { class: 'wish-card lantern-card' },
        h('div', { class: 'wish-heading' }, t('lantern.gridTitle', { wall: t(side ? 'lantern.right' : 'lantern.left'), n: this.onWall(side).length, max: PER_WALL })),
        h('div', { class: 'lantern-grid' }, ...cells),
        note,
        h('div', { class: 'wish-actions' }, h('button', { class: 'pill-btn', i18n: 'wish.close', onclick: () => this.close() })),
      ),
    );
    this.panel.classList.remove('hidden');
    tick();
  }

  /** A free hook: write a wish and light its lantern. */
  private claim(side: number, slot: number, note?: HTMLElement) {
    if (wishWait()) {
      if (!note) return this.hud.toast(t('wish.wait', { s: wishWait() }));
      note.classList.remove('flash');
      void note.offsetWidth; // restart the flash
      return note.classList.add('flash');
    }
    this.view = null;
    showWishForm(this.panel, this.hud, 'hallWish.heading', (title, text, color) => {
      this.pending = title;
      this.net.hangWish(title, text, color, this.myName, slot, this.hallId, side);
      this.player.gesture('reach', 0.8);
    }, () => this.openGrid(side));
  }

  /** A claimed lantern: the wish, how often it's been blessed, and 祝福願望 (or Edit, if it's yours). */
  private openWish(id: string) {
    const w = this.wishes.get(id);
    if (!w) return;
    this.view = { wish: id };
    const side = wallOf(w.slot), holder = this.blessing.holder(id), mine = w.name === this.myName;
    const report = mine ? null : (h('button', { class: 'wish-report', disabled: this.reported.has(w.id), i18n: this.reported.has(w.id) ? 'wish.reported' : 'wish.report' }) as HTMLButtonElement);
    report?.addEventListener('click', () => {
      this.reported.add(w.id);
      this.net.reportWish(w.id);
      report.disabled = true;
      report.dataset.i18n = 'wish.reported';
      report.textContent = t('wish.reported');
      this.hud.toast(t('wish.reportThanks'));
    });
    const bless = h('button', { class: 'primary-btn', disabled: !!holder || this.blessing.active }, holder ? t('lantern.away') : t('lantern.bless')) as HTMLButtonElement;
    bless.addEventListener('click', () => {
      this.close();
      const r = this.routes[side];
      const route: BlessRoute = { hook: this.root.localToWorld(this.chalices ? this.hooks[w.slot].clone() : this.hooks[w.slot].clone().add(new THREE.Vector3(0, -0.5 * this.scale, 0))), scale: this.scale, kind: this.chalices ? 'chalice' : 'lantern', start: r.start, to: (spot) => this.spotAt(spot, r.side) };
      this.blessing.start(w.id, lanternHex(w.color), route);
    });
    const edit = mine
      ? (h('button', { class: 'pill-btn', i18n: 'wish.edit', onclick: () => this.editWish(w.id) }) as HTMLButtonElement)
      : null;
    this.panel.replaceChildren(
      h('div', { class: 'wish-card' },
        h('div', { class: 'wish-heading' }, `${t('lantern.number', { n: (w.slot % PER_WALL) + 1 })} · ${w.title}`),
        w.text ? h('p', { class: 'wish-body' }, w.text) : null,
        h('div', { class: 'wish-meta' }, wishMeta(w)),
        h('div', { class: 'wish-meta' }, t('lantern.prayers', { n: w.prayers ?? 0 })),
        report,
        h('div', { class: 'wish-actions' },
          h('button', { class: 'pill-btn', i18n: 'lantern.back', onclick: () => this.openGrid(side) }),
          edit,
          bless,
        ),
      ),
    );
    this.panel.classList.remove('hidden');
  }

  /** Change the title, wish text or light colour on a lantern you hung. */
  private editWish(id: string) {
    const w = this.wishes.get(id);
    if (!w || w.name !== this.myName) return;
    this.view = null;
    showWishForm(
      this.panel,
      this.hud,
      'hallWish.heading',
      (title, text, color) => {
        this.editing = id;
        this.net.editWish(id, title, text, color, w);
      },
      () => this.openWish(id),
      { title: w.title, text: w.text, color: w.color, submitKey: 'wish.save' },
    );
  }
}

function signTexture() {
  return canvasTexture(512, 148, (g) => {
    g.fillStyle = '#7a1f16';
    g.fillRect(0, 0, 512, 148);
    g.strokeStyle = '#d9a441';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 504, 140);
    g.fillStyle = '#e8c76a';
    g.font = '700 84px "Noto Serif TC", "Songti TC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('光明燈', 256, 78);
  });
}

/** A small writing table: an unlit butter lamp (or paper lantern), a coil of red string, scissors, a pencil and paper slips. */
function writingTable(ctx: WorldContext, parent: THREE.Object3D, x: number, F: number, z: number, W: (x: number, y: number, z: number) => THREE.Vector3, chalice: boolean) {
  const wood = mat(0x5a2b1a, { roughness: 0.55 });
  const top = F + 0.8;
  const g = new THREE.Group();
  g.add(box(1.1, 0.06, 0.62, wood, x, top - 0.06, z));
  for (const [dx, dz] of [[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]]) g.add(box(0.06, 0.74, 0.06, wood, x + dx, F, z + dz));
  if (chalice) { // a butter lamp, unlit like the ones on the shelves waiting for a wish
    const lamp = new THREE.Mesh(chaliceGeometries().trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
    lamp.scale.setScalar(0.75);
    lamp.position.set(x - 0.34, top, z - 0.1);
    g.add(lamp);
  }
  // paper lantern on a little stand, unlit like the ones on the wall waiting for a wish
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8).scale(1, 1.15, 1), mat(DARK.getHex(), { roughness: 0.7 }));
  paper.position.set(x - 0.34, top + 0.17, z - 0.1);
  if (!chalice) g.add(paper, cylinder(0.07, 0.07, 0.03, mat(THEME.goldLeaf, { metalness: 0.6, roughness: 0.4 }), x - 0.34, top, z - 0.1, 10));
  // coil of red string
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 18).rotateX(Math.PI / 2), mat(0xc0221a, { roughness: 0.8 }));
  coil.position.set(x - 0.05, top + 0.012, z + 0.15);
  g.add(coil);
  // paper slips
  g.add(box(0.26, 0.012, 0.18, mat(0xf6efdc, { roughness: 0.9 }), x + 0.12, top, z - 0.1));
  // pencil
  const pencil = new THREE.Group();
  pencil.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.17, 6).rotateZ(Math.PI / 2), mat(0xe7b53a, { roughness: 0.6 })));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.025, 6).rotateZ(-Math.PI / 2), mat(0x3a2a1a));
  tip.position.x = 0.097;
  pencil.add(tip);
  pencil.position.set(x + 0.14, top + 0.019, z + 0.06);
  pencil.rotation.y = 0.35;
  g.add(pencil);
  // scissors: two blades and two finger loops
  const steel = mat(0xb9bec4, { metalness: 0.8, roughness: 0.3 }), handle = mat(0x1d1d1d, { roughness: 0.5 });
  const sc = new THREE.Group();
  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.014), steel);
    blade.position.set(0.05, 0, 0);
    blade.rotation.y = s * 0.18;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 12).rotateX(Math.PI / 2), handle);
    loop.position.set(-0.035, 0, s * 0.024);
    sc.add(blade, loop);
  }
  sc.position.set(x + 0.36, top + 0.008, z + 0.14);
  sc.rotation.y = -0.6;
  g.add(sc);
  parent.add(g);
  const p = W(x, 0, z), turned = Math.abs(Math.sin(parent.rotation.y)) > 0.5;
  ctx.collisions.addBoxCentered(p.x, p.z, turned ? 0.72 : 1.2, turned ? 1.2 : 0.72);
}

/** A wooden ladder leaning against the wall beside the lamp shelves (the mock hall's prop). */
function ladder(x: number, F: number, wall: number) {
  const g = new THREE.Group(), wood = mat(0x6b4a2e, { roughness: 0.85 }), L = 3.4;
  for (const s of [-1, 1]) g.add(box(0.06, L, 0.06, wood, s * 0.22, 0, 0));
  for (let y = 0.28; y < L - 0.1; y += 0.32) g.add(box(0.44, 0.04, 0.05, wood, 0, y, 0));
  g.position.set(x, F, wall + 0.75);
  g.rotation.x = -Math.asin(0.62 / L); // its top against the wall
  return g;
}
