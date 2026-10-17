import { t } from './i18n.js';
// Stage = WebGL renderer + scene + camera + post chain (RenderPass -> UnrealBloom -> CyberShader -> Output)
// + resize handling + frame loop with dt cap + FPS meter + automatic pixel-ratio downgrade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CyberShader } from './post.js';
import { flags as defaultFlags } from './flags.js';

const TM = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, reinhard: THREE.ReinhardToneMapping };
const QUALITY_PR = { low: 1, med: 1.5, high: 2, auto: 2 };

/**
 * Glow presets (v0.3.0). The game passes its "high" look (bloom / bloomRadius / bloomThreshold, the pre-v0.3 values);
 * 'low' (the default) scales it down so gameplay objects stay crisp and the neon glow is only an accent.
 * strength / radius are multipliers, threshold is added (capped), aberration / grain are the CyberShader base values.
 */
export const GLOW_LEVELS = {
  low: { strength: 0.45, radius: 0.55, threshold: 0.12, thresholdMax: 0.98, aberration: 0.0006, grain: 0.01 },
  high: { strength: 1, radius: 1, threshold: 0, thresholdMax: 2, aberration: 0.0018, grain: 0.018 },
};
const GLOW_KEY = 'cyber.glow';
/** current glow preference: ?glow=low|high flag -> localStorage cyber.glow (shared by all CYBER games) -> 'low' */
export function getGlowPref(flags = defaultFlags) {
  const f = flags && flags.get ? flags.get('glow') : null;
  if (f === 'low' || f === 'high') return f;
  try { const v = localStorage.getItem(GLOW_KEY); if (v === 'low' || v === 'high') return v; } catch (e) { /* storage blocked */ }
  return 'low';
}
export function setGlowPref(level) { try { localStorage.setItem(GLOW_KEY, level === 'high' ? 'high' : 'low'); } catch (e) { /* ignore */ } }

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} [o.bloom=0.85]  bloom strength   (URL ?bloom= overrides)
 * @param {number} [o.bloomRadius=0.45]
 * @param {number} [o.bloomThreshold=0.82]
 * @param {number} [o.fov=50]
 * @param {'low'|'high'} [o.glow]  default: getGlowPref() (?glow= flag, shared localStorage cyber.glow, else 'low')
 * @param {object} [o.glowLevels]  per-game overrides merged into GLOW_LEVELS, e.g. { low: { strength: 0.3 } }
 * @param {string} [o.toneMapping='neutral']
 * @param {number} [o.exposure=1]
 * @param {(msg:string)=>void} [o.onFatal]  called if WebGL is unavailable
 */
export function createStage(o = {}) {
  const flags = o.flags || defaultFlags;
  const canvas = o.canvas || document.querySelector('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (err) {
    (o.onFatal || defaultFatal)(t('kit.webgl'));
    throw err;
  }
  const maxPR = Math.min(o.maxPixelRatio ?? 2, QUALITY_PR[flags.quality] ?? 2);
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = TM[flags.toneMapping || o.toneMapping || 'neutral'] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = flags.exposure ?? o.exposure ?? 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov ?? 50, window.innerWidth / window.innerHeight, o.near ?? 0.1, o.far ?? 900);

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: pixelRatio < 1.5 ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const look = { strength: o.bloom ?? 0.85, radius: o.bloomRadius ?? 0.45, threshold: o.bloomThreshold ?? 0.82 };
  const levels = { low: { ...GLOW_LEVELS.low, ...(o.glowLevels && o.glowLevels.low) }, high: { ...GLOW_LEVELS.high, ...(o.glowLevels && o.glowLevels.high) } };
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), look.strength, look.radius, look.threshold);
  composer.addPass(bloomPass);
  const cyberPass = new ShaderPass(CyberShader);
  composer.addPass(cyberPass);
  const glowCbs = [];
  composer.addPass(new OutputPass());

  const resizeHandlers = [];
  const stage = {
    renderer, scene, camera, composer, bloomPass, cyberPass, flags,
    /** base bloom strength for the current glow level (FxState.applyPost adds hit-flash on top) */
    bloomBase: look.strength, aberrBase: 0.0018, glow: 'low', glowLevels: levels,
    /** 'low' | 'high' - persist=true stores the choice for every CYBER game (localStorage cyber.glow) */
    setGlow(level, { persist = false } = {}) {
      level = level === 'high' ? 'high' : 'low';
      const L = levels[level];
      stage.glow = level;
      stage.bloomBase = flags.bloom ?? look.strength * L.strength;
      bloomPass.strength = stage.bloomBase;
      bloomPass.radius = look.radius * L.radius;
      bloomPass.threshold = Math.min(L.thresholdMax, look.threshold + L.threshold);
      stage.aberrBase = L.aberration;
      cyberPass.uniforms.uAberration.value = L.aberration; cyberPass.uniforms.uGrain.value = L.grain;
      if (persist) setGlowPref(level);
      for (const fn of glowCbs) fn(level);
      return stage;
    },
    toggleGlow(opts = { persist: true }) { return stage.setGlow(stage.glow === 'low' ? 'high' : 'low', opts).glow; },
    /** fn(level) after every setGlow (e.g. to dim game materials) */
    onGlow(fn) { glowCbs.push(fn); return stage; },
    get pixelRatio() { return pixelRatio; },
    width: window.innerWidth, height: window.innerHeight,
    fps: 0,
    /** register fn(w, h, pixelRatio) - called immediately and on every resize */
    onResize(fn) { resizeHandlers.push(fn); fn(stage.width, stage.height, pixelRatio); return stage; },
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      stage.width = w; stage.height = h;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h);
      composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
      cyberPass.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
      for (const fn of resizeHandlers) fn(w, h, pixelRatio);
    },
    setPixelRatio(pr) { pixelRatio = Math.max(0.75, Math.min(pr, maxPR)); stage.resize(); },
    /** project a world point to CSS pixels */
    toScreen(v, out = { x: 0, y: 0 }) {
      const p = _v.copy(v).project(camera);
      out.x = (p.x * 0.5 + 0.5) * stage.width; out.y = (-p.y * 0.5 + 0.5) * stage.height; return out;
    },
    render(dt) { composer.render(dt); },
    /**
     * Start the frame loop. fn(dt, time, rawDt). Auto-quality only runs while isActive() returns true.
     * Returns a stop() function.
     */
    loop(fn, { isActive = () => true, fpsEl = null } = {}) {
      let last = performance.now(), time = 0, frames = 0, acc = 0, hist = [], low = 0, running = true;
      const tick = (now) => {
        if (!running) return;
        requestAnimationFrame(tick);
        const raw = Math.max(0, (now - last) / 1000); last = now;
        const dt = Math.min(flags.dtcap ?? 0.1, raw);
        time += dt; frames++; acc += raw;
        if (acc >= 0.5) {
          stage.fps = frames / acc; frames = 0; acc = 0;
          if (fpsEl) fpsEl.textContent = stage.fps.toFixed(0) + ' FPS · ' + pixelRatio.toFixed(2) + 'x';
          if (!flags.noauto && flags.quality === 'auto' && isActive()) {
            hist.push(stage.fps); if (hist.length > 8) hist.shift();
            if (hist.length === 8) {
              const avg = hist.reduce((a, b) => a + b, 0) / 8;
              if (avg < 42 && pixelRatio > 1) { if (++low >= 2) { stage.setPixelRatio(pixelRatio - 0.25); hist = []; low = 0; } } else low = 0;
            }
          }
        }
        fn(dt, time, raw);
      };
      requestAnimationFrame((t) => { last = t; tick(t); });
      return () => { running = false; };
    },
  };
  const _v = new THREE.Vector3();
  window.addEventListener('resize', () => stage.resize());
  stage.resize();
  stage.setGlow(o.glow || getGlowPref(flags));
  return stage;
}

function defaultFatal(msg) {
  let e = document.getElementById('err');
  if (!e) { e = document.createElement('div'); e.id = 'err'; e.className = 'ck-err'; document.body.appendChild(e); }
  e.textContent = '⚠ ' + msg; e.classList.remove('hidden');
  const l = document.getElementById('loading'); if (l) l.classList.add('done');
}
