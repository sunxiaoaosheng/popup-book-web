// 盖页内侧的天空：一块平面，用 uniform 画垂直渐变。换季只改颜色，不换几何。
import * as THREE from '../vendor/three.module.js';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
varying vec2 vUv;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uGlowAmt;
void main() {
  float y = vUv.y;
  float h = smoothstep(0.02, 0.78, y);
  vec3 col = mix(uHorizon, uTop, h);
  float band = exp(-((y - 0.46) * (y - 0.46)) / 0.028) * uGlowAmt;
  col = mix(col, uGlow, clamp(band, 0.0, 0.72));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

export function createSkyMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color('#f6c99b') },
      uHorizon: { value: new THREE.Color('#f3c7d6') },
      uGlow: { value: new THREE.Color('#ff9fb8') },
      uGlowAmt: { value: 0.3 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  mat.color = new THREE.Color('#f6c99b');
  return mat;
}

export function paintSky(mat, top, horizon, glow, glowAmt) {
  mat.uniforms.uTop.value.copy(top);
  mat.uniforms.uHorizon.value.copy(horizon);
  mat.uniforms.uGlow.value.copy(glow);
  mat.uniforms.uGlowAmt.value = glowAmt;
  mat.color.copy(horizon).lerp(top, 0.5);
}
