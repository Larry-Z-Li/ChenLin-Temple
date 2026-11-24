/**
 * The 佛家奇門 transition: the start page darkens and you rush down a tunnel of octagonal rings carrying
 * the nine syllables (九字: 臨兵鬪者皆陣列在前) — eight round each ring, clockwise from the top left as in
 * the 3×3 square on the temple, and 皆 in each one's middle, travelling and turning with it. At the end you go through into white
 * (then on to qimen.one). Mocks: /transition-mocks.html (B).
 */
// the 3×3 as on the temple (者 前 兵 / 列 皆 鬪 / 在 臨 陣): round it clockwise from the top left, 皆 in the middle
const RING = '者前兵鬪陣臨在列', MIDDLE = '皆';
const SERIF = '"Noto Serif TC", "Songti TC", serif';
const DURATION = 3.4; // seconds (the first second a slow fade into the tunnel)

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** One frame, `k` 0 (the start page, untouched) … 1 (all white), on a transparent canvas over the page. */
export function drawQimenWarp(g: CanvasRenderingContext2D, w: number, h: number, k: number) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(10,10,28,${smooth(0, 0.3, k)})`; // the start page fades out…
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, S = Math.min(w, h), D = k * 1.4 + k ** 3 * 7;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // the tunnel: rings at whole-number depths, coming at you faster and faster
  for (let i = 16; i >= 0; i--) {
    const n = Math.floor(D) + i, z = n + 1 - D;
    if (z < 0.12) continue;
    const R = (S * 0.3) / z, a = clamp(1.3 - z / 11) * smooth(0.08, 0.38, k) * clamp(z * 3); // …as the tunnel fades in
    const rot = n * (Math.PI / 8) + k * k * 2.5 - (3 * Math.PI) / 4; // unturned, 臨 sits at the top left
    g.strokeStyle = `rgba(240,200,112,${a})`;
    g.lineWidth = Math.max(0.8, 3.2 / z);
    g.beginPath();
    for (let j = 0; j <= 8; j++) {
      const t = rot + ((j + 0.5) * Math.PI) / 4;
      g[j ? 'lineTo' : 'moveTo'](cx + Math.cos(t) * R, cy + Math.sin(t) * R);
    }
    // a dark plate: the rings beyond show only faintly through it, so its own 前 reads in its middle
    g.fillStyle = `rgba(10,10,28,${0.8 * a})`;
    g.fill();
    g.stroke();
    g.fillStyle = `rgba(255,226,160,${a})`;
    g.font = `700 ${Math.max(6, R * 0.17)}px ${SERIF}`;
    for (let j = 0; j < 8; j++) { // the eight in order, clockwise, one at the middle of each side
      const t = rot + (j * Math.PI) / 4, rr = R * 0.8;
      g.save();
      g.translate(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
      g.rotate(t + Math.PI / 2);
      g.fillText(RING[j], 0, 0);
      g.restore();
    }
    // and the ninth, 前, in this ring's middle: the two travel and turn together
    g.save();
    g.translate(cx, cy);
    g.rotate(rot + (3 * Math.PI) / 4);
    g.font = `700 ${Math.max(6, R * 0.34)}px ${SERIF}`;
    g.fillStyle = `rgba(255,226,160,${a * smooth(0.35, 0.8, z) * (1 - smooth(5, 9, z))})`; // gone as its ring leaves the screen; the farthest too small to read
    g.fillText(MIDDLE, 0, 0);
    g.restore();
  }

  // through: white blooms out from the middle
  const e = smooth(0.76, 1, k);
  if (e) {
    const R = Math.hypot(w, h) * (0.1 + 0.9 * e), gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, `rgba(255,253,246,${Math.min(1, e * 1.6)})`);
    gr.addColorStop(0.6, `rgba(255,246,220,${e})`);
    gr.addColorStop(1, `rgba(255,240,200,${e * e})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  if (k >= 1) {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, h);
  }
}

/** Play the transition over everything; resolves once the screen is white (the overlay stays until you come back). */
export function playQimenWarp(): Promise<void> {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:100;pointer-events:auto';
  document.body.append(c);
  const g = c.getContext('2d')!;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener('resize', fit);
  // Back from qimen.one, the browser may restore this page as it was left (all white): clear it away
  addEventListener('pageshow', () => (c.remove(), removeEventListener('resize', fit)), { once: true });
  // with reduced motion, just a short fade to white
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now(), length = calm ? 0.6 : DURATION;
  return new Promise((resolve) => {
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000 / length);
      if (calm) {
        g.fillStyle = `rgba(255,253,246,${k})`;
        g.clearRect(0, 0, innerWidth, innerHeight);
        g.fillRect(0, 0, innerWidth, innerHeight);
      } else drawQimenWarp(g, innerWidth, innerHeight, k);
      if (k < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
