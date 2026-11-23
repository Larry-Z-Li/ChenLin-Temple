import * as THREE from 'three';
import { FLAG_LINES, type FlagAnchor } from '../config/layout';
import { THEME } from '../config/theme';
import type { StupaSpot } from '../buildings/stupas';
import type { WorldContext } from '../core/context';
import { mulberry32 } from '../core/math';
import type { Ground } from '../core/ground';
import { assetUrl } from '../content/manifest';

/** Traditional order: blue (sky), white (air), red (fire), green (water), yellow (earth). */
const COLORS = [0x2a6fd6, 0xf4f1e8, 0xc8302c, 0x2f9e4f, 0xf2c230].map((c) => new THREE.Color(c));
const SPACING = 0.62;

interface Line { a: THREE.Vector3; b: THREE.Vector3; scale: number }

/**
 * Strings of five-colour prayer flags that sag between anchors and flutter in the wind.
 * Temple-ground lines come from FLAG_LINES; ridge lines join neighbouring stupas.
 */
export function buildPrayerFlags(ctx: WorldContext, stupas: StupaSpot[]) {
  const anchor = (a: FlagAnchor) => new THREE.Vector3(a.x, groundAt(ctx.ground, a.x, a.z) + a.h, a.z);
  const lines: Line[] = FLAG_LINES.map(([a, b]) => ({ a: anchor(a), b: anchor(b), scale: 1 }));

  // Ridge: from spire to spire between neighbouring stupas (bigger flags so they read from the valley).
  for (let i = 0; i + 1 < stupas.length; i++) {
    const p = stupas[i], q = stupas[i + 1];
    if (Math.hypot(p.x - q.x, p.z - q.z) > 45) continue;
    lines.push({ a: new THREE.Vector3(p.x, p.y + 8.6 * p.s, p.z), b: new THREE.Vector3(q.x, q.y + 8.6 * q.s, q.z), scale: 2.4 });
  }

  // Poles under anchors that ask for one (deduplicated).
  const poleMat = new THREE.MeshStandardMaterial({ color: THEME.wood, roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ color: THEME.goldLeaf, metalness: 0.7, roughness: 0.35 });
  const seen = new Set<string>();
  for (const a of FLAG_LINES.flat()) {
    const key = `${a.x.toFixed(1)},${a.z.toFixed(1)}`;
    if (!a.pole || seen.has(key)) continue;
    seen.add(key);
    const y0 = groundAt(ctx.ground, a.x, a.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, a.h + 0.2, 8), poleMat);
    pole.position.set(a.x, y0 + (a.h + 0.2) / 2, a.z);
    pole.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), capMat);
    cap.position.set(a.x, y0 + a.h + 0.25, a.z);
    ctx.scene.add(pole, cap);
    ctx.collisions.addCircle(a.x, a.z, 0.15);
  }

  // Sample each sagging string; one flag every SPACING metres.
  const base: { p: THREE.Vector3; q: THREE.Quaternion; s: number; phase: number }[] = [];
  const linePts: number[] = [];
  const rng = mulberry32(5);
  const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const { a, b, scale } of lines) {
    const len = a.distanceTo(b);
    const sag = Math.max(0.3, len * 0.07);
    const n = Math.max(2, Math.floor(len / (SPACING * scale)));
    const at = (t: number) => new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
    for (let j = 0; j < n; j++) linePts.push(...at(j / n).toArray(), ...at((j + 1) / n).toArray());
    for (let j = 1; j < n; j++) {
      const t = j / n;
      X.subVectors(b, a).add(new THREE.Vector3(0, -sag * 4 * (1 - 2 * t), 0)).normalize(); // along the string
      Z.crossVectors(X, up).normalize();
      Y.crossVectors(Z, X);
      base.push({ p: at(t), q: new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(X, Y, Z)), s: scale, phase: rng() * Math.PI * 2 });
    }
  }

  const strings = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3)), new THREE.LineBasicMaterial({ color: 0xd8d0c0 }));
  ctx.scene.add(strings);

  // Each flag carries the wind-horse (lungta) print: black ink on white, so the flag's colour (the
  // instance colour) fills the cloth and the ink stays dark. Portrait, like the woodblock.
  const flagGeo = new THREE.PlaneGeometry(0.3, 0.5).translate(0, -0.27, 0); // hangs just below the string
  const print = new THREE.TextureLoader().load(assetUrl('flags', 'lungta.jpg'));
  print.colorSpace = THREE.SRGBColorSpace;
  print.anisotropy = 4;
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: print, roughness: 0.9, side: THREE.DoubleSide }), base.length);
  flags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  base.forEach((_, i) => flags.setColorAt(i, COLORS[i % COLORS.length]));
  flags.frustumCulled = false;
  ctx.scene.add(flags);

  const swing = new THREE.Quaternion(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0);
  ctx.updaters.push((_dt, time) => {
    base.forEach((f, i) => {
      // Lean downwind with a gust-y flutter.
      const angle = 0.3 + 0.32 * Math.sin(time * 2.3 + f.phase) + 0.12 * Math.sin(time * 5.7 + f.phase * 1.7);
      swing.setFromAxisAngle(xAxis, angle);
      q.copy(f.q).multiply(swing);
      flags.setMatrixAt(i, m.compose(f.p, q, sv.setScalar(f.s)));
    });
    flags.instanceMatrix.needsUpdate = true;
  });
}

const groundAt = (ground: Ground, x: number, z: number) => ground.heightAt(x, z);
