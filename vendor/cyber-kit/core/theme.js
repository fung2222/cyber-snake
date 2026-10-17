import { getLang } from './i18n.js';
// Shared neon colour uniforms + Hong Kong district themes + smooth theme transitions.
// Every kit shader references the SAME uniform objects in U, so changing a theme recolours the whole scene.
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x12051f) },
  uFogDensity: { value: 0.012 },   // v0.3.0: was 0.017 (too hazy over the play field)
  uC1: { value: new THREE.Color(0x00f0ff) },     // primary neon
  uC2: { value: new THREE.Color(0xff2bd6) },     // secondary neon
  uC3: { value: new THREE.Color(0xfff35c) },     // accent
  uGrid: { value: new THREE.Color(0x00c8ff) },
  uHorizon: { value: new THREE.Color(0x5a0a5e) },
  uZenith: { value: new THREE.Color(0x02010a) },
};

// name = HK district flavour shown in banners.  accent = item / pickup colour.
export const THEMES = [
  { name: '霓虹九龍', en: 'NEON KOWLOON', c1: 0x00f0ff, c2: 0xff2bd6, c3: 0xfff35c, fog: 0x12051f, horizon: 0x5a0a5e, zenith: 0x02010a, accent: 0xfff35c, grid: 0x00c8ff },
  { name: '毒霧旺角', en: 'TOXIC MONG KOK', c1: 0x7dff3a, c2: 0x9b30ff, c3: 0x3affd0, fog: 0x0b1410, horizon: 0x2a1a5c, zenith: 0x010604, accent: 0xff3ad0, grid: 0x5aff6a },
  { name: '銀翼油麻地', en: 'SILVERWING YAU MA TEI', c1: 0xff9a1f, c2: 0x00e5c8, c3: 0xff4f3a, fog: 0x1a0b06, horizon: 0x6a2410, zenith: 0x050202, accent: 0x3affff, grid: 0xff8a2a },
  { name: '電光深水埗', en: 'VOLT SHAM SHUI PO', c1: 0xff3aa8, c2: 0x3a7bff, c3: 0xb8ff3a, fog: 0x0a0620, horizon: 0x24106a, zenith: 0x01010c, accent: 0x7affff, grid: 0xff4ab8 },
  { name: '金龍尖沙咀', en: 'GOLDEN DRAGON TSIM SHA TSUI', c1: 0xffd23a, c2: 0xff2a3a, c3: 0xff8af0, fog: 0x1a0a04, horizon: 0x5a1010, zenith: 0x060101, accent: 0x3affd0, grid: 0xffb43a },
  { name: '冰藍中環', en: 'ICE BLUE CENTRAL', c1: 0xbff4ff, c2: 0x8a3aff, c3: 0x3affff, fog: 0x060a1a, horizon: 0x1a2a6a, zenith: 0x00020a, accent: 0xff3a8a, grid: 0x8ad8ff },
];

export const themeFor = (level) => THEMES[((level - 1) % THEMES.length + THEMES.length) % THEMES.length];

const KEYS = { c1: 'uC1', c2: 'uC2', c3: 'uC3', grid: 'uGrid', fog: 'uFogColor', horizon: 'uHorizon', zenith: 'uZenith' };
const hex = c => '#' + new THREE.Color(c).getHexString();

/** Smoothly lerps U colours toward a target theme; also mirrors c1/c2/c3 into CSS vars --c1/--c2/--c3. */
export class ThemeController {
  constructor({ speed = 2.2, css = true } = {}) {
    this.speed = speed; this.css = css;
    this.target = {}; this.accent = new THREE.Color(0xfff35c); this.accentTarget = new THREE.Color(0xfff35c);
    this.current = THEMES[0];
  }
  set(theme, instant = false) {
    const th = typeof theme === 'number' ? themeFor(theme) : theme;
    this.current = th;
    for (const [k, u] of Object.entries(KEYS)) {
      this.target[u] = new THREE.Color(th[k]);
      if (instant) U[u].value.copy(this.target[u]);
    }
    this.accentTarget.set(th.accent ?? th.c3);
    if (instant) this.accent.copy(this.accentTarget);
    if (this.css && typeof document !== 'undefined') {
      const r = document.documentElement.style;
      r.setProperty('--c1', hex(th.c1)); r.setProperty('--c2', hex(th.c2)); r.setProperty('--c3', hex(th.c3));
    }
    return th;
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * this.speed);
    for (const u of Object.values(KEYS)) if (this.target[u]) U[u].value.lerp(this.target[u], k);
    this.accent.lerp(this.accentTarget, k);
  }
}

/** district name in the current language (theme objects carry name = zh-HK, en = English) */
export function themeLabel(th) { return getLang() === 'en' ? th.en : th.name; }
