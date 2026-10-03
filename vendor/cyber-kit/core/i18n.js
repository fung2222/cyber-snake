// cyber-kit i18n — Traditional Chinese (Hong Kong) + English, user-selectable, persisted, live DOM updates.
//
//   import { i18n, t } from 'cyber-kit';
//   i18n.add({ title: ['數據熔合', 'DATA FUSE'], floor: ['第 {n} 層', 'FLOOR {n}'] });   // [zh-HK, en] pairs
//   t('floor', { n: 3 })            // → '第 3 層' | 'FLOOR 3'
//   <b data-i18n="title"></b>       // textContent kept in sync
//   <p data-i18n-html="howto"></p>  // innerHTML (trusted game strings only)
//   <button data-i18n-attr="title:muteTip,aria-label:muteTip">
//   i18n.bindToggle(buttonEl)       // button shows the other language ("EN" / "中") and toggles on click
//   i18n.onChange((lang) => redrawDynamicText())
//
// Language is stored in localStorage key `cyber.lang` (shared by every CYBER game) — values 'zh-HK' | 'en'.
// Default: stored value, else navigator.language starting with "zh" → 'zh-HK', otherwise 'en'.
// URL flag ?lang=en / ?lang=zh forces (and stores) a language — handy for tests and store screenshots.
export const LANGS = ['zh-HK', 'en'];
export const LANG_KEY = 'cyber.lang';
const IDX = { 'zh-HK': 0, en: 1 };
const tables = {};
const subs = new Set();
let lang = 'zh-HK';

const norm = (l) => (l && String(l).toLowerCase().startsWith('zh')) ? 'zh-HK' : (l && String(l).toLowerCase().startsWith('en') ? 'en' : null);
function readStored() { try { return norm(localStorage.getItem(LANG_KEY)); } catch { return null; } }
function writeStored(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ } }

/** language the player should see: ?lang= flag > stored choice > browser language */
export function detectLang() {
  try { const q = new URLSearchParams(location.search).get('lang'); if (norm(q)) { writeStored(norm(q)); return norm(q); } } catch { /* no location */ }
  const s = readStored(); if (s) return s;
  const nav = (typeof navigator !== 'undefined' && (navigator.languages && navigator.languages[0] || navigator.language)) || '';
  return String(nav).toLowerCase().startsWith('zh') ? 'zh-HK' : 'en';
}

/** register strings: { key: ['zh-HK text', 'en text'] } or { key: { 'zh-HK': '…', en: '…' } }. Later calls override keys. */
export function addStrings(table) {
  for (const [k, v] of Object.entries(table)) tables[k] = Array.isArray(v) ? v : [v['zh-HK'] ?? v.zh ?? '', v.en ?? ''];
  scheduleApply();
  return api;
}
export const hasString = (key) => key in tables;
let applyQueued = false;
/** strings registered after page load are painted on the next microtask (v0.2.1) */
function scheduleApply() {
  if (applyQueued || typeof document === 'undefined' || document.readyState === 'loading') return;
  applyQueued = true; queueMicrotask(() => { applyQueued = false; applyI18n(); });
}

/** translate key in the current (or given) language; {name} placeholders are filled from params; unknown keys return the key */
export function t(key, params, l = lang) {
  const row = tables[key]; let s = row ? (row[IDX[l]] ?? row[0]) : key;
  if (s === '' && row) s = row[0];
  if (params) s = s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? params[p] : m));
  return s;
}
/** both languages, "中文 English" (for legacy two-line labels) */
export const tBoth = (key, params) => `${t(key, params, 'zh-HK')} ${t(key, params, 'en')}`;

export const getLang = () => lang;
export const isZh = () => lang === 'zh-HK';

/** update every [data-i18n], [data-i18n-html], [data-i18n-attr] under root */
export function applyI18n(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  if (root === document || root === document.documentElement) {
    document.documentElement.lang = lang === 'zh-HK' ? 'zh-Hant-HK' : 'en';
    document.documentElement.dataset.lang = lang === 'zh-HK' ? 'zh' : 'en';
    const tt = document.querySelector('title[data-i18n]'); if (tt) document.title = t(tt.dataset.i18n);
  }
  root.querySelectorAll('[data-i18n]').forEach((el) => { const s = t(el.dataset.i18n, el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : undefined); if (el.textContent !== s) el.textContent = s; });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(',')) { const [attr, key] = pair.split(':').map((x) => x.trim()); if (attr && key) el.setAttribute(attr, t(key)); }
  });
  root.querySelectorAll('[data-lang-toggle]').forEach(paintToggle);
  // glitch titles mirror their text in data-text for the ::before/::after layers
  root.querySelectorAll('.glitch[data-i18n]').forEach((el) => { el.dataset.text = el.textContent; });
}

function paintToggle(el) {
  el.textContent = lang === 'zh-HK' ? 'EN' : '中';
  el.setAttribute('aria-label', lang === 'zh-HK' ? 'Switch to English' : '切換至中文');
  el.title = lang === 'zh-HK' ? 'English' : '中文';
}

/** change language: persists, updates the DOM, notifies listeners and fires window event 'cyber:langchange' */
export function setLang(l, { persist = true } = {}) {
  const n = norm(l) || 'zh-HK';
  const changed = n !== lang; lang = n;
  if (persist) writeStored(n);
  applyI18n();
  if (changed) {
    for (const fn of subs) { try { fn(lang); } catch (e) { console.warn('[i18n] listener failed', e); } }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cyber:langchange', { detail: { lang } }));
  }
  return lang;
}
export const toggleLang = () => setLang(lang === 'zh-HK' ? 'en' : 'zh-HK');
/** subscribe; returns an unsubscribe function */
export function onLangChange(fn) { subs.add(fn); return () => subs.delete(fn); }

/** make a button a language toggle (adds [data-lang-toggle], class lang-btn) */
export function bindToggle(el, { onToggle } = {}) {
  if (!el) return;
  el.setAttribute('data-lang-toggle', ''); el.classList.add('lang-btn'); paintToggle(el);
  el.addEventListener('click', (e) => { e.stopPropagation(); toggleLang(); onToggle && onToggle(lang); el.blur(); });
  return el;
}

const api = { t, tBoth, add: addStrings, has: hasString, get lang() { return lang; }, isZh, set: setLang, toggle: toggleLang, onChange: onLangChange, apply: applyI18n, bindToggle, detect: detectLang, LANGS, LANG_KEY };

// kit-level strings (used by CyberUI defaults; games may override any key)
addStrings({
  'kit.start': ['開始遊戲', 'START'], 'kit.resume': ['繼續', 'RESUME'], 'kit.retry': ['再嚟一鋪', 'RETRY'], 'kit.menu': ['主畫面', 'MAIN MENU'],
  'kit.paused': ['已暫停', 'PAUSED'], 'kit.gameOver': ['遊戲結束', 'GAME OVER'], 'kit.newRecord': ['★ 新紀錄 ★', '★ NEW RECORD ★'],
  'kit.score': ['分數', 'SCORE'], 'kit.best': ['最高分', 'BEST'], 'kit.level': ['等級', 'LEVEL'], 'kit.sound': ['聲音', 'SOUND'], 'kit.mute': ['靜音', 'MUTE'],
  'kit.undo': ['復原', 'UNDO'], 'kit.newGame': ['新一局', 'NEW GAME'], 'kit.watchAd': ['睇廣告', 'WATCH AD'], 'kit.noThanks': ['唔使喇', 'NO THANKS'],
  'kit.continue': ['繼續挑戰', 'CONTINUE'], 'kit.loading': ['系統啟動中…', 'BOOTING…'], 'kit.demo': ['DEMO · 自動示範', 'DEMO · AUTOPLAY'],
  'kit.privacy': ['私隱政策', 'Privacy policy'], 'kit.adLabel': ['廣告', 'AD'], 'kit.webgl': ['你的瀏覽器唔支援 WebGL，無法運行遊戲。', 'WebGL is not available in this browser.'],
  'kit.rewardOffline': ['暫時冇廣告可以睇，遲啲再試下。', 'No ad available right now. Try again later.'],
  'kit.glow': ['光暈：{v}', 'GLOW: {v}'], 'kit.glowLow': ['低', 'LOW'], 'kit.glowHigh': ['高', 'HIGH'], 'kit.glowHint': ['畫面光暈強度（所有遊戲通用）', 'Neon glow strength (all CYBER games)'],
  'kit.endless': ['無盡模式', 'ENDLESS'], 'kit.bestEndless': ['無盡紀錄', 'ENDLESS BEST'], 'kit.language': ['語言', 'LANGUAGE'],
  'kit.adsimRewarded': ['獎勵廣告示範', 'REWARDED AD (SIM)'], 'kit.adsimInter': ['插頁廣告示範', 'INTERSTITIAL (SIM)'], 'kit.adsimNote': ['?adsim=1 · 只係測試，唔係真廣告', '?adsim=1 · test only, not a real ad'],
});

lang = typeof window !== 'undefined' ? detectLang() : 'zh-HK';
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyI18n(), { once: true }); else applyI18n();
}

export const i18n = api;
