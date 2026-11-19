import type * as THREE from 'three';
import { t } from '../i18n';
import { h } from './dom';
import { drawTempleMap } from './mapDraw';

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
  isOpen = false;

  constructor(parent: HTMLElement) {
    this.canvas = h('canvas', { class: 'bigmap-canvas' }) as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.el = h(
      'div',
      { class: 'bigmap hidden', onclick: (e: MouseEvent) => e.target === this.el && this.show(false) },
      h('div', { class: 'bigmap-card' }, h('div', { class: 'bigmap-title', i18n: 'map.title' }), this.canvas, h('button', { class: 'icon-btn bigmap-close', i18nTitle: 'map.close', onclick: () => this.show(false) }, '✕')),
    );
    parent.append(this.el);
  }

  show(open: boolean) {
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
  }

  toggle() {
    this.show(!this.isOpen);
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
    drawTempleMap(g, css, { me: { x: me.x, z: me.z, yaw: myYaw }, others, labels: true });
  }
}
