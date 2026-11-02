"""One intro: the title screen must appear without a second boot overlay."""
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
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg = c.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '?lang=zh', wait_until='domcontentloaded')
    pg.wait_for_selector('#screen-start .title', timeout=60000)
    pg.wait_for_timeout(500)
    state = pg.evaluate("""() => ({
      loading: !!document.getElementById('loading'),
      bootText: !!document.querySelector('.ld-text'),
      startVisible: !document.getElementById('screen-start').classList.contains('hidden'),
      title: document.querySelector('#screen-start .title')?.textContent.trim(),
      docW: document.documentElement.scrollWidth,
      dim: parseFloat(getComputedStyle(document.getElementById('screen-start'), '::before').opacity),
    })""")
    print(state)
    check(not state['loading'] and not state['bootText'], 'no separate boot overlay')
    check(state['startVisible'] and state['title'] == '賽博蛇', 'one title intro is visible')
    check(state['docW'] <= 390, 'no horizontal overflow')
    pg.wait_for_timeout(2400)
    dim = pg.evaluate("() => parseFloat(getComputedStyle(document.getElementById('screen-start'), '::before').opacity)")
    print('dim after 2.9s:', dim)
    check(dim >= 0.3, 'background slowly dims to its target')
    check(len(errs) == 0, 'zero console errors')
    c.close(); b.close()

print(f'\n{len(fails)} FAILED' if fails else '\nALL PASSED')
raise SystemExit(1 if fails else 0)
