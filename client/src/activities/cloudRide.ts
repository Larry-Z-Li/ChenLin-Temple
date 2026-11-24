import * as THREE from 'three';
import { whoosh } from '../audio/sfx';
import type { TravelSpot } from '../config/layout';
import type { WorldContext } from '../core/context';
import { clamp, dampAngle } from '../core/math';
import { glowTexture } from '../core/textures';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import type { Hud } from '../ui/hud';
import { CLOUD_TOP } from '../world/cloud';

/** On localhost (testing), travel is instant. */
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

const FEET = 0.8 + CLOUD_TOP; // standing height on the cloud

/**
 * Fast travel: pick a place on the map and a glowing cloud carries you there in a short swooping
 * arc from wherever you stand, landing in front of it and facing it. Others see you on your cloud
 * via FLAG_CLOUD.
 */
export class CloudRide {
  riding = false;
  private curve: THREE.CatmullRomCurve3 | null = null;
  private t = 0;
  private duration = 4;
  /** Which way the rider faces for the whole flight. */
  private heading = 0;
  private dest: TravelSpot['arrive'] | null = null;
  // Golden motes trailing the cloud
  private trail: THREE.Points;
  private tPos: Float32Array;
  private tCol: Float32Array;
  private tLife: Float32Array;
  private tNext = 0;
  private emitAcc = 0;

  constructor(private ctx: WorldContext, private player: LocalPlayer, private rig: CameraRig, private hud: Hud) {
    const N = 220;
    this.tPos = new Float32Array(N * 3).fill(-9999);
    this.tCol = new Float32Array(N * 3);
    this.tLife = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3));
    this.trail = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    ctx.scene.add(this.trail);
  }

  /** Fly to a place. Returns false if you can't right now (seated, mid-ritual, already flying). */
  flyTo(dest: TravelSpot['arrive']) {
    if (this.riding || this.player.mode !== 'free') return false;
    if (LOCAL) { // testing on localhost: straight there, no cloud
      this.dest = dest;
      this.arrive();
      return true;
    }
    const from = this.player.pos.clone();
    const g = this.ctx.ground;
    const to = new THREE.Vector3(dest.x, g.heightAt(dest.x, dest.z) + FEET, dest.z);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    // Up almost straight above the roofs and trees (~26 m), across above the tallest pagodas, then down almost
    // straight onto the spot (arrival spots are in the open, so nothing is in the way of the climb or the drop).
    const lift = 26, cruise = Math.max(from.y, to.y) + clamp(30 + dist * 0.04, 32, 44);
    const along = (k: number, h: number) => new THREE.Vector3().lerpVectors(from, to, k).setY(h);
    const k0 = Math.min(0.06, 2.5 / Math.max(dist, 1)), k1 = 1 - k0;
    this.curve = new THREE.CatmullRomCurve3(
      [from.clone().setY(from.y + FEET), along(k0, from.y + lift), along(0.3, cruise), along(0.7, cruise), along(k1, to.y + lift), to],
      false,
      'centripetal',
    );
    this.duration = clamp((dist + 2 * lift) / 42, 3, 7.5);
    this.heading = dist > 0.5 ? Math.atan2(-(to.x - from.x), -(to.z - from.z)) : this.player.yaw;
    this.dest = dest;
    this.riding = true;
    this.t = 0;
    this.player.mode = 'riding';
    this.player.setAnchorAnim('idle');
    this.player.avatar.setCloud(true);
    this.ctx.interactions.enabled = false;
    this.hud.setPrompt(null);
    whoosh(1, 1.8);
    return true;
  }

  private arrive() {
    const d = this.dest!;
    this.riding = false;
    this.player.avatar.setCloud(false);
    this.player.pos.set(d.x, this.ctx.ground.heightAt(d.x, d.z), d.z);
    this.player.yaw = d.yaw;
    this.player.release();
    this.ctx.interactions.enabled = true;
    this.rig.frame(0.3, 6); // back to walking distance; the camera doesn't turn
    whoosh(0.5, 1.0);
  }

  update(dt: number) {
    this.updateTrail(dt);
    if (!this.riding || !this.curve) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    const u = -(Math.cos(Math.PI * k) - 1) / 2; // ease in and out
    const p = this.curve.getPointAt(u);
    this.player.pos.copy(p);
    // face the destination, steadily (the path's own direction is nearly vertical on the climb and the drop)
    this.player.yaw = dampAngle(this.player.yaw, this.heading, 6, dt);
    // Pulled back to see the grounds go by, but never turned: the view keeps facing the way it did.
    this.rig.frame(0.38, 12);

    this.emitAcc += dt * 45;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
      const i = this.tNext, j = i * 3;
      this.tNext = (this.tNext + 1) % this.tLife.length;
      this.tPos[j] = p.x - fx * 1.4 + (Math.random() - 0.5) * 0.8;
      this.tPos[j + 1] = p.y - CLOUD_TOP + (Math.random() - 0.5) * 0.4;
      this.tPos[j + 2] = p.z - fz * 1.4 + (Math.random() - 0.5) * 0.8;
      this.tLife[i] = 1.2;
    }
    if (k >= 1) this.arrive();
  }

  private updateTrail(dt: number) {
    for (let i = 0; i < this.tLife.length; i++) {
      if (this.tLife[i] <= 0) continue;
      this.tLife[i] -= dt;
      const j = i * 3;
      if (this.tLife[i] <= 0) {
        this.tPos[j + 1] = -9999;
        continue;
      }
      this.tPos[j + 1] -= dt * 0.4;
      const a = this.tLife[i] / 1.2;
      this.tCol[j] = a;
      this.tCol[j + 1] = 0.88 * a;
      this.tCol[j + 2] = 0.6 * a;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }
}
