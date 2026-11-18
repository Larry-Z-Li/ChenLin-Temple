import * as THREE from 'three';

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let glow: THREE.Texture | null = null;
/** Soft radial white dot, for glows and particles. */
export function glowTexture() {
  return (glow ??= canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,240,200,0.8)');
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }));
}

/** Text on a transparent background, e.g. name tags and plaques. */
export function textTexture(text: string, opts: { font?: string; color?: string; bg?: string; w?: number; h?: number; border?: string } = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  return canvasTexture(w, h, (g) => {
    if (opts.bg) {
      g.fillStyle = opts.bg;
      g.fillRect(0, 0, w, h);
    }
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = h * 0.08;
      g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.12 > 0 ? h - h * 0.12 : h);
    }
    // Latin falls through to Georgia; CJK glyphs fall back to a Traditional Chinese serif (Ming/Song style).
    g.font = opts.font ?? `600 ${Math.round(h * 0.42)}px Georgia, 'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Noto Serif CJK TC', serif`;
    g.fillStyle = opts.color ?? '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2, w * 0.92);
  });
}

/** Stone paving tiles. */
export function stoneTexture() {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#a49e90';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const o = y % 2 ? 32 : 0;
        const v = 150 + Math.floor(Math.random() * 30);
        g.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
        g.fillRect(x * 64 + o + 2, y * 64 + 2, 60, 60);
        g.fillRect(x * 64 + o - 256 + 2, y * 64 + 2, 60, 60);
      }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Vertical streaks that scroll downwards for the waterfall. */
export function waterfallTexture() {
  const tex = canvasTexture(128, 256, (g) => {
    g.fillStyle = 'rgba(200,225,240,0.55)';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 128, y = Math.random() * 256, len = 20 + Math.random() * 80;
      g.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      g.lineWidth = 1 + Math.random() * 2.5;
      const dx = (Math.random() - 0.5) * 3;
      for (const oy of [0, -256]) {
        // draw twice so streaks wrap seamlessly when the texture repeats vertically
        g.beginPath();
        g.moveTo(x, y + oy);
        g.lineTo(x + dx, y + oy + len);
        g.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Vertical inscription (top to bottom), e.g. column couplets and steles. */
export function verticalTextTexture(text: string, opts: { color?: string; bg?: string; border?: string; w?: number; h?: number } = {}) {
  const w = opts.w ?? 160, h = opts.h ?? 1024;
  const chars = Array.from(text);
  return canvasTexture(w, h, (g) => {
    g.fillStyle = opts.bg ?? '#1a1410';
    g.fillRect(0, 0, w, h);
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = w * 0.06;
      g.strokeRect(w * 0.06, w * 0.06, w - w * 0.12, h - w * 0.12);
    }
    const cell = (h - w * 0.4) / chars.length;
    const size = Math.min(w * 0.68, cell * 0.86);
    g.font = `600 ${Math.round(size)}px 'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Noto Serif CJK TC', serif`;
    g.fillStyle = opts.color ?? '#e8c76a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    chars.forEach((c, i) => g.fillText(c, w / 2, w * 0.2 + cell * (i + 0.5)));
  });
}

/** Painted coffered ceiling tile (藻井-style): teal frame, red field, gold ring and lotus rosette. */
export function ceilingTexture() {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#7a2a1e';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#2f7a6b';
    g.lineWidth = 18;
    g.strokeRect(9, 9, 238, 238);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 4;
    g.strokeRect(22, 22, 212, 212);
    g.fillStyle = '#2b4c8c';
    g.beginPath();
    g.arc(128, 128, 84, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d4af37';
    g.lineWidth = 6;
    g.stroke();
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i / 8) * Math.PI * 2);
      g.fillStyle = i % 2 ? '#f4d2c8' : '#e9b8ad';
      g.beginPath();
      g.ellipse(0, -42, 15, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#d4af37';
    g.beginPath();
    g.arc(128, 128, 16, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) {
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
