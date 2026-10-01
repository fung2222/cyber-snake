// Simple autopilot for demo / attract mode: BFS to food + flood-fill safety.
import { GRID } from './levels.js';
import { DIRS } from './game.js';

const NAMES = ['up', 'down', 'left', 'right'];

function buildBlocked(g) {
  const b = new Uint8Array(GRID * GRID);
  for (const o of g.obstacles) b[o.z * GRID + o.x] = 1;
  const n = g.grow > 0 ? g.snake.length : g.snake.length - 1;
  for (let i = 0; i < n; i++) b[g.snake[i].z * GRID + g.snake[i].x] = 1;
  return b;
}

function flood(b, sx, sz, limit) {
  const seen = new Uint8Array(GRID * GRID);
  const q = [sz * GRID + sx]; seen[q[0]] = 1; let c = 0;
  while (q.length && c < limit) {
    const k = q.pop(); c++;
    const x = k % GRID, z = (k / GRID) | 0;
    for (const d of NAMES) {
      const nx = x + DIRS[d].x, nz = z + DIRS[d].z;
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
      const nk = nz * GRID + nx;
      if (seen[nk] || b[nk]) continue;
      seen[nk] = 1; q.push(nk);
    }
  }
  return c;
}

export function aiChoose(g) {
  const head = g.snake[0];
  const dir = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
  const b = buildBlocked(g);
  const cands = NAMES.filter(n => {
    const d = DIRS[n];
    if (d.x === -dir.x && d.z === -dir.z) return false;
    const nx = head.x + d.x, nz = head.z + d.z;
    return nx >= 0 && nz >= 0 && nx < GRID && nz < GRID && !b[nz * GRID + nx];
  });
  if (!cands.length) return null;

  // BFS to food
  let first = null;
  if (g.food) {
    const prev = new Int32Array(GRID * GRID).fill(-1);
    const start = head.z * GRID + head.x;
    prev[start] = start;
    const q = [start]; let qi = 0; let found = -1;
    const goal = g.food.z * GRID + g.food.x;
    while (qi < q.length) {
      const k = q[qi++];
      if (k === goal) { found = k; break; }
      const x = k % GRID, z = (k / GRID) | 0;
      for (const n of NAMES) {
        const nx = x + DIRS[n].x, nz = z + DIRS[n].z;
        if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
        const nk = nz * GRID + nx;
        if (prev[nk] !== -1 || b[nk]) continue;
        if (k === start) { const d = DIRS[n]; if (d.x === -dir.x && d.z === -dir.z) continue; }
        prev[nk] = k; q.push(nk);
      }
    }
    if (found >= 0) {
      let k = found;
      while (prev[k] !== start) k = prev[k];
      const x = k % GRID, z = (k / GRID) | 0;
      first = NAMES.find(n => head.x + DIRS[n].x === x && head.z + DIRS[n].z === z);
    }
  }
  const need = Math.min(g.snake.length + 4, 120);
  const score = n => {
    const d = DIRS[n]; const nx = head.x + d.x, nz = head.z + d.z;
    b[nz * GRID + nx] = 1; const f = flood(b, nx, nz, 400); b[nz * GRID + nx] = 0;
    return f;
  };
  if (first && cands.includes(first)) {
    const f = score(first);
    if (f >= need) return first;
  }
  // fall back: maximise free space, tie-break toward food, prefer straight
  let best = null, bestS = -1;
  for (const n of cands) {
    let s = score(n) * 10;
    if (g.food) { const d = DIRS[n]; s -= (Math.abs(head.x + d.x - g.food.x) + Math.abs(head.z + d.z - g.food.z)) * 0.5; }
    if (DIRS[n].x === dir.x && DIRS[n].z === dir.z) s += 1;
    if (s > bestS) { bestS = s; best = n; }
  }
  return best;
}
