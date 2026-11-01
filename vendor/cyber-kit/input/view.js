// Player camera control for play (shared by CYBER arcade board-style games):
//   one-finger drag = orbit (azimuth / tilt) when opts.oneFingerOrbit is true (default; cyber-board / tower),
//   two fingers = pinch zoom + drag pan (+ twist rotate), mouse right/ctrl-drag = orbit, wheel = zoom.
// When opts.oneFingerOrbit is false (swipe / tap games: data-fuse, neon-recall, mini-pack), one-finger is left
// alone for gameplay; camera still gets pinch / twist / wheel / right-drag. Hard clamps + damping + tap-vs-drag
// classifier. THREE-free (pure state + DOM) so clamp maths is unit-testable in node.
//
// State is an *offset* on top of the auto-framed rig in main.js:
//   zoom  multiplier on the fitted distance (1 = whole board framed, < 1 = closer)
//   az    azimuth offset (rad) around the board centre, on top of the 2P table rotation
//   el    elevation offset (rad) added to the fitted pitch; the absolute pitch is clamped
//   px,pz look-target pan (world units), only allowed while zoomed in (anchored zoom / twist produce it)

export const VIEW_LIMITS = {
  zoomMin: 0.4,              // closest: 40 % of the fit distance (a chess square ≈ 2.4× its fitted size)
  zoomMax: 1.15,             // farthest: 15 % beyond the fit, so the whole board + rim always fits
  azMax: 70 * Math.PI / 180, // ±70° from the seat's side of the board: never looks from the opponent's side
  pitchMin: 34 * Math.PI / 180, // absolute elevation: never edge-on ...
  pitchMax: 84 * Math.PI / 180, // ... and never past top-down (so the board can't flip / go under)
};
export const TAP = { touchSlop: 14, mouseSlop: 6, maxMs: Infinity, afterGestureMs: 260 };   // no hold limit: movement decides
export const GESTURE = { pinchPx: 10, twistRad: 0.09, dragPx: 14, orbitPerPx: 0.0065, tiltPerPx: 0.0055, wheel: 0.0015, damping: 14 };

export const defaultView = () => ({ zoom: 1, az: 0, el: 0, px: 0, pz: 0 });

/** clamp a view in place. basePitch = fitted pitch; ext = [halfX, halfZ] of the playing area */
export function clampView(v, basePitch, ext, L = VIEW_LIMITS) {
  v.zoom = Math.min(L.zoomMax, Math.max(L.zoomMin, v.zoom));
  v.az = Math.min(L.azMax, Math.max(-L.azMax, v.az));
  const p = Math.min(L.pitchMax, Math.max(L.pitchMin, basePitch + v.el)); v.el = p - basePitch;
  // pan only while zoomed in: 0 at the fit distance, up to the board edge at max zoom
  const s = Math.min(1, Math.max(0, (1 - v.zoom) / (1 - L.zoomMin)));
  const ex = ext[0] * s, ez = ext[1] * s;
  v.px = Math.min(ex, Math.max(-ex, v.px)); v.pz = Math.min(ez, Math.max(-ez, v.pz));
  return v;
}
/** exponential smoothing of cur toward tgt (frame-rate independent) */
export function dampView(cur, tgt, dt, rate = GESTURE.damping) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  for (const key of ['zoom', 'az', 'el', 'px', 'pz']) { const d = tgt[key] - cur[key]; cur[key] = Math.abs(d) < 1e-5 ? tgt[key] : cur[key] + d * k; }
  return cur;
}
export const isDefaultView = (v, eps = 0.01) => Math.abs(v.zoom - 1) < eps && Math.abs(v.az) < eps && Math.abs(v.el) < eps && Math.abs(v.px) < eps * 5 && Math.abs(v.pz) < eps * 5;

/**
 * Pointer classifier on the 3D canvas.
 * h.enabled()                     camera gestures allowed now? (play, no battle running)
 * h.tap(x, y, e)                  a clean one-finger / left-click tap (never fired for gestures)
 * h.zoom(factor, x, y)            multiply zoom (factor < 1 = closer), anchored at screen point
 * h.twist(dRad, x, y)             rotate about the screen point (fingers' rotation)
 * h.pan(x0, y0, x1, y1)           move the board point under (x0,y0) to (x1,y1) (two-finger drag)
 * h.orbit(dAz, dEl)               orbit around the look target
 * h.gesture(active)               gesture started / ended (for UI, e.g. reveal the reset button)
 * h.down(e)                       any pointerdown (audio unlock)
 *
 * @param {HTMLElement} el
 * @param {object} h
 * @param {object} [opts]
 * @param {boolean} [opts.oneFingerOrbit=true]  false = leave one-finger / left-drag to gameplay (swipe/tap games)
 */
export class ViewInput {
  constructor(el, h, opts = {}) {
    this.el = el; this.h = h; this.oneFingerOrbit = opts.oneFingerOrbit !== false;
    this.pts = new Map(); this.mode = 'idle'; this.suppressUntil = 0; this.stats = { taps: 0, gestures: 0, cancelledTaps: 0 };
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onCancel(e));
    el.addEventListener('lostpointercapture', (e) => { if (this.pts.has(e.pointerId)) this.onCancel(e); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }
  onDown(e) {
    this.h.down && this.h.down(e);
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    const now = performance.now();
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now, type: e.pointerType, btn: e.button, mods: e.ctrlKey || e.metaKey });
    if (this.pts.size === 1) {
      // left button / one finger: tap until it moves past the slop, then orbit. Right / Ctrl-drag: orbit straight away.
      const orbitBtn = e.pointerType === 'mouse' && (e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey)));
      this.mode = orbitBtn ? 'orbit-pending' : (e.pointerType === 'mouse' && e.button !== 0 ? 'ignore' : 'tap');
    } else if (this.pts.size === 2) {
      if (this.mode === 'tap') this.stats.cancelledTaps++;
      this.startPinch();
    } else this.mode = 'ignore-multi';   // 3+ fingers: ignore until all up
  }
  startPinch() {
    const [a, b] = [...this.pts.values()];
    this.mode = 'pinch';
    this.pin = { d0: dist(a, b), a0: ang(a, b), m0: mid(a, b), d: dist(a, b), a: ang(a, b), m: mid(a, b), zoomOn: false, twistOn: false, dragOn: false };
  }
  onMove(e) {
    const p = this.pts.get(e.pointerId); if (!p) return;
    const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
    if (this.mode === 'tap') {
      const slop = p.type === 'mouse' ? TAP.mouseSlop : TAP.touchSlop;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > slop) {
        this.stats.cancelledTaps++;
        if (this.oneFingerOrbit) { this.mode = 'orbit'; this.begin(); }   // drag → orbit, never a tap
        else this.mode = 'pass';   // leave the drag to createInput / gameplay swipes
      }
    } else if (this.mode === 'orbit-pending' || this.mode === 'orbit') {
      if (this.mode === 'orbit-pending' && Math.hypot(p.x - p.x0, p.y - p.y0) > 3) { this.mode = 'orbit'; this.begin(); }
      if (this.mode === 'orbit' && this.h.enabled()) this.h.orbit(-(p.x - px) * GESTURE.orbitPerPx, (p.y - py) * GESTURE.tiltPerPx);
    } else if (this.mode === 'pinch' && this.pts.size === 2) {
      const [a, b] = [...this.pts.values()], P = this.pin;
      const d = dist(a, b), an = ang(a, b), m = mid(a, b);
      if (!P.zoomOn && Math.abs(d - P.d0) > GESTURE.pinchPx) P.zoomOn = true;
      if (!P.twistOn && Math.abs(wrap(an - P.a0)) > GESTURE.twistRad) P.twistOn = true;
      if (!P.dragOn && Math.hypot(m.x - P.m0.x, m.y - P.m0.y) > GESTURE.dragPx) P.dragOn = true;
      if ((P.zoomOn || P.twistOn || P.dragOn) && !this.gestureLive) this.begin();
      if (this.h.enabled()) {
        if (P.zoomOn && d > 1 && P.d > 1) this.h.zoom(P.d / d, m.x, m.y);
        if (P.twistOn) this.h.twist(wrap(an - P.a), m.x, m.y);
        if (P.dragOn) this.h.pan(P.m.x, P.m.y, m.x, m.y);
      }
      P.d = d; P.a = an; P.m = m;
    }
  }
  begin() { if (!this.gestureLive) { this.gestureLive = true; this.stats.gestures++; this.h.gesture && this.h.gesture(true); } }
  end() { if (this.gestureLive) { this.gestureLive = false; this.h.gesture && this.h.gesture(false); } }
  onUp(e) {
    const p = this.pts.get(e.pointerId); if (!p) return;
    this.pts.delete(e.pointerId);
    const now = performance.now();
    if (this.mode === 'tap' && this.pts.size === 0) {
      this.mode = 'idle';
      if (now >= this.suppressUntil && now - p.t0 <= TAP.maxMs) { this.stats.taps++; this.h.tap(e.clientX, e.clientY, e); }
      return;
    }
    if (this.mode === 'pinch' || this.mode === 'ignore-multi' || this.mode === 'orbit') this.suppressUntil = now + TAP.afterGestureMs;
    if (this.pts.size === 0) { this.mode = 'idle'; this.end(); }
    else if (this.mode === 'pinch') this.mode = 'ignore-multi';   // one finger left after a pinch: never becomes a tap or orbit
    else if (this.mode === 'ignore-multi' && this.pts.size === 2) this.startPinch();
  }
  onCancel(e) { this.pts.delete(e.pointerId); if (this.pts.size === 0) { this.mode = 'idle'; this.end(); } else this.mode = 'ignore-multi'; }
  onWheel(e) {
    if (!this.h.enabled()) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (e.ctrlKey && Math.abs(dy) < 50) { this.h.zoom(Math.exp(dy * 0.01), e.clientX, e.clientY); return; }  // trackpad pinch
    this.h.zoom(Math.exp(Math.max(-200, Math.min(200, dy)) * GESTURE.wheel), e.clientX, e.clientY);
  }
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const wrap = (r) => { while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; };
