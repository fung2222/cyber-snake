// App-platform hooks that work the same in a browser tab and inside a Capacitor Android/iOS shell.
// No bundler needed: Capacitor exposes registered native plugins on window.Capacitor.Plugins.
//   Platform.onBack(() => { if (paused) resume(); else pause(); return true; })   // return true = handled
//   Platform.onPause(fn) / Platform.onResume(fn)
//   Platform.haptic('light' | 'medium' | 'heavy' | 'success' | 'warning')

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
const plugin = (name) => cap()?.Plugins?.[name];

const backHandlers = [], pauseHandlers = [], resumeHandlers = [];
let hapticsOn = true;
let wired = false;

function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  const App = plugin('App');
  if (isNative() && App) {
    App.addListener('backButton', () => {
      for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]() === true) return;
      App.minimizeApp ? App.minimizeApp() : App.exitApp();   // nothing handled it: leave like a normal Android app
    });
    App.addListener('pause', () => pauseHandlers.forEach(f => f('app')));
    App.addListener('resume', () => resumeHandlers.forEach(f => f('app')));
  }
  document.addEventListener('visibilitychange', () => {
    (document.hidden ? pauseHandlers : resumeHandlers).forEach(f => f('visibility'));
  });
  window.addEventListener('blur', () => pauseHandlers.forEach(f => f('blur')));
}

export function isNative() { return !!cap()?.isNativePlatform?.(); }

export const Platform = {
  get isNative() { return isNative(); },
  /** 'android' | 'ios' | 'web' */
  get name() { return cap()?.getPlatform?.() || 'web'; },
  hasPlugin(name) { return !!plugin(name); },
  plugin,
  /** Android hardware/gesture back. Handlers run newest-first; return true when handled. Returns an unsubscribe fn. */
  onBack(fn) { wire(); backHandlers.push(fn); return () => { const i = backHandlers.indexOf(fn); if (i >= 0) backHandlers.splice(i, 1); }; },
  /** app backgrounded / tab hidden / window blurred. fn(reason) */
  onPause(fn) { wire(); pauseHandlers.push(fn); },
  onResume(fn) { wire(); resumeHandlers.push(fn); },
  setHaptics(on) { hapticsOn = !!on; },
  get haptics() { return hapticsOn; },
  haptic(kind = 'light') {
    if (!hapticsOn) return;
    const H = plugin('Haptics');
    try {
      if (isNative() && H) {
        if (kind === 'success' || kind === 'warning' || kind === 'error') H.notification({ type: kind.toUpperCase() });
        else H.impact({ style: ({ light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' })[kind] || 'LIGHT' });
      } else if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
        navigator.vibrate(({ light: 8, medium: 16, heavy: 30, success: [10, 40, 18], warning: [25, 40, 25], error: [40, 30, 40] })[kind] || 8);
      }
    } catch { /* haptics are best-effort */ }
  },
  /** leave the app (Android). On the web this is a no-op. */
  exit() { const App = plugin('App'); if (isNative() && App) App.exitApp(); },
  /** open a URL in the system browser when native (privacy policy etc.), new tab on the web */
  openUrl(url) {
    const B = plugin('Browser');
    if (isNative() && B) B.open({ url }); else window.open(url, '_blank', 'noopener');
  },
};
