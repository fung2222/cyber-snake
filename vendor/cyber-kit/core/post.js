// Final cyberpunk post pass: chromatic aberration, vignette, glitch rows, film grain, colour flash.
import * as THREE from 'three';

export const CyberShader = {
  name: 'CyberShader',
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uAberration: { value: 0.0012 }, uGlitch: { value: 0 },
    uVignette: { value: 1.0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.012 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAberration, uGlitch, uVignette, uFlash, uGrain; uniform vec3 uFlashColor; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.0) {
        float row = floor(uv.y * 24.0);
        float n = h(vec2(row, floor(uTime * 24.0)));
        uv.x += (n - 0.5) * uGlitch * 0.08 * step(0.6, n);
      }
      vec2 dir = uv - 0.5; float d = length(dir);
      float ab = uAberration * (0.4 + d * 2.0) + uGlitch * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;
      col *= mix(1.0, smoothstep(0.95, 0.25, d), 0.55 * uVignette);
      col += (h(uv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      col += uFlashColor * uFlash;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
