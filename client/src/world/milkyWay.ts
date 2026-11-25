import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { twinkleStars } from './skyChart';

/**
 * A dark-sky night: the Milky Way (ESO's all-sky panorama, wrapped round the sky) and a field of faint twinkling
 * stars over the whole sky. Two draws; both sit behind the land and
 * fade in with the night.
 */
export function buildMilkyWay(scene: THREE.Scene) {
  const rng = mulberry32(2024);

  // ---- the Milky Way: ESO's 360° panorama (ESO/S. Brunier, CC BY 4.0) wrapped round the sky ----
  // It's in galactic coordinates (the band along its middle, the core at its centre): turned so the core stands low
  // in the north, above the halls, and the band climbs the sky on a slant. Added over our dark sky; night only.
  const pano = new THREE.TextureLoader().load('/assets/sky/milkyway-eso.jpg');
  pano.colorSpace = THREE.SRGBColorSpace;
  pano.wrapS = THREE.RepeatWrapping;
  // (looked up per pixel from the direction, not from the sphere's own UVs, so it doesn't smear where they pinch
  // at the sphere's poles, and with the seam-free trick for the wrap-around)
  const band = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uMap: { value: pano }, uColor: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // at the sky's distance
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = -atan(d.z, -d.x) / 6.2831853, v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        float uA = fract(u), uB = fract(u + 0.5) - 0.5;
        vec2 uv = vec2(fwidth(uA) <= fwidth(uB) + 1e-5 ? uA : uB, v);
        vec3 c = textureGrad(uMap, uv, dFdx(uv), dFdy(uv)).rgb * uColor;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1450, 64, 32), band);
  const core = new THREE.Vector3(0, Math.sin(0.42), -Math.cos(0.42));
  dome.quaternion
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2) // core to the north, band along the horizon
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.42)) // core up ~24°
    .premultiply(new THREE.Quaternion().setFromAxisAngle(core, 1.0)); // the band rolled to climb on a slant
  dome.frustumCulled = false;
  dome.renderOrder = -0.9;
  scene.add(dome);
  const bandFull = new THREE.Color(0.75, 0.75, 0.75); // its brightness at full night

  const dir = new THREE.Vector3();

  // ---- a field of faint stars over the whole sky ----
  const pos: number[] = [], col: number[] = [], size: number[] = [];
  for (let i = 0; i < 4000; i++) {
    dir.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    if (dir.y < 0.02) continue;
    pos.push(dir.x * 1420, dir.y * 1420, dir.z * 1420);
    const k = rng() ** 3, b = 0.16 + k * 0.6, t = rng();
    const [r, g, bl] = t < 0.45 ? [0.65, 0.8, 1.25] : t < 0.75 ? [1, 0.98, 0.9] : t < 0.92 ? [1.2, 0.95, 0.6] : [1.25, 0.55, 0.42];
    col.push(b * r * 1.15, b * g * 1.15, b * bl * 1.15);
    size.push(1.1 + k * 1.7);
  }
  const field = twinkleStars(pos, col, size, 0.35);
  field.pts.renderOrder = -0.8;
  scene.add(field.pts);

  return {
    update(night: number, time: number) {
      band.uniforms.uColor.value.copy(bandFull).multiplyScalar(night);
      dome.visible = night > 0.01;
      field.update(night, time);
    },
  };
}
