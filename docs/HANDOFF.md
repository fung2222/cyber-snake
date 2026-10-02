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
- Uses only cyber-kit v0.2.1 `core/i18n.js`, vendored standalone at `vendor/cyber-kit/core/i18n.js` (no other kit module adopted — lowest risk).
- Strings: `js/strings.js` (`{key: [zh-HK, en]}`). HTML uses `data-i18n`, `data-i18n-html`, `data-i18n-attr`. Dynamic text (level banner, death reason, WebGL error) via `t()` (imported as `tr` in `main.js` to avoid clashing with frame-time variables).
- Toggles: `#btn-lang` (start screen), `#btn-lang2` (pause). Persisted in `localStorage cyber.lang` (shared by all CYBER games); `?lang=en|zh` forces; default from `navigator.language`.
- 3D shop-sign textures in `world.js` remain Chinese/English decoration (in-world art, not UI).
- Added `<meta name="robots" content="noindex,nofollow">` and a bilingual `privacy.html`.

## 4. Tests
`python tests/smoke.py [url] [out]` — 412×915 touch + 1280×800: default language, toggle live + persisted, start, endless level 12 + level 20 milestone, pause/resume, forced wall death with translated reason, best level saved, demo, zero console errors. Last run 2026-10-02: see cyber-arcade ARCADE-HANDOFF.

## 5. Ads
Web build has no ads. If packaged: natural break = game-over screen (Retry/Menu), never mid-level or at a level-up banner.

## 6. Known issues / ideas
- Headless SwiftShader ≈ 3 FPS; tests poll state.
- Not on cyber-kit renderer/UI; a full port is possible but was out of scope (minimal-risk rule).
