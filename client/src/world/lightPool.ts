import * as THREE from 'three';
import { BASIN, BODHI_BELL, GREAT_STUPA, hallHalf, HALLS, MOUNTAIN_GATE, PAGODAS, PLATFORM_H } from '../config/layout';
import type { WorldContext } from '../core/context';
import { damp, smoothstep } from '../core/math';
import { nightGlow } from './nightGlow';

/**
 * Lamps that actually light things.
 *
 * Outdoors, every lamp's light is painted into one "night light map" covering the valley; every
 * standard material adds it (times its own colour) near the ground after dusk. So a lamp lights the
 * path, the walls, the trees and the people around it the same from anywhere, and any number of
 * lamps costs one texture lookup. Hall interiors are masked out of the map (light doesn't come
 * through walls) and lit instead by a small pool of real PointLights given to the halls nearest you.
 */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  color: number;
  /** Real-light intensity (indoor lamps); mutable, e.g. a lantern wall that brightens as it fills. */
  intensity: number;
  /** Reach in metres. */
  range: number;
  decay?: number;
  /** Inside a hall: a real light, on day and night. Otherwise painted into the night light map. */
  indoor?: boolean;
  /** Standing near the ground (path lamps, stone lanterns): a stronger, tighter pool than hanging ones. */
  ground?: boolean;
}

const lamps: Lamp[] = [];

export function addLamp(l: Lamp) {
  lamps.push(l);
  return l;
}

/** Register a lamp at an object's world position (works inside turned halls). */
export function addLampAt(obj: THREE.Object3D, l: Omit<Lamp, 'x' | 'y' | 'z'>, offset = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  const p = obj.localToWorld(offset.clone());
  return addLamp({ ...l, x: p.x, y: p.y, z: p.z });
}

// ---------------------------------------------------------------------------------------------
// The night light map (outdoor lamps)

const SIZE = 1024;
const HALF = BASIN.radius + 18;
const box = new THREE.Vector4(BASIN.x - HALF, BASIN.z - HALF, HALF * 2, HALF * 2);
const MAX_FLOODS = 20;
const NIGHT = {
  nightLightMap: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) as THREE.Texture },
  nightBox: { value: box },
  nightLevel: { value: 0 },
  // Floodlights: centre x/z + half extents of the lit box; base/top height, strength; colour; interior half extents.
  floodA: { value: Array.from({ length: MAX_FLOODS }, () => new THREE.Vector4()) },
  floodB: { value: Array.from({ length: MAX_FLOODS }, () => new THREE.Vector4()) },
  floodC: { value: Array.from({ length: MAX_FLOODS }, () => new THREE.Vector3()) },
  floodD: { value: Array.from({ length: MAX_FLOODS }, () => new THREE.Vector4()) },
  floodCount: { value: 0 },
};
NIGHT.nightLightMap.value.needsUpdate = true;
nightGlow.track((n) => (NIGHT.nightLevel.value = smoothstep(0.15, 0.6, n)));

/** Every MeshStandardMaterial (and Physical) picks up the lamplight; materials with their own onBeforeCompile opt out. */
THREE.MeshStandardMaterial.prototype.onBeforeCompile = function nightLight(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, NIGHT);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vNightWorld;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
	vec4 nightW = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		nightW = batchingMatrix * nightW;
	#endif
	#ifdef USE_INSTANCING
		nightW = instanceMatrix * nightW;
	#endif
	vNightWorld = ( modelMatrix * nightW ).xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vNightWorld;
uniform sampler2D nightLightMap;
uniform vec4 nightBox;
uniform float nightLevel;
uniform vec4 floodA[ ${MAX_FLOODS} ];
uniform vec4 floodB[ ${MAX_FLOODS} ];
uniform vec3 floodC[ ${MAX_FLOODS} ];
uniform vec4 floodD[ ${MAX_FLOODS} ];
uniform int floodCount;`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
	vec2 nightUv = ( vNightWorld.xz - nightBox.xy ) / nightBox.zw;
	if ( nightLevel > 0.001 && nightUv.x > 0.0 && nightUv.y > 0.0 && nightUv.x < 1.0 && nightUv.y < 1.0 ) {
		float nightH = 1.0 - smoothstep( 3.0, 9.0, vNightWorld.y ); // lamplight stays near the ground
		totalEmissiveRadiance += diffuseColor.rgb * texture2D( nightLightMap, nightUv ).rgb * ( nightLevel * nightH * 1.3 );
	}
	if ( nightLevel > 0.001 ) {
		// Floodlights: the outside of a building washed from projectors at its foot, fading upward.
		vec3 nightN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		for ( int i = 0; i < ${MAX_FLOODS}; i ++ ) {
			if ( i >= floodCount ) break;
			vec2 fd = vNightWorld.xz - floodA[ i ].xy;
			if ( abs( fd.x ) > floodA[ i ].z || abs( fd.y ) > floodA[ i ].w ) continue;
			if ( vNightWorld.y < floodB[ i ].x - 0.5 || vNightWorld.y > floodB[ i ].y ) continue;
			if ( abs( fd.x ) < floodD[ i ].x && abs( fd.y ) < floodD[ i ].y ) continue; // inside the walls
			float out1 = dot( nightN.xz, normalize( fd + vec2( 1e-4 ) ) );
			float up = clamp( ( vNightWorld.y - floodB[ i ].x ) / max( 1.0, floodB[ i ].y - floodB[ i ].x ), 0.0, 1.0 );
			totalEmissiveRadiance += diffuseColor.rgb * floodC[ i ] * ( smoothstep( 0.0, 0.5, out1 ) * mix( 1.0, 0.35, up ) * floodB[ i ].z * nightLevel );
		}
	}`,
    );
};

/** Paint every outdoor lamp into the night light map. Call once all lamps are registered. */
export function buildNightLights() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  const px = SIZE / box.z;
  const X = (x: number) => (x - box.x) * px, Y = (z: number) => (z - box.y) * px;
  g.globalCompositeOperation = 'lighter';
  const c = new THREE.Color();
  for (const l of lamps) {
    if (l.indoor) continue;
    const r = l.range * (l.ground ? 1 : 1.15) * px, a = l.ground ? 0.65 : 0.4;
    c.setHex(l.color);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    const grad = g.createRadialGradient(X(l.x), Y(l.z), 0, X(l.x), Y(l.z), r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(0.3, `rgba(${rgb},${a * 0.55})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(X(l.x) - r, Y(l.z) - r, r * 2, r * 2);
  }
  // Light doesn't come through hall walls: the interiors have their own lamps.
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  for (const h of HALLS) {
    const [ex, ez] = hallHalf(h);
    g.fillRect(X(h.x - ex + 0.25), Y(h.z - ez + 0.25), (ex * 2 - 0.5) * px, (ez * 2 - 0.5) * px);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // canvas rows run along +z
  tex.colorSpace = THREE.NoColorSpace;
  NIGHT.nightLightMap.value = tex;
}

// ---------------------------------------------------------------------------------------------
// Floodlights on the buildings

interface Flood { x: number; z: number; hx: number; hz: number; base: number; top: number; strength: number; color: number; ix?: number; iz?: number }

function addFlood(f: Flood) {
  const i = NIGHT.floodCount.value;
  if (i >= MAX_FLOODS) return;
  NIGHT.floodA.value[i].set(f.x, f.z, f.hx, f.hz);
  NIGHT.floodB.value[i].set(f.base, f.top, f.strength, 0);
  const c = new THREE.Color(f.color);
  NIGHT.floodC.value[i].set(c.r, c.g, c.b);
  NIGHT.floodD.value[i].set(f.ix ?? 0, f.iz ?? 0, 0, 0);
  NIGHT.floodCount.value = i + 1;
}

/** Floodlights on the halls, pagodas, great stupa and gate, with the projector fixtures at their feet. */
export function buildFloodlights(ctx: WorldContext) {
  const fixtures: [number, number][] = [];
  const corners = (x: number, z: number, hx: number, hz: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => fixtures.push([x + sx * hx, z + sz * hz]));
  for (const h of HALLS) {
    const [ex, ez] = hallHalf(h);
    addFlood({ x: h.x, z: h.z, hx: ex + 3.2, hz: ez + 3.2, base: 0, top: PLATFORM_H + h.wallHeight + 7, strength: 0.5, color: 0xffd6a0, ix: ex - 0.25, iz: ez - 0.25 });
    corners(h.x, h.z, ex + 2.3, ez + 2.3);
  }
  const s = GREAT_STUPA, sy = ctx.ground.heightAt(s.x, s.z);
  addFlood({ x: s.x, z: s.z, hx: s.base / 2 + 1, hz: s.base / 2 + 1, base: sy, top: sy + s.height + 1, strength: 0.45, color: 0xfff0dc });
  for (let k = 0; k < 8; k++) fixtures.push([s.x + Math.cos((k * Math.PI) / 4 + 0.39) * (s.base / 2 + 0.6), s.z + Math.sin((k * Math.PI) / 4 + 0.39) * (s.base / 2 + 0.6)]);
  for (const p of PAGODAS) {
    const py = ctx.ground.heightAt(p.x, p.z), r = p.stories ? 5.5 : 7;
    addFlood({ x: p.x, z: p.z, hx: r + 1, hz: r + 1, base: py, top: py + p.height + 1, strength: 0.55, color: 0xffdcae });
    corners(p.x, p.z, r, r);
  }
  const by = ctx.ground.heightAt(BODHI_BELL.x, BODHI_BELL.z);
  addFlood({ x: BODHI_BELL.x, z: BODHI_BELL.z, hx: 4, hz: 3.5, base: by, top: by + 6.5, strength: 0.55, color: 0xffd6a0 });
  corners(BODHI_BELL.x, BODHI_BELL.z, 3.3, 2.8);
  const g = MOUNTAIN_GATE;
  addFlood({ x: g.x, z: g.z, hx: g.width / 2 + 1.5, hz: 2.2, base: 0, top: g.height + 1.5, strength: 0.6, color: 0xffd6a0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fixtures.push([g.x + sx * (g.width / 2 - 0.6), g.z + sz * 1.6]);

  // The projectors: small dark housings with a glowing lens facing up at their building.
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.22, 0.3).translate(0, 0.11, 0), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 }), fixtures.length);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffe2b0, emissiveIntensity: 0.2 });
  nightGlow.track((n) => (lensMat.emissiveIntensity = 0.2 + 2.5 * n));
  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 12).rotateX(-Math.PI / 2).translate(0, 0.225, 0), lensMat, fixtures.length);
  const m = new THREE.Matrix4();
  fixtures.forEach(([x, z], i) => {
    m.makeTranslation(x, ctx.ground.heightAt(x, z), z);
    body.setMatrixAt(i, m);
    lens.setMatrixAt(i, m);
  });
  ctx.scene.add(body, lens);
}

// ---------------------------------------------------------------------------------------------
// Real lights for the hall interiors nearest you

interface Slot { light: THREE.PointLight; lamp: Lamp | null; leaving: boolean }

export class LightPool {
  private slots: Slot[] = [];
  private active: number;
  private night = 0;
  private acc = 1;

  constructor(scene: THREE.Scene, private max: number, active = max) {
    for (let i = 0; i < max; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.castShadow = false;
      scene.add(light);
      this.slots.push({ light, lamp: null, leaving: false });
    }
    this.active = active;
    this.setActive(active);
    nightGlow.track((n) => (this.night = n));
  }

  /** Fewer real lights on low graphics (changing the count recompiles shaders once). */
  setActive(n: number) {
    this.active = Math.max(0, Math.min(this.max, n));
    this.slots.forEach((s, i) => {
      s.light.visible = i < this.active;
      if (i >= this.active) [s.lamp, s.light.intensity] = [null, 0];
    });
  }

  private level(l: Lamp) {
    return l.intensity * (1 + 0.9 * this.night); // lamplight carries further after dark
  }

  update(dt: number, at: THREE.Vector3) {
    const slots = this.slots.slice(0, this.active);
    if ((this.acc += dt) > 0.25) {
      this.acc = 0;
      const want = lamps
        .filter((l) => l.indoor && this.level(l) > 0.01)
        .map((l) => ({ l, s: Math.hypot(l.x - at.x, l.y - at.y, l.z - at.z) / l.range }))
        .filter((c) => c.s < 3)
        .sort((a, b) => a.s - b.s)
        .slice(0, slots.length)
        .map((c) => c.l);
      const chosen = new Set(want);
      for (const s of slots) s.leaving = !!s.lamp && !chosen.has(s.lamp);
      const held = new Set(slots.map((s) => s.lamp));
      for (const l of want) {
        if (held.has(l)) continue;
        // A free light, else the dimmest one already fading out (e.g. right after fast travel).
        const free = slots.find((s) => !s.lamp) ?? slots.filter((s) => s.leaving).sort((a, b) => a.light.intensity - b.light.intensity)[0];
        if (!free) break;
        free.lamp = l;
        free.leaving = false;
        free.light.position.set(l.x, l.y, l.z);
        free.light.color.setHex(l.color);
        free.light.distance = l.range;
        free.light.decay = l.decay ?? 2;
        free.light.intensity = 0;
      }
    }
    for (const s of slots) {
      if (!s.lamp) continue;
      const target = s.leaving ? 0 : this.level(s.lamp);
      s.light.intensity = damp(s.light.intensity, target, 6, dt);
      if (s.leaving && s.light.intensity < 0.02) [s.lamp, s.leaving, s.light.intensity] = [null, false, 0];
    }
  }
}
