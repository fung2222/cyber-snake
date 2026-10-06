"""Screenshots with the snake parked in the bottom-right corner (follow camera), for occlusion before/after checks.
usage: python tests/occlusion_shots.py BASE_URL OUT_DIR PREFIX [seed]
Writes OUT_DIR/PREFIX-412x915.png (touch, DPR 2) and OUT_DIR/PREFIX-1280x800.png. Math.random is seeded so the
random city is the same layout candidate in every run (seed 2 reproduced Roy's bug on the pre-fix build).
"""
import sys, os
from playwright.sync_api import sync_playwright
BASE, OUT, PREFIX = sys.argv[1], sys.argv[2], sys.argv[3]
SEED = int(sys.argv[4]) if len(sys.argv) > 4 else 2
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED_JS = "(()=>{let a=%d>>>0;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();"
os.makedirs(OUT, exist_ok=True)
errs_all = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for (w, h) in [(412, 915), (1280, 800)]:
        m = w < 600
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if m else 1, is_mobile=m, has_touch=m)
        ctx.add_init_script(SEED_JS % SEED)
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda msg: errs.append(msg.text) if msg.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '?lang=en&noauto=1&dtcap=0.5'); pg.wait_for_timeout(2500)
        pg.click('#btn-start'); pg.wait_for_timeout(500)
        pg.evaluate("""() => { __snake.setAutopilot(false); const g = __snake.game; g.frozen = 1e9; g.queue = [];
          const cells = [[19,19],[19,18],[19,17],[18,17],[17,17],[16,17]];
          g.snake = cells.map(([x,z]) => ({x, z})); g.prev = g.snake.map(c => ({...c})); g.dir = {x: 0, z: 1}; }""")
        pg.wait_for_timeout(6000)
        path = f'{OUT}/{PREFIX}-{w}x{h}.png'; pg.screenshot(path=path); print(path, 'errors:', errs)
        errs_all += errs; ctx.close()
    b.close()
sys.exit(1 if errs_all else 0)
