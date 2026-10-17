// GPU-light particle pool (CPU simulated, additive point sprites), 3D shockwave rings and a
// screen-feel state (trauma shake / aberration / glitch / fov kick) shared by every game.
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 2500, { floorY = 0.03 } = {}) {
    this.floorY = floorY;
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) }, uH: { value: window.innerHeight } },
      vertexShader: /* glsl */`attribute vec3 aCol; attribute float aSize; attribute float aAlpha; uniform float uPR, uH;
        varying vec3 vC; varying float vA;
        void main(){ vC = aCol; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAlpha > 0.0 ? aSize * 0.12 * uH * uPR / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a * 0.7 + smoothstep(0.18, 0.0, d) * 0.6;
          gl_FragColor = vec4(vC * a * vA, 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(p, v, color, { life = 1, size = 1, grav = -6, drag = 1.5, bright = 3 } = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r * bright; this.col[i * 3 + 1] = color.g * bright; this.col[i * 3 + 2] = color.b * bright;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = 1;
  }

  burst(center, color, count = 60, { speed = 6, up = 3, life = 0.9, size = 1, grav = -9, spread = 1, color2 = null, bright = 3 } = {}) {
    const v = new THREE.Vector3(); const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const sp = speed * (0.3 + Math.random() * 0.7);
      v.set(Math.sin(ph) * Math.cos(th) * sp * spread, Math.abs(Math.cos(ph)) * sp * 0.6 + up * Math.random(), Math.sin(ph) * Math.sin(th) * sp * spread);
      c.copy(color); if (color2 && Math.random() < 0.5) c.copy(color2);
      if (Math.random() < 0.15) c.setRGB(1, 1, 1);
      this.emit(center, v, c, { life: life * (0.5 + Math.random() * 0.8), size: size * (0.5 + Math.random()), grav, bright });
    }
  }

  ring(center, color, count = 120, speed = 14, y = 0.2) {
    const v = new THREE.Vector3(); const p = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2;
      v.set(Math.cos(a) * speed, 0.5 + Math.random(), Math.sin(a) * speed);
      p.set(center.x, y, center.z);
      this.emit(p, v, color, { life: 1.2, size: 1.4, grav: 0, drag: 1.2, bright: 3.5 });
    }
  }

  update(dt) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d + this.grav[i] * dt; V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < this.floorY) { P[i * 3 + 1] = this.floorY; V[i * 3 + 1] *= -0.45; V[i * 3] *= 0.8; V[i * 3 + 2] *= 0.8; }
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = k * k * (3 - 2 * k);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true;
  }

  /** call on resize so point sizes stay correct */
  resize(h, pixelRatio) { this.mat.uniforms.uH.value = h; this.mat.uniforms.uPR.value = pixelRatio; }
}

// Expanding 3D energy rings
export class Shockwaves {
  constructor(scene, n = 8) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true); geo.translate(0, 0.5, 0);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 } },
        vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uA; varying vec2 vUv;
          void main(){ float a = pow(1.0 - vUv.y, 3.0) * uA; a += smoothstep(0.06, 0.0, vUv.y) * uA * 1.5;
            a *= 0.75 + 0.25 * step(0.5, fract(vUv.x * 48.0));
            gl_FragColor = vec4(uColor * a, 1.0); }`,
      });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.items.push({ m, t: 0, dur: 1, r0: 0, r1: 1, h: 1, a: 1, active: false });
    }
    this.i = 0;
  }
  spawn(pos, color, { r0 = 0.3, r1 = 6, h = 1.2, dur = 0.8, a = 2.5 } = {}) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    Object.assign(it, { t: 0, dur, r0, r1, h, a, active: true });
    it.m.position.set(pos.x, (pos.y ?? 0) + 0.02, pos.z);
    it.m.material.uniforms.uColor.value.copy(color);
    it.m.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const e = 1 - Math.pow(1 - k, 3);
      const r = it.r0 + (it.r1 - it.r0) * e;
      it.m.scale.set(r, it.h * (1 - k * 0.6), r);
      it.m.material.uniforms.uA.value = it.a * (1 - k) * (1 - k);
      if (k >= 1) { it.active = false; it.m.visible = false; }
    }
  }
}

/**
 * Screen-feel state. Bump values on events, call update(dt) each frame, then apply to camera / post.
 *   fx.kick({ trauma: .3, aberr: .5 })
 */
export class FxState {
  constructor() { this.trauma = 0; this.aberr = 0; this.glitch = 0; this.fovKick = 0; this.slowmo = 0; this.danger = 0; }
  kick(o) { for (const k in o) this[k] = k === 'trauma' ? Math.min(1, this[k] + o[k]) : Math.max(this[k], o[k]); }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.aberr = Math.max(0, this.aberr - dt * 2.5);
    this.glitch = Math.max(0, this.glitch - dt * 2.2);
    this.fovKick = Math.max(0, this.fovKick - dt * 1.6);
    this.danger = Math.max(0, this.danger - dt * 0.6);
    if (this.slowmo > 0) this.slowmo -= dt;
  }
  /** time scale for slow-motion moments (1 = normal) */
  get timeScale() { return this.slowmo > 0 ? 0.35 + 0.65 * (1 - Math.max(0, this.slowmo) / 0.9) : 1; }
  /** add trauma^2 shake to a camera AFTER you positioned it and called lookAt */
  shake(camera, t, amount = 1) {
    const tr = this.trauma * this.trauma * amount;
    if (tr < 0.001) return;
    camera.position.x += (Math.sin(t * 61.3) + Math.sin(t * 97.1)) * 0.35 * tr;
    camera.position.y += (Math.sin(t * 73.7) + Math.sin(t * 51.9)) * 0.3 * tr;
    camera.position.z += Math.sin(t * 89.3) * 0.3 * tr;
    camera.rotation.z += Math.sin(t * 43.1) * 0.03 * tr;
  }
  /** push aberration / glitch into the CyberShader pass (stage.cyberPass) */
  applyPost(stage, t) {
    const u = stage.cyberPass.uniforms;
    u.uTime.value = t;
    u.uAberration.value = (stage.aberrBase ?? 0.0018) + this.aberr * (stage.glow === 'low' ? 0.0025 : 0.004);
    u.uGlitch.value = this.glitch;
    stage.bloomPass.strength = stage.bloomBase + this.aberr * 0.08;
  }
}
