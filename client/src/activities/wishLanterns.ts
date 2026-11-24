import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WISH_COOLDOWN_MS, WISH_TEXT_MAX, WISH_TITLE_MAX, WISH_TTL_MS, type Wish } from '../../../shared/protocol';
import { isBlocked } from '../../../shared/moderation';
import { THEME } from '../config/theme';
import { t, type I18nKey } from '../i18n';
import { h } from '../ui/dom';
import type { Hud } from '../ui/hud';
import { LOTUS_COLOURS } from '../world/lanterns';
import { whiteColors } from '../world/nightGlow';

// Shared pieces of the wish lanterns (the 光明燈 wall in the first hall): lantern geometry, the writing form, the cooldown.

/** One lantern a minute (the server's rule), across both of the hall's tables. */
let lastHung = -Infinity;
export const markHung = () => (lastHung = Date.now());
/** Whole seconds until you may hang another (0 = now). */
export const wishWait = () => Math.max(0, Math.ceil((lastHung + WISH_COOLDOWN_MS - Date.now()) / 1000));

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

/**
 * A butter lamp (酥油燈) standing on its foot at the origin, about half a metre tall: a gold chalice — lotus
 * foot, a knotted stem set with turquoise and coral, a silver band round the cup — with its butter and wick
 * (trim); and its flame (body: tinted per instance, lit in the wish's colour, hidden while unlit).
 */
export function chaliceGeometries() {
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const stones = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return paint(new THREE.SphereGeometry(0.014, 6, 4).translate(Math.cos(a) * 0.064, 0.215, Math.sin(a) * 0.064), i % 2 ? 0xb5452f : 0x2aa79b);
  });
  return {
    body: whiteColors(new THREE.SphereGeometry(0.03, 10, 8).scale(1, 2.6, 1).translate(0, 0.47, 0)),
    trim: mergeGeometries([
      paint(lathe([[0.001, 0], [0.16, 0], [0.165, 0.03], [0.13, 0.05], [0.14, 0.08], [0.1, 0.13], [0.06, 0.15], [0.045, 0.19], [0.068, 0.215], [0.045, 0.24], [0.04, 0.265], [0.075, 0.285], [0.16, 0.34], [0.19, 0.385], [0.196, 0.405], [0.172, 0.405], [0.168, 0.385], [0.001, 0.385]]), THEME.goldLeaf),
      paint(new THREE.TorusGeometry(0.176, 0.011, 6, 32).rotateX(Math.PI / 2).translate(0, 0.35, 0), 0xc9ccd2), // silver band
      paint(new THREE.CylinderGeometry(0.166, 0.166, 0.01, 24).translate(0, 0.39, 0), 0xf0dc9a), // the butter
      paint(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 4).translate(0, 0.41, 0), 0x2a1a10), // wick
      ...stones,
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
    if (isBlocked(`${tt} ${text.value}`)) return hud.toast(t('wish.blocked'));
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
