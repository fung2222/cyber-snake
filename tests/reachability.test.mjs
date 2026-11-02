import { SnakeGame, DIRS } from '../js/game.js';
import { GRID } from '../js/levels.js';

function key(x, z) { return x + ',' + z; }

function reachableFromHead(game) {
  const head = game.snake[0];
  const seen = new Set([key(head.x, head.z)]);
  const q = [[head.x, head.z]];
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID || seen.has(k) || game.obstacleSet.has(k)) continue;
      seen.add(k); q.push([nx, nz]);
    }
  }
  return seen;
}

function freeCells(game) {
  const occ = new Set(game.snake.map(s => key(s.x, s.z)));
  const head = game.snake[0];
  const out = [];
  for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
    const k = key(x, z);
    if (occ.has(k) || game.obstacleSet.has(k)) continue;
    if (Math.abs(x - head.x) + Math.abs(z - head.z) < 3) continue;
    out.push({ x, z, k });
  }
  return out;
}

let failed = 0;
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failed++; }

for (const level of [14]) {
  const game = new SnakeGame();
  game.reset(level);
  const reachable = reachableFromHead(game);
  const free = freeCells(game);
  const sealed = free.filter(c => !reachable.has(c.k));
  check(sealed.length > 0, `level ${level} actually has a sealed free cell`);
  if (!sealed.length) continue;

  // Force spawnFood to pick the first sealed cell by making Math.random choose its index.
  const idx = free.findIndex(c => c.k === sealed[0].k);
  const oldRandom = Math.random;
  Math.random = () => (idx + 0.5) / free.length;
  game.food = null;
  game.spawnFood();
  const picked = game.food ? key(game.food.x, game.food.z) : null;
  Math.random = oldRandom;
  console.log(`level ${level}: sealed=${sealed.map(c => c.k).slice(0, 3)} picked=${picked}`);
  check(!!picked && reachable.has(picked), `level ${level} never spawns food inside a sealed pocket`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
