import * as THREE from 'three';

/**
 * The night sky's chart: the twenty-eight lunar mansions (二十八宿) joined by lines and shining brightest,
 * the pole stars (北極, 四輔) overhead, and the Four Symbols in their quarters — 青龍 east, 白虎 west,
 * 玄武 north, 朱雀 south — as faint figures of light near the horizon.
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

function drawChart() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  drawSymbols(g);
  // lines, then the stars over them
  g.lineCap = 'round';
  for (const m of Object.values(MANSIONS)) {
    const p = m.pts.map(toCanvas);
    const lines = m.lines ?? p.slice(1).map((_, i) => [i, i + 1] as [number, number]).concat(m.loop ? [[p.length - 1, 0]] : []);
    g.strokeStyle = 'rgba(255,214,120,0.55)';
    g.lineWidth = 3;
    g.shadowColor = 'rgba(255,200,90,0.8)';
    g.shadowBlur = 6;
    g.beginPath();
    for (const [i, j] of lines) {
      g.moveTo(...p[i]);
      g.lineTo(...p[j]);
    }
    g.stroke();
    g.shadowBlur = 0;
    for (const [x, y] of p) {
      const r = 13, grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,240,1)');
      grad.addColorStop(0.25, 'rgba(255,236,170,0.95)');
      grad.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The Four Symbols, as faint glowing line drawings in their quarters near the chart's rim. Each is drawn
 * in a frame laid along the rim: x along it, y pointing out toward the horizon (so feet face the horizon).
 */
function drawSymbols(g: CanvasRenderingContext2D) {
  const rim = (angle: number, r: number, colour: string, draw: () => void, alpha = 0.42, flip = false) => {
    g.save();
    g.translate(C + Math.cos(angle) * r * C, C + Math.sin(angle) * r * C);
    g.rotate(angle + Math.PI / 2);
    g.scale(flip ? -1 : 1, -1);
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.shadowColor = colour;
    g.shadowBlur = 22;
    g.lineWidth = 5;
    g.lineCap = g.lineJoin = 'round';
    g.globalAlpha = alpha;
    draw();
    g.restore();
  };
  const curve = (pts: [number, number][]) => {
    g.beginPath();
    g.moveTo(...pts[0]);
    for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    g.lineTo(...pts[pts.length - 1]);
    g.stroke();
  };

  // 青龍 · east (left): a long winding body along the rim, head to the south (角, its horn), tail to the north
  rim(Math.PI, 0.89, '#5fd0ff', () => {
    const body = (x: number) => Math.sin(x / 70) * 34;
    for (let x = -330; x < 330; x += 6) {
      const w = 22 * (1 - (x + 330) / 760) + 5; // tapering to the tail
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, body(x));
      g.lineTo(x + 7, body(x + 7));
      g.stroke();
      if ((x + 330) % 36 < 6) (g.lineWidth = 3), curve([[x, body(x) - w / 2], [x + 6, body(x) - w / 2 - 14], [x + 12, body(x) - w / 2]]); // spines along its back
    }
    g.lineWidth = 4;
    for (const lx of [-230, -110, 40, 170]) curve([[lx, body(lx)], [lx - 8, body(lx) + 40], [lx - 22, body(lx) + 62], [lx - 34, body(lx) + 58]]); // legs and claws
    // head: snout, jaw, horns swept back, whiskers trailing
    const hx = -350, hy = body(-330);
    curve([[hx + 20, hy - 14], [hx - 30, hy - 16], [hx - 58, hy - 4], [hx - 40, hy + 8], [hx + 10, hy + 12]]);
    curve([[hx + 6, hy - 14], [hx + 30, hy - 48], [hx + 62, hy - 58]]);
    curve([[hx - 6, hy - 14], [hx + 12, hy - 52], [hx + 34, hy - 70]]);
    g.lineWidth = 2.5;
    curve([[hx - 52, hy - 4], [hx - 86, hy - 30], [hx - 120, hy - 20]]);
    curve([[hx - 50, hy + 4], [hx - 90, hy + 26], [hx - 124, hy + 16]]);
  }, 0.24);

  // 白虎 · west (right): a striding tiger, head to the south (觜, 參), tail curling to the north (奎)
  rim(0, 0.89, '#e9f1ff', () => {
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(0, -10, 190, 58, 0, 0, Math.PI * 2);
    g.stroke();
    for (const sx of [-120, -70, -20, 30, 80]) curve([[sx, -66], [sx + 14, -30], [sx + 4, 4]]); // stripes
    for (const [lx, d] of [[-140, -1], [-95, 1], [105, -1], [150, 1]]) curve([[lx, 30], [lx + d * 10, 80], [lx + d * 4, 110], [lx + d * 22, 114]]); // legs mid-stride
    g.beginPath();
    g.arc(-245, -40, 48, 0, Math.PI * 2); // head
    g.stroke();
    curve([[-270, -82], [-262, -104], [-248, -86]]); // ears
    curve([[-232, -84], [-222, -104], [-212, -84]]);
    curve([[-292, -30], [-300, -18], [-284, -6]]); // muzzle
    g.lineWidth = 6;
    curve([[188, -20], [250, -60], [262, -130], [228, -170], [200, -150]]); // tail
  }, 0.42, true);

  // 玄武 · north (top): a tortoise with a snake coiled round it
  rim(-Math.PI / 2, 0.9, '#9a8cff', () => {
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(0, 0, 140, 80, 0, Math.PI, Math.PI * 2); // the shell's dome
    g.lineTo(-140, 0);
    g.stroke();
    for (const [hx, hy] of [[-60, -40], [0, -52], [60, -40], [-30, -12], [30, -12]]) {
      g.beginPath();
      for (let i = 0; i <= 6; i++) g.lineTo(hx + Math.cos((i / 6) * Math.PI * 2) * 22, hy + Math.sin((i / 6) * Math.PI * 2) * 15);
      g.stroke(); // plates
    }
    for (const lx of [-90, -40, 50, 100]) curve([[lx, 0], [lx - 6, 30], [lx + 10, 40]]); // legs
    curve([[140, -6], [175, -18], [196, -10], [190, 8], [150, 6]]); // head
    g.lineWidth = 7;
    curve([[-220, 30], [-160, 60], [-60, 52], [40, 70], [150, 60], [190, -10], [120, -110], [0, -120], [-120, -100], [-150, -150], [-80, -190], [20, -170]]); // the snake
    g.beginPath();
    g.arc(30, -165, 14, 0, Math.PI * 2);
    g.fill(); // its head, facing the tortoise
  });

  // 朱雀 · south (bottom): a bird with wings spread wide and long tail plumes
  rim(Math.PI / 2, 0.88, '#ff6a3a', () => {
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(0, 0, 70, 30, 0, 0, Math.PI * 2);
    g.stroke();
    curve([[-60, -10], [-110, -40], [-130, -72], [-108, -78], [-92, -54]]); // neck and head
    curve([[-118, -78], [-132, -110], [-112, -128]]); // crest
    curve([[-130, -70], [-160, -66]]); // beak
    for (const s of [-1, 1]) {
      // wings swept up and out, feathers fanning from them
      const tip: [number, number] = [s * 60 - 20, -230];
      curve([[s * 20 - 10, -20], [s * 100 - 10, -110], tip]);
      for (let k = 0; k < 6; k++) curve([[s * (30 + k * 12) - 10, -40 - k * 30], [s * (70 + k * 18) - 10, -50 - k * 30], [s * (110 + k * 20) - 10, -30 - k * 32]]);
    }
    for (const [dx, dy] of [[150, 40], [190, 10], [170, 80]]) curve([[60, 4], [110, dy - 10], [dx, dy], [dx + 40, dy + 30]]); // tail plumes
  });
}

/** The dome cap carrying the chart; `night` 0 (day) … 1 (night). */
export function buildSkyChart(scene: THREE.Scene) {
  const radius = 1350, phiMax = THREE.MathUtils.degToRad(72); // from the zenith down to 18° above the horizon
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
  const mat = new THREE.MeshBasicMaterial({ map: drawChart(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -0.5;
  scene.add(mesh);
  return { update: (night: number) => ((mat.opacity = night), (mesh.visible = night > 0.01)) };
}
