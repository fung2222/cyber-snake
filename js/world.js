// Environment: sky, wet reflective grid floor, arena rails, neon skyline, signs, rain, dust, traffic.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GRID } from './levels.js';
import { cameraEnvelope, SHAKE } from './camrig.js';

export const HALF = GRID / 2;

// Sight-line protection (2026-10-06 occlusion fix). Every scenery object must stay out of every camera -> arena-cell
// sight line. SIGHT.field is a top-down height cap (world units) built from camrig.cameraEnvelope(): a building whose
// inflated footprint covers a capped cell is lowered below the cap (a "podium") or dropped. A runtime fade
// (World.updateOcclusion) dithers away anything that still ends up in front of the arena, e.g. mid camera transition.
export const SIGHT = {
  EXT: 44, RES: 0.5,          // field covers |x|,|z| <= EXT at RES resolution
  CLEAR: 27,                  // hard clear zone: no building footprint within this square half-size (unchanged)
  MARGIN: 1.0,                // footprint inflation: shake (0.7) + sampling slop
  VMARGIN: 0.8,               // vertical clearance under the sight lines
  MIN_PODIUM: 3,              // shorter than this is dropped instead of kept as a podium
  FADE_MIN: 0.12,             // dither coverage of a fully faded occluder
};
const PERIM_STEP = 1.0;
export function arenaPerimeter(step = PERIM_STEP, y = 0) {
  const pts = [];
  for (let s = -HALF; s < HALF - 1e-6; s += step) pts.push(new THREE.Vector3(s, y, -HALF), new THREE.Vector3(HALF, y, s), new THREE.Vector3(-s, y, HALF), new THREE.Vector3(-HALF, y, -s));
  return pts;
}
// segment p->q vs axis-aligned box (min/max Vector3): true if they intersect (slab test, allocation-free)
function slab(p, d, mn, mx, r) {
  if (Math.abs(d) < 1e-9) return p >= mn && p <= mx;
  let a = (mn - p) / d, b = (mx - p) / d;
  if (a > b) { const t = a; a = b; b = t; }
  if (a > r[0]) r[0] = a; if (b < r[1]) r[1] = b;
  return r[0] <= r[1];
}
const _r = [0, 1];
export function segBox(p, q, mn, mx) {
  _r[0] = 0; _r[1] = 1;
  return slab(p.x, q.x - p.x, mn.x, mx.x, _r) && slab(p.y, q.y - p.y, mn.y, mx.y, _r) && slab(p.z, q.z - p.z, mn.z, mx.z, _r);
}

// Shared uniforms (same objects referenced by many materials)
export const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x12051f) },
  uFogDensity: { value: 0.012 },   // was 0.017: lighter haze so the arena reads crisp
  uC1: { value: new THREE.Color(0x00f0ff) },
  uC2: { value: new THREE.Color(0xff2bd6) },
  uC3: { value: new THREE.Color(0xfff35c) },
  uGrid: { value: new THREE.Color(0x00c8ff) },
  uHorizon: { value: new THREE.Color(0x5a0a5e) },
  uZenith: { value: new THREE.Color(0x02010a) },
};

const mix01 = (f) => SIGHT.FADE_MIN + (1 - SIGHT.FADE_MIN) * f;
const NOISE_GLSL = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
`;
const FOG_GLSL = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDensity;
vec3 applyFog(vec3 col, float dist){ float f = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist); return mix(col, uFogColor, clamp(f,0.0,1.0)); }
`;

export class World {
  constructor(scene, renderer, quality = 1) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(U.uFogColor.value, U.uFogDensity.value);
    this.floorUniforms = null;
    this.flicker = [];
    this.buildSky();
    this.buildFloor(quality);
    this.occluders = [];      // runtime-fade candidates: { min, max, fade, target, apply(f) }
    this.scenery = [];        // every scenery mesh (tests raycast against these)
    this.fadeEnabled = new URLSearchParams(location.search).get('nofade') !== '1';
    this.buildSightField();
    this.buildArena();
    this.buildCity();
    this.buildBillboard();
    this.buildRain();
    this.buildDust();
    this.buildTraffic();
    this.buildLights();
    this.buildEnv();
  }

  // ---------------- Sky ----------------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: U.uTime, uHorizon: U.uHorizon, uZenith: U.uZenith, uFogColor: U.uFogColor, uC2: U.uC2 },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uHorizon, uZenith, uFogColor, uC2; uniform float uTime; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          float y = vDir.y;
          vec3 col = mix(uFogColor, uZenith, smoothstep(0.0, 0.55, y));
          // horizon glow band
          col += uHorizon * exp(-abs(y - 0.02) * 9.0) * 0.9;
          col += uC2 * exp(-abs(y) * 30.0) * 0.12;
          // slow clouds / smog
          vec2 cp = vDir.xz / max(y + 0.25, 0.05) * 1.6 + vec2(uTime * 0.01, 0.0);
          float c = vnoise(cp) * 0.6 + vnoise(cp * 2.3) * 0.4;
          col += uHorizon * smoothstep(0.45, 0.9, c) * 0.25 * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(0.3, 0.8, y));
          // stars
          vec2 sp = floor(vDir.xz / (y + 0.4) * 140.0);
          float s = step(0.996, hash12(sp)) * smoothstep(0.25, 0.7, y);
          col += vec3(0.8, 0.85, 1.0) * s * (0.5 + 0.5 * sin(uTime * 2.0 + hash12(sp + 3.0) * 30.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);
  }

  // ---------------- Floor ----------------
  buildFloor(quality) {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = 0.5 * quality;
    const shader = {
      name: 'NeonFloor',
      uniforms: {
        color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
        uPulse: { value: new THREE.Vector4(0, 0, -100, 0) },
        uPulse2: { value: new THREE.Vector4(0, 0, -100, 0) },
        uHead: { value: new THREE.Vector2() }, uFood: { value: new THREE.Vector2(999, 999) },
        uHeadColor: { value: new THREE.Color() }, uFoodColor: { value: new THREE.Color() },
        uDanger: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 vUvR; varying vec3 vWorld;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          vUvR = textureMatrix * vec4(position, 1.0);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 color; uniform sampler2D tDiffuse;
        uniform float uTime, uDanger; uniform vec3 uC1, uC2, uGrid;
        uniform vec4 uPulse, uPulse2; uniform vec2 uHead, uFood; uniform vec3 uHeadColor, uFoodColor;
        varying vec4 vUvR; varying vec3 vWorld;
        #include <logdepthbuf_pars_fragment>
        ${NOISE_GLSL}
        ${FOG_GLSL}
        float gridLine(vec2 p, float w){ vec2 fw = fwidth(p); vec2 g = abs(fract(p - 0.5) - 0.5) / (fw * w); return 1.0 - min(min(g.x, g.y), 1.0); }
        float pulse(vec4 P, vec2 p){
          float age = uTime - P.z; if (age < 0.0 || age > 2.5) return 0.0;
          float r = age * 16.0; float d = length(p - P.xy);
          return exp(-pow((d - r) * 0.9, 2.0)) * P.w * (1.0 - age / 2.5);
        }
        void main(){
          #include <logdepthbuf_fragment>
          vec2 p = vWorld.xz;
          float H = ${HALF.toFixed(1)};
          float m = max(abs(p.x), abs(p.y));
          float inside = 1.0 - step(H, m);
          float dist = length(vWorld - cameraPosition);
          // puddles / wet asphalt variation
          float pn = vnoise(p * 0.18) * 0.65 + vnoise(p * 0.7) * 0.35;
          float puddle = smoothstep(0.42, 0.62, pn);
          // ripple distortion from rain
          vec2 rip = (vec2(vnoise(p * 1.7 + uTime * 0.9), vnoise(p * 1.7 - uTime * 0.8)) - 0.5) * 0.004 * (1.0 - inside * 0.8);
          vec4 uvr = vUvR; uvr.xy += rip * uvr.w;
          // wet-street look: reflections smeared vertically (in screen space)
          float b = (0.0035 + 0.004 * (1.0 - puddle)) * uvr.w * (1.0 - inside * 0.5);
          vec3 refl = textureProj(tDiffuse, uvr).rgb * 0.2;
          refl += textureProj(tDiffuse, uvr + vec4(0.0,  b, 0.0, 0.0)).rgb * 0.15;
          refl += textureProj(tDiffuse, uvr + vec4(0.0, -b, 0.0, 0.0)).rgb * 0.15;
          refl += textureProj(tDiffuse, uvr + vec4(b * 0.35,  2.2 * b, 0.0, 0.0)).rgb * 0.125;
          refl += textureProj(tDiffuse, uvr + vec4(-b * 0.35, -2.2 * b, 0.0, 0.0)).rgb * 0.125;
          refl += textureProj(tDiffuse, uvr + vec4(0.0,  3.6 * b, 0.0, 0.0)).rgb * 0.1;
          refl += textureProj(tDiffuse, uvr + vec4(0.0, -3.6 * b, 0.0, 0.0)).rgb * 0.1;
          refl += textureProj(tDiffuse, uvr + vec4(b * 0.6, 0.0, 0.0, 0.0)).rgb * 0.025;
          refl += textureProj(tDiffuse, uvr + vec4(-b * 0.6, 0.0, 0.0, 0.0)).rgb * 0.025;

          vec3 base = vec3(0.006, 0.006, 0.013) * (0.7 + vnoise(p * 2.0) * 0.6);
          vec2 cell = floor(p);
          float chk = mod(cell.x + cell.y, 2.0);
          base += inside * vec3(0.006, 0.007, 0.016) * (0.6 + chk * 0.6);
          float reflK = mix(0.18 + 0.6 * puddle, 0.36, inside);
          vec3 col = base + refl * reflK;

          // arena grid
          float gl = gridLine(p, 1.2);
          float gl5 = gridLine(p / 5.0, 1.0);
          col += uGrid * (gl * 0.11 + gl5 * 0.12) * inside;
          // cell centre dots
          vec2 cf = abs(fract(p) - 0.5);
          col += uGrid * smoothstep(0.05, 0.0, length(cf)) * 0.1 * inside;
          // outer street grid (fades with distance)
          float og = gridLine(p / 4.0, 1.0) * (1.0 - inside) * exp(-max(m - H, 0.0) * 0.05);
          col += uGrid * og * 0.05;
          // border
          float e = abs(m - H);
          col += uC1 * (smoothstep(0.08, 0.0, e) * 2.0 + exp(-e * 3.0) * 0.12);
          col += uC2 * exp(-abs(m - H - 0.6) * 8.0) * 0.12 * (1.0 - inside);
          // light pools under snake head / food
          float hd = length(p - uHead);
          col += uHeadColor * exp(-hd * hd * 0.25) * (0.05 + gl * 0.5);
          float fd = length(p - uFood);
          col += uFoodColor * exp(-fd * fd * 0.4) * (0.05 + gl * 0.6);
          // pulse rings
          float pl = pulse(uPulse, p) + pulse(uPulse2, p);
          col += mix(uC2, uC1, 0.35) * pl * (0.08 + gl * 1.2 + gl5 * 0.6);
          // scanning sweep
          float sy = mod(uTime * 5.0, 50.0) - 25.0;
          col += uC1 * exp(-pow((p.y - sy) * 1.5, 2.0)) * inside * (0.015 + gl * 0.25);
          // danger tint
          col += vec3(1.0, 0.05, 0.15) * uDanger * (0.03 + gl * 0.35) * inside;
          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    };
    const geo = new THREE.PlaneGeometry(500, 500);
    const floor = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: Math.floor(w * pr * scale),
      textureHeight: Math.floor(h * pr * scale),
      color: 0xffffff, multisample: 0, shader,
    });
    floor.rotation.x = -Math.PI / 2;
    const u = floor.material.uniforms;
    for (const k of ['uTime', 'uC1', 'uC2', 'uGrid', 'uFogColor', 'uFogDensity']) u[k] = U[k];
    this.floor = floor;
    this.floorUniforms = u;
    this.reflScale = scale;
    this.group.add(floor);
  }

  resize(w, h, pr) {
    const rt = this.floor.getRenderTarget();
    rt.setSize(Math.floor(w * pr * this.reflScale), Math.floor(h * pr * this.reflScale));
  }

  // ---------------- Arena rails + pylons ----------------
  buildArena() {
    const g = new THREE.Group();
    this.railMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.railMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const L = GRID + 0.3;
    const mk = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    for (const s of [-1, 1]) {
      mk(L, 0.06, 0.06, 0, 0.08, s * (HALF + 0.15), this.railMat);
      mk(0.06, 0.06, L, s * (HALF + 0.15), 0.08, 0, this.railMat);
      mk(L, 0.035, 0.035, 0, 0.62, s * (HALF + 0.15), this.railMat2);
      mk(0.035, 0.035, L, s * (HALF + 0.15), 0.62, 0, this.railMat2);
    }
    // translucent energy walls
    const wallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uC1, uC2; varying vec2 vUv; varying vec3 vW;
        void main(){
          float a = pow(1.0 - vUv.y, 2.0) * 0.14;
          float stripes = step(0.5, fract((vW.x + vW.z) * 2.0 - uTime * 0.8)) * 0.08;
          float scan = exp(-pow((vUv.y - fract(uTime * 0.35)) * 18.0, 2.0)) * 0.4;
          vec3 col = mix(uC1, uC2, vUv.y) * (a + stripes * (1.0 - vUv.y) + scan * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    for (let i = 0; i < 4; i++) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.62), wallMat);
      const a = i * Math.PI / 2;
      wall.position.set(Math.sin(a) * (HALF + 0.15), 0.31, Math.cos(a) * (HALF + 0.15));
      wall.rotation.y = a;
      g.add(wall);
    }
    // corner pylons
    // (each corner pylon has its own materials so the sight-line fade can ghost it: from the low attract/game-over
    // orbit a pylon sits right in front of its corner cell)
    this.capMats = [];
    this.pylonLights = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x0b0b16, metalness: 0.9, roughness: 0.3, transparent: true });
      const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      this.capMats.push(capMat);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), pylonMat);
      p.position.set(sx * (HALF + 0.6), 1.3, sz * (HALF + 0.6));
      g.add(p);
      const parts = [p];
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.74), capMat);
        band.position.set(p.position.x, 0.6 + k * 0.8, p.position.z); g.add(band); parts.push(band);
      }
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), capMat);
      cap.position.set(p.position.x, 3.1, p.position.z); g.add(cap); parts.push(cap);
      this.pylonLights.push(cap);
      for (const m of parts) { m.userData.scenery = 'pylon'; this.scenery.push(m); }
      const px = p.position.x, pz = p.position.z;
      this.addOccluder(new THREE.Vector3(px - 0.37, 0, pz - 0.37), new THREE.Vector3(px + 0.37, 3.4, pz + 0.37), (f) => {
        const a = 0.18 + 0.82 * f;
        pylonMat.opacity = a; capMat.opacity = a; pylonMat.depthWrite = capMat.depthWrite = f > 0.98;
      });
    }
    this.group.add(g);
    this.arena = g;
  }

  // ---------------- Sight-line height cap ----------------
  buildSightField() {
    const { EXT, RES, CLEAR } = SIGHT;
    const n = Math.ceil(2 * EXT / RES);
    const field = new Float32Array(n * n).fill(Infinity);
    const cams = cameraEnvelope({ orbitAngles: 192 });
    const tgts = arenaPerimeter();
    const inner = CLEAR - SIGHT.MARGIN - 1;   // nothing can stand inside this square, skip that part of each line
    const mark = (x, z, y) => {
      const i = Math.floor((x + EXT) / RES), j = Math.floor((z + EXT) / RES);
      if (i < 0 || j < 0 || i >= n || j >= n) return;
      const k = j * n + i; if (y < field[k]) field[k] = y;
    };
    for (const { p: c } of cams) {
      if (Math.max(Math.abs(c.x), Math.abs(c.z)) < inner) continue;  // line never leaves the clear zone
      for (const tg of tgts) {
        const dx = c.x - tg.x, dz = c.z - tg.z, L = Math.hypot(dx, dz);
        // parameter where the line leaves the inner square (it starts inside: targets are on the arena edge)
        let ts = 1;
        for (const [o, d] of [[tg.x, dx], [tg.z, dz]]) {
          if (Math.abs(d) < 1e-9) continue;
          const tt = ((d > 0 ? inner : -inner) - o) / d; if (tt > 0 && tt < ts) ts = tt;
        }
        const steps = Math.max(1, Math.ceil(L * (1 - ts) / (RES * 0.5)));
        for (let s = 0; s <= steps; s++) {
          const t = ts + (1 - ts) * s / steps, t2 = ts + (1 - ts) * Math.min(steps, s + 1) / steps;
          const y = c.y * t;          // target y = 0, height grows towards the camera: the step's minimum is y(t)
          mark(tg.x + dx * t, tg.z + dz * t, y); mark(tg.x + dx * t2, tg.z + dz * t2, y);
        }
      }
    }
    this.sight = { field, n };
  }

  // lowest sight line over a footprint (centre x,z, size w,d) inflated by SIGHT.MARGIN; Infinity = never in view
  sightCap(x, z, w, d) {
    const { EXT, RES, MARGIN } = SIGHT, { field, n } = this.sight;
    const i0 = Math.max(0, Math.floor((x - w / 2 - MARGIN + EXT) / RES)), i1 = Math.min(n - 1, Math.floor((x + w / 2 + MARGIN + EXT) / RES));
    const j0 = Math.max(0, Math.floor((z - d / 2 - MARGIN + EXT) / RES)), j1 = Math.min(n - 1, Math.floor((z + d / 2 + MARGIN + EXT) / RES));
    let m = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (field[j * n + i] < m) m = field[j * n + i];
    return m;
  }

  addOccluder(min, max, apply) {
    const o = { min: min.clone().sub(new THREE.Vector3(0.25, 0, 0.25)), max: max.clone().add(new THREE.Vector3(0.25, 0.25, 0.25)), fade: 1, target: 1, apply };
    this.occluders.push(o); return o;
  }

  // Safety fade: anything (still) between the camera and the arena dithers out. `focus` = extra points (head, food).
  updateOcclusion(camPos, dt, focus = []) {
    if (!this._perim) this._perim = arenaPerimeter(2, 0.3);
    const pts = this._perim;
    for (const o of this.occluders) {
      let hit = false;
      if (this.fadeEnabled) {
        for (const f of focus) if (segBox(camPos, f, o.min, o.max)) { hit = true; break; }
        if (!hit) for (const q of pts) if (segBox(camPos, q, o.min, o.max)) { hit = true; break; }
      }
      o.target = hit ? 0 : 1;
      if (o.fade === o.target) continue;
      const f = o.fade + (o.target - o.fade) * Math.min(1, dt * (hit ? 10 : 3));
      o.fade = Math.abs(f - o.target) < 0.01 ? o.target : f; o.apply(o.fade);
    }
    if (this.cityFadeDirty) { this.cityFade.needsUpdate = true; this.cityFadeDirty = false; }
  }

  // ---------------- City ----------------
  buildCity() {
    const N = 300;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uC3: U.uC3, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`
        attribute float aSeed; attribute float aFade;
        varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed; varying float vFade;
        void main(){
          vFade = aFade;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normal; vL = position;
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vSeed = aSeed;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uC1, uC2, uC3;
        varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed; varying float vFade;
        ${NOISE_GLSL}
        ${FOG_GLSL}
        float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0);
          float b = mod(q.x + q.y * 2.0, 4.0) * 4.0 + mod(floor(q.x * 0.5) + floor(q.y * 0.5) * 2.0, 4.0);
          return (b + 0.5) / 16.0; }
        void main(){
          if (vFade < 0.999) {
            // sight-line safety fade: holographic dither, keep the neon edges as a wire outline
            vec2 ed = (0.5 - abs(vL.xz)) * vS.xz;
            float edge = vN.y > 0.5 ? 0.0 : step(min(ed.x, ed.y), 0.07) + step(abs(vW.y - vS.y), 0.08);
            if (edge < 0.5 && bayer4(gl_FragCoord.xy) > mix(${SIGHT.FADE_MIN.toFixed(2)}, 1.0, vFade)) discard;
          }
          vec3 col = vec3(0.008, 0.008, 0.018);
          float dist = length(vW - cameraPosition);
          vec3 neon = vSeed < 0.33 ? uC1 : (vSeed < 0.66 ? uC2 : uC3);
          if (vN.y > 0.5) {
            // roof
            vec2 d = (0.5 - abs(vL.xz)) * vS.xz;
            float e = min(d.x, d.y);
            col += neon * smoothstep(0.15, 0.0, e) * 1.2 * step(0.5, fract(vSeed * 13.0));
          } else if (vN.y > -0.5) {
            float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
            vec2 wc = vec2(u / 0.62, vW.y / 0.82);
            float aa = clamp(1.6 - max(fwidth(wc.x), fwidth(wc.y)) * 2.2, 0.0, 1.0);
            vec2 cell = floor(wc); vec2 f = fract(wc);
            float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
            float h = hash12(cell + vSeed * 91.7);
            float lit = step(0.64, h);
            vec3 wcol = h > 0.93 ? uC1 : (h > 0.88 ? uC2 : vec3(1.0, 0.72, 0.42));
            float flick = 0.85 + 0.15 * sin(uTime * (3.0 + h * 9.0) + h * 40.0);
            vec3 wl = win * lit * wcol * (0.35 + h * 0.9) * flick * 0.8;
            col += mix(vec3(0.07, 0.05, 0.05), wl, aa);
            // unlit windows faintly reflective
            col += win * (1.0 - lit) * vec3(0.02, 0.025, 0.05);
            // corner neon strips
            vec2 dd = (0.5 - abs(vL.xz)) * vS.xz;
            float corner = max(dd.x, dd.y);
            float hasStrip = step(0.55, fract(vSeed * 7.31));
            col += neon * smoothstep(0.14, 0.02, corner) * 2.5 * hasStrip;
            // horizontal neon band
            float bandY = vS.y * (0.35 + 0.5 * fract(vSeed * 3.7));
            float hasBand = step(0.6, fract(vSeed * 5.13));
            col += neon * smoothstep(0.12, 0.0, abs(vW.y - bandY)) * 2.0 * hasBand;
            // roof edge line
            col += neon * smoothstep(0.1, 0.0, abs(vW.y - vS.y + 0.1)) * 1.5 * step(0.4, fract(vSeed * 2.9));
            // ground level shop glow
            col += mix(uC2, vec3(1.0, 0.5, 0.2), fract(vSeed * 4.0)) * smoothstep(2.5, 0.0, vW.y) * 0.35;
          }
          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const seeds = new Float32Array(N);
    const m4 = new THREE.Matrix4();
    const placed = [];
    let count = 0, tries = 0;
    this.nearBuildings = [];
    while (count < N && tries < 6000) {
      tries++;
      const ang = Math.random() * Math.PI * 2;
      const r = 31 + Math.pow(Math.random(), 1.4) * 100;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const w = 4 + Math.random() * 7, d = 4 + Math.random() * 7;
      // avoid overlaps
      let ok = true;
      for (const b of placed) { if (Math.abs(b.x - x) < (b.w + w) / 2 + 1 && Math.abs(b.z - z) < (b.d + d) / 2 + 1) { ok = false; break; } }
      if (!ok) continue;
      if (Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2) < SIGHT.CLEAR) continue;
      const near = r < 55;
      let h = near ? 10 + Math.random() * 30 : 18 + Math.random() * 60;
      // keep out of every camera -> arena sight line: lower to a podium under the lowest line, or drop it
      const cap = this.sightCap(x, z, w, d) - SIGHT.VMARGIN;
      if (cap < SIGHT.MIN_PODIUM) continue;
      const podium = h > cap;
      if (podium) h = Math.max(SIGHT.MIN_PODIUM, cap - Math.random() * Math.min(3, cap - SIGHT.MIN_PODIUM));
      m4.makeScale(w, h, d); m4.setPosition(x, 0, z);
      mesh.setMatrixAt(count, m4);
      seeds[count] = Math.random();
      const b = { x, z, w, d, h, i: count, podium, cap: cap + SIGHT.VMARGIN };
      placed.push(b);
      if (near) this.nearBuildings.push(b);
      count++;
    }
    mesh.count = count;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const fade = new Float32Array(N).fill(1);
    this.cityFade = new THREE.InstancedBufferAttribute(fade, 1); this.cityFade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFade', this.cityFade);
    // only buildings whose footprint is anywhere under a sight line can ever get in the way
    for (const b of placed) if (Number.isFinite(b.cap)) {
      this.addOccluder(new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2), new THREE.Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2),
        (f) => { fade[b.i] = f; this.cityFadeDirty = true; });
    }
    this.buildings = placed;
    mesh.frustumCulled = false;
    mesh.userData.scenery = 'building';
    this.group.add(mesh);
    this.city = mesh;
    this.scenery.push(mesh);
    this.buildSigns();
  }

  makeSignTexture(text, color, vertical, sub = '') {
    const c = document.createElement('canvas');
    const W = vertical ? 128 : 512, H = vertical ? 512 : 160;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,2,18,0.92)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 14;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#ffffff'; g.shadowBlur = 22;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const zh = '"Noto Sans CJK TC","Noto Sans TC","PingFang HK","Microsoft JhengHei",sans-serif';
    if (vertical) {
      const chars = [...text]; const fs = Math.min(96, (H - 50) / chars.length);
      g.font = `900 ${fs}px ${zh}`;
      chars.forEach((ch, i) => { g.fillStyle = color; g.fillText(ch, W / 2, 28 + fs / 2 + i * fs); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(ch, W / 2, 28 + fs / 2 + i * fs); });
    } else {
      g.font = `900 ${sub ? 70 : 84}px ${zh}`;
      g.fillStyle = color; g.fillText(text, W / 2, sub ? H / 2 - 18 : H / 2);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(text, W / 2, sub ? H / 2 - 18 : H / 2);
      if (sub) { g.font = `700 30px Orbitron, sans-serif`; g.fillStyle = color; g.fillText(sub, W / 2, H / 2 + 42); }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  buildSigns() {
    const texts = ['大押', '茶餐廳', '義體診所', '電腦城', '金舖', '冰室', '網吧', '夜市', '數碼港', '大排檔', '旅館', '藥房', '霓虹', '龍城'];
    const horiz = [['賽博', 'CYBER'], ['24小時', 'OPEN 24H'], ['電子', 'ELECTRONICS'], ['九龍', 'KOWLOON'], ['數據', 'DATA BANK'], ['酒家', 'RESTAURANT']];
    const cols = ['#ff2bd6', '#00f0ff', '#fff35c', '#ff6a3a', '#7dff3a', '#b45cff'];
    const bs = [...this.nearBuildings].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 26);
    let i = 0;
    for (const b of bs) {
      const vertical = i % 3 !== 2;
      const color = cols[i % cols.length];
      const tex = vertical ? this.makeSignTexture(texts[i % texts.length], color, true) : this.makeSignTexture(horiz[i % horiz.length][0], color, false, horiz[i % horiz.length][1]);
      const sw = vertical ? 1.8 : 6, sh = vertical ? 7.2 : 1.9;
      if (b.h < sh + 3) { i++; continue; }
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
      // face toward arena
      const toC = new THREE.Vector2(-b.x, -b.z);
      let px, pz, ry;
      if (Math.abs(toC.x) > Math.abs(toC.y)) { const s = Math.sign(toC.x); px = b.x + s * (b.w / 2 + (vertical ? 0.9 : 0.06)); pz = b.z + (Math.random() - 0.5) * b.d * 0.4; ry = s > 0 ? Math.PI / 2 : -Math.PI / 2; if (vertical) ry += Math.PI / 2; }
      else { const s = Math.sign(toC.y); pz = b.z + s * (b.d / 2 + (vertical ? 0.9 : 0.06)); px = b.x + (Math.random() - 0.5) * b.w * 0.4; ry = s > 0 ? 0 : Math.PI; if (vertical) ry += Math.PI / 2; }
      // vertical blade signs stick out perpendicular to the facade (HK style); rotate them to face the arena a bit
      if (vertical) ry = Math.atan2(-b.x, -b.z) + (Math.random() - 0.5) * 0.5;
      const y = 3 + Math.random() * Math.max(0, Math.min(b.h - sh - 3, 14)) + sh / 2;
      const ext = Math.max(sw, 0.2) / 2;   // conservative: rotation-independent footprint
      const scap = this.sightCap(px, pz, 2 * ext, 2 * ext);
      if (y + sh / 2 > scap - SIGHT.VMARGIN) { i++; continue; }
      sign.position.set(px, y, pz);
      if (Number.isFinite(scap)) this.addOccluder(new THREE.Vector3(px - ext, y - sh / 2, pz - ext), new THREE.Vector3(px + ext, y + sh / 2, pz + ext), (f) => { mat.opacity = mix01(f); });
      sign.userData.scenery = 'sign';
      sign.rotation.y = ry;
      this.group.add(sign); this.scenery.push(sign);
      if (Math.random() < 0.35) this.flicker.push({ mat, base: 2.2, seed: Math.random() * 100 });
      i++;
    }
  }

  buildBillboard() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, 'rgba(0,240,255,0.12)'); grd.addColorStop(1, 'rgba(255,43,214,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#00f0ff'; g.lineWidth = 4; g.strokeRect(10, 10, 1004, 364);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff2bd6'; g.shadowBlur = 30; g.fillStyle = '#ffffff';
    g.font = '900 170px "Noto Sans CJK TC","Noto Sans TC","PingFang HK","Microsoft JhengHei",sans-serif';
    g.fillText('賽博蛇', 512, 160);
    g.shadowColor = '#00f0ff'; g.fillStyle = '#7ff8ff';
    g.font = '900 56px Orbitron, sans-serif';
    g.fillText('C Y B E R   S N A K E', 512, 300);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, tMap: { value: tex }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float uTime; uniform sampler2D tMap; varying vec2 vUv; varying vec3 vW;
        uniform vec3 uFogColor; uniform float uFogDensity;
        void main(){
          vec2 uv = vUv;
          float gl = step(0.985, fract(sin(floor(uTime * 8.0)) * 4375.5));
          uv.x += gl * (fract(sin(floor(uv.y * 30.0) + uTime) * 999.0) - 0.5) * 0.06;
          vec4 t = texture2D(tMap, uv);
          float scan = 0.75 + 0.25 * sin(uv.y * 300.0 - uTime * 6.0);
          float flick = 0.9 + 0.1 * sin(uTime * 37.0) * sin(uTime * 13.0);
          vec3 col = t.rgb * t.a * scan * flick * 2.2;
          float dist = length(vW - cameraPosition);
          float f = exp(-uFogDensity*uFogDensity*dist*dist*0.5);
          gl_FragColor = vec4(col * f, 1.0);
        }`,
    });
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(30, 11.25), mat);
    bb.position.set(0, 21, -42);
    bb.userData.scenery = 'billboard';
    this.group.add(bb); this.scenery.push(bb);
    this.billboard = bb;
    // support frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.9, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 16, 0.6), frameMat);
      pole.position.set(sx * 12, 8, -42.6); pole.userData.scenery = 'billboard-pole'; this.group.add(pole); this.scenery.push(pole);
    }
  }

  // ---------------- Rain ----------------
  buildRain() {
    const N = 2200, AREA = 90, HGT = 45;
    const pos = new Float32Array(N * 2 * 3), off = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * AREA, y = Math.random() * HGT, z = (Math.random() - 0.5) * AREA;
      for (let k = 0; k < 2; k++) { off.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uC1: U.uC1, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uCenter: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */`
        attribute vec3 aOff; attribute float aEnd; uniform float uTime; uniform vec3 uCenter;
        varying float vA; varying float vD;
        void main(){
          vec3 p = aOff;
          p.y = mod(p.y - uTime * 26.0, 45.0);
          p.xz += uCenter.xz;
          p.y += aEnd * 0.9; p.x += aEnd * 0.18;
          vA = aEnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`uniform vec3 uC1; varying float vA; varying float vD;
        void main(){ float a = (1.0 - vA) * 0.22 * smoothstep(1.0, 4.0, vD) * exp(-vD * 0.02);
          gl_FragColor = vec4(mix(vec3(0.6, 0.75, 1.0), uC1, 0.3) * a, 1.0); }`,
    });
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    this.rain = rain;
    this.group.add(rain);
  }

  buildDust() {
    const N = 420;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(Math.random() - 0.5) * 50, 0.3 + Math.random() * 9, (Math.random() - 0.5) * 50], i * 3); seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uPR: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */`attribute float aSeed; uniform float uTime, uPR; varying float vS; varying float vT;
        void main(){ vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 1.2; p.z += cos(uTime * 0.25 + aSeed * 17.0) * 1.2;
          p.y += sin(uTime * 0.5 + aSeed * 9.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vS = aSeed;
          vT = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 50.0);
          gl_PointSize = (2.0 + aSeed * 4.0) * uPR * 10.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uC1, uC2; varying float vS; varying float vT;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * (0.25 + vT * 0.5);
          gl_FragColor = vec4(mix(uC1, uC2, step(0.5, vS)) * a, 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.dust = pts; this.dustMat = mat;
    this.group.add(pts);
  }

  buildTraffic() {
    const N = 70;
    const pos = new Float32Array(N * 3), dir = new Float32Array(N * 3), info = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const palette = [[1, 0.95, 0.85], [1, 0.15, 0.2], [0.2, 0.9, 1], [1, 0.3, 0.9]];
    for (let i = 0; i < N; i++) {
      const lane = Math.floor(Math.random() * 6);
      const alongX = lane < 3;
      const off = [-58, -78, 62, -64, 70, -90][lane];
      const y = 12 + (lane * 5.3) % 22 + Math.random() * 2;
      const s = Math.random() < 0.5 ? 1 : -1;
      if (alongX) { pos.set([0, y, off + (s > 0 ? 1.2 : -1.2)], i * 3); dir.set([s, 0, 0], i * 3); }
      else { pos.set([off + (s > 0 ? 1.2 : -1.2), y, 0], i * 3); dir.set([0, 0, s], i * 3); }
      info.set([Math.random() * 300, 10 + Math.random() * 14, Math.random()], i * 3);
      const c = s > 0 ? palette[0] : palette[1];
      const cc = Math.random() < 0.2 ? palette[2 + (i % 2)] : c;
      col.set(cc, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uPR: { value: Math.min(window.devicePixelRatio, 2) }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`attribute vec3 aDir, aInfo, aCol; uniform float uTime, uPR; varying vec3 vC; varying float vF;
        uniform float uFogDensity;
        void main(){ vec3 p = position + aDir * (mod(aInfo.x + uTime * aInfo.y, 300.0) - 150.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vC = aCol * 3.0;
          float d = -mv.z; vF = exp(-uFogDensity*uFogDensity*d*d*0.6);
          gl_PointSize = 260.0 * uPR / d; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`varying vec3 vC; varying float vF;
        void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q * vec2(1.0, 2.2)); float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * a * a * vF, 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.traffic = pts; this.trafficMat = mat;
    this.group.add(pts);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x6a5aff, 0x100018, 0.5);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0x9fb4ff, 0.7);
    this.dir.position.set(-10, 25, 12);
    this.scene.add(this.dir);
  }

  buildEnv() {
    // tiny neon "room" baked into a PMREM env map so metal surfaces reflect neon colours
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x05020c);
    const mk = (color, w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.y = ry; m.lookAt(0, 0, 0); env.add(m);
    };
    mk(new THREE.Color(0, 3, 4), 6, 1.5, -6, 2, -4);
    mk(new THREE.Color(4, 0.4, 3), 6, 1.5, 6, 2, -4);
    mk(new THREE.Color(2, 1.2, 4), 10, 2, 0, 7, 0);
    mk(new THREE.Color(0.5, 2.5, 3), 4, 4, 0, 1, 7);
    mk(new THREE.Color(3, 1.5, 0.4), 3, 1, -5, 0.5, 5);
    this.envTex = pmrem.fromScene(env, 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();
  }

  update(t, dt, camera, theme) {
    U.uTime.value = t;
    this.rain.material.uniforms.uCenter.value.set(camera.position.x * 0.5, 0, camera.position.z * 0.5 - 10);
    // rails & caps follow theme
    this.railMat.color.copy(U.uC1.value).multiplyScalar(2.2);
    this.railMat2.color.copy(U.uC2.value).multiplyScalar(1.8);
    const blink = (Math.sin(t * 3) > 0.2) ? 4 : 1.2;
    for (const m of this.capMats) m.color.copy(U.uC2.value).multiplyScalar(blink);
    for (const p of this.pylonLights) { p.rotation.y = t * 1.5; p.position.y = 3.1 + Math.sin(t * 2) * 0.1; }
    for (const f of this.flicker) {
      const n = Math.sin(t * 23 + f.seed) * Math.sin(t * 7.1 + f.seed * 2);
      const on = n > -0.85 ? 1 : 0.15;
      f.mat.color.setScalar(f.base * on);
    }
    this.scene.fog.color.copy(U.uFogColor.value);
    this.scene.fog.density = U.uFogDensity.value;
    this.hemi.color.copy(U.uC1.value).lerp(new THREE.Color(0x6a5aff), 0.6);
  }
}
