"""Start button must show the Loading transition (two rings + glow) before play."""
from __future__ import annotations
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18940/cyber-snake/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(ok, msg):
    print(('ok   ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = c.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?lang=zh', wait_until='domcontentloaded')
    pg.wait_for_selector('#screen-start .title', timeout=60000)
    pg.wait_for_timeout(400)
    pg.click('#btn-start')
    pg.wait_for_selector('#start-loading:not(.hidden)', timeout=5000)
    pg.wait_for_timeout(250)
    mid = pg.evaluate("""() => {
      const ov = document.getElementById('start-loading');
      const rings = [...document.querySelectorAll('#start-loading .sl-ring')];
      return {
        on: ov.classList.contains('on'),
        rings: rings.length,
        text: document.querySelector('#start-loading .sl-text')?.textContent.trim(),
        opacity: parseFloat(getComputedStyle(ov).opacity),
      };
    }""")
    print('mid', mid)
    check(mid['on'] and mid['rings'] == 2, 'two circular rings are shown')
    check(mid['text'] == 'Loading...', 'Loading... label is shown')
    check(mid['opacity'] > 0.5, 'overlay fades in')
    pg.wait_for_function("() => __snake.state === 'playing'", timeout=10000)
    end = pg.evaluate("() => ({state:__snake.state, hidden:document.getElementById('start-loading').classList.contains('hidden')})")
    print('end', end)
    check(end['hidden'], 'overlay clears before play')
    check(len(errs) == 0, 'zero console errors')
    c.close(); b.close()

print(f'\n{len(fails)} FAILED' if fails else '\nALL PASSED')
raise SystemExit(1 if fails else 0)
