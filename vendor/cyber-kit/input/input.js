// Unified input: keyboard + pointer (touch / mouse / pen) -> swipe directions, taps, holds and named actions.
//
//   const input = createInput({
//     dir(d, info)  { ... },            // 'up' | 'down' | 'left' | 'right'   info = { source: 'key'|'swipe', repeat }
//     tap(p)        { ... },            // p = { x, y }   (CSS px)
//     holdStart(p)  { ... }, holdEnd(p) { ... },
//     action(name)  { ... },            // 'primary' | 'pause' | 'mute' | 'undo' | 'restart' | 'camera' | 'fps' | custom
//     anyGesture()  { audio.init() },   // first user gesture: unlock audio
//   }, { swipe: 'once' });
//
// Pointer events that start on buttons / links / inputs or anything with [data-no-input] are ignored,
// so HUD buttons never trigger a swipe.

export const DEFAULT_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export const DEFAULT_ACTIONS = {
  Enter: 'primary', Space: 'primary', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
  KeyZ: 'undo', KeyU: 'undo', Backspace: 'undo', KeyR: 'restart', KeyC: 'camera', KeyF: 'fps',
};

/**
 * @param {object} h handlers (all optional)
 * @param {object} [o]
 * @param {EventTarget} [o.target=window]
 * @param {'once'|'chain'} [o.swipe='once']  once = one direction per finger-down; chain = keep emitting while dragging
 * @param {number} [o.threshold=24]  px of travel to count as a swipe
 * @param {number} [o.holdMs=380]
 * @param {number} [o.tapMaxMove=14]
 * @param {object} [o.keys]     extra / override direction keys  { KeyI: 'up' }
 * @param {object} [o.actions]  extra / override action keys     { KeyN: 'restart' }
 */
export function createInput(h = {}, o = {}) {
  const target = o.target || window;
  const mode = o.swipe || 'once';
  const TH = o.threshold ?? 24, HOLD = o.holdMs ?? 380, TAPMAX = o.tapMaxMove ?? 14;
  const keys = Object.assign({}, DEFAULT_KEYS, o.keys);
  const actions = Object.assign({}, DEFAULT_ACTIONS, o.actions);
  const ignoreSel = o.ignore || 'button, a, input, select, textarea, label, [data-no-input]';
  let enabled = true;
  const any = () => h.anyGesture && h.anyGesture();

  const onKey = (e) => {
    if (!enabled) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    any();
    const d = keys[e.code] || keys[e.key];
    if (d) { e.preventDefault(); h.dir && h.dir(d, { source: 'key', repeat: e.repeat }); return; }
    const a = actions[e.code];
    if (a) {
      if (a === 'primary' || a === 'undo') e.preventDefault();
      if (!e.repeat) h.action && h.action(a, e);
    }
  };
  window.addEventListener('keydown', onKey);

  let ptr = null; // { id, sx, sy, x, y, fired, held, timer }
  const onDown = (e) => {
    any();
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest(ignoreSel)) return;
    if (ptr) return; // single-pointer gestures
    ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, fired: false, held: false, timer: 0 };
    ptr.timer = setTimeout(() => {
      if (ptr && !ptr.fired && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) < TAPMAX) { ptr.held = true; h.holdStart && h.holdStart({ x: ptr.x, y: ptr.y }); }
    }, HOLD);
  };
  const onMove = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (mode === 'once' && ptr.fired) return;
    const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TH) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    ptr.fired = true; clearTimeout(ptr.timer);
    if (ptr.held) { ptr.held = false; h.holdEnd && h.holdEnd({ x: ptr.x, y: ptr.y }); }
    if (mode === 'chain') { ptr.sx = ptr.x; ptr.sy = ptr.y; }
    h.dir && h.dir(d, { source: 'swipe', repeat: false });
    if (e.cancelable) e.preventDefault();
  };
  const onUp = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    clearTimeout(ptr.timer);
    const moved = Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy);
    if (ptr.held) h.holdEnd && h.holdEnd({ x: e.clientX, y: e.clientY });
    else if (!ptr.fired && moved < TAPMAX && e.type === 'pointerup') h.tap && h.tap({ x: e.clientX, y: e.clientY });
    ptr = null;
  };
  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  // block iOS/Android page scroll / pull-to-refresh while playing
  const noScroll = (e) => { if (enabled && e.cancelable && !(e.target.closest && e.target.closest('[data-scroll]'))) e.preventDefault(); };
  window.addEventListener('touchmove', noScroll, { passive: false });

  return {
    setEnabled(b) { enabled = !!b; if (!b) ptr = null; },
    get enabled() { return enabled; },
    dispose() {
      window.removeEventListener('keydown', onKey);
      target.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', noScroll);
    },
  };
}
