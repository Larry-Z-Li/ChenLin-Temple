import * as THREE from 'three';
import { FRUIT_REGROW_MS, INCENSE_BURN_MS, INVENTORY_MAX, type Anim, type Fruit, type Offering } from '../../../shared/protocol';
import { FRUIT_TYPES } from '../config/theme';
import type { OfferingTable, WorldContext } from '../core/context';
import { glowTexture } from '../core/textures';
import { t, type I18nKey } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';
import type { Hud } from '../ui/hud';
import type { FruitSpot, Orchard } from '../world/vegetation';

/** 0 = empty-handed, 1 = holding unlit incense, 2 = holding lit incense. */
export type IncenseState = 0 | 1 | 2;

const fruitName = (f: Fruit) => t(FRUIT_TYPES[f].nameKey as I18nKey);

// Fruit piled in an offering bowl: [ring radius, height, count] per layer (24 per bowl).
const PILE = ([[0.21, 0, 10], [0.14, 0.09, 7], [0.075, 0.18, 4], [0.03, 0.26, 2], [0, 0.33, 1]] as const).flatMap(([r, y, n]) =>
  Array.from({ length: n }, (_, i) => (r === 0 && n === 1 ? [0, y, 0] : [Math.cos((i / n) * Math.PI * 2 + y * 9) * r, y, Math.sin((i / n) * Math.PI * 2 + y * 9) * r])),
);

interface Stick { mesh: THREE.Mesh; tip: THREE.Sprite; at: number; emit: number }

/**
 * Offering incense is one action: take a stick, light it at the candle, bow with it, plant it.
 * `incense` is what the hand holds during that step (others see it via the transform flags).
 */
const RITUAL: { anim: Anim; seconds: number; incense: IncenseState }[] = [
  { anim: 'reach', seconds: 0.9, incense: 0 }, // reach for a stick
  { anim: 'reach', seconds: 0.9, incense: 1 }, // hold it to the candle
  { anim: 'bow', seconds: 1.7, incense: 2 }, // bow with the lit incense
  { anim: 'reach', seconds: 0.9, incense: 2 }, // plant it in the ash
  { anim: 'idle', seconds: 0.35, incense: 0 },
];
interface TableVisual { table: OfferingTable; sticks: Map<string, Stick>; fruits: Map<string, THREE.Mesh>; order: string[] }

/**
 * Fruit picking (orchard) and offerings (incense + fruit) at every hall's table.
 * Server-authoritative: everyone sees the same picked fruit, burning incense and fruit piles.
 * Offerings stay until midnight in the temple's time zone; incense burns out after INCENSE_BURN_MS.
 */
export class Offerings {
  inventory: Fruit[] = [];
  incense: IncenseState = 0;
  private picked = new Map<string, number>(); // fruit id -> Date.now() when picked
  private spots = new Map<string, FruitSpot>();
  private tables = new Map<string, TableVisual>();
  private regrowAcc = 0;
  private ritual: { table: OfferingTable; step: number; t: number } | null = null;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Take one fruit of a kind out of the basket (e.g. fed to a deer). */
  removeFruit(f: Fruit) {
    const i = this.inventory.indexOf(f);
    if (i < 0) return;
    this.inventory.splice(i, 1);
    this.hud.setInventory(this.inventory);
  }
  private m = new THREE.Matrix4();
  private stickGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.3, 5).translate(0, 0.15, 0);
  private stickMat = new THREE.MeshStandardMaterial({ color: 0x9c4a2a, roughness: 0.9 });
  private fruitGeo = new THREE.SphereGeometry(0.065, 12, 9);
  private fruitMats = new Map<Fruit, THREE.Material>();
  // Incense smoke
  private smoke: THREE.Points;
  private sPos: Float32Array;
  private sCol: Float32Array;
  private sVel: Float32Array;
  private sLife: Float32Array;
  private sNext = 0;

  /** You just made an offering (功德). */
  onOffered: (kind: 'fruit' | 'incense') => void = () => {};

  constructor(private ctx: WorldContext, private net: NetClient, private hud: Hud, private orchard: Orchard, private player: LocalPlayer) {
    for (const tree of orchard.trees) for (const s of tree.spots) this.spots.set(s.id, s);

    orchard.trees.forEach((tree, i) =>
      ctx.interactions.add({
        id: `tree-${i}`, x: tree.x, z: tree.z, radius: 1.9,
        prompt: () => {
          if (!tree.spots.some((s) => !this.picked.has(s.id))) return { text: t('prompt.noRipe'), busy: true };
          if (this.inventory.length >= INVENTORY_MAX) return { text: t('prompt.handsFull'), busy: true };
          return { text: t('prompt.pick', { fruit: fruitName(tree.type) }) };
        },
        onInteract: () => {
          const spot = tree.spots.filter((s) => !this.picked.has(s.id)).sort((a, b) => a.position.y - b.position.y)[0];
          if (spot) net.pickFruit(spot.id);
        },
      }),
    );

    for (const table of ctx.offeringTables) this.addTable(table);

    // Smoke particles (vertex alpha for a soft fade).
    const N = 500;
    this.sPos = new Float32Array(N * 3).fill(-9999);
    this.sCol = new Float32Array(N * 4);
    this.sVel = new Float32Array(N * 3);
    this.sLife = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sCol, 4));
    this.smoke = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false;
    ctx.scene.add(this.smoke);

    net.on('welcome', (msg) => {
      // A fresh connection starts empty-handed on the server; mirror that.
      this.inventory = [];
      this.hud.setInventory(this.inventory);
      for (const id of [...this.picked.keys()]) this.regrow(id);
      const now = Date.now();
      for (const [id, ago] of Object.entries(msg.picked)) this.hide(id, now - ago);
      this.clearOfferings();
      for (const [hall, list] of Object.entries(msg.offerings)) for (const o of list) this.addOffering(hall, o);
    });
    net.on('picked', (id, by) => {
      this.hide(id, Date.now());
      const spot = this.spots.get(id);
      if (by === net.id && spot) {
        this.inventory.push(spot.type);
        this.hud.setInventory(this.inventory);
        this.hud.toast(t('pick.got', { fruit: fruitName(spot.type) }));
      }
    });
    net.on('pickDenied', (_id, reason) => this.hud.toast(t(reason === 'full' ? 'prompt.handsFull' : 'prompt.noRipe')));
    net.on('offered', (hall, o, by) => {
      this.addOffering(hall, o);
      if (by !== net.id) return;
      if (o.kind === 'fruit' && o.fruit) {
        const i = this.inventory.indexOf(o.fruit);
        if (i >= 0) this.inventory.splice(i, 1);
        this.hud.setInventory(this.inventory);
        this.hud.toast(t('offer.fruitDone', { fruit: fruitName(o.fruit) }));
        this.onOffered('fruit');
      } else {
        this.hud.toast(t('offer.incenseDone'));
        this.onOffered('incense');
      }
    });
    net.on('offerDenied', (reason) => this.hud.toast(t(reason === 'noFruit' ? 'offer.noFruit' : 'offer.full')));
    net.on('newDay', () => this.clearOfferings());
  }

  get busy() {
    return !!this.ritual;
  }

  private addTable(table: OfferingTable) {
    const vis: TableVisual = { table, sticks: new Map(), fruits: new Map(), order: [] };
    this.tables.set(table.hallId, vis);
    // visitors stand on the table's front side (south, unless the hall is turned)
    const fx = Math.sin(table.facing ?? 0), fz = Math.cos(table.facing ?? 0);
    const add = (key: string, x: number, z: number, prompt: () => { text: string } | null, act: () => void) =>
      this.ctx.interactions.add({ id: `${table.hallId}-${key}`, x, z, radius: 1.0, prompt, onInteract: act });

    const stand = table.stand ?? { x: table.x + fx, z: table.z + fz };
    add('incense', stand.x, stand.z, () => (this.ritual ? null : { text: t('prompt.placeIncense') }), () => this.startRitual(table));
    table.slots.forEach((slot, i) =>
      add(`plate${i}`, slot.x + fx * 0.92, slot.z + fz * 0.92, () => ({ text: this.inventory.length ? t('prompt.offerAllFruit', { n: this.inventory.length }) : t('prompt.offerFruit') }), () => {
        // Required: a clear message when there's nothing to offer.
        if (!this.inventory.length) return this.hud.toast(t('offer.noFruit'));
        this.net.offerFruits(table.hallId, [...this.inventory]);
      }),
    );
  }

  private startRitual(table: OfferingTable) {
    if (this.ritual || this.player.mode !== 'free') return;
    const stand = table.stand ?? { x: table.x + Math.sin(table.facing ?? 0), z: table.z + Math.cos(table.facing ?? 0) };
    const bowl = table.bowl ?? { x: table.x, z: table.z };
    const yaw = Math.atan2(-(bowl.x - stand.x), -(bowl.z - stand.z));
    this.player.anchor(stand.x, this.ctx.ground.heightAt(stand.x, stand.z), stand.z, yaw, 'ritual', RITUAL[0].anim);
    this.ctx.interactions.enabled = false;
    this.ritual = { table, step: 0, t: 0 };
  }

  private updateRitual(dt: number) {
    const r = this.ritual;
    if (!r) return;
    r.t += dt;
    if (r.t >= RITUAL[r.step].seconds) {
      r.t = 0;
      if (RITUAL[r.step].incense === 2 && RITUAL[r.step + 1]?.incense === 0) this.net.offerIncense(r.table.hallId); // planted
      if (++r.step >= RITUAL.length) {
        this.ritual = null;
        this.incense = 0;
        this.player.release();
        this.ctx.interactions.enabled = true;
        return;
      }
    }
    this.incense = RITUAL[r.step].incense;
    this.player.setAnchorAnim(RITUAL[r.step].anim);
  }

  private hide(id: string, at: number) {
    const s = this.spots.get(id);
    if (!s) return;
    this.picked.set(id, at);
    this.orchard.meshes[s.type].setMatrixAt(s.index, this.zero);
    this.orchard.meshes[s.type].instanceMatrix.needsUpdate = true;
  }

  private regrow(id: string) {
    const s = this.spots.get(id);
    this.picked.delete(id);
    if (!s) return;
    this.orchard.meshes[s.type].setMatrixAt(s.index, this.m.makeTranslation(s.position.x, s.position.y, s.position.z));
    this.orchard.meshes[s.type].instanceMatrix.needsUpdate = true;
  }

  private addOffering(hall: string, o: Offering) {
    const vis = this.tables.get(hall);
    if (!vis) return;
    const { table } = vis;
    if (o.kind === 'incense') {
      if (o.ago >= INCENSE_BURN_MS || vis.sticks.has(o.id)) return;
      const bowl = table.bowl ?? { x: table.x, y: table.y + 0.2, z: table.z, r: 0.21 };
      const i = vis.sticks.size + vis.order.length; // spread sticks around the bowl
      const a = i * 2.39996, r = 0.04 + (bowl.r - 0.04) * Math.sqrt((i % 40) / 40);
      const mesh = new THREE.Mesh(this.stickGeo, this.stickMat);
      mesh.position.set(bowl.x + Math.cos(a) * r, bowl.y, bowl.z + Math.sin(a) * r);
      mesh.rotation.set((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12);
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      tip.scale.setScalar(0.05);
      tip.position.y = 0.3;
      mesh.add(tip);
      this.ctx.scene.add(mesh);
      vis.sticks.set(o.id, { mesh, tip, at: Date.now() - o.ago, emit: Math.random() });
    } else if (o.fruit && table.slots.length && !vis.fruits.has(o.id)) {
      const n = vis.fruits.size;
      const slot = table.slots[n % table.slots.length], [px, py, pz] = PILE[Math.floor(n / table.slots.length) % PILE.length];
      let mat = this.fruitMats.get(o.fruit);
      if (!mat) this.fruitMats.set(o.fruit, (mat = new THREE.MeshStandardMaterial({ color: FRUIT_TYPES[o.fruit].color, roughness: 0.5 })));
      const mesh = new THREE.Mesh(this.fruitGeo, mat);
      mesh.position.set(slot.x + px, slot.y + 0.065 + py, slot.z + pz);
      mesh.castShadow = true;
      this.ctx.scene.add(mesh);
      vis.fruits.set(o.id, mesh);
    }
  }

  private clearOfferings() {
    for (const vis of this.tables.values()) {
      for (const s of vis.sticks.values()) this.ctx.scene.remove(s.mesh);
      for (const f of vis.fruits.values()) this.ctx.scene.remove(f);
      vis.sticks.clear();
      vis.fruits.clear();
      vis.order = [];
    }
  }

  private ambientAcc = 0;

  update(dt: number) {
    const now = Date.now();
    this.updateRitual(dt);
    // The big courtyard burner always smoulders a little.
    this.ambientAcc += dt * 5;
    while (this.ambientAcc >= 1) {
      this.ambientAcc -= 1;
      for (const vis of this.tables.values()) {
        const b = vis.table.bowl;
        if (!vis.table.ambientSmoke || !b) continue;
        const a = Math.random() * Math.PI * 2, r = Math.random() * b.r * 0.8;
        this.puff(new THREE.Vector3(b.x + Math.cos(a) * r, b.y + 0.1, b.z + Math.sin(a) * r));
      }
    }
    // Regrow fruit (checked about once a second).
    this.regrowAcc += dt;
    if (this.regrowAcc > 1) {
      this.regrowAcc = 0;
      for (const [id, at] of this.picked) if (now - at >= FRUIT_REGROW_MS) this.regrow(id);
    }

    // Burning incense: shortens over its burn time, then is gone; tips give off smoke.
    for (const vis of this.tables.values())
      for (const [id, s] of vis.sticks) {
        const p = (now - s.at) / INCENSE_BURN_MS;
        if (p >= 1) {
          this.ctx.scene.remove(s.mesh);
          vis.sticks.delete(id);
          continue;
        }
        const len = 1 - p * 0.8;
        s.mesh.scale.y = len;
        s.tip.position.y = 0.3;
        s.tip.scale.set(0.05, 0.05 / len, 1);
        s.emit += dt * 1.6;
        if (s.emit >= 1) {
          s.emit -= 1;
          const tipW = new THREE.Vector3(0, 0.3, 0);
          s.mesh.localToWorld(tipW);
          this.puff(tipW);
        }
      }

    const n = this.sLife.length;
    for (let i = 0; i < n; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      const k = i * 3, c = i * 4;
      if (this.sLife[i] <= 0) {
        this.sPos[k + 1] = -9999;
        continue;
      }
      this.sVel[k] += (Math.random() - 0.5) * dt * 0.08;
      this.sVel[k + 2] += (Math.random() - 0.5) * dt * 0.08;
      this.sPos[k] += this.sVel[k] * dt;
      this.sPos[k + 1] += this.sVel[k + 1] * dt;
      this.sPos[k + 2] += this.sVel[k + 2] * dt;
      const f = this.sLife[i] / 4;
      this.sCol[c] = this.sCol[c + 1] = this.sCol[c + 2] = 0.85;
      this.sCol[c + 3] = Math.min(1, (1 - f) * 5) * f * 0.45;
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.color.needsUpdate = true;
  }

  private puff(at: THREE.Vector3) {
    const i = this.sNext;
    this.sNext = (this.sNext + 1) % this.sLife.length;
    const k = i * 3;
    this.sPos[k] = at.x;
    this.sPos[k + 1] = at.y;
    this.sPos[k + 2] = at.z;
    this.sVel[k] = (Math.random() - 0.5) * 0.03;
    this.sVel[k + 1] = 0.18 + Math.random() * 0.08;
    this.sVel[k + 2] = (Math.random() - 0.5) * 0.03;
    this.sLife[i] = 4;
  }
}
