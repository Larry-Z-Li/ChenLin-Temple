import * as THREE from 'three';
import type { Ground } from '../core/ground';
import { clamp, damp, dampAngle } from '../core/math';

/** Third-person orbit camera with wall avoidance. Drag to look, scroll to zoom. */
export class CameraRig {
  yaw = 0; // 0 = camera south of the player, looking north
  pitch = 0.3;
  private dist = 6;
  private targetDist = 6;
  private curDist = 6;
  private focus = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private dragging = false;
  private last = { x: 0, y: 0 };
  /** When set, the camera eases toward this yaw until the user drags. */
  private yawGoal: number | null = null;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.yawGoal = null;
      this.last = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.last.x) * 0.005;
      this.pitch = clamp(this.pitch + (e.clientY - this.last.y) * 0.004, -0.25, 1.25);
      this.last = { x: e.clientX, y: e.clientY };
    });
    const end = () => (this.dragging = false);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener(
      'wheel',
      (e) => {
        this.targetDist = clamp(this.targetDist * (e.deltaY > 0 ? 1.12 : 0.89), 1.8, 16);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Smoothly turn to look along `yaw` (e.g. toward the altar when kneeling). */
  lookAlong(yaw: number, pitch?: number, dist?: number) {
    this.yawGoal = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    if (dist !== undefined) this.targetDist = dist;
  }

  update(dt: number, target: THREE.Vector3, headHeight: number, blockers: THREE.Object3D[], ground: Ground) {
    if (this.yawGoal !== null) this.yaw = dampAngle(this.yaw, this.yawGoal, 4, dt);
    this.dist = damp(this.dist, this.targetDist, 8, dt);
    this.focus.set(target.x, target.y + headHeight, target.z);

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Pull in if a wall/roof is between the player and the camera.
    let allowed = this.dist;
    this.ray.set(this.focus, dir);
    this.ray.far = this.dist + 0.3;
    const hit = this.ray.intersectObjects(blockers, false)[0];
    if (hit) allowed = Math.max(0.4, hit.distance - 0.3);
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 5, dt);

    const pos = this.focus.clone().addScaledVector(dir, this.curDist);
    pos.y = Math.max(pos.y, ground.heightAt(pos.x, pos.z) + 0.3);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.focus);
  }
}
