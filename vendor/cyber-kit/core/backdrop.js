// NeonCity: the shared cyberpunk environment of every CYBER game.
// Sky dome with smog + stars, wet reflective street floor with neon grid & pulse rings, instanced skyline with
// lit windows and neon strips, HK-style vertical blade signs, holographic billboard, rain, dust, flying traffic,
// lights and a baked neon PMREM environment (so metal surfaces reflect neon).
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { U } from './theme.js';

export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
`;
export const FOG_GLSL = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDensity;
vec3 applyFog(vec3 col, float dist){ float f = 1.0 - exp(-uFogDensity*uFogDensity*dist*dist); return mix(col, uFogColor, clamp(f,0.0,1.0)); }
`;

const ZH_FONT = '"Noto Sans CJK TC","Noto Sans TC","PingFang HK","Microsoft JhengHei",sans-serif';

/**
 * @param {object} stage   from createStage()
 * @param {object} [o]
 * @param {'reflect'|'plain'|'none'} [o.floor='reflect']
 * @param {number} [o.floorHalf=0]     half-size of a glowing square play-area drawn on the floor (0 = none)
 * @param {boolean} [o.arena=false]    build rails / energy walls / pylons around floorHalf
 * @param {number} [o.innerRadius=27]  no buildings inside this radius
 * @param {number} [o.buildings=300]
 * @param {{zh:string,en:string,pos?:number[],width?:number}|null} [o.billboard]
 * @param {boolean} [o.signs=true]  [o.rain=true]  [o.dust=true]  [o.traffic=true]
 * @param {string[]} [o.signTexts]  vertical sign words
 * @param {'low'|'med'|'high'|'auto'} [o.quality]
 */
export class NeonCity {
  constructor(stage, o = {}) {
    this.stage = stage;
    this.o = o = Object.assign({ floor: 'reflect', floorHalf: 0, arena: false, innerRadius: 27, buildings: 300, billboard: null, signs: true, rain: true, dust: true, traffic: true, quality: stage.flags?.quality || 'auto', dustArea: 50, dustHeight: 9 }, o);
    const low = o.quality === 'low';
    if (low && o.floor === 'reflect') o.floor = 'plain';
    this.scene = stage.scene; this.renderer = stage.renderer;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.scene.fog = new THREE.FogExp2(U.uFogColor.value, U.uFogDensity.value);
    this.flicker = [];
    this.pulseIdx = 0;
    this.buildSky();
    if (o.floor !== 'none') this.buildFloor(o.floor === 'reflect');
    if (o.arena && o.floorHalf > 0) this.buildArena();
    this.buildCity(low ? Math.floor(o.buildings * 0.6) : o.buildings);
    if (o.billboard) this.buildBillboard(o.billboard);
    if (o.rain) this.buildRain(low ? 900 : 2200);
    if (o.dust) this.buildDust(low ? 200 : 420);
    if (o.traffic) this.buildTraffic();
    this.buildLights();
    this.buildEnv();
    stage.onResize((w, h, pr) => this.resize(w, h, pr));
  }

  // ---------------- Sky ----------------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: U.uTime, uHorizon: U.uHorizon, uZenith: U.uZenith, uFogColor: U.uFogColor, uC2: U.uC2 },
      vertexShader: /* glsl */`varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uHorizon, uZenith, uFogColor, uC2; uniform float uTime; varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          float y = vDir.y;
          vec3 col = mix(uFogColor, uZenith, smoothstep(0.0, 0.55, y));
          col += uHorizon * exp(-abs(y - 0.02) * 9.0) * 0.9;
          col += uC2 * exp(-abs(y) * 30.0) * 0.12;
          vec2 cp = vDir.xz / max(y + 0.25, 0.05) * 1.6 + vec2(uTime * 0.01, 0.0);
          float c = vnoise(cp) * 0.6 + vnoise(cp * 2.3) * 0.4;
          col += uHorizon * smoothstep(0.45, 0.9, c) * 0.25 * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(0.3, 0.8, y));
          vec2 sp = floor(vDir.xz / (y + 0.4) * 140.0);
          float s = step(0.996, hash12(sp)) * smoothstep(0.25, 0.7, y);
          col += vec3(0.8, 0.85, 1.0) * s * (0.5 + 0.5 * sin(uTime * 2.0 + hash12(sp + 3.0) * 30.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.group.add(sky);
  }

  // ---------------- Floor ----------------
  buildFloor(reflect) {
    const H = this.o.floorHalf;
    const uniforms = {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      uPulse: { value: new THREE.Vector4(0, 0, -100, 0) }, uPulse2: { value: new THREE.Vector4(0, 0, -100, 0) },
      uLightA: { value: new THREE.Vector3(999, 999, 0) }, uLightB: { value: new THREE.Vector3(999, 999, 0) },
      uLightAColor: { value: new THREE.Color() }, uLightBColor: { value: new THREE.Color() },
      uDanger: { value: 0 }, uReflect: { value: reflect ? 1 : 0 },
    };
    const shader = {
      name: 'NeonFloor', uniforms,
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWorld;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          vUvR = textureMatrix * vec4(position, 1.0);
          vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 color; uniform sampler2D tDiffuse;
        uniform float uTime, uDanger, uReflect; uniform vec3 uC1, uC2, uGrid;
        uniform vec4 uPulse, uPulse2; uniform vec3 uLightA, uLightB; uniform vec3 uLightAColor, uLightBColor;
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
          float H = ${H.toFixed(2)};
          float m = max(abs(p.x), abs(p.y));
          float inside = H > 0.0 ? 1.0 - step(H, m) : 0.0;
          float dist = length(vWorld - cameraPosition);
          float pn = vnoise(p * 0.18) * 0.65 + vnoise(p * 0.7) * 0.35;
          float puddle = smoothstep(0.42, 0.62, pn);
          vec3 refl = vec3(0.0);
          if (uReflect > 0.5) {
            vec2 rip = (vec2(vnoise(p * 1.7 + uTime * 0.9), vnoise(p * 1.7 - uTime * 0.8)) - 0.5) * 0.004 * (1.0 - inside * 0.8);
            vec4 uvr = vUvR; uvr.xy += rip * uvr.w;
            float b = (0.0035 + 0.004 * (1.0 - puddle)) * uvr.w * (1.0 - inside * 0.5);
            refl += textureProj(tDiffuse, uvr).rgb * 0.2;
            refl += textureProj(tDiffuse, uvr + vec4(0.0,  b, 0.0, 0.0)).rgb * 0.15;
            refl += textureProj(tDiffuse, uvr + vec4(0.0, -b, 0.0, 0.0)).rgb * 0.15;
            refl += textureProj(tDiffuse, uvr + vec4(b * 0.35,  2.2 * b, 0.0, 0.0)).rgb * 0.125;
            refl += textureProj(tDiffuse, uvr + vec4(-b * 0.35, -2.2 * b, 0.0, 0.0)).rgb * 0.125;
            refl += textureProj(tDiffuse, uvr + vec4(0.0,  3.6 * b, 0.0, 0.0)).rgb * 0.1;
            refl += textureProj(tDiffuse, uvr + vec4(0.0, -3.6 * b, 0.0, 0.0)).rgb * 0.1;
          }
          vec3 base = vec3(0.006, 0.006, 0.013) * (0.7 + vnoise(p * 2.0) * 0.6);
          vec2 cell = floor(p);
          base += inside * vec3(0.006, 0.007, 0.016) * (0.6 + mod(cell.x + cell.y, 2.0) * 0.6);
          float reflK = mix(0.18 + 0.6 * puddle, 0.36, inside);
          vec3 col = base + refl * reflK;
          float gl = gridLine(p, 1.2);
          float gl5 = gridLine(p / 5.0, 1.0);
          col += uGrid * (gl * 0.11 + gl5 * 0.12) * inside;
          vec2 cf = abs(fract(p) - 0.5);
          col += uGrid * smoothstep(0.05, 0.0, length(cf)) * 0.1 * inside;
          float og = gridLine(p / 4.0, 1.0) * (1.0 - inside) * exp(-max(m - H, 0.0) * 0.05);
          col += uGrid * og * 0.05;
          if (H > 0.0) {
            float e = abs(m - H);
            col += uC1 * (smoothstep(0.08, 0.0, e) * 2.0 + exp(-e * 3.0) * 0.12);
            col += uC2 * exp(-abs(m - H - 0.6) * 8.0) * 0.12 * (1.0 - inside);
          }
          float ad = length(p - uLightA.xy); col += uLightAColor * exp(-ad * ad * 0.25 / max(uLightA.z, 0.05)) * (0.05 + gl * 0.5) * step(0.001, uLightA.z);
          float bd = length(p - uLightB.xy); col += uLightBColor * exp(-bd * bd * 0.4 / max(uLightB.z, 0.05)) * (0.05 + gl * 0.6) * step(0.001, uLightB.z);
          float pl = pulse(uPulse, p) + pulse(uPulse2, p);
          col += mix(uC2, uC1, 0.35) * pl * (0.08 + gl * 1.2 + gl5 * 0.6 + og * 2.0);
          float sy = mod(uTime * 5.0, 50.0) - 25.0;
          col += uC1 * exp(-pow((p.y - sy) * 1.5, 2.0)) * inside * (0.015 + gl * 0.25);
          col += vec3(1.0, 0.05, 0.15) * uDanger * (0.03 + gl * 0.35) * max(inside, 0.3);
          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    };
    const geo = new THREE.PlaneGeometry(500, 500);
    let floor;
    if (reflect) {
      const w = window.innerWidth, h = window.innerHeight, pr = this.stage.pixelRatio;
      this.reflScale = 0.5;
      floor = new Reflector(geo, { clipBias: 0.003, textureWidth: Math.floor(w * pr * 0.5), textureHeight: Math.floor(h * pr * 0.5), color: 0xffffff, multisample: 0, shader });
    } else {
      // plain: same shader, no reflection texture
      uniforms.tDiffuse.value = new THREE.Texture(); uniforms.textureMatrix.value = new THREE.Matrix4();
      floor = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader }));
    }
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = this.o.floorY || 0;
    const u = floor.material.uniforms;
    for (const k of ['uTime', 'uC1', 'uC2', 'uGrid', 'uFogColor', 'uFogDensity']) u[k] = U[k];
    this.floor = floor; this.floorUniforms = u;
    this.group.add(floor);
  }

  /** Expanding neon ring on the floor at world (x, z). strength ~1..2.5 */
  pulse(x, z, strength = 1, delay = 0) {
    if (!this.floorUniforms) return;
    const fu = this.floorUniforms;
    fu.uPulse2.value.copy(fu.uPulse.value);
    fu.uPulse.value.set(x, z, U.uTime.value + delay, strength);
  }
  /** soft light pool on the floor; which = 'A' | 'B'; radius ~1; set radius 0 to hide */
  setLight(which, x, z, color, radius = 1) {
    if (!this.floorUniforms) return;
    this.floorUniforms['uLight' + which].value.set(x, z, radius);
    if (color) this.floorUniforms['uLight' + which + 'Color'].value.copy(color);
  }
  set danger(v) { if (this.floorUniforms) this.floorUniforms.uDanger.value = v; }

  resize(w, h, pr) {
    if (this.floor && this.floor.getRenderTarget) this.floor.getRenderTarget().setSize(Math.floor(w * pr * this.reflScale), Math.floor(h * pr * this.reflScale));
    if (this.dustMat) this.dustMat.uniforms.uPR.value = pr;
    if (this.trafficMat) this.trafficMat.uniforms.uPR.value = pr;
  }

  // ---------------- Arena rails + pylons (optional) ----------------
  buildArena() {
    const HALF = this.o.floorHalf, g = new THREE.Group();
    this.railMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.railMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const L = HALF * 2 + 0.3;
    const mk = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    for (const s of [-1, 1]) {
      mk(L, 0.06, 0.06, 0, 0.08, s * (HALF + 0.15), this.railMat); mk(0.06, 0.06, L, s * (HALF + 0.15), 0.08, 0, this.railMat);
      mk(L, 0.035, 0.035, 0, 0.62, s * (HALF + 0.15), this.railMat2); mk(0.035, 0.035, L, s * (HALF + 0.15), 0.62, 0, this.railMat2);
    }
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x0b0b16, metalness: 0.9, roughness: 0.3 });
    this.capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pylonLights = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), pylonMat);
      p.position.set(sx * (HALF + 0.6), 1.3, sz * (HALF + 0.6)); g.add(p);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), this.capMat);
      cap.position.set(p.position.x, 3.1, p.position.z); g.add(cap); this.pylonLights.push(cap);
    }
    this.group.add(g); this.arena = g;
  }

  // ---------------- City ----------------
  buildCity(N) {
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uC3: U.uC3, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`
        attribute float aSeed;
        varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed;
        void main(){
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normal; vL = position;
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vSeed = aSeed;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uC1, uC2, uC3;
        varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed;
        ${NOISE_GLSL}
        ${FOG_GLSL}
        void main(){
          vec3 col = vec3(0.008, 0.008, 0.018);
          float dist = length(vW - cameraPosition);
          vec3 neon = vSeed < 0.33 ? uC1 : (vSeed < 0.66 ? uC2 : uC3);
          if (vN.y > 0.5) {
            vec2 d = (0.5 - abs(vL.xz)) * vS.xz; float e = min(d.x, d.y);
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
            col += win * (1.0 - lit) * vec3(0.02, 0.025, 0.05);
            vec2 dd = (0.5 - abs(vL.xz)) * vS.xz; float corner = max(dd.x, dd.y);
            col += neon * smoothstep(0.14, 0.02, corner) * 2.5 * step(0.55, fract(vSeed * 7.31));
            float bandY = vS.y * (0.35 + 0.5 * fract(vSeed * 3.7));
            col += neon * smoothstep(0.12, 0.0, abs(vW.y - bandY)) * 2.0 * step(0.6, fract(vSeed * 5.13));
            col += neon * smoothstep(0.1, 0.0, abs(vW.y - vS.y + 0.1)) * 1.5 * step(0.4, fract(vSeed * 2.9));
            col += mix(uC2, vec3(1.0, 0.5, 0.2), fract(vSeed * 4.0)) * smoothstep(2.5, 0.0, vW.y) * 0.35;
          }
          col = applyFog(col, dist);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const seeds = new Float32Array(N);
    const m4 = new THREE.Matrix4();
    const placed = []; let count = 0, tries = 0;
    const R0 = this.o.innerRadius;
    this.nearBuildings = [];
    while (count < N && tries < 6000) {
      tries++;
      const ang = Math.random() * Math.PI * 2;
      const r = R0 + 4 + Math.pow(Math.random(), 1.4) * 100;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const w = 4 + Math.random() * 7, d = 4 + Math.random() * 7;
      let ok = true;
      for (const b of placed) { if (Math.abs(b.x - x) < (b.w + w) / 2 + 1 && Math.abs(b.z - z) < (b.d + d) / 2 + 1) { ok = false; break; } }
      if (!ok) continue;
      if (Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2) < R0) continue;
      const near = r < R0 + 28;
      const h = near ? 10 + Math.random() * 30 : 18 + Math.random() * 60;
      m4.makeScale(w, h, d); m4.setPosition(x, 0, z);
      mesh.setMatrixAt(count, m4);
      seeds[count] = Math.random();
      const b = { x, z, w, d, h }; placed.push(b); if (near) this.nearBuildings.push(b);
      count++;
    }
    mesh.count = count;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    this.group.add(mesh); this.city = mesh;
    if (this.o.signs) this.buildSigns();
  }

  makeSignTexture(text, color, vertical, sub = '') {
    const c = document.createElement('canvas');
    const W = vertical ? 128 : 512, H = vertical ? 512 : 160;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,2,18,0.92)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 14;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#ffffff'; g.shadowBlur = 22; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      const chars = [...text]; const fs = Math.min(96, (H - 50) / chars.length);
      g.font = `900 ${fs}px ${ZH_FONT}`;
      chars.forEach((ch, i) => { g.fillStyle = color; g.fillText(ch, W / 2, 28 + fs / 2 + i * fs); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(ch, W / 2, 28 + fs / 2 + i * fs); });
    } else {
      g.font = `900 ${sub ? 70 : 84}px ${ZH_FONT}`;
      g.fillStyle = color; g.fillText(text, W / 2, sub ? H / 2 - 18 : H / 2);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(text, W / 2, sub ? H / 2 - 18 : H / 2);
      if (sub) { g.font = `700 30px Orbitron, sans-serif`; g.fillStyle = color; g.fillText(sub, W / 2, H / 2 + 42); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  buildSigns() {
    const texts = this.o.signTexts || ['大押', '茶餐廳', '義體診所', '電腦城', '金舖', '冰室', '網吧', '夜市', '數碼港', '大排檔', '旅館', '藥房', '霓虹', '龍城'];
    const horiz = this.o.signTextsH || [['賽博', 'CYBER'], ['24小時', 'OPEN 24H'], ['電子', 'ELECTRONICS'], ['九龍', 'KOWLOON'], ['數據', 'DATA BANK'], ['酒家', 'RESTAURANT']];
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
      const toC = new THREE.Vector2(-b.x, -b.z);
      let px, pz, ry;
      if (Math.abs(toC.x) > Math.abs(toC.y)) { const s = Math.sign(toC.x); px = b.x + s * (b.w / 2 + (vertical ? 0.9 : 0.06)); pz = b.z + (Math.random() - 0.5) * b.d * 0.4; ry = s > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { const s = Math.sign(toC.y); pz = b.z + s * (b.d / 2 + (vertical ? 0.9 : 0.06)); px = b.x + (Math.random() - 0.5) * b.w * 0.4; ry = s > 0 ? 0 : Math.PI; }
      if (vertical) ry = Math.atan2(-b.x, -b.z) + (Math.random() - 0.5) * 0.5;
      const y = 3 + Math.random() * Math.max(0, Math.min(b.h - sh - 3, 14)) + sh / 2;
      sign.position.set(px, y, pz); sign.rotation.y = ry;
      this.group.add(sign);
      if (Math.random() < 0.35) this.flicker.push({ mat, base: 2.2, seed: Math.random() * 100 });
      i++;
    }
  }

  buildBillboard({ zh, en, pos = [0, 21, -42], width = 30 }) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, 'rgba(0,240,255,0.12)'); grd.addColorStop(1, 'rgba(255,43,214,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#00f0ff'; g.lineWidth = 4; g.strokeRect(10, 10, 1004, 364);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff2bd6'; g.shadowBlur = 30; g.fillStyle = '#ffffff';
    g.font = `900 ${zh.length > 3 ? 150 : 170}px ${ZH_FONT}`; g.fillText(zh, 512, 160);
    g.shadowColor = '#00f0ff'; g.fillStyle = '#7ff8ff';
    g.font = '900 56px Orbitron, sans-serif'; g.fillText(en, 512, 300);
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
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.375), mat);
    bb.position.set(pos[0], pos[1], pos[2]);
    bb.lookAt(0, pos[1], 0);
    this.group.add(bb); this.billboard = bb;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.9, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, pos[1] - 5, 0.6), frameMat);
      const off = new THREE.Vector3(sx * width * 0.4, 0, 0).applyQuaternion(bb.quaternion);
      pole.position.set(pos[0] + off.x, (pos[1] - 5) / 2, pos[2] + off.z); this.group.add(pole);
    }
  }

  // ---------------- Rain / dust / traffic ----------------
  buildRain(N) {
    const AREA = 90, HGT = 45;
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
      uniforms: { uTime: U.uTime, uC1: U.uC1, uCenter: { value: new THREE.Vector3() }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aOff; attribute float aEnd; uniform float uTime; uniform vec3 uCenter;
        varying float vA; varying float vD;
        void main(){
          vec3 p = aOff; p.y = mod(p.y - uTime * 26.0, 45.0); p.xz += uCenter.xz;
          p.y += aEnd * 0.9; p.x += aEnd * 0.18; vA = aEnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`uniform vec3 uC1; uniform float uIntensity; varying float vA; varying float vD;
        void main(){ float a = (1.0 - vA) * 0.22 * uIntensity * smoothstep(1.0, 4.0, vD) * exp(-vD * 0.02);
          gl_FragColor = vec4(mix(vec3(0.6, 0.75, 1.0), uC1, 0.3) * a, 1.0); }`,
    });
    const rain = new THREE.LineSegments(geo, mat); rain.frustumCulled = false;
    this.rain = rain; this.group.add(rain);
  }

  buildDust(N) {
    const A = this.o.dustArea, Hh = this.o.dustHeight;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(Math.random() - 0.5) * A, 0.3 + Math.random() * Hh, (Math.random() - 0.5) * A], i * 3); seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uPR: { value: this.stage.pixelRatio } },
      vertexShader: /* glsl */`attribute float aSeed; uniform float uTime, uPR; varying float vS; varying float vT;
        void main(){ vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 1.2; p.z += cos(uTime * 0.25 + aSeed * 17.0) * 1.2; p.y += sin(uTime * 0.5 + aSeed * 9.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vS = aSeed; vT = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 50.0);
          gl_PointSize = (2.0 + aSeed * 4.0) * uPR * 10.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uC1, uC2; varying float vS; varying float vT;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * (0.25 + vT * 0.5);
          gl_FragColor = vec4(mix(uC1, uC2, step(0.5, vS)) * a, 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    this.dust = pts; this.dustMat = mat; this.group.add(pts);
  }

  buildTraffic() {
    const N = 70;
    const pos = new Float32Array(N * 3), dir = new Float32Array(N * 3), info = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const palette = [[1, 0.95, 0.85], [1, 0.15, 0.2], [0.2, 0.9, 1], [1, 0.3, 0.9]];
    const R = this.o.innerRadius;
    for (let i = 0; i < N; i++) {
      const lane = Math.floor(Math.random() * 6);
      const alongX = lane < 3;
      const off = [-(R + 31), -(R + 51), R + 35, -(R + 37), R + 43, -(R + 63)][lane];
      const y = 12 + (lane * 5.3) % 22 + Math.random() * 2;
      const s = Math.random() < 0.5 ? 1 : -1;
      if (alongX) { pos.set([0, y, off + (s > 0 ? 1.2 : -1.2)], i * 3); dir.set([s, 0, 0], i * 3); }
      else { pos.set([off + (s > 0 ? 1.2 : -1.2), y, 0], i * 3); dir.set([0, 0, s], i * 3); }
      info.set([Math.random() * 300, 10 + Math.random() * 14, Math.random()], i * 3);
      const c = s > 0 ? palette[0] : palette[1];
      col.set(Math.random() < 0.2 ? palette[2 + (i % 2)] : c, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uPR: { value: this.stage.pixelRatio }, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`attribute vec3 aDir, aInfo, aCol; uniform float uTime, uPR; varying vec3 vC; varying float vF; uniform float uFogDensity;
        void main(){ vec3 p = position + aDir * (mod(aInfo.x + uTime * aInfo.y, 300.0) - 150.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vC = aCol * 3.0;
          float d = -mv.z; vF = exp(-uFogDensity*uFogDensity*d*d*0.6);
          gl_PointSize = 260.0 * uPR / d; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`varying vec3 vC; varying float vF;
        void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q * vec2(1.0, 2.2)); float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vC * a * a * vF, 1.0); }`,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    this.traffic = pts; this.trafficMat = mat; this.group.add(pts);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x6a5aff, 0x100018, 0.5);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(0x9fb4ff, 0.7);
    this.dirLight.position.set(-10, 25, 12);
    this.scene.add(this.dirLight);
  }

  buildEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x05020c);
    const mk = (color, w, h, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
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

  /** call every frame with total time (s), dt and the camera */
  update(t, dt, camera) {
    U.uTime.value = t;
    if (this.rain) this.rain.material.uniforms.uCenter.value.set(camera.position.x * 0.5, 0, camera.position.z * 0.5 - 10);
    if (this.railMat) {
      this.railMat.color.copy(U.uC1.value).multiplyScalar(2.2);
      this.railMat2.color.copy(U.uC2.value).multiplyScalar(1.8);
      this.capMat.color.copy(U.uC2.value).multiplyScalar(Math.sin(t * 3) > 0.2 ? 4 : 1.2);
      for (const p of this.pylonLights) { p.rotation.y = t * 1.5; p.position.y = 3.1 + Math.sin(t * 2) * 0.1; }
    }
    for (const f of this.flicker) {
      const n = Math.sin(t * 23 + f.seed) * Math.sin(t * 7.1 + f.seed * 2);
      f.mat.color.setScalar(f.base * (n > -0.85 ? 1 : 0.15));
    }
    this.scene.fog.color.copy(U.uFogColor.value);
    this.scene.fog.density = U.uFogDensity.value;
    this.hemi.color.copy(U.uC1.value).lerp(_violet, 0.6);
  }
}
const _violet = new THREE.Color(0x6a5aff);
