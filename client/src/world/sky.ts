import * as THREE from 'three';
import { buildSkyChart, twinkleStars } from './skyChart';
import { buildSkyClouds } from './skyClouds';
import { buildMilkyWay } from './milkyWay';
import { DEFAULT_TEMPLE_TZ } from '../../../shared/protocol';
import { isTouchDevice, settings } from '../config/settings';
import { lerp, mulberry32, smoothstep } from '../core/math';
import { glowTexture } from '../core/textures';
import { nightGlow } from './nightGlow';

/** Shared lighting state read by other systems (lantern glow, birdsong vs crickets). */
export const lighting = { daylight: 1, night: 0 };

let templeTz = DEFAULT_TEMPLE_TZ;
/** Use the server's time zone so everyone shares the temple's day (and offerings reset at its midnight). */
export function setTempleTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    templeTz = tz;
  } catch {
    /* keep default */
  }
}

let debugHours: number | null = null;
let refresh = true;
/** Development: force a time of day (null = follow the clock). */
export const setDebugHours = (h: number | null) => {
  debugHours = h;
  refresh = true;
};
/** Re-read the clock / setting on the next frame (e.g. after toggling "Always day"). */
export const refreshSky = () => (refresh = true);

/** Hours (0–24, fractional) at the temple right now. */
export function templeHours(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: templeTz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') + get('minute') / 60;
}

const ALWAYS_DAY_HOURS = 14.5;
/** "Always night": late evening, the stars and the 28 mansions out, the lamps lit. */
const ALWAYS_NIGHT_HOURS = 22; // a gentle afternoon

/** Sun path: rises in the east (+X), crosses the southern sky (+Z), sets in the west. */
function sunDirection(h: number, out: THREE.Vector3) {
  const th = ((h - 6) / 12) * Math.PI; // 0 at 06:00, π at 18:00
  return out.set(Math.cos(th), Math.sin(th) * 0.85, 0.35 + Math.sin(th) * 0.45).normalize();
}

const C = (hex: number) => new THREE.Color(hex);
const PALETTE = {
  day: { top: C(0x5d97d3), horizon: C(0xd7e6ee) },
  dusk: { top: C(0x4a5a8c), horizon: C(0xf0a070) },
  night: { top: C(0x02050d), horizon: C(0x08111f) }, // a dark-site sky: near-black blue, no glow
};

export function buildSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: PALETTE.day.top.clone() },
      horizon: { value: PALETTE.day.horizon.clone() },
      glowDir: { value: new THREE.Vector3(0, 1, 0) },
      glowColor: { value: new THREE.Color(1, 0.92, 0.75) },
      glowStrength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // keep at far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 glowDir; uniform vec3 glowColor; uniform float glowStrength;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(d, glowDir), 0.0);
        col += glowColor * glowStrength * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  // Image-based lighting from the daytime sky (dimmed at night).
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const fog = new THREE.FogExp2(PALETTE.day.horizon.getHex(), 0.0019);
  scene.fog = fog;

  // Stars (upper sky) and the moon.
  const rng = mulberry32(7);
  const starPos: number[] = [], starCol: number[] = [], starSize: number[] = [];
  while (starPos.length < 1800 * 3) {
    const v = new THREE.Vector3(rng() * 2 - 1, rng(), rng() * 2 - 1);
    if (v.lengthSq() > 1 || v.y < 0.06) continue;
    v.normalize().multiplyScalar(1400);
    starPos.push(v.x, v.y, v.z);
    // mostly faint and small, a few brighter; a little blue or warm
    const k = rng() ** 2.5, b = 0.3 + k * 0.7, warm = rng() - 0.5;
    starCol.push(b * (1 + warm * 0.12), b, b * (1 - warm * 0.15));
    starSize.push(1.8 + k * 2.4);
  }
  const stars = twinkleStars(starPos, starCol, starSize.map((v) => v * 2), 0.42, 0.7); // twinkling, with now and then a glint
  scene.add(stars.pts);
  let starTime = 0;
  const milky = buildMilkyWay(scene); // a dark-sky night: the Milky Way and a dense field of faint stars
  const chart = buildSkyChart(scene); // the 28 mansions and the Four Symbols, by night
  const clouds = buildSkyClouds(scene); // and by day, drifting clouds
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xeef2ff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  moon.scale.setScalar(90);
  scene.add(moon);

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x55703a, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(isTouchDevice ? 1024 : 2048); // (phones: a quarter of the shadow map to draw each frame)
  const s = 75; // the shadow box is 150 m across, slid ahead of the camera (see follow)
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3(0, 1, 0);
  const top = new THREE.Color(), horizon = new THREE.Color(), tmp = new THREE.Color();
  let hours = ALWAYS_DAY_HOURS, clockAcc = 99;

  function update(dt: number) {
    clockAcc += dt;
    if (clockAcc > 1 || refresh) {
      clockAcc = 0;
      refresh = false;
      hours = debugHours ?? (settings.timeOfDay === 'day' ? ALWAYS_DAY_HOURS : settings.timeOfDay === 'night' ? ALWAYS_NIGHT_HOURS : templeHours());
    }
    sunDirection(hours, sunDir);
    moonDir.set(-sunDir.x, -sunDir.y, 0.4).normalize();

    const daylight = smoothstep(-0.1, 0.22, sunDir.y);
    const dusk = Math.exp(-(((sunDir.y - 0.02) / 0.13) ** 2));
    clouds.update(dt, daylight, dusk);
    lighting.daylight = daylight;
    lighting.night = 1 - daylight;

    top.copy(PALETTE.night.top).lerp(PALETTE.day.top, daylight).lerp(PALETTE.dusk.top, dusk * 0.6);
    horizon.copy(PALETTE.night.horizon).lerp(PALETTE.day.horizon, daylight).lerp(PALETTE.dusk.horizon, dusk * 0.8);
    skyMat.uniforms.top.value.copy(top);
    skyMat.uniforms.horizon.value.copy(horizon);
    const sunUp = smoothstep(-0.03, 0.08, sunDir.y);
    skyMat.uniforms.glowDir.value.copy(sunUp > 0.02 ? sunDir : moonDir);
    skyMat.uniforms.glowColor.value.set(sunUp > 0.02 ? 0xffebbf : 0xc8d4ff);
    skyMat.uniforms.glowStrength.value = sunUp > 0.02 ? sunUp : 0.28 * lighting.night;
    fog.color.copy(horizon);

    hemi.color.copy(tmp.set(0x3a5488)).lerp(C(0xdcecff), daylight);
    hemi.groundColor.copy(tmp.set(0x1a2418)).lerp(C(0x55703a), daylight);
    hemi.intensity = lerp(0.55, 1.1, daylight);

    // Sunlight by day (warmer when low), moonlight by night.
    if (sunUp > 0.02) {
      lightDir.copy(sunDir);
      sun.color.set(0xffa060).lerp(C(0xfff0d8), smoothstep(0.05, 0.4, sunDir.y));
      sun.intensity = 2.8 * sunUp;
    } else {
      lightDir.copy(moonDir);
      sun.color.set(0x9fb4ff);
      sun.intensity = 0.65 * lighting.night;
    }
    scene.environmentIntensity = lerp(0.15, 0.55, daylight);
    starTime += dt;
    stars.update(smoothstep(0.35, 1, lighting.night), starTime);
    milky.update(smoothstep(0.35, 1, lighting.night), starTime);
    chart.update(smoothstep(0.45, 1, lighting.night), starTime);
    (moon.material as THREE.SpriteMaterial).opacity = smoothstep(0.3, 1, lighting.night);
    moon.position.copy(moonDir).multiplyScalar(1300);
    nightGlow.update(lighting.night);
  }

  /**
   * Shadow box follows the player, slid forward along `look` (the camera's direction) so it covers what's
   * on screen — from ~20 m behind you to ~130 m ahead — instead of wasting half of it behind the camera.
   */
  function follow(p: THREE.Vector3, look?: THREE.Vector3) {
    let fx = 0, fz = 0;
    if (look) {
      const l = Math.hypot(look.x, look.z) || 1;
      [fx, fz] = [(look.x / l) * s * 0.75, (look.z / l) * s * 0.75];
    }
    // at your height, not sea level: up on the ridge the stupas beside you were above the box
    sun.target.position.set(Math.round((p.x + fx) / 2) * 2, Math.round(p.y / 2) * 2, Math.round((p.z + fz) / 2) * 2);
    sun.position.copy(sun.target.position).addScaledVector(lightDir, 200);
  }
  return { sun, follow, update };
}
