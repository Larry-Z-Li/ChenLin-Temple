import * as THREE from 'three';
import { assetUrl } from '../content/manifest';

/**
 * The night sky's chart: the twenty-eight lunar mansions (二十八宿) joined by lines and shining brightest,
 * the pole stars (北極, 四輔) overhead, and the Four Symbols in their quarters — 蒼龍 east, 白虎 west,
 * 玄武 north, 朱雀 south — as faint figures of light near the horizon (from a traditional print).
 *
 * Laid out like a sky map, centred on the zenith with north up (so, looking up, east is on the left).
 * One texture on a dome cap: a single draw call, faded in with the night.
 */

/** Star positions traced from a traditional chart (pixel coordinates, north at the top, east on the left). */
type Group = { pts: [number, number][]; lines?: [number, number][]; loop?: boolean };
const CHART_CENTRE: [number, number] = [411, 330], CHART_R = 340;
const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry] as [number, number]);
const MANSIONS: Record<string, Group> = {
  // 北方七宿 · 玄武
  斗: { pts: [[249, 92], [270, 104], [277, 123], [262, 131], [248, 154], [243, 180]] },
  牛: { pts: [[292, 104], [311, 107], [322, 99], [313, 128], [305, 152], [322, 165]], lines: [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5]] },
  女: { pts: [[346, 107], [361, 114], [371, 134], [378, 157], [362, 160]] },
  虛: { pts: [[420, 113], [420, 161]] },
  危: { pts: [[463, 118], [486, 141], [467, 163]] },
  室: { pts: [[545, 117], [545, 186], [511, 181], [529, 193], [566, 190], [576, 184], [538, 210], [522, 224]], lines: [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [1, 6], [6, 7]] },
  壁: { pts: [[598, 119], [598, 166]] },
  // 西方七宿 · 白虎
  奎: { pts: ellipse(648, 222, 44, 16, 14), loop: true },
  婁: { pts: [[607, 292], [640, 288], [660, 268]] },
  胃: { pts: [[626, 327], [640, 343], [652, 328], [640, 362]], lines: [[0, 1], [2, 1], [1, 3]] },
  昴: { pts: [[624, 378], [637, 368], [651, 378], [648, 395], [633, 402], [622, 392]], loop: true },
  畢: { pts: [[588, 444], [608, 437], [624, 445], [640, 438], [660, 432], [606, 464], [591, 480], [611, 489]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [5, 7]] },
  觜: { pts: [[593, 500], [604, 512], [590, 518]], loop: true },
  參: { pts: [[636, 468], [660, 462], [683, 476], [660, 495], [642, 520], [672, 522], [692, 529]], lines: [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [5, 6]] },
  // 南方七宿 · 朱雀
  井: { pts: [[606, 555], [630, 551], [612, 578], [636, 575], [606, 605], [632, 603]], lines: [[0, 1], [2, 3], [4, 5], [0, 2], [2, 4], [1, 3], [3, 5]] },
  鬼: { pts: [[568, 558], [580, 569], [568, 582], [556, 570]], loop: true },
  柳: { pts: [[470, 560], [492, 565], [508, 555], [521, 543], [528, 528], [517, 515]] },
  星: { pts: [[447, 496], [460, 518], [462, 547], [447, 566], [434, 548], [438, 520]], loop: true },
  張: { pts: [[404, 580], [424, 574], [441, 589], [441, 610], [421, 613], [408, 598]], loop: true },
  翼: {
    pts: [[292, 505], [316, 514], [343, 520], [366, 524], [381, 520], [330, 541], [318, 562], [302, 578], [331, 577], [356, 583], [279, 583], [300, 602], [330, 612], [358, 617], [384, 602], [350, 548], [373, 560]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7], [6, 8], [8, 9], [7, 10], [7, 11], [11, 12], [12, 13], [13, 14], [5, 15], [15, 16]],
  },
  軫: { pts: [[214, 574], [236, 578], [246, 601], [226, 612], [205, 598], [250, 556]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 5]] },
  // 東方七宿 · 青龍
  角: { pts: [[148, 533], [196, 533]] },
  亢: { pts: [[132, 488], [151, 501], [173, 501], [206, 479]] },
  氐: { pts: [[148, 412], [186, 412], [186, 446], [148, 446]], loop: true },
  房: { pts: [[138, 373], [160, 380], [186, 376], [212, 366]] },
  心: { pts: [[141, 299], [158, 309], [176, 331]] },
  尾: { pts: [[155, 254], [166, 269], [183, 278], [213, 278], [183, 227], [197, 240]], lines: [[0, 1], [1, 2], [2, 3], [4, 5]] },
  箕: { pts: [[138, 186], [162, 166], [194, 164], [199, 194]] },
  // 北極 and 四輔, overhead
  北極: { pts: [[330, 344], [347, 346], [364, 346], [381, 344], [398, 341], [409, 316], [432, 323], [441, 347], [421, 366]] },
};

const S = 2048, C = S / 2;
/** Chart pixel → canvas, the mansions' ring at about 0.76 of the way out (the figures beyond it). */
const toCanvas = ([x, y]: [number, number]): [number, number] => [C + ((x - CHART_CENTRE[0]) / CHART_R) * 0.76 * C, C + ((y - CHART_CENTRE[1]) / CHART_R) * 0.76 * C];

function drawChart(c: HTMLCanvasElement, images: HTMLImageElement[]) {
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  drawSymbols(g, images);
  // the lines joining each mansion's stars (the stars themselves are points: see twinkleStars)
  g.lineCap = 'round';
  for (const m of Object.values(MANSIONS)) {
    const p = m.pts.map(toCanvas);
    const lines = m.lines ?? p.slice(1).map((_, i) => [i, i + 1] as [number, number]).concat(m.loop ? [[p.length - 1, 0]] : []);
    g.strokeStyle = 'rgba(255,220,150,0.26)';
    g.lineWidth = 2.2;
    g.shadowColor = 'rgba(255,200,110,0.5)';
    g.shadowBlur = 4;
    g.beginPath();
    for (const [i, j] of lines) {
      g.moveTo(...p[i]);
      g.lineTo(...p[j]);
    }
    g.stroke();
  }
}

/**
 * The Four Symbols, from a traditional star-chart print (cleaned to line art, assets/sky/*.png), tinted
 * and glowing in their quarters near the chart's rim. The print has south at the top; the chart has north
 * at the top, so 玄武 and the two long beasts are turned round (each stands toward its own horizon, the
 * dragon's and tiger's heads to the south); 朱雀 already faces its horizon as printed.
 */
const SYMBOLS = [
  { file: 'qinglong.png', colour: '#5fd0ff', x: 0.09, y: 0.5, h: 0.25, turn: true }, // 蒼龍 · east (left)
  { file: 'baihu.png', colour: '#eef4ff', x: 0.91, y: 0.5, h: 0.25, turn: true }, // 白虎 · west (right)
  { file: 'xuanwu.png', colour: '#a596ff', x: 0.5, y: 0.13, w: 0.21, turn: true }, // 玄武 · north (top)
  { file: 'zhuque.png', colour: '#ff6a3a', x: 0.5, y: 0.88, w: 0.28, turn: false }, // 朱雀 · south (bottom)
] as const;

function drawSymbols(g: CanvasRenderingContext2D, images: HTMLImageElement[]) {
  SYMBOLS.forEach((sym, i) => {
    const img = images[i];
    if (!img?.naturalWidth) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    const h = 'h' in sym ? sym.h * S : (sym.w * S) / aspect, w = h * aspect;
    // tint the white line art
    const tint = document.createElement('canvas');
    tint.width = Math.ceil(w);
    tint.height = Math.ceil(h);
    const t = tint.getContext('2d')!;
    t.drawImage(img, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = sym.colour;
    t.fillRect(0, 0, w, h);
    g.save();
    g.translate(sym.x * S, sym.y * S);
    if (sym.turn) g.rotate(Math.PI);
    g.shadowColor = sym.colour;
    g.shadowBlur = 10;
    g.globalAlpha = 0.3;
    g.drawImage(tint, -w / 2, -h / 2, w, h);
    g.restore();
  });
}

/**
 * Stars as small soft round points that twinkle (each at its own pace), instead of square dots or painted
 * blobs. `size` in CSS pixels; `amp` how deep the twinkle dips (0 none … 1 out).
 */
export function twinkleStars(pos: number[], tint: number[], size: number[], amp: number) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.Float32BufferAttribute(size.map(() => Math.random()), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) }, uAmp: { value: amp } },
    vertexShader: /* glsl */ `
      attribute vec3 tint; attribute float size, phase;
      uniform float uTime, uOpacity, uPx, uAmp;
      varying vec3 vTint; varying float vA;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float sp = 1.2 + fract(phase * 7.13) * 2.4;
        float tw = (0.5 + 0.5 * sin(uTime * sp + phase * 6.283)) * (0.55 + 0.45 * sin(uTime * 0.63 + phase * 17.0));
        vA = uOpacity * (1.0 - uAmp * tw);
        vTint = tint;
        gl_PointSize = size * uPx;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vTint; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2); // a bright core, a quick soft edge
        gl_FragColor = vec4(vTint, a * vA);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, update: (opacity: number, time: number) => ((mat.uniforms.uOpacity.value = opacity), (mat.uniforms.uTime.value = time), (pts.visible = opacity > 0.01)) };
}

/** The dome cap carrying the chart; `night` 0 (day) … 1 (night). */
export function buildSkyChart(scene: THREE.Scene) {
  const radius = 1350, phiMax = THREE.MathUtils.degToRad(70); // from the zenith down to 20° above the horizon
  const geo = new THREE.SphereGeometry(radius, 96, 48, 0, Math.PI * 2, 0, phiMax);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = Math.hypot(x, z) || 1;
    const r = Math.acos(Math.min(1, y / radius)) / phiMax; // 0 overhead … 1 at the cap's rim
    // north (−z) to the chart's top, east (+x) to its left: the sky as seen looking up
    uv.setXY(i, 0.5 + (-x / h) * r * 0.5, 0.5 + (z / h) * r * 0.5);
  }
  // canvas y runs down, texture v runs up: flip so the chart's top (north) lands north
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  drawChart(canvas, []);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // the Four Symbols arrive as images: redraw the chart with them once they're in
  const images = SYMBOLS.map((sym) => Object.assign(new Image(), { src: assetUrl('sky', sym.file) }));
  void Promise.allSettled(images.map((im) => im.decode())).then(() => {
    drawChart(canvas, images);
    map.needsUpdate = true;
  });
  // the mansions' stars, on the dome just inside the chart: canvas → the direction it maps to
  const sPos: number[] = [], tint: number[] = [], size: number[] = [], R = radius - 5;
  for (const m of Object.values(MANSIONS))
    for (const pt of m.pts) {
      const [px, py] = toCanvas(pt), dx = (px / S - 0.5) * 2, dy = (py / S - 0.5) * 2, r = Math.hypot(dx, dy) || 1e-6, th = r * phiMax;
      sPos.push(R * Math.sin(th) * (-dx / r), R * Math.cos(th), R * Math.sin(th) * (dy / r));
      const b = 0.62 + Math.random() * 0.2;
      tint.push(b, b * 0.9, b * 0.7);
      size.push(5.5 + Math.random() * 2);
    }
  const mansionStars = twinkleStars(sPos, tint, size, 0.3);
  scene.add(mansionStars.pts);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -0.5;
  scene.add(mesh);
  return {
    update: (night: number, time: number) => {
      mat.opacity = night;
      mesh.visible = night > 0.01;
      mansionStars.update(night, time);
    },
  };
}
