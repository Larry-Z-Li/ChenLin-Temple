import * as THREE from 'three';

/**
 * The ground's fine detail, worked out per pixel from the slope and the place (so it is the same wherever the
 * terrain, the rivers' banks and the waterfall's rock meet, and doesn't depend on how coarse a mesh is): grass broken
 * into lighter and darker tufts, patches of bare earth and gravel on the level, scree on the slopes, and rock with
 * its bedding on the steepest. It builds on the vertex colour (the broad meadow → forest → rock). With `shade`, a
 * per-vertex `aShade` (0 … 1) darkens nooks and caves afterward.
 */
export function groundDetail<T extends THREE.MeshStandardMaterial>(mat: T, opts: { shade?: boolean } = {}): T {
  if (opts.shade) mat.defines = { ...mat.defines, GROUND_SHADE: '' };
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying vec3 vGN;
        #ifdef GROUND_SHADE
          attribute float aShade; varying float vShade;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGN = normalize(mat3(modelMatrix) * objectNormal);
        #ifdef GROUND_SHADE
          vShade = aShade;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying vec3 vGN;
        #ifdef GROUND_SHADE
          varying float vShade;
        #endif
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float slope = 1.0 - clamp(normalize(vGN).y, 0.0, 1.0);
          vec2 p = vGW.xz;
          float patches = gNoise(p * 0.06) * 0.6 + gNoise(p * 0.17 + 3.1) * 0.4;
          float fine = gNoise(p * 0.85), grain = gNoise(p * 3.1 + vGW.y * 0.7);
          vec3 g = diffuseColor.rgb;
          g *= (0.95 + 0.1 * patches) * (0.95 + 0.1 * fine * (1.0 - slope));            // grass a shade lighter or darker here and there
          float earth = smoothstep(0.64, 0.74, patches) * (1.0 - smoothstep(0.25, 0.5, slope)) * smoothstep(6.0, 14.0, vGW.y); // up in the hills, not the park
          vec3 earthC = mix(vec3(0.115, 0.082, 0.052), vec3(0.2, 0.17, 0.13), grain);    // bare earth, gravelly
          g = mix(g, earthC * (0.85 + 0.3 * fine), earth * 0.75);
          float scree = smoothstep(0.26 + 0.12 * patches, 0.42 + 0.12 * patches, slope);
          vec3 screeC = mix(vec3(0.17, 0.155, 0.13), vec3(0.3, 0.285, 0.255), grain) * (0.8 + 0.35 * fine);
          g = mix(g, screeC, scree * 0.8);
          float rock = smoothstep(0.52 + 0.1 * fine, 0.68 + 0.1 * fine, slope);
          float bed = gNoise(vec2(vGW.y * 0.8 + fine * 0.6, (p.x + p.y) * 0.04));          // bedding across the face
          vec3 rockC = mix(vec3(0.19, 0.18, 0.16), vec3(0.32, 0.3, 0.27), bed) * (0.82 + 0.3 * grain);
          float big = gNoise(p * 0.03 + vec2(vGW.y * 0.015, 0.0));                        // lighter and darker stretches of rock
          float streak = gNoise(p * 0.45 + vec2(0.0, vGW.y * 0.012));                     // (on a sheer face, streaks down it)
          rockC *= (0.75 + 0.45 * big) * (1.0 - 0.3 * smoothstep(0.6, 0.9, streak));
          rockC = mix(rockC, rockC * vec3(1.08, 1.0, 0.88), smoothstep(0.4, 0.8, gNoise(p * 0.07 + 5.3)));
          g = mix(g, rockC, rock);
          #ifdef GROUND_SHADE
            g *= vShade;
          #endif
          diffuseColor.rgb = g;
        }`);
  };
  mat.customProgramCacheKey = () => 'groundDetail' + (opts.shade ? '+shade' : '');
  return mat;
}
