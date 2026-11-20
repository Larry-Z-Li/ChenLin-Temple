import * as THREE from 'three';
import { bell } from '../audio/sfx';
import { isTouchDevice, saveSettings, settings } from '../config/settings';
import { damp } from '../core/math';
import { glowTexture } from '../core/textures';

export const BEAD_COUNT = 108;
const SLOTS = BEAD_COUNT + 1; // +1 gap for the guru bead
const A = 0.11, B = 0.5; // ellipse half-axes (m), camera space
const DEPTH = 0.95, BEAD_R = 0.0098;

/**
 * A 108-bead mala shown in front of the camera. ← / → slide it by exactly one bead with smooth easing;
 * the bead at the top (under the thumb) is the one being counted.
 */
export class Mala {
  readonly group = new THREE.Group();
  private beads: THREE.InstancedMesh;
  private guru: THREE.Group;
  private offset = 0;
  private target = 0;
  private m = new THREE.Matrix4();
  private visible = false;
  private fade = 0;
  private materials: THREE.Material[] = [];
  onCount?: (count: number, round: number) => void;

  private baseY = -0.62;

  constructor(private camera: THREE.PerspectiveCamera) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b2f1a, roughness: 0.4, emissive: 0x1a0a04, transparent: true });
    const beadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x1a0a04, transparent: true });
    this.materials.push(wood, beadMat);
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0098, 12, 8), beadMat, BEAD_COUNT);
    // Marker beads at 27 / 54 / 81
    const gold = new THREE.Color(0xd9b45a), brown = new THREE.Color(0x6b2f1a);
    for (let i = 0; i < BEAD_COUNT; i++) this.beads.setColorAt(i, i > 0 && i % 27 === 0 ? gold : brown);
    this.beads.frustumCulled = false;

    this.guru = new THREE.Group();
    this.guru.add(new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), wood));
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 10).translate(0, -0.06, 0), new THREE.MeshStandardMaterial({ color: 0x9e1b1b, roughness: 0.9, transparent: true }));
    this.materials.push(tassel.material);
    this.guru.add(tassel);

    const thumb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe2a8, transparent: true, opacity: 0.35, depthWrite: false }));
    thumb.scale.setScalar(0.07);
    thumb.position.set(0, B, -0.01);
    this.materials.push(thumb.material);

    this.group.add(this.beads, this.guru, thumb);
    this.group.position.set(0.34, -0.62, -0.95);
    this.group.rotation.set(-0.18, 0.55, 0);
    this.group.visible = false;
    camera.add(this.group);
    this.layout();
  }

  get count() {
    return ((this.target % BEAD_COUNT) + BEAD_COUNT) % BEAD_COUNT;
  }
  get round() {
    return Math.floor(this.target / BEAD_COUNT);
  }

  show(v: boolean) {
    this.visible = v;
    if (v) this.group.visible = true;
  }

  /** dir = +1 (→) or -1 (←). Limits queued steps so holding a key stays smooth. */
  step(dir: 1 | -1) {
    if (Math.abs(this.target + dir - this.offset) > 3) return;
    const before = this.round;
    this.target += dir; // silent; only completing a round rings the bell
    if (dir > 0 && this.round > before) {
      bell(196, 5);
      settings.beadRounds++;
      saveSettings();
    }
    this.onCount?.(this.count, this.round);
  }

  private pointAt(slot: number, out: THREE.Vector3) {
    const s = slot / SLOTS;
    const a = Math.PI / 2 - s * Math.PI * 2; // start at the top, travel clockwise
    return out.set(Math.cos(a) * A, Math.sin(a) * B, 0);
  }

  private layout() {
    const p = new THREE.Vector3();
    // Bead i sits at slot (i - offset): moving → shifts every bead one slot clockwise.
    for (let i = 0; i < BEAD_COUNT; i++) {
      this.pointAt(i - this.offset, p);
      this.beads.setMatrixAt(i, this.m.makeTranslation(p.x, p.y, p.z));
    }
    this.beads.instanceMatrix.needsUpdate = true;
    this.pointAt(BEAD_COUNT - this.offset, p);
    this.guru.position.copy(p);
  }

  /**
   * Size and place the mala from the real screen: each bead about 22 px on phones (16 on desktop),
   * the counting bead a little below the middle, and the string kept on screen in portrait.
   */
  private fit() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * DEPTH, halfW = halfH * this.camera.aspect;
    const px = isTouchDevice ? 22 : 16;
    const s = THREE.MathUtils.clamp((px * halfH) / (BEAD_R * window.innerHeight), 0.8, 3.4);
    this.group.scale.setScalar(s);
    this.baseY = -0.22 * halfH - B * s; // the bead under the thumb sits just below centre
    this.group.position.x = Math.min(halfW * 0.35, halfW - A * s * 1.6);
  }

  update(dt: number) {
    this.fade = damp(this.fade, this.visible ? 1 : 0, 8, dt);
    if (!this.visible && this.fade < 0.01) {
      this.group.visible = false;
      return;
    }
    this.materials.forEach((m) => (m.opacity = this.fade * (m instanceof THREE.SpriteMaterial ? 0.35 : 1)));
    this.fit();
    this.group.position.y = this.baseY - (1 - this.fade) * 0.25 * this.group.scale.y;
    if (Math.abs(this.offset - this.target) > 1e-4) {
      this.offset = damp(this.offset, this.target, 14, dt);
      if (Math.abs(this.offset - this.target) < 0.002) this.offset = this.target;
      this.layout();
    }
  }
}
