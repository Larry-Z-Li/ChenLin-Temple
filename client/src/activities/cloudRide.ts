import * as THREE from 'three';
import { CLOUD_RIDE_SECONDS, CLOUD_ROUTE, CLOUD_STATIONS } from '../config/layout';
import { whoosh } from '../audio/sfx';
import type { WorldContext } from '../core/context';
import { dampAngle } from '../core/math';
import { glowTexture } from '../core/textures';
import { t } from '../i18n';
import type { CameraRig } from '../player/cameraRig';
import type { LocalPlayer } from '../player/localPlayer';
import type { Hud } from '../ui/hud';
import { CLOUD_TOP, makeCloud } from '../world/cloud';

const HOVER = 0.8; // station cloud centre above the ground
type Key = keyof typeof CLOUD_STATIONS;

/**
 * Fast travel by cloud between the mountain gate and the Hall of Cundī (~5 s each way).
 * Each end has a bobbing cloud; riding one flies a swooping arc to the other.
 * Others see you on your cloud via FLAG_CLOUD.
 */
export class CloudRide {
  riding = false;
  private curve: THREE.CatmullRomCurve3;
  private t = 0;
  private dir: 1 | -1 = 1;
  private stations: { key: Key; x: number; z: number; y: number; cloud: THREE.Mesh; hiddenFor: number }[] = [];
  // Golden motes trailing the cloud
  private trail: THREE.Points;
  private tPos: Float32Array;
  private tCol: Float32Array;
  private tLife: Float32Array;
  private tNext = 0;
  private emitAcc = 0;

  constructor(private ctx: WorldContext, private player: LocalPlayer, private rig: CameraRig, private hud: Hud) {
    const feet = HOVER + CLOUD_TOP;
    const end = (k: Key) => new THREE.Vector3(CLOUD_STATIONS[k].x, ctx.ground.heightAt(CLOUD_STATIONS[k].x, CLOUD_STATIONS[k].z) + feet, CLOUD_STATIONS[k].z);
    this.curve = new THREE.CatmullRomCurve3([end('gate'), ...CLOUD_ROUTE.map(([x, y, z]) => new THREE.Vector3(x, y, z)), end('cundi')], false, 'centripetal');

    for (const key of Object.keys(CLOUD_STATIONS) as Key[]) {
      const { x, z } = CLOUD_STATIONS[key];
      const y = ctx.ground.heightAt(x, z);
      const cloud = makeCloud();
      cloud.position.set(x, y + HOVER, z);
      ctx.scene.add(cloud);
      this.stations.push({ key, x, z, y, cloud, hiddenFor: 0 });
      ctx.interactions.add({
        id: `cloud-${key}`, x, z, radius: 2.2,
        prompt: () => (this.riding ? null : { text: t(key === 'gate' ? 'prompt.cloudToCundi' : 'prompt.cloudToGate') }),
        onInteract: () => this.start(key === 'gate' ? 1 : -1),
      });
    }

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

  private start(dir: 1 | -1) {
    if (this.riding || this.player.mode !== 'free') return;
    this.riding = true;
    this.dir = dir;
    this.t = 0;
    this.player.mode = 'riding';
    this.player.setAnchorAnim('idle');
    this.player.avatar.setCloud(true);
    const from = this.stations.find((s) => s.key === (dir > 0 ? 'gate' : 'cundi'))!;
    from.cloud.visible = false; // you're standing on it now; a new one drifts in shortly
    from.hiddenFor = CLOUD_RIDE_SECONDS + 1.5;
    this.ctx.interactions.enabled = false;
    this.hud.setPrompt(null);
    whoosh(1, 1.8);
  }

  private arrive() {
    const dest = CLOUD_STATIONS[this.dir > 0 ? 'cundi' : 'gate'];
    this.riding = false;
    this.player.avatar.setCloud(false);
    // Step off just south of the landing cloud, facing north into the temple.
    const x = dest.x, z = dest.z + 1.6;
    this.player.pos.set(x, this.ctx.ground.heightAt(x, z), z);
    this.player.yaw = 0;
    this.player.release();
    this.ctx.interactions.enabled = true;
    this.rig.lookAlong(0, 0.3, 6);
    whoosh(0.5, 1.0);
  }

  update(dt: number, time: number) {
    for (const s of this.stations) {
      s.cloud.position.y = s.y + HOVER + Math.sin(time * 1.4 + s.x) * 0.12;
      s.cloud.rotation.y = Math.sin(time * 0.3 + s.z) * 0.4;
      if (!s.cloud.visible && (s.hiddenFor -= dt) <= 0) s.cloud.visible = true;
    }
    this.updateTrail(dt);
    if (!this.riding) return;

    this.t += dt;
    const k = Math.min(1, this.t / CLOUD_RIDE_SECONDS);
    const eased = -(Math.cos(Math.PI * k) - 1) / 2; // ease in and out
    const u = this.dir > 0 ? eased : 1 - eased;
    const p = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(u).multiplyScalar(this.dir);
    const yaw = Math.atan2(-tan.x, -tan.z);
    this.player.pos.copy(p);
    this.player.yaw = dampAngle(this.player.yaw, yaw, 6, dt);
    // Camera off to one side and pulled back, keeping the temple, pond and waterfall in frame.
    if (!this.rig.userLooking()) this.rig.lookAlong(yaw + 0.6 * this.dir, 0.38, 12);

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
