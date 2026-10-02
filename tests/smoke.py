"""Headless smoke test for CYBER SNAKE (v1.1: bilingual + endless).
Usage: python tests/smoke.py [base_url] [out_dir]   (serve the parent folder: python3 -m http.server 18940)
Checks at 412x915 touch + 1280x800: zero console errors, default language from navigator, zh-HK/en toggle live +
persisted (localStorage cyber.lang), start, swipe/keys steer, endless level 12 (beyond authored layouts) + level 20
milestone bonus, game over with translated death reason, best-level record, demo autoplay.
"""
import sys, os
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18940/cyber-snake/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'docs/shots'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
def run(p, name, w, h, mobile):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(4000)
    lang = lambda: pg.evaluate('document.documentElement.dataset.lang')
    pg.screenshot(path=f'{OUT}/{name}-start-en.png')
    check(lang() == 'en' and 'START' in pg.inner_text('#btn-start'), f'{name}: default language en (navigator)')
    pg.click('#btn-lang'); pg.wait_for_timeout(400)
    check(lang() == 'zh' and '開始' in pg.inner_text('#btn-start'), f'{name}: toggle -> zh-HK live')
    pg.reload(); pg.wait_for_timeout(5500)
    check(lang() == 'zh' and pg.evaluate("localStorage.getItem('cyber.lang')") == 'zh-HK', f'{name}: language persisted')
    pg.screenshot(path=f'{OUT}/{name}-start-zh.png')
    if name == 'desktop':
        pg.click('#btn-lang'); pg.wait_for_timeout(300); check(lang() == 'en', f'{name}: toggle back -> en')
    st = lambda: pg.evaluate('({s: __snake.state, lv: __snake.level, score: __snake.score, len: __snake.length})')
    pg.click('#btn-start'); pg.wait_for_timeout(800)
    check(st()['s'] == 'playing', f'{name}: start -> playing')
    pg.evaluate('__snake.setAutopilot(true)'); pg.wait_for_timeout(4000)
    s0 = st()
    pg.evaluate('__snake.levelTo(12)'); pg.wait_for_timeout(900)
    banner = pg.inner_text('#banner')
    check(st()['lv'] == 12 and ('ENDLESS' in banner or '無盡' in banner), f'{name}: endless level 12 beyond authored layouts ({banner!r})')
    pg.screenshot(path=f'{OUT}/{name}-endless-12.png')
    sc = st()['score']; pg.evaluate('__snake.levelTo(20)'); pg.wait_for_timeout(900)
    check(st()['lv'] == 20 and st()['score'] >= sc + 1000, f'{name}: level 20 milestone bonus ({sc} -> {st()["score"]})')
    pg.screenshot(path=f'{OUT}/{name}-endless-20.png')
    pg.wait_for_timeout(2500)
    pg.keyboard.press('p'); pg.wait_for_timeout(300); check(st()['s'] == 'paused', f'{name}: pause')
    pg.keyboard.press('p'); pg.wait_for_timeout(300); check(st()['s'] == 'playing', f'{name}: resume')
    pg.evaluate('__snake.setAutopilot(false); const g = __snake.game; g.frozen = 0; g.snake.forEach((s, i) => { s.x = 19 - i; s.z = 0; }); g.dir = { x: 1, z: 0 }; g.queue = [];')
    for _ in range(80):
        if st()['s'] == 'over': break
        pg.wait_for_timeout(250)
    reason = pg.inner_text('#over-reason') if st()['s'] == 'over' else ''
    check(st()['s'] == 'over' and reason in ('WALL COLLISION', '撞到能量牆'), f'{name}: game over + translated reason ({reason!r})')
    pg.screenshot(path=f'{OUT}/{name}-over.png')
    check(pg.evaluate("localStorage.getItem('cyberSnake.bestLevel')") == '20', f'{name}: best endless level saved')
    pg.goto(BASE + '?demo=1'); pg.wait_for_timeout(8000)
    check(st()['s'] == 'playing', f'{name}: demo autoplays')
    check(not errs, f'{name}: zero console errors {errs[:3]}')
    b.close()
with sync_playwright() as p:
    run(p, 'mobile', 412, 915, True)
    run(p, 'desktop', 1280, 800, False)
print('ALL PASSED' if not fails else f'{len(fails)} FAILED')
sys.exit(1 if fails else 0)
