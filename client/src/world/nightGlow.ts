import * as THREE from 'three';
import { glowTexture } from '../core/textures';

type NightFn = (night: number) => void;
const tracked: NightFn[] = [];

/** Shared materials for things that glow more after dark (updated once per frame by the sky). */
export const nightGlow = {
  lanternBody: new THREE.MeshStandardMaterial({ color: 0xc8231c, roughness: 0.6, emissive: 0xff3a1a, emissiveIntensity: 0.35 }),
  lanternHalo: new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a40, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  stoneWindow: new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffb54a, emissiveIntensity: 0.9 }),
  stoneHalo: new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  /** Warm paper of path lanterns and palace lanterns. */
  paper: new THREE.MeshStandardMaterial({ color: 0xfff0d6, roughness: 0.8, emissive: 0xffc27a, emissiveIntensity: 0.3 }),
  /** Run `fn(night)` every frame with the current darkness (0 = day, 1 = night). */
  track(fn: NightFn) {
    tracked.push(fn);
  },
  update(night: number) {
    this.lanternBody.emissiveIntensity = 0.35 + 1.4 * night;
    this.lanternHalo.opacity = 0.55 * night;
    this.stoneWindow.emissiveIntensity = 0.9 + 2.2 * night;
    this.stoneHalo.opacity = 0.6 * night;
    this.paper.emissiveIntensity = 0.3 + 1.6 * night;
    for (const fn of tracked) fn(night);
  },
};

/**
 * Lit material whose glow takes each vertex/instance colour, so one InstancedMesh can hold
 * lanterns of many colours that each shine in their own colour. The geometry needs a `color`
 * attribute (white is fine; the instance colour tints it).
 */
export function colourGlowMaterial(params: THREE.MeshStandardMaterialParameters, glow: (night: number) => number) {
  const m = new THREE.MeshStandardMaterial({ ...params, vertexColors: true, emissive: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
  };
  m.customProgramCacheKey = () => 'colourGlow';
  nightGlow.track((n) => (m.emissiveIntensity = glow(n)));
  m.emissiveIntensity = glow(0);
  return m;
}

/** Give a geometry an all-white `color` attribute (for vertex-coloured materials). */
export function whiteColors(geo: THREE.BufferGeometry) {
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
}

/**
 * Soft additive halos (one draw call) at the given points, fading in after dark.
 * `size` is the halo diameter in metres; `day` is the opacity kept in daylight (e.g. indoor lamps).
 */
export function haloPoints(positions: number[], colors: number[], size: number, max = 0.7, day = 0) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ map: glowTexture(), size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: day, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  nightGlow.track((n) => {
    mat.opacity = day + (max - day) * n;
    points.visible = mat.opacity > 0.01;
  });
  return points;
}
