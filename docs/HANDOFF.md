# CYBER SNAKE 賽博蛇 — Handoff

Live: https://fung2222.github.io/cyber-snake/ · Demo: `?demo=1` · part of CYBER ARCADE (`fung2222/cyber-arcade`).
CYBER SNAKE predates cyber-kit; it has its own renderer/effects/UI. v1.1 (2026-10-02) made minimal-risk changes only.

## 1. Design
True-3D snake on a 20×20 neon grid. Eat cores → grow + score (combo up to ×3). Each level: target cores (5 → 10), faster tick (0.155 s → 0.062 s cap), new obstacle layout, theme shift (6 HK district palettes).

## 2. Endless mode (v1.1)
- Levels never end; there is no final level. Levels 1–6 use authored layouts; 7+ are procedural symmetric layouts seeded by level (`layoutFor`).
- Capped curve: `speedFor` floor 0.062 s/tick (reached at level 9), `targetFor` cap 10, procedural obstacle count cap 10.
- Milestones: every `MILESTONE_EVERY` = 10 levels → `milestoneBonus(level)` = 500 × level/10 points + milestone banner. Banner shows `ENDLESS` past level 6.
- Records: hi-score (`cyberSnake.hi`) and best level (`cyberSnake.bestLevel`, the endless record, shown on the start screen).
- Test hook: `window.__snake.levelTo(n)`.

## 3. Bilingual zh-HK / en (v1.1)
- Uses only cyber-kit v0.3.0 `core/i18n.js`, vendored standalone at `vendor/cyber-kit/core/i18n.js` (no other kit module adopted — lowest risk).
- Strings: `js/strings.js` (`{key: [zh-HK, en]}`). HTML uses `data-i18n`, `data-i18n-html`, `data-i18n-attr`. Dynamic text (level banner, death reason, WebGL error) via `t()` (imported as `tr` in `main.js` to avoid clashing with frame-time variables).
- Toggles: `#btn-lang` (start screen), `#btn-lang2` (pause). Persisted in `localStorage cyber.lang` (shared by all CYBER games); `?lang=en|zh` forces; default from `navigator.language`.
- 3D shop-sign textures in `world.js` remain Chinese/English decoration (in-world art, not UI).
- Added `<meta name="robots" content="noindex,nofollow">` and a bilingual `privacy.html`.

## 4. Tests
`python tests/occlusion.py [url] [seeds]` — scenery-occlusion raycasts (see §7). `python tests/occlusion_shots.py URL OUT PREFIX [seed]` — snake parked in the bottom-right corner at 412×915 + 1280×800.
`python tests/smoke.py [url] [out]` — 412×915 touch + 1280×800: default language, toggle live + persisted, start, endless level 12 + level 20 milestone, pause/resume, forced wall death with translated reason, best level saved, demo, zero console errors. Last run 2026-10-02: see cyber-arcade ARCADE-HANDOFF.

## 5. Ads
Web build has no ads. If packaged: natural break = game-over screen (Retry/Menu), never mid-level or at a level-up banner.

## 6. Known issues / ideas
- Headless SwiftShader ≈ 3 FPS; tests poll state.
- Not on cyber-kit renderer/UI; a full port is possible but was out of scope (minimal-risk rule).
- Portrait follow camera frames the arena from far back (fit 2.3): with the snake on one side, the opposite arena edge can be outside the screen (framing, not occlusion; unchanged).

## Audio loudness + glow (2026-10-03, matches cyber-kit v0.3.0)
- `js/audio.js` keeps its own engine but now uses the kit chain: buses → glue compressor (−16 dB, 2.5:1) → limiter (−4 dB, 20:1) → soft clip → `out` (mute). `MUSIC_TRIM_DB` 3.9 / `SFX_TRIM_DB` 3.5 put the music at ≈ −20 LUFS and the SFX/BGM ratio near 0 dB like every other CYBER game (measure with cyber-kit `tests/loudness.py … cyber-snake:AudioEngine:snake`).
- Glow: `?glow=low|high` / shared `localStorage cyber.glow`, default LOW (bloom ×0.45, radius 0.25, threshold 0.92, less aberration). Pause screen GLOW button (`#btn-glow`). Fog density 0.017 → 0.012.

## 7. Scenery occlusion fix (2026-10-06)
**Bug (Roy, Android portrait ≈ 412×915):** near the bottom-right corner the snake vanished behind city buildings.
**Root cause:** the random skyline only kept a fixed clear square (|x|,|z| ≥ 27, buildings 10–40 tall from r ≈ 31), but on portrait screens every camera is pushed back by `fit` = 1.25/aspect (capped 2.3): the chase camera sits at z ≈ 33–35, y ≈ 26, the top camera at (0, 57.5, 34.5) and the attract/game-over orbit at r = 33, y 8–11, i.e. *inside* the building ring. Towers between camera and arena (often the camera was inside one) hid the near (bottom) edge and corners. Desktop (fit 1, camera z ≤ 19) was not affected.
**Fix (structural + safety):**
- `js/camrig.js` — single source of truth for camera poses (`followPose`, `topPose`, `orbitPose`, `shakeOffset`, `fitFor`) used by `main.js`, plus `cameraEnvelope()`: sampled positions for every mode, fit 1…2.3 (any aspect / rotation), head anywhere, any heading.
- `World.buildSightField()` — top-down height cap (0.5-unit grid) = lowest camera→arena-edge sight line over each spot (rays to the arena perimeter cover every cell: anything ground-based that blocks an inner cell also blocks the perimeter point below where that ray crosses the edge). City placement: footprint inflated by `SIGHT.MARGIN` 1.0 (shake + slop); a building taller than cap − 0.8 becomes a low neon **podium** under the sight lines, or is dropped if < 3 high. Signs must sit fully under the cap. Full-height towers now start ≈ r 40 in the camera's direction; podiums ring the near side. Cost ≈ 35 ms at load.
- `World.updateOcclusion()` (called after the camera each frame) — safety fade: any registered occluder (buildings under a sight line, signs, corner pylons) whose box crosses camera → snake head / food / arena edge samples dithers to 12 % (holographic Bayer dither, neon edges kept; pylons/signs via opacity). In practice it only fires for the corner pylons when the low title/game-over orbit lines up with a diagonal. `?nofade=1` disables it (tests).
- Test hooks on `window.__snake`: `THREE, world, camera, rig, cellToWorld, snakeView, camMode, setCamMode()`; `world.scenery` = every scenery mesh.
**Test:** `tests/occlusion.py` raycasts (THREE.Raycaster on the real scene, against `world.scenery`) — (1) envelope: follow (head on every cell → head cell; 9 heads → all 400 cells), top, orbit; fits = viewport + 1/1.65/2.3; no shake + 8 shake-box corners; run with `?nofade=1` (structural: zero building/sign/billboard hits in all modes, zero pylon hits in follow/top) and with the fade (zero hits of anything); (2) live game at levels 1–7, 12, 20: follow + top with the snake in all 4 corners and on all 4 edges (level 1) / bottom-right (others), camera transitions, attract orbit — all 400 cells; plus a negative-control self-test (injected tower must be detected). 412×915 touch + 1280×800, seeds 1,2,3. Last run 2026-10-06: ALL PASSED (99 checks), smoke ALL PASSED.
**Known gaps:** fade on a real 60 fps device takes ≈ 0.1–0.3 s (only reachable during camera swings / pylon diagonals); energy walls/rails, rain, dust and traffic sprites are not treated as occluders (additive/transparent); the envelope is sampled (dense + inflated margins), not analytic. If camera code changes, update `camrig.js` (the layout and the test follow it automatically).
