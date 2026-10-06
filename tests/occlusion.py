"""Scenery occlusion test for CYBER SNAKE (2026-10-06).
Usage: python tests/occlusion.py [base_url] [seeds]     (serve the parent folder: python3 -m http.server 18940)

Raycasts from the camera to arena cells against every scenery mesh (city buildings, shop signs, billboard + poles,
corner pylons) with THREE.Raycaster on the real scene, and fails on any hit.

1. Envelope (synthetic poses from js/camrig.js, the functions main.js uses):
   modes follow / top / orbit (attract + game over); fits = this viewport's + 1, 1.65, 2.3 (every aspect);
   follow: head on EVERY cell x 4 headings -> ray to the head cell, and 9 heads (corners, edge mids, centre) x 4
   headings -> rays to all 400 cells; orbit: 48 angles x 3 heights; each pose with no shake + the 8 corners of the
   max shake box. Run twice: ?nofade=1 (structural layout alone; corner pylons are allowed to block only in orbit
   mode, the fade handles those) and with the runtime fade (zero hits of anything, faded objects ignored).
2. Live: real game + real camera (lerp, shake, fov kick) with the snake parked in each corner / on each edge,
   every level 1-7, 12, 20 (endless), follow + top camera, plus the attract orbit; rays to all 400 cells.
Run at 412x915 (touch, DPR 2) and 1280x800, for several city seeds (Math.random seeded per page).
"""
import sys, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18940/cyber-snake/'
SEEDS = [int(s) for s in (sys.argv[2] if len(sys.argv) > 2 else '1,2,3').split(',')]
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED_JS = "(()=>{let a=%d>>>0;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();"

LIB = r"""
window.__occ = (() => {
  const S = __snake, T = S.THREE, w = S.world, rig = S.rig;
  const ray = new T.Raycaster(); const dir = new T.Vector3();
  const cellPos = (x, z, y = 0.45) => S.cellToWorld(x, z, new T.Vector3()).setY(y);
  const all = []; for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) all.push(cellPos(x, z));
  const solid = (h) => {   // is this hit object currently drawn solid (not faded by the safety fade)?
    const m = h.object;
    if (m.isInstancedMesh) return w.cityFade.array[h.instanceId] > 0.5;
    if (m.material && m.material.transparent && m.userData.scenery !== 'billboard') return m.material.opacity > 0.5;
    return true;
  };
  // returns list of hits {kind, cam, cell}; `fade` = apply the runtime fade for this pose first
  function cast(cam, targets, fade, out, tag) {
    w.group.updateMatrixWorld(true);
    if (fade) w.updateOcclusion(cam, 1e3, targets.length < 4 ? targets : []);
    for (const tg of targets) {
      dir.subVectors(tg, cam); const d = dir.length(); dir.divideScalar(d);
      ray.set(cam, dir); ray.near = 0; ray.far = d - 0.05;
      const hits = ray.intersectObjects(w.scenery, false).filter(h => !fade || solid(h));
      if (hits.length) out.push({ tag, kind: hits[0].object.userData.scenery, cam: cam.toArray().map(v => +v.toFixed(2)), cell: tg.toArray().map(v => +v.toFixed(2)) });
    }
  }
  const SH = rig.SHAKE, shakes = [new T.Vector3()];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) shakes.push(new T.Vector3(sx * SH.x, sy * SH.y, sz * SH.z));
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  function envelope({ fits, fade }) {
    const out = [], pos = new T.Vector3(), look = new T.Vector3(), cam = new T.Vector3();
    const counts = { follow: 0, top: 0, orbit: 0 };
    for (const fit of fits) {
      // top
      rig.topPose(fit, pos, look);
      for (const s of shakes) { cam.copy(pos).add(s); cast(cam, all, fade, out, 'top'); counts.top += all.length; }
      // follow: head on every cell -> head cell
      for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) for (const [dx, dz] of DIRS) {
        const head = cellPos(x, z, 0); rig.followPose(head, new T.Vector3(dx, 0, dz), fit, pos, look);
        const tgs = [cellPos(x, z, 0.45), cellPos(x, z, 0.1)];
        for (const s of shakes) { cam.copy(pos).add(s); cast(cam, tgs, fade, out, 'follow-head'); counts.follow += 2; }
      }
      // follow: 9 representative heads -> whole arena
      for (const x of [0, 10, 19]) for (const z of [0, 10, 19]) for (const [dx, dz] of DIRS) {
        rig.followPose(cellPos(x, z, 0), new T.Vector3(dx, 0, dz), fit, pos, look);
        for (const s of [shakes[0], shakes[1], shakes[8]]) { cam.copy(pos).add(s); cast(cam, all, fade, out, 'follow-arena'); counts.follow += all.length; }
      }
      // orbit (attract + game over)
      const R = 22 * Math.min(fit, 1.5);
      for (let k = 0; k < 48; k++) for (const y of [8, 9.5, 11]) {
        const a = k * Math.PI * 2 / 48; pos.set(Math.sin(a) * R, y, Math.cos(a) * R);
        for (const s of [shakes[0], shakes[1], shakes[8]]) { cam.copy(pos).add(s); cast(cam, all, fade, out, 'orbit'); counts.orbit += all.length; }
      }
    }
    if (fade) w.updateOcclusion(S.camera.position, 1e3, []);
    return { counts, hits: out.length, byKind: out.reduce((m, h) => (m[h.tag + ':' + h.kind] = (m[h.tag + ':' + h.kind] || 0) + 1, m), {}), sample: out.slice(0, 5) };
  }
  function live(tag) {   // from the real camera, with the real fade state, to all 400 cells
    const out = []; w.group.updateMatrixWorld(true);
    for (const tg of all) {
      dir.subVectors(tg, S.camera.position); const d = dir.length(); dir.divideScalar(d);
      ray.set(S.camera.position, dir); ray.near = 0; ray.far = d - 0.05;
      const hits = ray.intersectObjects(w.scenery, false).filter(solid);
      if (hits.length) out.push({ tag, kind: hits[0].object.userData.scenery, cell: tg.toArray() });
    }
    return { hits: out.length, cam: S.camera.position.toArray().map(v => +v.toFixed(2)), sample: out.slice(0, 3) };
  }
  function park(cells, d) {
    S.setAutopilot(false); const g = S.game; g.frozen = 1e9; g.queue = [];
    g.snake = cells.map(([x, z]) => ({ x, z })); g.prev = g.snake.map(c => ({ ...c })); g.dir = { x: d[0], z: d[1] };
  }
  // negative control: a tower dropped where the old random city could put one (behind the portrait camera's
  // sight line to the bottom-right corner) must be reported, otherwise the test itself is broken
  function selfTest() {
    const m = new T.Mesh(new T.BoxGeometry(8, 30, 6), new T.MeshBasicMaterial()); m.position.set(4, 15, 30); m.userData.scenery = 'selftest';
    w.group.add(m); w.scenery.push(m);
    const out = [], pos = new T.Vector3(), look = new T.Vector3();
    rig.followPose(cellPos(19, 19, 0), new T.Vector3(0, 0, 1), rig.FIT_MAX, pos, look);
    cast(pos, all, false, out, 'selftest');
    w.scenery.pop(); w.group.remove(m);
    return out.length;
  }
  return { envelope, live, park, selfTest, fit: () => rig.fitFor(S.camera.aspect) };
})();
"""

PARKS = {  # name: (cells head-first, dir)
    'bottom-right': ([[19, 19], [19, 18], [19, 17], [18, 17], [17, 17], [16, 17]], [0, 1]),
    'bottom-left': ([[0, 19], [0, 18], [0, 17], [1, 17], [2, 17]], [0, 1]),
    'top-right': ([[19, 0], [18, 0], [17, 0], [16, 0]], [1, 0]),
    'top-left': ([[0, 0], [1, 0], [2, 0], [3, 0]], [-1, 0]),
    'bottom-edge': ([[10, 19], [9, 19], [8, 19], [7, 19]], [1, 0]),
    'right-edge': ([[19, 10], [19, 9], [19, 8], [19, 7]], [0, 1]),
    'top-edge': ([[10, 0], [11, 0], [12, 0], [13, 0]], [-1, 0]),
    'left-edge': ([[0, 10], [0, 11], [0, 12], [0, 13]], [0, -1]),
}
LEVELS = [1, 2, 3, 4, 5, 6, 7, 12, 20]
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def page(b, w, h, seed, q):
    mobile = w < 600
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script(SEED_JS % seed)
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '?lang=en&noauto=1&dtcap=0.5' + q); pg.wait_for_timeout(2500)
    pg.evaluate(LIB)
    return ctx, pg, errs

def settle(pg, ms=2500):
    pg.wait_for_timeout(ms)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for (w, h) in [(412, 915), (1280, 800)]:
        name = f'{w}x{h}'
        for si, seed in enumerate(SEEDS):
            for fade in (False, True):
                ctx, pg, errs = page(b, w, h, seed, '' if fade else '&nofade=1')
                fit = pg.evaluate('__occ.fit()')
                if si == 0 and not fade:
                    n = pg.evaluate('__occ.selfTest()')
                    check(n > 0, f'{name} self-test: an injected tower in front of the portrait camera is detected ({n} blocked cells)')
                r = pg.evaluate('(o) => __occ.envelope(o)', {'fits': sorted({round(fit, 3), 1, 1.65, 2.3}), 'fade': fade})
                bk = r['byKind']
                if fade:
                    check(r['hits'] == 0, f'{name} seed {seed} envelope + fade: 0 hits of any scenery in {r["counts"]} rays {bk} {r["sample"][:2]}')
                else:
                    struct = {k: v for k, v in bk.items() if not (k.startswith('orbit:pylon'))}
                    check(not struct, f'{name} seed {seed} envelope structural (no fade): 0 building/sign/billboard hits in every mode, 0 pylon hits in follow/top {struct} {r["sample"][:2]}')
                    print(f'INFO {name} seed {seed}: orbit rays blocked by corner pylons without fade: {bk.get("orbit:pylon", 0)} (fade handles these)')
                if fade and si == 0:
                    # live game: real camera, every level, both gameplay cameras, all corners / edges
                    pg.click('#btn-start')
                    worst = 0   # camera swinging from the attract orbit to the chase camera
                    for k in range(8): pg.wait_for_timeout(250); worst = max(worst, pg.evaluate('__occ.live("start-transition")')['hits'])
                    check(worst == 0, f'{name} live attract -> follow transition: 0 hits at 8 moments (worst {worst})')
                    for lv in LEVELS:
                        if lv > 1: pg.evaluate(f'__snake.levelTo({lv})'); pg.wait_for_timeout(300)
                        for mode in (('top', 'follow') if lv == 1 else ('follow', 'top')):
                            pg.evaluate(f'__snake.setCamMode("{mode}")')
                            if lv == 1:   # sample the swing between cameras with the snake in the bottom-right corner
                                pg.evaluate('([c, d]) => __occ.park(c, d)', list(PARKS['bottom-right']))
                                worst = 0
                                for k in range(6): pg.wait_for_timeout(200); worst = max(worst, pg.evaluate(f'__occ.live("to-{mode}")')['hits'])
                                check(worst == 0, f'{name} live camera transition -> {mode}: 0 hits at 6 moments (worst {worst})')
                            parks = PARKS if lv == 1 else {'bottom-right': PARKS['bottom-right']}
                            for pk, (cells, d) in parks.items():
                                pg.evaluate('([c, d]) => __occ.park(c, d)', [cells, d]); settle(pg, 2200)
                                lr = pg.evaluate(f'__occ.live("{mode}")')
                                check(lr['hits'] == 0, f'{name} live L{lv} {mode} snake {pk}: 0 hits / 400 cells cam={lr["cam"]} {lr["sample"]}')
                    pg.evaluate('__snake.setCamMode("follow")')
                    # attract orbit (title screen) live, several moments
                    pg.click('#btn-pause'); pg.wait_for_timeout(300); pg.click('#btn-quit'); pg.wait_for_timeout(2500)
                    worst = 0
                    for k in range(6):
                        pg.wait_for_timeout(1500); worst = max(worst, pg.evaluate('__occ.live("attract")')['hits'])
                    check(worst == 0, f'{name} live attract orbit: 0 hits / 400 cells at 6 moments (worst {worst})')
                check(not errs, f'{name} seed {seed} fade={fade}: zero console errors {errs[:3]}')
                ctx.close()
    b.close()
print('ALL PASSED' if not fails else f'{len(fails)} FAILED')
sys.exit(1 if fails else 0)
