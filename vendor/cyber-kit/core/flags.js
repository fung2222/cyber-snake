// URL flags shared by every CYBER game.  ?demo=1 &level=3 &fps=1 &autostart=1 &quality=low ...
// Usage: const flags = parseFlags();  flags.demo === true

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

export function parseFlags(search = (typeof location !== 'undefined' ? location.search : '')) {
  const p = new URLSearchParams(search);
  const has = k => p.get(k) === '1' || p.get(k) === 'true';
  const q = (p.get('quality') || 'auto').toLowerCase();
  return {
    raw: p,
    demo: has('demo'),                    // autoplay AI, no input needed, loops forever
    autostart: has('autostart'),          // skip start screen
    level: Math.max(1, Math.floor(num(p.get('level'), 1))),
    fps: has('fps'),                      // show FPS meter
    noauto: has('noauto'),                // disable automatic pixel-ratio downgrade
    quality: ['low', 'med', 'high', 'auto'].includes(q) ? q : 'auto',
    bloom: p.has('bloom') ? num(p.get('bloom'), null) : null,
    exposure: p.has('exp') ? num(p.get('exp'), null) : null,
    toneMapping: p.get('tm') || null,
    dtcap: num(p.get('dtcap'), 0.1),
    seed: p.has('seed') ? Math.floor(num(p.get('seed'), 1)) : null,
    adsim: has('adsim'),                  // web: show simulated ad overlays to test ad flow
    mute: has('mute'),
    reset: has('reset'),                  // wipe this game's localStorage on boot
    debug: has('debug'),
    get(k, d = null) { return p.has(k) ? p.get(k) : d; },
    num(k, d) { return num(p.get(k), d); },
  };
}

export const flags = parseFlags();
