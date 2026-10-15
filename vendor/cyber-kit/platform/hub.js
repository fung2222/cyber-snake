// CYBER ARCADE hub contract — shared by every game (see cyber-arcade docs/MONETIZATION.md §8).
//   Launch URL from the hub:  ?hub=1&tier=free|silver|gold&ads=0|1[&trial=1&trialLeft=N][&ret=<hub URL>]
//   Fallback cache:           localStorage 'cyber.entitlement' = { v:1, tier, products, … }
// These values only gate ads and trial caps. They are user-editable on the web, so never protect anything valuable with them.
//
//   import { readHub, returnToHub } from 'cyber-kit/platform/hub.js';
//   const hub = readHub();
//   returnToHub({ gameId: 'cyber-snake' });                    // home 「選單 · 其他遊戲」 — no store sheet
//   returnToHub({ gameId: 'cyber-snake', openStore: true });   // trial unlock — hub opens unlock sheet

import { addStrings } from '../core/i18n.js';

addStrings({
  'kit.arcadeMenu': ['選單 · 其他遊戲', 'ARCADE MENU'],
  'kit.arcadeMenuS': ['其他遊戲', 'OTHER GAMES'],
});

const TIERS = ['free', 'silver', 'gold'];
const OPEN_STORE_KEY = 'cyber.arcade.openStore';

function readEnt() {
  try {
    const e = JSON.parse(localStorage.getItem('cyber.entitlement') || 'null');
    return e && TIERS.includes(e.tier) ? e : null;
  } catch { return null; }
}

/** Parse hub launch params (+ entitlement cache). Game-specific trial caps stay in the game. */
export function readHub(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search);
  const fromHub = p.get('hub') === '1';
  const ent = typeof localStorage !== 'undefined' ? readEnt() : null;
  const tier = TIERS.includes(p.get('tier')) ? p.get('tier') : (ent ? ent.tier : null);
  // ads: explicit param wins; else derive from the tier (Free = interstitials); standalone web = allowed
  const ads = p.has('ads') ? p.get('ads') === '1' : (tier ? tier === 'free' : true);
  const trial = p.get('trial') === '1';
  const trialLeft = p.has('trialLeft') ? Math.max(0, parseInt(p.get('trialLeft'), 10) || 0) : null;
  let ret = p.get('ret') || null;
  if (ret) {
    try {
      const u = new URL(ret, typeof location !== 'undefined' ? location.href : 'https://example.invalid/');
      if (typeof location !== 'undefined' && u.origin !== location.origin) ret = null;
    } catch { ret = null; }
  }
  return { fromHub, tier, ads, trial, trialLeft, ret, entitlement: ent };
}

/**
 * Navigate back to the CYBER ARCADE hub.
 * Prefer history.back() when launched with hub=1 (and referrer does not prove a foreign origin);
 * else same-origin ?ret=; else ../cyber-arcade/ fallback.
 * @param {{ gameId?: string, openStore?: boolean }} [opts]
 *   openStore: when true, leave cyber.arcade.openStore so the hub opens its unlock sheet (trial unlock path).
 *   Home 「選單 · 其他遊戲」 must pass openStore: false (default).
 * @returns {'ret'|'back'|'root'}
 */
export function returnToHub({ gameId = null, openStore = false } = {}, search = typeof location !== 'undefined' ? location.search : '') {
  if (openStore && gameId && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(OPEN_STORE_KEY, JSON.stringify({ game: gameId, t: Date.now() })); } catch { /* storage blocked */ }
  }
  const p = new URLSearchParams(search);
  const fromHub = p.get('hub') === '1';
  const ret = p.get('ret');
  if (ret) {
    try {
      const u = new URL(ret, location.href);
      if (u.origin === location.origin) {
        if (openStore) u.searchParams.set('store', '1');
        location.href = u.href;
        return 'ret';
      }
    } catch { /* bad url */ }
  }
  // hub page sends no referrer (meta referrer=no-referrer), so only refuse back when a referrer proves we came from elsewhere
  const foreign = typeof document !== 'undefined' && document.referrer && (() => {
    try { return new URL(document.referrer).origin !== location.origin; } catch { return true; }
  })();
  if (fromHub && typeof history !== 'undefined' && history.length > 1 && !foreign) {
    history.back();
    return 'back';
  }
  location.href = new URL('../cyber-arcade/', location.href).href;
  return 'root';
}

/** True when the start-screen arcade-menu button should show (launched from hub or has a return URL). */
export function shouldShowArcadeMenu(hub = null, search = typeof location !== 'undefined' ? location.search : '') {
  const h = hub || readHub(search);
  return !!(h.fromHub || h.ret);
}
