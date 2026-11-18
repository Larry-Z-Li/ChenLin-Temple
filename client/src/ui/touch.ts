import type { Input } from '../core/input';
import { h } from './dom';

/** On-screen joystick for phones and tablets (writes analog movement into input.stick). */
export function mountJoystick(parent: HTMLElement, input: Input) {
  document.body.classList.add('touch');
  const knob = h('div', { class: 'joy-knob' });
  const pad = h('div', { class: 'joystick' }, knob);
  parent.append(pad);
  const R = 50;
  let id: number | null = null, cx = 0, cy = 0;
  const set = (x: number, y: number) => {
    const d = Math.hypot(x, y), k = d > R ? R / d : 1;
    knob.style.transform = `translate(${x * k}px, ${y * k}px)`;
    input.stick.x = (x * k) / R;
    input.stick.y = (y * k) / R;
  };
  pad.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    const r = pad.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    pad.setPointerCapture(e.pointerId);
    set(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === id && set(e.clientX - cx, e.clientY - cy));
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    set(0, 0);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
