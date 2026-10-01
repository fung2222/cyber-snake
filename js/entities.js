// Snake, food and obstacle visuals.
import * as THREE from 'three';
import { U, HALF } from './world.js';

export const cellToWorld = (x, z, out = new THREE.Vector3()) => out.set(x - HALF + 0.5, 0, z - HALF + 0.5);

// MeshStandardMaterial with neon emissive driven by (instance) colour + fresnel rim
function glowMaterial({ instanced = false, base = 0x202030, metalness = 0.75, roughness = 0.22, core = 0.5, rim = 1.8, env = 1.2 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: base, metalness, roughness, envMapIntensity: env });
  const uniforms = { uGlowColor: { value: new THREE.Color(1, 1, 1) }, uCore: { value: core }, uRim: { value: rim }, uBoost: { value: 0 } };
  mat.userData.u = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = 'uniform vec3 uGlowColor; uniform float uCore, uRim, uBoost;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      {
        vec3 gc = ${instanced ? 'vColor' : 'uGlowColor'};
        float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        fr = pow(fr, 2.2);
        totalEmissiveRadiance += gc * (uCore + uBoost + fr * uRim);
      }`);
    if (instanced) {
      // keep diffuse dark-ish so the glow reads as neon rather than flat paint
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, 0.25);');
    }
  };
  mat.customProgramCacheKey = () => (instanced ? 'glowI' : 'glow');
  return mat;
}

// ------------------------------------------------------------------ Snake
export class SnakeView {
  constructor(scene) {
    this.scene = scene;
    this.MAX = 1400;
    const geo = new THREE.SphereGeometry(1, 24, 16);
    this.bodyMat = glowMaterial({ instanced: true, base: 0x0c0c18, metalness: 0.55, roughness: 0.3, env: 0.5, core: 0.7, rim: 1.2 });
    this.body = new THREE.InstancedMesh(geo, this.bodyMat, this.MAX);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.setColorAt(0, new THREE.Color());
    this.body.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.body.frustumCulled = false;
    this.body.count = 0;
    scene.add(this.body);

    // spine ring "joints" for a segmented cyber look
    const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 28);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.rings = new THREE.InstancedMesh(ringGeo, this.ringMat, 500);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, new THREE.Color());
    this.rings.frustumCulled = false; this.rings.count = 0;
    scene.add(this.rings);

    this.buildHead();
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpS = new THREE.Vector3(); this.tmpP = new THREE.Vector3();
    this.tmpC = new THREE.Color(); this.yAxis = new THREE.Vector3(0, 1, 0); this.c1 = new THREE.Color(); this.c2 = new THREE.Color();
    this.points = [];
    this.yaw = 0; this.flashT = 99; this.deadCount = -1; this.visible = true;
    this.headPos = new THREE.Vector3();
    this.dirVec = new THREE.Vector3(0, 0, -1);
  }

  buildHead() {
    const head = this.head = new THREE.Group();
    const S = new THREE.Vector3(0.52, 0.43, 0.64);
    this.headMat = glowMaterial({ base: 0x10101e, metalness: 0.85, roughness: 0.2, env: 0.8, core: 0.3, rim: 1.4 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), this.headMat);
    shell.scale.copy(S); head.add(shell);
    // dark glass visor band
    const visorGeo = new THREE.SphereGeometry(1.04, 40, 12, Math.PI / 2 - Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.30, Math.PI * 0.2);
    const visor = new THREE.Mesh(visorGeo, new THREE.MeshStandardMaterial({ color: 0x020205, metalness: 1, roughness: 0.05, envMapIntensity: 2.2, side: THREE.DoubleSide }));
    visor.scale.copy(S); head.add(visor);
    // glowing scanner line
    const lineGeo = new THREE.SphereGeometry(1.055, 40, 2, Math.PI / 2 - Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.395, Math.PI * 0.022);
    this.visorLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const vline = new THREE.Mesh(lineGeo, this.visorLineMat); vline.scale.copy(S); head.add(vline);
    // eyes
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) });
    const eyeGeo = new THREE.SphereGeometry(0.09, 16, 12);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, this.eyeMat);
      e.position.set(s * 0.27, 0.13, 0.5); e.scale.set(1, 0.7, 0.6);
      head.add(e); this.eyes.push(e);
    }
    // moving scanner dot (KITT style)
    this.scanDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 2, 6) }));
    head.add(this.scanDot);
    // crest fins
    this.finMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14 - i * 0.03, 0.18), this.finMat);
      fin.position.set(0, 0.42 - i * 0.03, -0.05 - i * 0.2); head.add(fin);
    }
    // mandible accents
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.34), this.finMat);
      m.position.set(s * 0.34, -0.12, 0.25); m.rotation.y = -s * 0.35; head.add(m);
    }
    this.light = new THREE.PointLight(0x00f0ff, 6, 8, 1.6);
    this.light.position.set(0, 0.8, 0.4);
    head.add(this.light);
    this.scene.add(head);
  }

  // positions: array of THREE.Vector3 interpolated segment centres (head first)
  update(t, dt, pts, dir, alive) {
    const n = pts.length;
    this.c1.copy(U.uC1.value); this.c2.copy(U.uC2.value);
    // head
    const hp = pts[0];
    this.headPos.copy(hp);
    const targetYaw = Math.atan2(dir.x, dir.z);
    let dy = targetYaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 16);
    this.dirVec.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const headHidden = this.deadCount > 0;
    this.head.visible = !headHidden && this.visible;
    this.head.position.set(hp.x, 0.5 + Math.sin(t * 5) * 0.025, hp.z);
    this.head.rotation.set(0, this.yaw, Math.sin(t * 2.3) * 0.04);
    const dyingFlash = this.deadCount === 0 ? (Math.sin(t * 60) > 0 ? 1 : 0.3) : 0;
    this.headMat.userData.u.uGlowColor.value.copy(this.c1);
    this.visorLineMat.color.copy(this.c1).multiplyScalar(4);
    if (this.deadCount === 0) { this.headMat.userData.u.uGlowColor.value.setRGB(3 * dyingFlash, 0.1, 0.3); this.visorLineMat.color.setRGB(8 * dyingFlash, 0.2, 0.6); }
    this.finMat.color.copy(this.c2).multiplyScalar(4);
    this.light.color.copy(this.c1);
    const sx = Math.sin(t * 4.2) * 0.3;
    this.scanDot.position.set(sx, 0.08, Math.sqrt(Math.max(0, 1 - (sx / 0.5) ** 2)) * 0.55 + 0.05);
    const blinkEyes = (t % 4) < 0.08 ? 0.1 : 1;
    this.eyes.forEach(e => e.scale.y = 0.7 * blinkEyes);

    // body samples (3 per gap) with taper
    const SUB = 4;
    let k = 0, r = 0;
    this.flashT += dt;
    const total = Math.max(1, (n - 1) * SUB);
    for (let i = 0; i < n - 1 && k < this.MAX; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let s = 0; s < SUB; s++) {
        const idx = i * SUB + s;
        if (idx === 0) continue; // head occupies this spot
        const u = idx / total;
        const f = s / SUB;
        const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        let rad = 0.4 * (1 - 0.5 * Math.pow(u, 1.3));
        if (this.deadCount >= 0 && i + 1 < this.deadCount) rad = 0;
        if (!this.visible) rad = 0;
        const wave = Math.sin(t * 6 - idx * 0.35) * 0.025;
        this.tmpP.set(x, rad + 0.06 + wave, z);
        this.tmpS.setScalar(rad);
        this.tmpM.compose(this.tmpP, this.tmpQ.identity(), this.tmpS);
        this.body.setMatrixAt(k, this.tmpM);
        // colour gradient + eat flash travelling down the body
        this.tmpC.copy(this.c1).lerp(this.c2, Math.min(1, u * 1.1));
        const wavePos = this.flashT * 40;
        const fl = Math.max(0, 1 - Math.abs(idx - wavePos) / 4) * (this.flashT < 2 ? 1 : 0);
        this.tmpC.multiplyScalar(1 + fl * 2.5);
        this.body.setColorAt(k, this.tmpC);
        k++;
        // joint rings at actual segment centres
        if (s === 0 && rad > 0 && r < 500 && i % 2 === 1) {
          const dx = b.x - a.x, dz = b.z - a.z;
          const yaw = Math.atan2(dx, dz);
          this.tmpQ.setFromAxisAngle(this.yAxis, yaw);
          this.tmpS.setScalar(rad * 1.0);
          this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
          this.rings.setMatrixAt(r, this.tmpM);
          this.tmpC.multiplyScalar(2.2);
          this.rings.setColorAt(r, this.tmpC);
          r++;
        }
      }
    }
    // tail tip
    if (n >= 1 && k < this.MAX && this.visible && !(this.deadCount >= 0 && n - 1 < this.deadCount)) {
      const tp = pts[n - 1];
      this.tmpP.set(tp.x, 0.27, tp.z); this.tmpS.setScalar(0.16);
      this.tmpM.compose(this.tmpP, this.tmpQ.identity(), this.tmpS);
      this.body.setMatrixAt(k, this.tmpM); this.body.setColorAt(k, this.tmpC.copy(this.c2).multiplyScalar(1.5)); k++;
    }
    this.body.count = k;
    this.body.instanceMatrix.needsUpdate = true;
    this.body.instanceColor.needsUpdate = true;
    this.rings.count = r;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.bodyMat.userData.u.uBoost.value = alive ? 0 : 0.6;
  }

  flash() { this.flashT = 0; }
}

// ------------------------------------------------------------------ Food
export class FoodView {
  constructor(scene) {
    const g = this.group = new THREE.Group();
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), this.coreMat);
    g.add(this.core);
    this.shellMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true });
    this.shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.4, 0)), this.shellMat);
    g.add(this.shell);
    this.cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)), this.shellMat);
    g.add(this.cube);
    // translucent holo cube faces
    this.holoMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.holo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.holoMat);
    this.cube.add(this.holo);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.014, 8, 64), this.ringMat);
    g.add(this.ring);
    this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.01, 8, 64), this.ringMat);
    g.add(this.ring2);
    // ground marker
    this.markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 4, 1), this.markMat);
    this.mark.rotation.x = -Math.PI / 2; this.mark.rotation.z = Math.PI / 4;
    this.mark.position.y = 0.015;
    this.root = new THREE.Group();
    this.root.add(g); this.root.add(this.mark);
    // light beam
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color() }, uAmp: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform float uTime, uAmp; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.y, 3.0) * 0.16;
          a *= 0.7 + 0.3 * step(0.5, fract(vUv.y * 14.0 - uTime * 2.0));
          a *= 0.6 + 0.4 * abs(sin(vUv.x * 6.2831 * 3.0));
          gl_FragColor = vec4(uColor * a * uAmp, 1.0); }`,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 9, 24, 1, true), this.beamMat);
    this.beam.position.y = 4.5;
    this.root.add(this.beam);
    // orbit particles
    const N = 48; const pos = new Float32Array(N * 3); const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = Math.random();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.orbitMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color() }, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: /* glsl */`attribute float aSeed; uniform float uTime, uPR; varying float vA;
        void main(){ float t = uTime * (0.6 + aSeed) + aSeed * 40.0; float r = 0.5 + aSeed * 0.4;
          float y = fract(aSeed * 7.0 + uTime * 0.25 * (0.5 + aSeed)) * 2.0;
          vec3 p = vec3(cos(t) * r, y, sin(t) * r); vA = 1.0 - y / 2.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (3.0 + aSeed * 4.0) * uPR * 11.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor * 3.0 * smoothstep(0.5, 0.0, d) * vA, 1.0); }`,
    });
    this.orbit = new THREE.Points(pg, this.orbitMat); this.orbit.frustumCulled = false;
    this.root.add(this.orbit);
    this.light = new THREE.PointLight(0xffff00, 5, 6, 1.5);
    this.light.position.y = 0.9;
    this.root.add(this.light);
    scene.add(this.root);
    this.color = new THREE.Color(0xfff35c);
    this.spawnT = 0; this.active = false;
    this.root.visible = false;
  }

  setColor(c) { this.color.copy(c); }

  show(pos) { this.root.position.copy(pos); this.spawnT = 0; this.active = true; this.root.visible = true; }
  hide() { this.active = false; this.root.visible = false; }

  update(t, dt) {
    if (!this.active) return;
    this.spawnT += dt;
    const s = this.spawnT < 0.5 ? easeOutBack(this.spawnT / 0.5) : 1;
    const pulse = 1 + Math.sin(t * 5) * 0.08;
    this.group.scale.setScalar(s * pulse);
    this.group.position.y = 0.6 + Math.sin(t * 2.2) * 0.1;
    this.shell.rotation.set(t * 0.7, t * 1.1, 0);
    this.cube.rotation.set(-t * 0.5, -t * 0.8, t * 0.3);
    this.ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.4, t * 1.5, 0);
    this.ring2.rotation.set(Math.PI / 2 - 0.6, -t * 2.1, 0.3);
    const c = this.color;
    this.coreMat.color.copy(c).multiplyScalar(6 + Math.sin(t * 8) * 1.5);
    this.shellMat.color.copy(c).multiplyScalar(3);
    this.ringMat.color.copy(c).multiplyScalar(3.5);
    this.holoMat.color.copy(c);
    this.markMat.color.copy(c).multiplyScalar(2.5);
    this.mark.scale.setScalar(1 + (t * 1.2 % 1) * 0.6);
    this.markMat.opacity = 1 - (t * 1.2 % 1);
    this.beamMat.uniforms.uColor.value.copy(c);
    this.beamMat.uniforms.uAmp.value = this.spawnT < 0.6 ? 1 + (1 - this.spawnT / 0.6) * 3 : 1;
    this.orbitMat.uniforms.uColor.value.copy(c);
    this.light.color.copy(c);
  }
}

function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

// ------------------------------------------------------------------ Obstacles
export class ObstacleView {
  constructor(scene) {
    this.MAX = 220;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    this.rise = new Float32Array(this.MAX);
    this.hue = new Float32Array(this.MAX);
    geo.setAttribute('aRise', new THREE.InstancedBufferAttribute(this.rise, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(this.hue, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`
        attribute float aRise; attribute float aHue;
        varying vec3 vL; varying vec3 vS; varying vec3 vN; varying vec3 vW; varying float vRise; varying float vHue;
        void main(){
          vec3 p = position; p.y *= max(aRise, 0.001);
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz) * max(aRise, 0.001), length(instanceMatrix[2].xyz));
          vL = position; vN = normal; vW = w.xyz; vRise = aRise; vHue = aHue;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uC1, uC2; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vL; varying vec3 vS; varying vec3 vN; varying vec3 vW; varying float vRise; varying float vHue;
        void main(){
          vec3 d = (vec3(0.5) - abs(vL - vec3(0.0, 0.5, 0.0))) * vS;
          float mn = min(d.x, min(d.y, d.z)); float mx = max(d.x, max(d.y, d.z));
          float e = d.x + d.y + d.z - mn - mx; // distance to nearest edge
          vec3 neon = mix(uC2, uC1, vHue);
          vec3 col = vec3(0.012, 0.01, 0.03);
          // vertical gradient + fake fresnel
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
          col += neon * fr * 0.15;
          col += neon * smoothstep(0.06, 0.0, e) * 5.0;
          col += neon * exp(-e * 9.0) * 0.5;
          // circuitry / scanlines on faces
          float sl = step(0.82, fract(vW.y * 6.0 - uTime * 0.7)) * 0.08;
          col += neon * sl * (1.0 - step(0.5, vN.y));
          if (vN.y > 0.5) {
            vec2 q = abs(fract(vW.xz * 4.0) - 0.5);
            col += neon * step(0.44, max(q.x, q.y)) * 0.12;
            col += neon * 0.06;
          }
          // ground contact glow
          col += neon * exp(-vW.y * 6.0) * 0.6;
          // materialise flicker while rising
          float flick = vRise < 1.0 ? (0.5 + 0.5 * step(0.5, fract(uTime * 18.0 + vHue * 3.0))) : 1.0;
          col *= flick;
          col += neon * (1.0 - vRise) * 0.6;
          float dist = length(vW - cameraPosition);
          float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    this.anim = null;
    this.m4 = new THREE.Matrix4();
    this.v = new THREE.Vector3();
  }

  setList(list, riseFrom = 1) {
    this.list = list;
    const n = Math.min(list.length, this.MAX);
    for (let i = 0; i < n; i++) {
      const o = list[i];
      cellToWorld(o.x, o.z, this.v);
      this.m4.makeScale(0.9, o.h, 0.9); this.m4.setPosition(this.v.x, 0, this.v.z);
      this.mesh.setMatrixAt(i, this.m4);
      this.rise[i] = riseFrom;
      this.hue[i] = ((o.x * 7 + o.z * 13) % 5) / 4;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aRise.needsUpdate = true;
    this.mesh.geometry.attributes.aHue.needsUpdate = true;
  }

  // sink old, then raise new
  transition(newList, onSwap) {
    this.anim = { t: 0, newList, phase: this.list.length ? 'sink' : 'rise', onSwap };
    if (!this.list.length) { this.setList(newList, 0); onSwap && onSwap(); }
  }

  update(dt) {
    const a = this.anim; if (!a) return;
    a.t += dt;
    const n = this.mesh.count;
    if (a.phase === 'sink') {
      const k = Math.min(1, a.t / 0.45);
      for (let i = 0; i < n; i++) this.rise[i] = 1 - k * k;
      if (k >= 1) { this.setList(a.newList, 0); a.phase = 'rise'; a.t = 0; a.onSwap && a.onSwap(); }
    } else {
      const N = this.mesh.count;
      for (let i = 0; i < N; i++) {
        const delay = (i / Math.max(1, N)) * 0.4;
        const k = Math.min(1, Math.max(0, (a.t - delay) / 0.5));
        this.rise[i] = k < 1 ? easeOutBack(k) : 1;
      }
      if (a.t > 1.0) { for (let i = 0; i < N; i++) this.rise[i] = 1; this.anim = null; }
    }
    this.mesh.geometry.attributes.aRise.needsUpdate = true;
  }
}
