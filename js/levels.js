// Level definitions, colour themes, background styles and obstacle layouts.
// Palette locked to Cyber Hub Art Bible: #05010f bg · gunmetal · #00e5ff cyan · #7ad7ff · #ff2bd6 magenta · #ff3b5c warn · #7cff3a acid · gold/orange/violet helpers.
export const GRID = 20;

// floor: 0 grid-alley · 1 rain-wet · 2 scan-haze · 3 circuit · 4 market-tiles · 5 acid-caution · 6 volt-hex · 7 ember-rings
// Each level advance cycles theme + swaps floor/atmosphere (see World.setBackground).
export const THEMES = [
  {
    id: 'grid-alley', name: '霓虹九龍', en: 'NEON KOWLOON',
    c1: 0x00e5ff, c2: 0xff2bd6, c3: 0xffb428, fog: 0x05010f, horizon: 0x5a0a5e, zenith: 0x02010a,
    food: 0xffb428, grid: 0x00e5ff, floor: 0, fogDensity: 0.011, rain: 0.85, dust: 0.9, scan: 0.16, haze: 'cyan',
  },
  {
    id: 'rain-streaks', name: '暴雨旺角', en: 'RAIN MONG KOK',
    c1: 0x7ad7ff, c2: 0xff2bd6, c3: 0x7cff3a, fog: 0x070412, horizon: 0x2a1a5c, zenith: 0x010408,
    food: 0xff2bd6, grid: 0x7ad7ff, floor: 1, fogDensity: 0.016, rain: 2.0, dust: 0.35, scan: 0.22, haze: 'cyan',
  },
  {
    id: 'scan-magenta', name: '故障紅磡', en: 'GLITCH HUNG HOM',
    c1: 0xff2bd6, c2: 0x00e5ff, c3: 0xff3b5c, fog: 0x0a0214, horizon: 0x6a1060, zenith: 0x05010f,
    food: 0x00e5ff, grid: 0xff2bd6, floor: 2, fogDensity: 0.014, rain: 0.25, dust: 1.2, scan: 0.42, haze: 'magenta',
  },
  {
    id: 'circuit-cyan', name: '電路中環', en: 'CIRCUIT CENTRAL',
    c1: 0x00e5ff, c2: 0x7ad7ff, c3: 0x8b3dff, fog: 0x040812, horizon: 0x0a3a4a, zenith: 0x01060a,
    food: 0xffb428, grid: 0x00e5ff, floor: 3, fogDensity: 0.010, rain: 0.15, dust: 1.4, scan: 0.12, haze: 'cyan',
  },
  {
    id: 'night-market', name: '夜市廟街', en: 'NIGHT MARKET',
    c1: 0x8b3dff, c2: 0xff2bd6, c3: 0xff9a1f, fog: 0x080414, horizon: 0x4a1858, zenith: 0x03010c,
    food: 0xffe600, grid: 0x9a93bf, floor: 4, fogDensity: 0.013, rain: 0.55, dust: 1.0, scan: 0.18, haze: 'violet',
  },
  {
    id: 'acid-caution', name: '酸霧危區', en: 'ACID CAUTION ZONE',
    c1: 0x7cff3a, c2: 0xff9a1f, c3: 0xff3b5c, fog: 0x061008, horizon: 0x2a4010, zenith: 0x020604,
    food: 0xff3b5c, grid: 0x7cff3a, floor: 5, fogDensity: 0.015, rain: 0.4, dust: 0.7, scan: 0.14, haze: 'acid',
  },
  {
    id: 'volt-hex', name: '電光深水埗', en: 'VOLT SHAM SHUI PO',
    c1: 0xff2bd6, c2: 0x8b3dff, c3: 0x00e5ff, fog: 0x08061a, horizon: 0x24106a, zenith: 0x01010c,
    food: 0x7ad7ff, grid: 0xff2bd6, floor: 6, fogDensity: 0.012, rain: 0.7, dust: 1.1, scan: 0.20, haze: 'violet',
  },
  {
    id: 'ember-harbor', name: '金港碼頭', en: 'EMBER HARBOR',
    c1: 0xffb428, c2: 0xff3b5c, c3: 0xff9a1f, fog: 0x10060a, horizon: 0x5a1810, zenith: 0x060201,
    food: 0x00e5ff, grid: 0xffb428, floor: 7, fogDensity: 0.011, rain: 0.5, dust: 0.8, scan: 0.15, haze: 'gold',
  },
];

export function themeFor(level) { return THEMES[(level - 1) % THEMES.length]; }

export function speedFor(level) {
  // tick interval in seconds
  return Math.max(0.062, 0.155 - (level - 1) * 0.0125);
}
// Endless: levels never end. Authored layouts stop at level 6; after that layouts are procedural (seeded per level),
// the speed curve is capped (0.062 s/tick from level 9), targets cap at 10 and obstacle count caps at 10, so it stays playable.
export const AUTHORED_LEVELS = 6;
export const MILESTONE_EVERY = 10;
export const milestoneBonus = (level) => 500 * (level / MILESTONE_EVERY);   // awarded on reaching level 10, 20, 30…

export function targetFor(level) { return Math.min(5 + (level - 1), 10); }
export function pointsFor(level) { return 10 + (level - 1) * 5; }

// helper to add symmetric cells
function sym4(cells, x, z) {
  const m = GRID - 1;
  cells.push([x, z], [m - x, z], [x, m - z], [m - x, m - z]);
}

// Layouts return arrays of [x, z, height]
const LAYOUTS = [
  // 1: open arena
  () => [],
  // 2: four pillars
  () => { const c = []; sym4(c, 4, 4); sym4(c, 5, 4); sym4(c, 4, 5); return c.map(([x, z]) => [x, z, 1.2]); },
  // 3: corner brackets
  () => { const c = []; for (let i = 0; i < 4; i++) { sym4(c, 3 + i, 3); sym4(c, 3, 3 + i); } return dedupe(c).map(([x, z]) => [x, z, 0.9]); },
  // 4: twin bars + centre block
  () => { const c = []; for (let i = 5; i < 15; i++) { c.push([i, 5], [i, 14]); } for (let x = 9; x < 11; x++) for (let z = 9; z < 11; z++) c.push([x, z]); return c.map(([x, z]) => [x, z, x >= 9 && x < 11 && z >= 9 && z < 11 ? 2.2 : 1.0]); },
  // 5: plus cross with gaps
  () => { const c = []; for (let i = 3; i < 17; i++) { if (i === 9 || i === 10) continue; if (i > 6 && i < 13) { c.push([i, 9]); c.push([9, i]); } } sym4(c, 3, 3); sym4(c, 6, 15); return dedupe(c).map(([x, z]) => [x, z, 1.1]); },
  // 6: maze-ish rooms
  () => { const c = []; for (let i = 2; i < 8; i++) { sym4(c, i, 6); } for (let i = 2; i < 5; i++) sym4(c, 6, i); sym4(c, 9, 9); return dedupe(c).map(([x, z]) => [x, z, 1.0]); },
];

function dedupe(cells) {
  const s = new Set(); const out = [];
  for (const [x, z] of cells) { const k = x + ',' + z; if (!s.has(k)) { s.add(k); out.push([x, z]); } }
  return out;
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function layoutFor(level) {
  if (level <= LAYOUTS.length) return LAYOUTS[level - 1]();
  // procedural symmetric layouts for higher levels
  const r = rng(level * 7919);
  const c = [];
  const n = Math.min(4 + Math.floor(level / 2), 10);
  for (let k = 0; k < n; k++) {
    const x = 2 + Math.floor(r() * 7), z = 2 + Math.floor(r() * 7);
    const horiz = r() < 0.5; const len = 1 + Math.floor(r() * 3);
    for (let i = 0; i < len; i++) sym4(c, horiz ? Math.min(x + i, 8) : x, horiz ? z : Math.min(z + i, 8));
  }
  return dedupe(c).map(([x, z]) => [x, z, 0.8 + r() * 1.4]);
}
