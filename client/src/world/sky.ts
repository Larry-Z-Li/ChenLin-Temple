import * as THREE from 'three';
import { THEME } from '../config/theme';

/** Afternoon sun from the south-west so the south-facing façades are lit. */
export const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.65).normalize();

export function buildSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(THEME.skyTop) },
      horizon: { value: new THREE.Color(THEME.skyHorizon) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // keep at far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  // Image-based lighting from the sky, so metals (gold statues) read properly.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone()));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.fog = new THREE.FogExp2(THEME.skyHorizon, 0.0019);

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x55703a, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 60;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  /** Shadow frustum follows the player. */
  function follow(p: THREE.Vector3) {
    sun.target.position.set(Math.round(p.x), 0, Math.round(p.z));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  }
  return { sun, follow };
}
