# CYBER SNAKE — deep audit 2026-11-03

Scope: 390px mobile start / play / pause, plus source review of food spawning, level layouts and audio. Read-only audit first; fixes tracked below.

## Findings

### 1. Food could spawn in a sealed pocket (high)
Procedural layout at **level 14** has eight free cells enclosed by obstacles. `spawnFood()` picked from every free cell on the board, so it could place the only food inside a pocket the snake can never reach. The player would then be stuck with no way to reach the target and clear the level.

Repro before fix: `node tests/reachability.test.mjs` → forced level-14 spawn picked `4,4` (sealed) → FAIL.

Fix: `SnakeGame.reachableCells()` flood-fills from the head through non-obstacle cells; `spawnFood()` now only considers reachable free cells. Snake body cells are not treated as permanent walls (they move), but occupied cells are still excluded.

### 2. BGM still had ambient hiss and noise percussion (high)
`js/audio.js` looped a filtered noise buffer in `startAmbient()` at 0.018 gain, and `playStep()` added a noise snare plus noise hats. This is the same headphone hiss Roy rejected in data-fuse / neon-recall / cyber-mini-pack.

Fix: `startAmbient()` / `stopAmbient()` are no-ops, and the BGM step now has no noise hits — kick, tonal snare body, bass, pad and arp remain. SFX noise stays transient.

### 3. Two opening animations (medium)
The boot overlay (`#loading`, "BOOTING NEURAL GRID…") sat on top of the title screen and faded out after 250 ms, so the first launch showed a boot animation followed by the title introduction. Roy asked to merge them into one.

Fix: removed the separate loading layer and its dead strings/CSS/references. The title screen is now the single intro. `fatal()` still shows the `#err` overlay if WebGL fails.

## UI check
390px start, play and pause screens: title, HUD panels, bottom progress, BOOST button and the four HUD buttons all fit; no overflow or console errors.

## Verification
- `node tests/reachability.test.mjs` — PASS (level 14)
- `node --test tests/audio.test.mjs` — 2/2 PASS
- `python tests/intro.py` — PASS (no `#loading`, one title screen)
- `python tests/smoke.py` — full run still has an old `#btn-lang` selector; not counted as a pass
