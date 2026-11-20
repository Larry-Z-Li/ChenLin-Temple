import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WISH_SLOTS, WISH_TEXT_MAX, WISH_TITLE_MAX, WISH_TTL_MS, type Wish } from '../../../shared/protocol';
import { box, cylinder, mat } from '../buildings/materials';
import { WISH_GARDEN } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { canvasTexture } from '../core/textures';
import { t, type I18nKey } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import { h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import { LOTUS_COLOURS } from '../world/lanterns';
import { colourGlowMaterial, whiteColors } from '../world/nightGlow';

const G = WISH_GARDEN;
const PER_RACK = Math.ceil(WISH_SLOTS / G.racks.length);
const HOOK_Y = 2.75;

/** World position of a lantern hook. */
function slotPos(slot: number) {
  const rack = Math.floor(slot / PER_RACK), i = slot % PER_RACK;
  return { x: G.rackX0 + 0.5 + (i * (G.rackX1 - G.rackX0 - 1)) / (PER_RACK - 1), z: G.racks[rack] };
}

/** A wish lantern hanging from its hook at the origin: white glow body (tinted per instance) + string, gold caps and tassel. */
export function lanternGeometries() {
  return {
    body: whiteColors(new THREE.SphereGeometry(0.22, 14, 10).scale(1, 1.15, 1).translate(0, -0.55, 0)),
    trim: mergeGeometries([
      paint(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 3).translate(0, -0.15, 0), 0x2a1a10),
      paint(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12).translate(0, -0.31, 0), THEME.goldLeaf),
      paint(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12).translate(0, -0.8, 0), THEME.goldLeaf),
      paint(new THREE.CylinderGeometry(0.02, 0.045, 0.28, 6).translate(0, -0.97, 0), 0xc0221a),
    ]),
  };
}

export const lanternHex = (color: number) => LOTUS_COLOURS[color] ?? LOTUS_COLOURS[0];

/** The writing form (title, wish, colour) shown in `panel`; `onHang` gets the trimmed title (non-empty). */
export function showWishForm(panel: HTMLElement, hud: Hud, headingKey: I18nKey, onHang: (title: string, text: string, color: number) => void, close: () => void) {
  let color = 0;
  const title = h('input', { class: 'wish-input', maxlength: String(WISH_TITLE_MAX), placeholder: t('wish.title') }) as HTMLInputElement;
  const text = h('textarea', { class: 'wish-input wish-text', maxlength: String(WISH_TEXT_MAX), placeholder: t('wish.text'), rows: '4' }) as HTMLTextAreaElement;
  const swatches = LOTUS_COLOURS.map((c, i) =>
    h('button', {
      class: `wish-swatch${i === 0 ? ' on' : ''}`,
      style: `background:#${c.toString(16).padStart(6, '0')}`,
      onclick: (e: MouseEvent) => {
        color = i;
        swatches.forEach((s) => s.classList.remove('on'));
        (e.currentTarget as HTMLElement).classList.add('on');
      },
    }),
  );
  const submit = () => {
    const tt = title.value.trim();
    if (!tt) return hud.toast(t('wish.empty'));
    onHang(tt.slice(0, WISH_TITLE_MAX), text.value.trim(), color);
    close();
  };
  panel.replaceChildren(
    h('div', { class: 'wish-card' },
      h('div', { class: 'wish-heading', i18n: headingKey }),
      title, text,
      h('div', { class: 'wish-swatches' }, ...swatches),
      h('div', { class: 'wish-actions' },
        h('button', { class: 'pill-btn', i18n: 'wish.cancel', onclick: close }),
        h('button', { class: 'primary-btn', i18n: 'wish.hang', onclick: submit }),
      ),
    ),
  );
  panel.classList.remove('hidden');
  title.focus();
}

/** "— name · date · N days left" for a wish. */
export function wishMeta(w: Wish) {
  const days = Math.max(0, Math.ceil((w.at + WISH_TTL_MS - Date.now()) / 86400000));
  return t('wish.by', { name: w.name, date: new Date(w.at).toLocaleDateString(), days });
}

function paint(geo: THREE.BufferGeometry, hex: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  return g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * The wish-lantern garden on the plaza: write a title and a wish at the desk, pick a colour and hang it on the
 * racks for everyone to see. Lanterns stay 30 days; when every hook is taken the oldest comes down.
 */
export class WishLanterns {
  private wishes = new Map<string, Wish>();
  private bySlot = new Map<number, Wish>();
  private bodies: THREE.InstancedMesh;
  private trims: THREE.InstancedMesh;
  private tags = new Map<string, THREE.Sprite>();
  private panel: HTMLElement;
  private pendingTitle: string | null = null;
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Your own lantern just went up (the Bodhi tree's bell rings for you). */
  onHung: () => void = () => {};

  constructor(private ctx: WorldContext, private net: NetClient, private hud: Hud, private player: LocalPlayer, ui: HTMLElement, public myName: string) {
    this.buildGarden();

    // Lanterns: one instance per hook, hidden until a wish hangs there.
    const { body, trim } = lanternGeometries();
    this.bodies = new THREE.InstancedMesh(body, colourGlowMaterial({ roughness: 0.6 }, (n) => 0.2 + 1.3 * n), WISH_SLOTS);
    this.trims = new THREE.InstancedMesh(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), WISH_SLOTS);
    for (let s = 0; s < WISH_SLOTS; s++) {
      this.bodies.setMatrixAt(s, this.hidden);
      this.trims.setMatrixAt(s, this.hidden);
      this.bodies.setColorAt(s, new THREE.Color(0xffffff));
      const { x, z } = slotPos(s);
      ctx.interactions.add({
        id: `wish-${s}`, x, z, radius: 0.7,
        prompt: () => {
          const w = this.bySlot.get(s);
          return w ? { text: `${t('wish.read')}「${w.title}」` } : null;
        },
        onInteract: () => this.bySlot.get(s) && this.read(this.bySlot.get(s)!),
      });
    }
    ctx.scene.add(this.bodies, this.trims);

    this.panel = h('div', { class: 'wish-overlay hidden', onclick: (e: MouseEvent) => e.target === this.panel && this.close() });
    ui.append(this.panel);

    net.on('welcome', (msg) => {
      for (const id of [...this.wishes.keys()]) this.remove(id);
      for (const w of msg.wishes) this.add(w);
    });
    net.on('wishAdded', (w) => {
      if ((w.board ?? 'garden') !== 'garden') return;
      this.add(w);
      if (this.pendingTitle !== null && w.title === this.pendingTitle && w.name === this.myName) {
        this.pendingTitle = null;
        this.hud.toast(t('wish.hung'));
        this.onHung();
      }
    });
    net.on('wishRemoved', (id) => this.remove(id));
    net.on('wishDenied', (reason) => {
      if (this.pendingTitle === null) return; // the hall's wall
      this.pendingTitle = null;
      this.hud.toast(t(reason === 'slow' ? 'wish.slow' : 'wish.empty'));
    });

    let sway = 0;
    ctx.updaters.push((dt, time) => {
      sway += dt;
      if (sway < 0.05) return;
      sway = 0;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      for (const w of this.bySlot.values()) {
        const { x, z } = slotPos(w.slot);
        q.setFromEuler(e.set(Math.sin(time * 1.2 + w.slot) * 0.05, w.slot, Math.sin(time * 0.9 + w.slot * 1.7) * 0.06));
        m.compose(p.set(x, ctx.ground.heightAt(x, z) + HOOK_Y, z), q, one);
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

  private add(w: Wish) {
    if (this.wishes.has(w.id) || (w.board ?? 'garden') !== 'garden') return;
    const prev = this.bySlot.get(w.slot);
    if (prev) this.remove(prev.id);
    this.wishes.set(w.id, w);
    this.bySlot.set(w.slot, w);
    this.bodies.setColorAt(w.slot, new THREE.Color(lanternHex(w.color)));
    this.bodies.instanceColor!.needsUpdate = true;
    // Paper tag with the title, hanging under the lantern.
    const tex = canvasTexture(320, 72, (g) => {
      g.fillStyle = '#f6efdc';
      g.fillRect(0, 0, 320, 72);
      g.strokeStyle = '#b8902e';
      g.lineWidth = 4;
      g.strokeRect(2, 2, 316, 68);
      g.fillStyle = '#3a1a10';
      g.font = '600 34px "Noto Serif TC", "Songti TC", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(w.title, 160, 38, 300);
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    const { x, z } = slotPos(w.slot);
    tag.position.set(x, this.ctx.ground.heightAt(x, z) + HOOK_Y - 1.4, z);
    tag.scale.set(0.85, 0.19, 1);
    this.ctx.scene.add(tag);
    this.tags.set(w.id, tag);
  }

  private remove(id: string) {
    const w = this.wishes.get(id);
    if (!w) return;
    this.wishes.delete(id);
    if (this.bySlot.get(w.slot)?.id === id) {
      this.bySlot.delete(w.slot);
      this.bodies.setMatrixAt(w.slot, this.hidden);
      this.trims.setMatrixAt(w.slot, this.hidden);
      this.bodies.instanceMatrix.needsUpdate = this.trims.instanceMatrix.needsUpdate = true;
    }
    const tag = this.tags.get(id);
    if (tag) {
      tag.removeFromParent();
      tag.material.map?.dispose();
      tag.material.dispose();
      this.tags.delete(id);
    }
  }

  /** The writing desk form. */
  private openForm() {
    showWishForm(this.panel, this.hud, 'wish.heading', (title, text, color) => {
      this.pendingTitle = title;
      this.net.hangWish(title, text, color, this.myName, this.freeSlot());
      this.player.gesture('reach', 0.8);
    }, () => this.close());
  }

  private read(w: Wish) {
    this.panel.replaceChildren(
      h('div', { class: 'wish-card', style: `border-color:#${lanternHex(w.color).toString(16).padStart(6, '0')}` },
        h('div', { class: 'wish-heading' }, w.title),
        w.text ? h('p', { class: 'wish-body' }, w.text) : null,
        h('div', { class: 'wish-meta' }, wishMeta(w)),
        h('div', { class: 'wish-actions' }, h('button', { class: 'pill-btn', i18n: 'wish.close', onclick: () => this.close() })),
      ),
    );
    this.panel.classList.remove('hidden');
  }

  /** Offline only: the first empty hook, or the oldest lantern's. */
  private freeSlot() {
    for (let s = 0; s < WISH_SLOTS; s++) if (!this.bySlot.has(s)) return s;
    return [...this.wishes.values()].reduce((a, b) => (a.at <= b.at ? a : b)).slot;
  }

  private buildGarden() {
    const ctx = this.ctx;
    const y = ctx.ground.heightAt((G.minX + G.maxX) / 2, (G.minZ + G.maxZ) / 2);
    // Racks: red posts and a beam under a narrow tiled top.
    const red = mat(THEME.column, { roughness: 0.55 });
    for (const rz of G.racks) {
      for (let x = G.rackX0; x <= G.rackX1 + 0.01; x += 3) {
        ctx.scene.add(cylinder(0.08, 0.1, HOOK_Y + 0.25, red, x, y, rz, 8));
        ctx.collisions.addCircle(x, rz, 0.15);
      }
      ctx.scene.add(box(G.rackX1 - G.rackX0 + 0.4, 0.14, 0.14, red, (G.rackX0 + G.rackX1) / 2, y + HOOK_Y, rz));
      ctx.scene.add(box(G.rackX1 - G.rackX0 + 0.9, 0.08, 0.5, mat(THEME.roof, { roughness: 0.75 }), (G.rackX0 + G.rackX1) / 2, y + HOOK_Y + 0.25, rz));
    }

    // Writing desk facing the plaza's central walk (east): paper and ink in front, spare lanterns behind.
    const { x: dx, z: dz } = G.desk;
    const wood = mat(0x5a2b1a, { roughness: 0.55 });
    ctx.scene.add(box(0.8, 0.78, 1.6, wood, dx, y, dz));
    ctx.scene.add(box(0.5, 0.01, 0.36, mat(0xf6efdc), dx + 0.1, y + 0.78, dz - 0.2));
    ctx.scene.add(box(0.14, 0.03, 0.22, mat(0x222222, { roughness: 0.4 }), dx + 0.15, y + 0.78, dz + 0.3));
    [0, 3, 5].forEach((c, i) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8).scale(1, 1.15, 1), mat(LOTUS_COLOURS[c], { roughness: 0.6 }));
      l.position.set(dx - 0.2, y + 0.97, dz + 0.55 - i * 0.3);
      ctx.scene.add(l);
    });
    ctx.collisions.addBoxCentered(dx, dz, 0.9, 1.7);
    // Sign on a post
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.45),
      new THREE.MeshStandardMaterial({ map: canvasTexture(512, 144, (g) => {
        g.fillStyle = '#7a1f16';
        g.fillRect(0, 0, 512, 144);
        g.strokeStyle = '#d9a441';
        g.lineWidth = 8;
        g.strokeRect(4, 4, 504, 136);
        g.fillStyle = '#e8c76a';
        g.font = '700 76px "Noto Serif TC", "Songti TC", serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('燈願許', 256, 76);
      }) }),
    );
    sign.position.set(dx + 0.2, y + 2.1, dz - 1.2);
    sign.rotation.y = Math.PI / 2; // faces the central walk
    ctx.scene.add(sign, cylinder(0.05, 0.05, 2.3, wood, dx + 0.15, y, dz - 1.2, 6));

    ctx.interactions.add({ id: 'wish-desk', x: dx + 1.0, z: dz, radius: 1.5, prompt: () => ({ text: t('prompt.hangWish') }), onInteract: () => this.openForm() });

  }
}
