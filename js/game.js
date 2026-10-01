// Pure grid-based Snake logic (no rendering).
import { GRID, speedFor, targetFor, pointsFor, layoutFor } from './levels.js';

export const DIRS = {
  up: { x: 0, z: -1 }, down: { x: 0, z: 1 }, left: { x: -1, z: 0 }, right: { x: 1, z: 0 },
};
const COMBO_WINDOW = 3.6; // seconds

export class SnakeGame {
  constructor(events = {}) {
    this.ev = events; // callbacks: onEat, onDie, onLevelUp, onTurn, onSpawnFood
    this.hi = 0;
    this.reset(1);
  }

  reset(level = 1) {
    this.level = level;
    this.score = 0;
    this.eatenThisLevel = 0;
    this.totalEaten = 0;
    const cz = GRID - 5, cx = Math.floor(GRID / 2);
    this.snake = [];
    for (let i = 0; i < 4; i++) this.snake.push({ x: cx, z: cz + i });
    this.prev = this.snake.map(s => ({ ...s }));
    this.dir = { ...DIRS.up };
    this.queue = [];
    this.grow = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.dead = false;
    this.deathReason = '';
    this.acc = 0;
    this.interval = speedFor(level);
    this.frozen = 0; // seconds of logic freeze (level-up transition)
    this.setObstacles(layoutFor(level));
    this.spawnFood();
  }

  setObstacles(list) {
    // never place obstacles on / right in front of the snake
    const head = this.snake[0];
    const avoid = new Set(this.snake.map(s => s.x + ',' + s.z));
    for (let i = 1; i <= 4; i++) avoid.add((head.x + this.dir.x * i) + ',' + (head.z + this.dir.z * i));
    this.obstacles = [];
    this.obstacleSet = new Set();
    for (const [x, z, h] of list) {
      const k = x + ',' + z;
      if (avoid.has(k)) continue;
      if (Math.abs(x - head.x) + Math.abs(z - head.z) <= 2) continue;
      this.obstacles.push({ x, z, h });
      this.obstacleSet.add(k);
    }
  }

  isFree(x, z, ignoreTail = false) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return false;
    if (this.obstacleSet.has(x + ',' + z)) return false;
    const n = ignoreTail && this.grow === 0 ? this.snake.length - 1 : this.snake.length;
    for (let i = 0; i < n; i++) if (this.snake[i].x === x && this.snake[i].z === z) return false;
    return true;
  }

  spawnFood() {
    const free = [];
    const occ = new Set(this.snake.map(s => s.x + ',' + s.z));
    const head = this.snake[0];
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
      const k = x + ',' + z;
      if (occ.has(k) || this.obstacleSet.has(k)) continue;
      if (Math.abs(x - head.x) + Math.abs(z - head.z) < 3) continue;
      free.push({ x, z });
    }
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    this.foodSpawnTime = performance.now();
    this.ev.onSpawnFood && this.ev.onSpawnFood(this.food);
  }

  // Input buffering: up to 2 queued turns, no 180° reversal relative to last queued dir
  queueDir(name) {
    const d = DIRS[name]; if (!d) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d.x === last.x && d.z === last.z) return false;
    if (d.x === -last.x && d.z === -last.z) return false;
    if (this.queue.length >= 2) return false;
    this.queue.push({ ...d });
    return true;
  }

  get alpha() { return Math.min(1, this.acc / this.interval); }

  update(dt) {
    if (this.dead) return;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen < 0.45 && !this.food) this.spawnFood();
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.interval && steps < 4 && !this.dead && this.frozen <= 0) {
      this.acc -= this.interval;
      this.step();
      steps++;
    }
    if (steps >= 4) this.acc = 0;
  }

  step() {
    if (this.ev.beforeStep) this.ev.beforeStep(this);
    if (this.queue.length) {
      const nd = this.queue.shift();
      this.dir = nd;
      this.ev.onTurn && this.ev.onTurn(nd);
    }
    const head = this.snake[0];
    const nx = head.x + this.dir.x, nz = head.z + this.dir.z;
    let reason = '';
    if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) reason = 'wall';
    else if (this.obstacleSet.has(nx + ',' + nz)) reason = 'obstacle';
    else {
      const n = this.grow > 0 ? this.snake.length : this.snake.length - 1; // tail moves away
      for (let i = 0; i < n; i++) if (this.snake[i].x === nx && this.snake[i].z === nz) { reason = 'self'; break; }
    }
    if (reason) {
      this.dead = true; this.deathReason = reason;
      this.prev = this.snake.map(s => ({ ...s }));
      this.acc = this.interval;
      this.ev.onDie && this.ev.onDie(reason, { x: nx, z: nz });
      return;
    }
    this.prev = this.snake.map(s => ({ ...s }));
    this.snake.unshift({ x: nx, z: nz });
    if (this.grow > 0) this.grow--; else this.snake.pop();

    if (this.food && nx === this.food.x && nz === this.food.z) this.eat();
  }

  eat() {
    this.grow += 1;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    const mult = 1 + Math.min(this.combo - 1, 4) * 0.5;
    const pts = Math.round(pointsFor(this.level) * mult);
    this.score += pts;
    this.eatenThisLevel++;
    this.totalEaten++;
    const at = { ...this.food };
    this.ev.onEat && this.ev.onEat({ at, pts, mult, combo: this.combo });
    if (this.eatenThisLevel >= targetFor(this.level)) {
      this.levelUp();
    } else {
      this.spawnFood();
    }
  }

  levelUp() {
    this.level++;
    this.eatenThisLevel = 0;
    this.interval = speedFor(this.level);
    this.queue.length = 0;
    this.frozen = 1.9;
    this.acc = 0;
    this.prev = this.snake.map(s => ({ ...s }));
    const oldObstacles = this.obstacles;
    this.setObstacles(layoutFor(this.level));
    this.food = null;
    this.ev.onLevelUp && this.ev.onLevelUp(this.level, oldObstacles);
  }

  get target() { return targetFor(this.level); }
}
