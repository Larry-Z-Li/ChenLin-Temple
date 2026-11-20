import type * as THREE from 'three';
import { t } from '../i18n';
import { h } from './dom';
import { TRAVEL_SPOTS, type TravelSpot } from '../config/layout';
import { drawTempleMap, mapProjector } from './mapDraw';

/** Small round map in the corner (south-up). Click it for the big map. */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private size = 200;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(parent: HTMLElement, onClick: () => void) {
    this.el = h('canvas', { class: 'minimap', onclick: onClick }) as HTMLCanvasElement;
    this.el.width = this.el.height = this.size * this.dpr;
    this.g = this.el.getContext('2d')!;
    parent.append(this.el);
    // Phones get a round map button here instead (CSS shows one or the other).
    parent.append(h('button', { class: 'minimap-btn', i18n: 'hud.map', onclick: onClick }));
  }

  draw(me: THREE.Vector3, myYaw: number, others: THREE.Vector3[]) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.size, this.size);
    drawTempleMap(g, this.size, { me: { x: me.x, z: me.z, yaw: myYaw }, others });
    this.el.title = t('hud.map');
  }
}

/** Full-screen temple map with place names, opened from the top bar, M, or the map board. */
export class BigMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private title: HTMLElement;
  isOpen = false;
  /** Fast-travel mode: tap a place to fly there. */
  private travel = false;
  private hovered: TravelSpot | null = null;
  onTravel: (spot: TravelSpot) => void = () => {};

  constructor(parent: HTMLElement) {
    this.canvas = h('canvas', { class: 'bigmap-canvas' }) as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.title = h('div', { class: 'bigmap-title', i18n: 'map.title' });
    this.el = h(
      'div',
      { class: 'bigmap hidden', onclick: (e: MouseEvent) => e.target === this.el && this.show(false) },
      h('div', { class: 'bigmap-card' }, this.title, this.canvas, h('button', { class: 'icon-btn bigmap-close', i18nTitle: 'map.close', onclick: () => this.show(false) }, '✕')),
    );
    this.canvas.addEventListener('pointermove', (e) => (this.hovered = this.travel ? this.spotAt(e) : null));
    this.canvas.addEventListener('click', (e) => {
      if (!this.travel) return;
      const spot = this.spotAt(e);
      if (!spot) return;
      this.show(false);
      this.onTravel(spot);
    });
    parent.append(this.el);
  }

  show(open: boolean, travel = false) {
    this.isOpen = open;
    this.travel = open && travel;
    this.hovered = null;
    this.title.dataset.i18n = this.travel ? 'map.travelTitle' : 'map.title';
    this.title.textContent = t(this.travel ? 'map.travelTitle' : 'map.title');
    this.canvas.style.cursor = this.travel ? 'pointer' : '';
    this.el.classList.toggle('hidden', !open);
  }

  toggle(travel = false) {
    this.show(!(this.isOpen && this.travel === travel), travel);
  }

  /** The destination nearest the pointer (within a finger's width). */
  private spotAt(e: MouseEvent | PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const { X, Y } = mapProjector(r.width);
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best: TravelSpot | null = null, bd = Math.max(22, r.width * 0.04);
    for (const s of TRAVEL_SPOTS) {
      const d = Math.hypot(X(s.at.x) - px, Y(s.at.z) - py);
      if (d < bd) [best, bd] = [s, d];
    }
    return best;
  }

  draw(me: THREE.Vector3, myYaw: number, others: THREE.Vector3[]) {
    if (!this.isOpen) return;
    const css = Math.floor(Math.min(window.innerHeight * 0.8, window.innerWidth * 0.9 - 32));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== css * dpr) {
      this.canvas.width = this.canvas.height = css * dpr;
      this.canvas.style.width = this.canvas.style.height = `${css}px`;
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, css, css);
    drawTempleMap(g, css, { me: { x: me.x, z: me.z, yaw: myYaw }, others, labels: true, travel: this.travel ? { spots: TRAVEL_SPOTS, hovered: this.hovered } : undefined });
  }
}
