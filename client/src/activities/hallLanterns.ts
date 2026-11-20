import * as THREE from 'three';
import { HALL_WISH_SLOTS, type Wish } from '../../../shared/protocol';
import { box, cylinder, mat } from '../buildings/materials';
import { HALLS, PLATFORM_H, WISH_HALL } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { canvasTexture } from '../core/textures';
import { t } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import { h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import { LOTUS_COLOURS } from '../world/lanterns';
import { addLamp, type Lamp } from '../world/lightPool';
import { colourGlowMaterial, haloPoints } from '../world/nightGlow';
import { lanternGeometries, lanternHex, showWishForm, wishMeta } from './wishLanterns';

const GRID = 7; // 7 × 7 per side
const COL = 0.95, ROW = 0.8, SCALE = 0.9;
const PAGE = 20;

/**
 * The lantern wall (光明燈) in the first hall: two 7×7 grids of small glowing lanterns on the back
 * wall, either side of the back door behind the Buddha. A writing table in each back corner (paper
 * lantern, string, scissors, pencil) lets you hang one — title, wish and colour — for 30 days; when
 * all 98 hooks are taken it turns you away. The wall itself opens the list of every wish.
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
  private page = 0;
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Your own lantern just went up (the Bodhi tree's bell rings for you). */
  onHung: () => void = () => {};
  private glow: Lamp[];

  constructor(ctx: WorldContext, private net: NetClient, private hud: Hud, private player: LocalPlayer, ui: HTMLElement, public myName: string) {
    const hall = HALLS.find((x) => x.id === WISH_HALL)!;
    const F = PLATFORM_H, hw = hall.width / 2, wall = hall.z - hall.depth / 2 + 0.2; // inner face of the back wall
    const cx = (2 + hw) / 2; // middle of each wall stretch beside the 4 m back door
    // Each grid casts real light into the hall, brighter as it fills.
    this.glow = [-1, 1].map((s) => addLamp({ x: hall.x + s * cx, y: F + 3.4, z: wall + 1.2, color: 0xffb27a, intensity: 0, range: 8, decay: 1.6, indoor: true }));

    // ---- The hangers: lacquered rails on the wall with gold hooks, under a 光明燈 board ----
    const red = mat(THEME.column, { roughness: 0.55 });
    const gold = mat(THEME.goldLeaf, { metalness: 0.7, roughness: 0.35 });
    const rail0 = F + 1.6, w = (GRID - 1) * COL + 0.7;
    for (const s of [-1, 1]) {
      const gx = hall.x + s * cx;
      for (let r = 0; r < GRID; r++) ctx.scene.add(box(w, 0.07, 0.08, red, gx, rail0 + r * ROW - 0.035, wall + 0.06));
      for (const e of [-1, 1]) ctx.scene.add(box(0.12, GRID * ROW + 0.3, 0.12, red, gx + (e * w) / 2, rail0 - 0.9, wall + 0.06));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.55), new THREE.MeshStandardMaterial({ map: signTexture() }));
      sign.position.set(gx, rail0 + (GRID - 1) * ROW + 0.55, wall + 0.04);
      ctx.scene.add(sign);
      for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++) this.hooks.push(new THREE.Vector3(gx + (c - (GRID - 1) / 2) * COL, rail0 + (GRID - 1 - r) * ROW, wall + 0.36));
    }
    const hookMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 5).rotateX(Math.PI / 2).translate(0, 0, -0.13), gold, HALL_WISH_SLOTS);
    this.hooks.forEach((p, i) => hookMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    ctx.scene.add(hookMesh);

    // ---- Lanterns (one per hook, hidden until hung): always lit indoors ----
    const { body, trim } = lanternGeometries();
    this.bodies = new THREE.InstancedMesh(body, colourGlowMaterial({ roughness: 0.6 }, (n) => 1.0 + 0.5 * n), HALL_WISH_SLOTS);
    this.trims = new THREE.InstancedMesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), HALL_WISH_SLOTS);
    const halo: number[] = [];
    this.hooks.forEach((p, i) => {
      this.bodies.setMatrixAt(i, this.hidden);
      this.trims.setMatrixAt(i, this.hidden);
      this.bodies.setColorAt(i, new THREE.Color(0xffffff));
      halo.push(p.x, p.y - 0.55 * SCALE, p.z);
    });
    this.halos = haloPoints(halo, new Array(halo.length).fill(0), 0.95, 0.85, 0.6);
    ctx.scene.add(this.bodies, this.trims, this.halos);

    // ---- Writing tables in the back corners ----
    for (const s of [-1, 1]) {
      const tx = hall.x + s * (hw - 1.4), tz = wall + 1.5;
      writingTable(ctx, tx, F, tz);
      ctx.interactions.add({
        id: `hallwish-table${s}`, x: tx, z: tz + 0.9, radius: 1.2,
        prompt: () => ({ text: t(this.full ? 'prompt.hallWishFull' : 'prompt.hallWish') }),
        onInteract: () => (this.full ? this.hud.toast(t('hallWish.full')) : this.openForm()),
      });
      ctx.interactions.add({
        id: `hallwish-wall${s}`, x: hall.x + s * cx, z: wall + 1.5, radius: 2.1,
        prompt: () => ({ text: t('prompt.hallList', { n: this.wishes.size }) }),
        onInteract: () => this.openList(0),
      });
    }

    this.panel = h('div', { class: 'wish-overlay hidden', onclick: (e: MouseEvent) => e.target === this.panel && this.close() });
    ui.append(this.panel);

    const mine = (w: Wish) => w.board === 'hall';
    net.on('welcome', (msg) => {
      for (const id of [...this.wishes.keys()]) this.remove(id);
      for (const w of msg.wishes) if (mine(w)) this.add(w);
    });
    net.on('wishAdded', (w) => {
      if (!mine(w)) return;
      this.add(w);
      if (this.pending !== null && w.title === this.pending && w.name === this.myName) {
        this.pending = null;
        this.hud.toast(t('wish.hung'));
        this.onHung();
      }
    });
    net.on('wishRemoved', (id) => this.remove(id));
    net.on('wishDenied', (reason) => {
      if (this.pending === null) return; // the garden's desk
      this.pending = null;
      this.hud.toast(t(reason === 'full' ? 'hallWish.full' : reason === 'slow' ? 'wish.slow' : 'wish.empty'));
    });

    // Gentle sway.
    let acc = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(SCALE, SCALE, SCALE);
    ctx.updaters.push((dt, time) => {
      if ((acc += dt) < 0.05 || !this.bySlot.size) return;
      acc = 0;
      for (const w of this.bySlot.values()) {
        q.setFromEuler(e.set(Math.sin(time * 1.1 + w.slot) * 0.04, w.slot, Math.sin(time * 0.8 + w.slot * 1.7) * 0.05));
        m.compose(this.hooks[w.slot], q, sc);
        this.bodies.setMatrixAt(w.slot, m);
        this.trims.setMatrixAt(w.slot, m);
      }
      this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    });
  }

  get isOpen() {
    return !this.panel.classList.contains('hidden');
  }

  close() {
    this.panel.classList.add('hidden');
  }

  private get full() {
    return this.bySlot.size >= HALL_WISH_SLOTS;
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

  private remove(id: string) {
    const w = this.wishes.get(id);
    if (!w) return;
    this.wishes.delete(id);
    if (this.bySlot.get(w.slot)?.id !== id) return;
    this.bySlot.delete(w.slot);
    this.bodies.setMatrixAt(w.slot, this.hidden);
    this.trims.setMatrixAt(w.slot, this.hidden);
    this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    this.halo(w.slot, new THREE.Color(0, 0, 0));
    this.relight();
  }

  private relight() {
    for (let side = 0; side < 2; side++) {
      let n = 0;
      for (const s of this.bySlot.keys()) if ((s < HALL_WISH_SLOTS / 2 ? 0 : 1) === side) n++;
      this.glow[side].intensity = 7 * Math.min(1, n / 18);
    }
  }

  private halo(slot: number, c: THREE.Color) {
    const col = this.halos.geometry.attributes.color as THREE.BufferAttribute;
    col.setXYZ(slot, c.r * 0.8, c.g * 0.8, c.b * 0.8);
    col.needsUpdate = true;
  }

  private openForm() {
    showWishForm(this.panel, this.hud, 'hallWish.heading', (title, text, color) => {
      this.pending = title;
      this.net.hangWish(title, text, color, this.myName, this.freeSlot(), 'hall');
      this.player.gesture('reach', 0.8);
    }, () => this.close());
  }

  /** Every wish on the wall, newest first, 20 to a page; ^ opens one up. */
  private openList(page: number) {
    const all = [...this.wishes.values()].sort((a, b) => b.at - a.at);
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    this.page = Math.max(0, Math.min(pages - 1, page));
    const rows = all.slice(this.page * PAGE, this.page * PAGE + PAGE).map((w) => {
      const more = h('div', { class: 'wishlist-more' }, w.text ? h('p', { class: 'wish-body' }, w.text) : null, h('div', { class: 'wish-meta' }, wishMeta(w)));
      const row = h('div', { class: 'wishlist-row' },
        h('button', { class: 'wishlist-head', onclick: () => row.classList.toggle('open') },
          h('span', { class: 'wishlist-dot', style: `background:#${lanternHex(w.color).toString(16).padStart(6, '0')}` }),
          h('span', { class: 'wishlist-title' }, w.title),
          h('span', { class: 'wishlist-name' }, w.name),
          h('span', { class: 'wishlist-arrow' }, '^'),
        ),
        more,
      );
      return row;
    });
    this.panel.replaceChildren(
      h('div', { class: 'wish-card wishlist-card' },
        h('div', { class: 'wish-heading' }, t('hallWish.listTitle', { n: all.length, max: HALL_WISH_SLOTS })),
        h('div', { class: 'wishlist' }, ...(rows.length ? rows : [h('div', { class: 'wishlist-empty', i18n: 'hallWish.none' })])),
        h('div', { class: 'wish-actions wishlist-pager' },
          h('button', { class: 'pill-btn', i18n: 'hallWish.prev', disabled: this.page === 0, onclick: () => this.openList(this.page - 1) }),
          h('span', { class: 'wishlist-page' }, `${this.page + 1} / ${pages}`),
          h('button', { class: 'pill-btn', i18n: 'hallWish.next', disabled: this.page >= pages - 1, onclick: () => this.openList(this.page + 1) }),
          h('button', { class: 'pill-btn', i18n: 'wish.close', onclick: () => this.close() }),
        ),
      ),
    );
    this.panel.classList.remove('hidden');
  }

  /** Offline only: the first empty hook. */
  private freeSlot() {
    for (let s = 0; s < HALL_WISH_SLOTS; s++) if (!this.bySlot.has(s)) return s;
    return 0;
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

/** A small writing table: an unlit paper lantern, a coil of red string, scissors, a pencil and paper slips. */
function writingTable(ctx: WorldContext, x: number, F: number, z: number) {
  const wood = mat(0x5a2b1a, { roughness: 0.55 });
  const top = F + 0.8;
  const g = new THREE.Group();
  g.add(box(1.1, 0.06, 0.62, wood, x, top - 0.06, z));
  for (const [dx, dz] of [[-0.48, -0.24], [0.48, -0.24], [-0.48, 0.24], [0.48, 0.24]]) g.add(box(0.06, 0.74, 0.06, wood, x + dx, F, z + dz));
  // paper lantern (unlit) on a little stand
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8).scale(1, 1.15, 1), mat(LOTUS_COLOURS[1], { roughness: 0.7 }));
  paper.position.set(x - 0.34, top + 0.17, z - 0.1);
  g.add(paper, cylinder(0.07, 0.07, 0.03, mat(THEME.goldLeaf, { metalness: 0.6, roughness: 0.4 }), x - 0.34, top, z - 0.1, 10));
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
  ctx.scene.add(g);
  ctx.collisions.addBoxCentered(x, z, 1.2, 0.72);
}
