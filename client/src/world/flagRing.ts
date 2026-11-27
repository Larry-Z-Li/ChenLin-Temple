import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLAG_COLOURS, FLAG_LINES_N, FLAG_ORDER, FLAG_POLE_H, FLAG_RING_POLES, flagSlots } from '../../../shared/flagRing';
import { THEME } from '../config/theme';
import { assetUrl } from '../content/manifest';
import type { WorldContext } from '../core/context';

export interface FlagRing {
  /** Hang a flag (a no-op if that place already has one). */
  hang(line: number, slot: number, color: number): void;
  /** Where a place on a line is, and the line's direction there (for a flag to face along it). */
  slotAt(line: number, slot: number): { p: THREE.Vector3; along: THREE.Vector3; q: THREE.Quaternion };
  /** A free place, for when there's no server to hand one out. */
  freeSlot(): [number, number] | null;
  /** A flag on its own (the one a visitor holds up, the one Garuda carries), in a colour. */
  makeFlag(color: number): THREE.Mesh;
}

/**
 * The ring of prayer-flag lines round the temples (see shared/flagRing.ts): its poles and strings, empty to begin with,
 * and the flags Garuda has hung on them, all in one draw.
 */
export function buildFlagRing(ctx: WorldContext): FlagRing {
  const N = FLAG_LINES_N;
  const tops = FLAG_RING_POLES.map(([x, z]) => new THREE.Vector3(x, ctx.ground.heightAt(x, z) + FLAG_POLE_H, z));
  const sagOf = (i: number) => Math.max(0.35, tops[i].distanceTo(tops[(i + 1) % N]) * 0.05);
  const along = (i: number, t: number) => {
    const a = tops[i], b = tops[(i + 1) % N], sag = sagOf(i);
    return new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
  };

  // poles with gold caps, and the strings between them
  const poleMat = new THREE.MeshStandardMaterial({ color: THEME.wood, roughness: 0.8 }), capMat = new THREE.MeshStandardMaterial({ color: THEME.goldLeaf, metalness: 0.7, roughness: 0.35 });
  const poles: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [], pts: number[] = [];
  FLAG_RING_POLES.forEach(([x, z], i) => {
    const y0 = tops[i].y - FLAG_POLE_H;
    poles.push(new THREE.CylinderGeometry(0.055, 0.075, FLAG_POLE_H + 0.2, 8).translate(x, y0 + (FLAG_POLE_H + 0.2) / 2, z));
    caps.push(new THREE.SphereGeometry(0.11, 10, 8).translate(x, tops[i].y + 0.25, z));
    ctx.collisions.addCircle(x, z, 0.18);
    const n = 24;
    for (let k = 0; k < n; k++) pts.push(...along(i, k / n).toArray(), ...along(i, (k + 1) / n).toArray());
  });
  const poleMesh = new THREE.Mesh(mergeGeometries(poles), poleMat), capMesh = new THREE.Mesh(mergeGeometries(caps), capMat);
  poleMesh.castShadow = true;
  ctx.scene.add(poleMesh, capMesh, new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: 0xd8d0c0 })));

  // the flags: the wind-horse print, coloured per flag, hanging just under the string and facing along it
  const flagGeo = new THREE.PlaneGeometry(0.3, 0.5).translate(0, -0.27, 0);
  const print = new THREE.TextureLoader().load(assetUrl('flags', 'lungta.jpg'));
  print.colorSpace = THREE.SRGBColorSpace;
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: print, roughness: 0.9, side: THREE.DoubleSide });
  let cap = 0;
  for (let i = 0; i < N; i++) cap += flagSlots(i);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, cap);
  flags.count = 0;
  flags.frustumCulled = false;
  ctx.scene.add(flags);
  const taken = new Set<string>(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(), Z = new THREE.Vector3(), Y = new THREE.Vector3(), c = new THREE.Color();

  const slotAt = (line: number, slot: number) => {
    const t = (slot + 1.5) / (flagSlots(line) + 2), p = along(line, t);
    const dir = along(line, Math.min(1, t + 0.01)).sub(along(line, Math.max(0, t - 0.01))).normalize();
    return { p, along: dir, q: orient(dir).clone() };
  };
  const orient = (dir: THREE.Vector3) => {
    X.copy(dir), Z.crossVectors(X, up).normalize(), Y.crossVectors(Z, X);
    return q.setFromRotationMatrix(m.makeBasis(X, Y, Z));
  };
  return {
    hang(line, slot, color) {
      const key = `${line}:${slot}`;
      if (taken.has(key) || line < 0 || line >= N || slot < 0 || slot >= flagSlots(line) || flags.count >= cap) return; // (also any left from before a pole moved)
      taken.add(key);
      const { p, along: dir } = slotAt(line, slot);
      flags.setMatrixAt(flags.count, m.compose(p, orient(dir).clone(), new THREE.Vector3(1, 1, 1)));
      flags.setColorAt(flags.count, c.setHex(FLAG_COLOURS[color] ?? FLAG_COLOURS[0]));
      flags.count++;
      flags.instanceMatrix.needsUpdate = true;
      if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    },
    slotAt,
    freeSlot() {
      return FLAG_ORDER.find(([line, slot]) => !taken.has(`${line}:${slot}`)) ?? null;
    },
    makeFlag(color) {
      const f = new THREE.Mesh(flagGeo, flagMat.clone());
      (f.material as THREE.MeshStandardMaterial).color.setHex(FLAG_COLOURS[color] ?? FLAG_COLOURS[0]);
      return f;
    },
  };
}
