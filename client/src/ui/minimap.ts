import type * as THREE from 'three';
import { BASIN, HALLS, ORCHARD, PAVED, PLAY_RADIUS, POND, WHEEL_ROWS } from '../config/layout';
import { t } from '../i18n';
import { h } from './dom';

/**
 * Map drawn SOUTH-UP (traditional orientation): south at the top, so east is on the left.
 * screenX = cx − x·s, screenY = cy − z·s
 */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private size = 200;
  private open = true;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(parent: HTMLElement) {
    this.el = h('canvas', { class: 'minimap' }) as HTMLCanvasElement;
    this.el.width = this.el.height = this.size * this.dpr;
    this.g = this.el.getContext('2d')!;
    parent.append(this.el);
  }

  toggle() {
    this.open = !this.open;
    this.el.classList.toggle('hidden', !this.open);
  }

  draw(me: THREE.Vector3, myYaw: number, others: THREE.Vector3[]) {
    if (!this.open) return;
    const g = this.g, S = this.size, s = (S / 2 - 8) / PLAY_RADIUS;
    const cx = S / 2 + BASIN.x * s, cy = S / 2 + BASIN.z * s;
    const X = (x: number) => cx - x * s, Y = (z: number) => cy - z * s;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, S, S);

    g.fillStyle = 'rgba(48,72,40,0.85)';
    g.beginPath();
    g.arc(X(BASIN.x), Y(BASIN.z), PLAY_RADIUS * s, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = 'rgba(190,182,166,0.9)';
    for (const r of PAVED) g.fillRect(X(r.maxX), Y(r.maxZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s);

    g.fillStyle = '#4c8fa3';
    g.beginPath();
    g.arc(X(POND.x), Y(POND.z), POND.radius * s, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = 'rgba(232,140,40,0.7)';
    for (let z = ORCHARD.minZ; z <= ORCHARD.maxZ; z += ORCHARD.spacing) for (let x = ORCHARD.minX; x <= ORCHARD.maxX; x += ORCHARD.spacing) g.fillRect(X(x) - 1, Y(z) - 1, 2.5, 2.5);

    g.fillStyle = '#d9a441';
    for (const w of WHEEL_ROWS) g.fillRect(X(w.x) - 1, Y(w.zStart + (w.count - 1) * w.spacing), 2, (w.count - 1) * w.spacing * s);

    for (const hall of HALLS) {
      g.fillStyle = hall.kind === 'shrine' ? '#b0473a' : '#8e2b1f';
      g.fillRect(X(hall.x + hall.width / 2), Y(hall.z + hall.depth / 2), hall.width * s, hall.depth * s);
    }

    g.fillStyle = '#fff';
    for (const o of others) {
      g.beginPath();
      g.arc(X(o.x), Y(o.z), 2, 0, Math.PI * 2);
      g.fill();
    }

    // Me: arrow. World forward (−sin ψ, −cos ψ) → screen (+sin ψ, +cos ψ) after the south-up flip.
    const px = X(me.x), py = Y(me.z), fx = Math.sin(myYaw), fy = Math.cos(myYaw);
    g.fillStyle = '#ffd36b';
    g.beginPath();
    g.moveTo(px + fx * 6, py + fy * 6);
    g.lineTo(px - fy * 3.5 - fx * 3, py + fx * 3.5 - fy * 3);
    g.lineTo(px + fy * 3.5 - fx * 3, py - fx * 3.5 - fy * 3);
    g.closePath();
    g.fill();

    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(t('map.s'), S / 2, 12);
    g.fillText(t('map.n'), S / 2, S - 4);
    g.fillText(t('map.e'), 9, S / 2 + 4);
    g.fillText(t('map.w'), S - 9, S / 2 + 4);
    this.el.title = t('hud.map');
  }
}
