// Level definitions, colour themes and obstacle layouts.
export const GRID = 20;

export const THEMES = [
  { name: '霓虹九龍', c1: 0x00f0ff, c2: 0xff2bd6, c3: 0xfff35c, fog: 0x12051f, horizon: 0x5a0a5e, zenith: 0x02010a, food: 0xfff35c, grid: 0x00c8ff },
  { name: '毒霧旺角', c1: 0x7dff3a, c2: 0x9b30ff, c3: 0x3affd0, fog: 0x0b1410, horizon: 0x2a1a5c, zenith: 0x010604, food: 0xff3ad0, grid: 0x5aff6a },
  { name: '銀翼油麻地', c1: 0xff9a1f, c2: 0x00e5c8, c3: 0xff4f3a, fog: 0x1a0b06, horizon: 0x6a2410, zenith: 0x050202, food: 0x3affff, grid: 0xff8a2a },
  { name: '電光深水埗', c1: 0xff3aa8, c2: 0x3a7bff, c3: 0xb8ff3a, fog: 0x0a0620, horizon: 0x24106a, zenith: 0x01010c, food: 0x7affff, grid: 0xff4ab8 },
  { name: '金龍尖沙咀', c1: 0xffd23a, c2: 0xff2a3a, c3: 0xff8af0, fog: 0x1a0a04, horizon: 0x5a1010, zenith: 0x060101, food: 0x3affd0, grid: 0xffb43a },
  { name: '冰藍中環', c1: 0xbff4ff, c2: 0x8a3aff, c3: 0x3affff, fog: 0x060a1a, horizon: 0x1a2a6a, zenith: 0x00020a, food: 0xff3a8a, grid: 0x8ad8ff },
];

export function themeFor(level) { return THEMES[(level - 1) % THEMES.length]; }

export function speedFor(level) {
  // tick interval in seconds
  return Math.max(0.062, 0.155 - (level - 1) * 0.0125);
}
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
