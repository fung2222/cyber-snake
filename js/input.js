// Keyboard + touch swipe input (+ boost hold).
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const BOOST_CODES = new Set(['ShiftLeft', 'ShiftRight', 'KeyB']);

export function setupInput(h) {
  window.addEventListener('keydown', (e) => {
    h.anyGesture && h.anyGesture();
    const dir = KEYMAP[e.code] || KEYMAP[e.key];
    if (dir) { e.preventDefault(); h.dir(dir); return; }
    if (BOOST_CODES.has(e.code) || e.code === 'Space') {
      if (e.code !== 'Space' || h.boostingAllowed?.()) {
        if (h.boost && !e.repeat) { e.preventDefault(); h.boost(true); }
        if (e.code !== 'Space') return;
      }
    }
    switch (e.code) {
      case 'Enter': case 'Space': e.preventDefault(); if (!e.repeat) h.primary(); break;
      case 'KeyP': case 'Escape': if (!e.repeat) h.pause(); break;
      case 'KeyM': if (!e.repeat) h.mute(); break;
      case 'KeyC': if (!e.repeat) h.camera(); break;
      case 'KeyF': if (!e.repeat) h.fps(); break;
      case 'KeyH': if (!e.repeat) h.hint && h.hint(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (BOOST_CODES.has(e.code) || e.code === 'Space') h.boost && h.boost(false);
  });
  window.addEventListener('blur', () => { h.boost && h.boost(false); });

  let sx = 0, sy = 0, active = false;
  const TH = 22;
  window.addEventListener('touchstart', (e) => {
    h.anyGesture && h.anyGesture();
    const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; active = true;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TH) return;
    if (Math.abs(dx) > Math.abs(dy)) h.dir(dx > 0 ? 'right' : 'left'); else h.dir(dy > 0 ? 'down' : 'up');
    sx = t.clientX; sy = t.clientY; // allow chained swipes without lifting the finger
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => { active = false; }, { passive: true });
  window.addEventListener('pointerdown', () => h.anyGesture && h.anyGesture());
}
