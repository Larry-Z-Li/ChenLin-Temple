import * as THREE from 'three';
import { glowTexture } from '../core/textures';

/** Shared materials for things that glow more after dark (updated once per frame by the sky). */
export const nightGlow = {
  lanternBody: new THREE.MeshStandardMaterial({ color: 0xc8231c, roughness: 0.6, emissive: 0xff3a1a, emissiveIntensity: 0.35 }),
  lanternHalo: new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a40, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  stoneWindow: new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffb54a, emissiveIntensity: 0.9 }),
  stoneHalo: new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  update(night: number) {
    this.lanternBody.emissiveIntensity = 0.35 + 1.4 * night;
    this.lanternHalo.opacity = 0.55 * night;
    this.stoneWindow.emissiveIntensity = 0.9 + 2.2 * night;
    this.stoneHalo.opacity = 0.6 * night;
  },
};
