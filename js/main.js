// CYBER SNAKE 賽博蛇 - main bootstrap, render loop, camera, game wiring.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { World, U } from './world.js';
import { SnakeView, FoodView, ObstacleView, cellToWorld } from './entities.js';
import { Particles, Shockwaves, CyberShader } from './effects.js';
import { SnakeGame } from './game.js';
import { aiChoose } from './ai.js';
import { themeFor, targetFor, AUTHORED_LEVELS, MILESTONE_EVERY, milestoneBonus } from './levels.js';
import { i18n, t as tr } from '../vendor/cyber-kit/core/i18n.js';
import './strings.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { setupInput } from './input.js';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const START_LEVEL = Math.max(1, parseInt(params.get('level') || '1', 10) || 1);
const HI_KEY = 'cyberSnake.hi';
const DT_CAP = parseFloat(params.get('dtcap') || '0.1');

function fatal(msg) {
  const e = document.getElementById('err');
  e.textContent = '⚠ ' + msg; e.classList.remove('hidden');
  document.getElementById('loading').classList.add('done');
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  fatal(tr('noWebgl'));
  throw err;
}
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
const TM = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, reinhard: THREE.ReinhardToneMapping };
renderer.toneMapping = TM[params.get('tm')] ?? THREE.NeutralToneMapping;
renderer.toneMappingExposure = parseFloat(params.get('exp') || '1.0');
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 16, 20);

const world = new World(scene, renderer);
const snakeView = new SnakeView(scene);
const foodView = new FoodView(scene);
const obstacleView = new ObstacleView(scene);
const particles = new Particles(scene);
const waves = new Shockwaves(scene);
const audio = new AudioEngine();
const ui = new UI();

// ---------------- Post processing ----------------
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: pixelRatio < 1.5 ? 4 : 0 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const BLOOM = parseFloat(params.get('bloom') || '0.85');
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM, 0.45, 0.82);
composer.addPass(bloom);
const cyberPass = new ShaderPass(CyberShader);
composer.addPass(cyberPass);
composer.addPass(new OutputPass());

// ---------------- Theme handling ----------------
const themeTarget = {};
const themeKeys = { c1: 'uC1', c2: 'uC2', c3: 'uC3', grid: 'uGrid', fog: 'uFogColor', horizon: 'uHorizon', zenith: 'uZenith' };
const foodColor = new THREE.Color();
const foodTarget = new THREE.Color();
function setTheme(level, instant = false) {
  const th = themeFor(level);
  for (const [k, u] of Object.entries(themeKeys)) {
    themeTarget[u] = new THREE.Color(th[k]);
    if (instant) U[u].value.copy(themeTarget[u]);
  }
  foodTarget.set(th.food);
  if (instant) foodColor.copy(foodTarget);
  const hex = c => '#' + new THREE.Color(c).getHexString();
  ui.setThemeCss(hex(th.c1), hex(th.c2), hex(th.c3));
}
function updateTheme(dt) {
  const k = 1 - Math.exp(-dt * 2.2);
  for (const u of Object.values(themeKeys)) if (themeTarget[u]) U[u].value.lerp(themeTarget[u], k);
  foodColor.lerp(foodTarget, k);
  foodView.setColor(foodColor);
}

// ---------------- Game wiring ----------------
let state = 'attract'; // attract | playing | paused | dying | over
let autopilot = true;
let hi = parseInt(localStorage.getItem(HI_KEY) || '0', 10) || 0;
const BEST_LEVEL_KEY = 'cyberSnake.bestLevel';
let bestLevel = parseInt(localStorage.getItem(BEST_LEVEL_KEY) || '0', 10) || 0;
function saveBestLevel(l) { if (DEMO || l <= bestLevel) return; bestLevel = l; try { localStorage.setItem(BEST_LEVEL_KEY, String(l)); } catch {} }
function refreshStartRecords() { ui.el.startHi.textContent = hi.toLocaleString('en-US'); document.getElementById('start-level').textContent = bestLevel || '—'; }
let camMode = params.get('cam') === 'top' ? 'top' : 'follow';
const fx = { trauma: 0, aberr: 0, glitch: 0, flash: 0, fovKick: 0, slowmo: 0, danger: 0 };
let dyingT = 0;
const tmpV = new THREE.Vector3();

const game = new SnakeGame({
  beforeStep(g) {
    if (autopilot && !g.queue.length) {
      const m = aiChoose(g);
      if (m) g.queueDir(m);
    }
  },
  onTurn() { if (!autopilot) audio.turn(); },
  onSpawnFood(f) {
    if (!f) { foodView.hide(); return; }
    cellToWorld(f.x, f.z, tmpV);
    foodView.show(tmpV);
    world.floorUniforms.uFood.value.set(tmpV.x, tmpV.z);
    particles.burst(tmpV.clone().setY(0.6), foodColor, 24, { speed: 3, up: 2, life: 0.6, size: 0.7, grav: -2 });
    if (state === 'playing') audio.spawn();
  },
  onEat({ at, pts, mult, combo }) {
    const p = cellToWorld(at.x, at.z, new THREE.Vector3()).setY(0.6);
    particles.burst(p, foodColor, 90, { speed: 7, up: 4, life: 1.0, size: 1.1, color2: U.uC1.value, grav: -10 });
    particles.ring(p, U.uC2.value, 40, 7, 0.15);
    waves.spawn(p, foodColor, { r0: 0.3, r1: 2.6, h: 0.9, dur: 0.55, a: 2.2 });
    const fu = world.floorUniforms;
    fu.uPulse2.value.copy(fu.uPulse.value);
    fu.uPulse.value.set(p.x, p.z, U.uTime.value, 1.0);
    snakeView.flash();
    fx.aberr = Math.max(fx.aberr, 0.4);
    fx.trauma = Math.min(1, fx.trauma + 0.12);
    foodView.hide();
    world.floorUniforms.uFood.value.set(999, 999);
    if (state === 'playing') {
      audio.eat(combo);
      const s = toScreen(p);
      ui.popup(s.x, s.y - 20, '+' + pts, mult > 1 ? 'x' + mult.toFixed(1) : '');
    }
  },
  onLevelUp(level, old) {
    setTheme(level);
    audio.setLevel(level);
    obstacleView.transition(game.obstacles);
    const center = new THREE.Vector3(0, 0.2, 0);
    particles.ring(snakeView.headPos, U.uC1.value, 160, 16, 0.3);
    particles.ring(snakeView.headPos, U.uC3.value, 100, 10, 0.8);
    waves.spawn(snakeView.headPos, U.uC1.value, { r0: 0.5, r1: 16, h: 3.2, dur: 1.4, a: 2.5 });
    waves.spawn(snakeView.headPos, U.uC2.value, { r0: 0.2, r1: 9, h: 1.6, dur: 1.1, a: 2.0 });
    const fu = world.floorUniforms;
    fu.uPulse.value.set(snakeView.headPos.x, snakeView.headPos.z, U.uTime.value, 2.0);
    fu.uPulse2.value.set(0, 0, U.uTime.value + 0.35, 1.5);
    fx.aberr = 1.6; fx.glitch = 0.6; fx.fovKick = 1; fx.trauma = Math.min(1, fx.trauma + 0.3); fx.slowmo = 0.9;
    if (state === 'playing' || DEMO) {
      audio.levelUp();
      const th = themeFor(level);
      const zone = i18n.isZh() ? th.name : th.en;
      const ms = level % MILESTONE_EVERY === 0;
      if (ms) game.score += milestoneBonus(level);
      if (state === 'playing') saveBestLevel(level);
      ui.banner(tr('levelN', { n: level }), level > AUTHORED_LEVELS ? `${tr('levelUp')} · ${tr('endless')}` : tr('levelUp'), ms ? tr('milestone', { pts: milestoneBonus(level) }) : tr('levelNote', { zone, target: targetFor(level) }));
      ui.flash('rgba(255,255,255,0.35)', 500);
    }
  },
  onDie(reason) {
    state = state === 'attract' ? 'attract-dying' : 'dying';
    dyingT = 0;
    snakeView.deadCount = 0;
    fx.trauma = 1; fx.aberr = 1.6; fx.glitch = 0.7; fx.danger = 1;
    const p = snakeView.headPos.clone().setY(0.5);
    particles.burst(p, new THREE.Color(1, 0.6, 0.7), 70, { speed: 9, up: 5, life: 0.8, size: 0.8, color2: new THREE.Color(1, 0.15, 0.3), grav: -14 });
    world.floorUniforms.uPulse.value.set(p.x, p.z, U.uTime.value, 2.5);
    if (state === 'dying') {
      audio.death();
      ui.flash('rgba(255,30,80,0.55)', 600);
    }
  },
});

function toScreen(p) {
  tmpV.copy(p).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight };
}

function newGame(level, ai) {
  game.reset(level);
  autopilot = ai;
  snakeView.deadCount = -1;
  setTheme(level, false);
  audio.setLevel(level);
  obstacleView.transition(game.obstacles);
  fx.danger = 0;
}

function startGame() {
  if (!navigator.userActivation || navigator.userActivation.hasBeenActive) audio.init();
  audio.click();
  newGame(START_LEVEL, DEMO);
  state = 'playing';
  ui.show(null); ui.hud(true);
  ui.el.demo.classList.toggle('hidden', !DEMO);
  audio.stopMusic(0.1);
  setTimeout(() => { if (state === 'playing') audio.startMusic(); }, 120);
}

function pauseToggle() {
  if (state === 'playing') {
    state = 'paused'; ui.show('pause'); audio.stopMusic(0.3); audio.click();
  } else if (state === 'paused') {
    state = 'playing'; ui.show(null); audio.startMusic(); audio.click();
  }
}

function toMenu() {
  audio.click(); audio.stopMusic();
  newGame(1, true);
  state = 'attract';
  ui.show('start'); ui.hud(false);
  refreshStartRecords();
}

function finishDeath() {
  if (DEMO) { newGame(START_LEVEL, true); state = 'playing'; return; }
  const isRecord = game.score > hi && game.score > 0;
  if (isRecord) { hi = game.score; localStorage.setItem(HI_KEY, String(hi)); }
  saveBestLevel(game.level);
  state = 'over';
  ui.gameOver(game, hi, isRecord);
}

// ---------------- Input ----------------
setupInput({
  anyGesture() {
    if (state === 'playing' || state === 'paused') {
      const was = audio.ready; audio.init();
      if (!was && audio.ready && state === 'playing') audio.startMusic();
    }
  },
  dir(d) {
    if (state === 'playing' && !autopilot) game.queueDir(d);
    else if (state === 'attract' && (d === 'up')) { /* ignore */ }
  },
  primary() {
    if (state === 'attract') startGame();
    else if (state === 'paused') pauseToggle();
    else if (state === 'over') startGame();
  },
  pause() { if (state === 'playing' || state === 'paused') pauseToggle(); },
  mute() { audio.init(); ui.setMuted(audio.toggleMute()); },
  camera() { camMode = camMode === 'follow' ? 'top' : 'follow'; audio.click(); },
  fps() { ui.el.fps.classList.toggle('hidden'); },
});
const on = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); });
on('btn-start', startGame);
on('btn-restart', startGame);
on('btn-resume', pauseToggle);
on('btn-quit', toMenu);
on('btn-menu', toMenu);
on('btn-pause', () => { if (state === 'playing' || state === 'paused') pauseToggle(); });
on('btn-cam', () => { camMode = camMode === 'follow' ? 'top' : 'follow'; });
on('btn-mute', () => { audio.init(); ui.setMuted(audio.toggleMute()); });
i18n.bindToggle(document.getElementById('btn-lang')); i18n.bindToggle(document.getElementById('btn-lang2'));
i18n.onChange(() => { if (state === 'over') ui.el.overReason.textContent = game.deathReason ? tr('death.' + game.deathReason) : ''; });
ui.setMuted(audio.muted);
if (params.get('fps') === '1') ui.el.fps.classList.remove('hidden');

window.addEventListener('blur', () => { if (state === 'playing' && !DEMO) pauseToggle(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing' && !DEMO) pauseToggle(); });

// ---------------- Resize ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  world.resize(w, h, pixelRatio);
  cyberPass.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  particles.mat.uniforms.uH.value = h;
  particles.mat.uniforms.uPR.value = pixelRatio;
}
window.addEventListener('resize', resize);
resize();

// ---------------- Camera ----------------
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camPosS = new THREE.Vector3(0, 18, 24);
function updateCamera(t, dt) {
  const aspect = camera.aspect;
  const fit = aspect < 1.25 ? Math.min(2.3, 1.25 / aspect) : 1;
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  if (state === 'attract' || state === 'attract-dying' || state === 'over') {
    const a = t * 0.07 + 0.6;
    const R = 22 * Math.min(fit, 1.5);
    desired.set(Math.sin(a) * R, 9.5 + Math.sin(t * 0.21) * 1.5, Math.cos(a) * R);
    look.set(0, 1.0, 0);
    if (aspect > 1.2 && state !== 'over') { // shift composition so the title has room on the left
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      look.addScaledVector(right, -5.5);
    }
  } else if (camMode === 'top') {
    desired.set(0, 25 * fit, 15 * fit);
    look.set(0, 0, 1.5);
  } else {
    const head = snakeView.headPos;
    camTarget.set(head.x * 0.55, 0, head.z * 0.5).addScaledVector(snakeView.dirVec, 1.4);
    const sway = THREE.MathUtils.clamp(-head.x * 0.02, -0.22, 0.22);
    const dist = 12 * fit, height = 11.5 * fit;
    desired.set(camTarget.x + Math.sin(sway) * dist, height, camTarget.z + Math.cos(sway) * dist + 1.5);
    look.copy(camTarget).setY(0);
  }
  const k = 1 - Math.exp(-dt * (state === 'attract' ? 1.5 : 3.2));
  camPosS.lerp(desired, k);
  camLook.lerp(look, k);
  camera.position.copy(camPosS);
  // screen shake (trauma^2)
  const tr = fx.trauma * fx.trauma;
  if (tr > 0.001) {
    camera.position.x += (Math.sin(t * 61.3) + Math.sin(t * 97.1)) * 0.35 * tr;
    camera.position.y += (Math.sin(t * 73.7) + Math.sin(t * 51.9)) * 0.3 * tr;
    camera.position.z += Math.sin(t * 89.3) * 0.3 * tr;
  }
  camera.lookAt(camLook);
  if (tr > 0.001) camera.rotation.z += Math.sin(t * 43.1) * 0.03 * tr;
  const baseFov = aspect < 1 ? 58 : 50;
  camera.fov = baseFov + fx.fovKick * 8;
  camera.updateProjectionMatrix();
}

// ---------------- Main loop ----------------
const interp = [];
for (let i = 0; i < 1500; i++) interp.push(new THREE.Vector3());
function snakePoints() {
  const a = game.alpha;
  const n = game.snake.length;
  const pts = interp.slice(0, n);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const cur = game.snake[i];
    const prv = game.prev[i] || game.prev[game.prev.length - 1] || cur;
    cellToWorld(prv.x, prv.z, tmpA); cellToWorld(cur.x, cur.z, tmpB);
    pts[i].copy(tmpA).lerp(tmpB, a);
  }
  return pts;
}

let last = performance.now();
let time = 0;
let fpsFrames = 0, fpsTime = 0, fps = 0;
const fpsHist = [];
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  let rdt = Math.min(DT_CAP, rawDt);
  last = now;
  fpsFrames++; fpsTime += rawDt;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0;
    ui.el.fps.textContent = fps.toFixed(0) + ' FPS · ' + pixelRatio.toFixed(2) + 'x';
    autoQuality(fps);
  }
  // slow motion on level-up / death
  let ts = 1;
  if (fx.slowmo > 0) { fx.slowmo -= rdt; ts = 0.35 + 0.65 * (1 - Math.max(0, fx.slowmo) / 0.9); }
  if (state === 'dying' || state === 'attract-dying') ts = 0.6;
  const dt = rdt * ts;
  time += rdt;

  if (state === 'playing' || state === 'attract') game.update(dt);

  if (state === 'dying' || state === 'attract-dying') {
    dyingT += rdt;
    const n = game.snake.length;
    const per = Math.min(0.05, 1.0 / n);
    const target = dyingT < 0.35 ? 0 : 1 + Math.floor((dyingT - 0.35) / per);
    while (snakeView.deadCount < Math.min(target, n)) {
      const seg = game.snake[snakeView.deadCount];
      const p = cellToWorld(seg.x, seg.z, new THREE.Vector3()).setY(0.4);
      const c = U.uC1.value.clone().lerp(U.uC2.value, snakeView.deadCount / n);
      const first = snakeView.deadCount === 0;
      particles.burst(p, first ? new THREE.Color(1, 0.2, 0.35) : c, first ? 120 : 16, { speed: first ? 10 : 5, up: first ? 6 : 4, life: first ? 1.3 : 0.9, size: first ? 1.3 : 0.9, grav: -12, color2: first ? U.uC1.value : null });
      if (first) {
        fx.trauma = 1; fx.aberr = Math.max(fx.aberr, 1.2);
        waves.spawn(p, new THREE.Color(1, 0.12, 0.3), { r0: 0.3, r1: 8, h: 2.2, dur: 1.0, a: 3 });
        if (state === 'dying') ui.flash('rgba(255,30,80,0.4)', 400);
      }
      snakeView.deadCount++;
    }
    const endT = 0.35 + n * per + 1.0;
    if (dyingT > endT) {
      if (state === 'dying') finishDeath();
      else { newGame(1, true); state = 'attract'; }
    }
  }

  updateTheme(rdt);
  const pts = snakePoints();
  snakeView.update(time, rdt, pts, game.dir, !game.dead);
  foodView.update(time, rdt);
  obstacleView.update(rdt);
  particles.update(dt);
  waves.update(dt);
  ui.tickBanner(rdt);
  world.update(time, rdt, camera);
  const fu = world.floorUniforms;
  fu.uHead.value.set(snakeView.headPos.x, snakeView.headPos.z);
  fu.uHeadColor.value.copy(U.uC1.value);
  fu.uFoodColor.value.copy(foodColor);
  fu.uDanger.value = fx.danger;

  // fx decay
  fx.trauma = Math.max(0, fx.trauma - rdt * 1.4);
  fx.aberr = Math.max(0, fx.aberr - rdt * 2.5);
  fx.glitch = Math.max(0, fx.glitch - rdt * 2.2);
  fx.fovKick = Math.max(0, fx.fovKick - rdt * 1.6);
  fx.danger = Math.max(0, fx.danger - rdt * 0.6);
  cyberPass.uniforms.uTime.value = time;
  cyberPass.uniforms.uAberration.value = 0.0018 + fx.aberr * 0.004;
  cyberPass.uniforms.uGlitch.value = fx.glitch;
  bloom.strength = BLOOM + fx.aberr * 0.08;

  updateCamera(time, rdt);
  if (state === 'playing' || state === 'paused' || state === 'dying') ui.update(game, Math.max(hi, game.score));
  composer.render(rdt);
}

// auto quality: drop pixel ratio if we can't hold ~45fps
let lowCount = 0;
function autoQuality(f) {
  if (params.get('noauto') === '1') return;
  if (state !== 'playing' && state !== 'attract') return;
  fpsHist.push(f); if (fpsHist.length > 8) fpsHist.shift();
  if (fpsHist.length < 8) return;
  const avg = fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length;
  if (avg < 42 && pixelRatio > 1) { lowCount++; if (lowCount >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); resize(); fpsHist.length = 0; lowCount = 0; } }
  else lowCount = 0;
}

// ---------------- Boot ----------------
setTheme(START_LEVEL, true);
newGame(DEMO ? START_LEVEL : 1, true);
obstacleView.setList(game.obstacles, 1);
obstacleView.anim = null;
refreshStartRecords();
if (DEMO) {
  state = 'playing';
  ui.show(null); ui.hud(true);
  ui.el.demo.classList.remove('hidden');
} else if (params.get('autostart') === '1') {
  startGame();
}
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => ui.el.loading.classList.add('done'), 250);

// test / debug hook
window.__snake = {
  get state() { return state; }, get score() { return game.score; }, get level() { return game.level; },
  get length() { return game.snake.length; }, get fps() { return fps; }, get pixelRatio() { return pixelRatio; },
  game, start: startGame, pause: pauseToggle,
  setAutopilot(b) { autopilot = b; },
  levelTo(n) { game.level = n - 1; game.levelUp(); },
  renderer,
};
