import * as THREE from 'three';
import { WHEEL_MAX, WHEEL_PUSH, WHEEL_PUSH_COOLDOWN_MS, wheelSpeedAfter } from '../../../shared/protocol';
import { PLATFORM_H, WHEEL_ROWS } from '../config/layout';
import { THEME } from '../config/theme';
import type { WorldContext } from '../core/context';
import { canvasTexture, glowTexture } from '../core/textures';
import { t } from '../i18n';
import { box, cylinder, mat } from './materials';

const MAX_CHARGE = 120;
const DRUM_Y = 1.2;

export interface Wheel {
  id: string;
  x: number;
  z: number;
  drum: THREE.Mesh;
  drumMat: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  /** Revolutions per second. Each push adds WHEEL_PUSH; coasts down between pushes. */
  speed: number;
  /** Accumulated rotations (decays when slow). Drives this wheel's own glow: the longer it turns, the brighter. */
  charge: number;
  emitAcc: number;
  /** Who set it turning last ('self' for us): each full turn from now is their merit. */
  spinner: string | null;
  /** Turns made, counting up (a whole number passed = one turn for the spinner). */
  turns: number;
}

export function drumTexture() {
  // Abstract banding only; swap for a real mantra texture during the art pass.
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = '#b8862b';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#8e1f16';
    g.fillRect(0, 0, 512, 22);
    g.fillRect(0, 106, 512, 22);
    g.fillStyle = '#e8c76a';
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.arc(16 + i * 32, 64, 9, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#6b4a12';
    g.lineWidth = 3;
    g.strokeRect(0, 26, 512, 76);
  });
}

/**
 * Rows of prayer wheels. Tap E beside one to push it: every tap adds speed (up to WHEEL_MAX)
 * and it coasts down on its own. Anyone can push any wheel; the server keeps speeds in sync.
 */
export class PrayerWheels {
  readonly wheels = new Map<string, Wheel>();
  private points: THREE.Points;
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pMax: Float32Array;
  private pNext = 0;
  private lastPush = 0;

  /** `onPush` is called for local pushes (send to the server). */
  constructor(ctx: WorldContext, private onPush: (wheel: Wheel) => void) {
    const drumMap = drumTexture();
    const capMat = mat(THEME.goldLeaf, { metalness: 0.75, roughness: 0.35 });
    const wood = mat(THEME.wood, { roughness: 0.8 });

    for (const row of WHEEL_ROWS) {
      const sign = row.side === 'east' ? 1 : -1; // direction from wheel to visitor
      const len = (row.count - 1) * row.spacing;
      const zMid = row.zStart + len / 2;
      const y0 = ctx.ground.heightAt(row.x, zMid) > PLATFORM_H * 0.5 ? PLATFORM_H : 0;

      // Gallery: back panel, posts, beams, roof.
      const g = new THREE.Group();
      const panel = box(0.15, 2.5, len + 1.4, wood, row.x - sign * 0.55, y0, zMid);
      g.add(panel);
      ctx.cameraBlockers.push(panel);
      for (const dz of [-1, 1]) g.add(box(0.2, 2.8, 0.2, wood, row.x + sign * 0.45, y0, zMid + dz * (len / 2 + 0.6)));
      g.add(box(1.4, 0.12, len + 1.4, wood, row.x, y0 + 0.55, zMid));
      g.add(box(1.4, 0.12, len + 1.4, wood, row.x, y0 + 1.9, zMid));
      const roof = box(2.0, 0.14, len + 2.0, mat(THEME.roof, { roughness: 0.75 }), row.x - sign * 0.1, y0 + 2.8, zMid);
      roof.rotation.z = sign * 0.18;
      g.add(roof);
      ctx.scene.add(g);
      ctx.collisions.addBox(Math.min(row.x - sign * 0.62, row.x + sign * 0.33), Math.max(row.x - sign * 0.62, row.x + sign * 0.33), row.zStart - 0.8, row.zStart + len + 0.8);

      for (let i = 0; i < row.count; i++) {
        const z = row.zStart + i * row.spacing;
        const drumMat = new THREE.MeshStandardMaterial({ map: drumMap, metalness: 0.55, roughness: 0.4, emissive: new THREE.Color(0xffc45a), emissiveIntensity: 0 });
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.66, 24), [drumMat, capMat, capMat]);
        drum.position.set(row.x, y0 + DRUM_Y, z);
        drum.castShadow = true;
        ctx.scene.add(drum);
        ctx.scene.add(cylinder(0.025, 0.025, 1.4, mat(0x3a2a1a), row.x, y0 + 0.55, z, 6));

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.copy(drum.position);
        ctx.scene.add(glow);

        const wheel: Wheel = { id: `wheel-${row.id}-${i}`, x: row.x, z, drum, drumMat, glow, speed: 0, charge: 0, emitAcc: 0, spinner: null, turns: 0 };
        this.wheels.set(wheel.id, wheel);
        ctx.interactions.add({
          id: wheel.id, x: row.x + sign * 0.95, z, radius: 0.8,
          prompt: () => ({ text: t('prompt.spin') }),
          onInteract: () => this.push(wheel),
        });
      }
    }

    // Shared light-mote particle system
    const N = 900;
    this.pPos = new Float32Array(N * 3).fill(-9999);
    this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pMax = new Float32Array(N).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.14, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    ctx.scene.add(this.points);
  }

  /** Local push: apply immediately for responsiveness, then tell the server. */
  private push(w: Wheel) {
    const now = performance.now();
    if (now - this.lastPush < WHEEL_PUSH_COOLDOWN_MS) return;
    this.lastPush = now;
    w.speed = Math.min(WHEEL_MAX, w.speed + WHEEL_PUSH);
    w.spinner = 'self';
    this.onPush(w);
  }

  /** A full turn of a wheel: one merit to whoever set it turning (their id, or 'self'). */
  onTurn: (spinner: string, turns: number) => void = () => {};

  /** Authoritative speed from the server (after anyone's push — `by` takes it over — or on join). */
  setSpeed(id: string, speed: number, isJoin = false, by?: string) {
    const w = this.wheels.get(id);
    if (!w) return;
    w.speed = speed;
    if (by !== undefined) w.spinner = by;
    if (isJoin) w.charge = Math.max(w.charge, Math.min(MAX_CHARGE, speed * 12));
  }

  update(dt: number) {
    for (const w of this.wheels.values()) {
      if (w.speed > 0) {
        w.drum.rotation.y -= w.speed * Math.PI * 2 * dt; // clockwise seen from above
        const before = Math.floor(w.turns);
        w.turns += w.speed * dt;
        const made = Math.floor(w.turns) - before;
        if (made > 0 && w.spinner) this.onTurn(w.spinner, made);
        w.charge = Math.min(MAX_CHARGE, w.charge + w.speed * dt);
        w.speed = wheelSpeedAfter(w.speed, dt);
      }
      if (w.speed < 0.15 && w.charge > 0) w.charge = Math.max(0, w.charge * Math.exp(-dt / 5) - dt * 0.05);

      const level = 1 - Math.exp(-w.charge / 20); // 0..1, grows the longer (and faster) it turns
      w.drumMat.emissiveIntensity = level * 1.2;
      w.glow.material.opacity = level * 0.75;
      w.glow.scale.setScalar(0.6 + level * 3.2);
      if (level > 0.01) {
        w.emitAcc += dt * (level * 6 + w.speed * level * 14);
        while (w.emitAcc >= 1) {
          w.emitAcc -= 1;
          this.emit(w, level);
        }
      }
    }
    // Particles: rise in a gentle spiral, fade out (additive → darker = more transparent).
    const n = this.pLife.length;
    for (let i = 0; i < n; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const k = i * 3;
      if (this.pLife[i] <= 0) {
        this.pPos[k + 1] = -9999;
        continue;
      }
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      const f = this.pLife[i] / this.pMax[i];
      const a = Math.min(1, f * 1.5) * Math.min(1, (1 - f) * 6);
      this.pCol[k] = 1.0 * a;
      this.pCol[k + 1] = 0.82 * a;
      this.pCol[k + 2] = 0.45 * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  private emit(w: Wheel, level: number) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % this.pLife.length;
    const a = Math.random() * Math.PI * 2, k = i * 3;
    this.pPos[k] = w.drum.position.x + Math.cos(a) * 0.28;
    this.pPos[k + 1] = w.drum.position.y + (Math.random() - 0.5) * 0.6;
    this.pPos[k + 2] = w.drum.position.z + Math.sin(a) * 0.28;
    this.pVel[k] = Math.cos(a) * 0.15 + (Math.random() - 0.5) * 0.1;
    this.pVel[k + 1] = 0.5 + Math.random() * 0.6 + level * 0.8;
    this.pVel[k + 2] = Math.sin(a) * 0.15 + (Math.random() - 0.5) * 0.1;
    this.pMax[i] = this.pLife[i] = 2.5 + Math.random() * 2.5 + level * 2;
  }
}
