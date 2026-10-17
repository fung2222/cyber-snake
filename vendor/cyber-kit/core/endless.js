// Endless-mode helpers shared by the CYBER games: a capped difficulty curve and milestone detection.
/**
 * Smoothly rising value that never exceeds `cap`: start + (cap - start) * (1 - e^(-n / tau)).
 * n = level / wave / floor index (0-based). Keeps endless play beatable: difficulty saturates instead of exploding.
 */
export function endlessCurve(n, { start = 0, cap = 1, tau = 12 } = {}) {
  return start + (cap - start) * (1 - Math.exp(-Math.max(0, n) / tau));
}
/** milestone number reached at n (every `every` steps), or 0 when n is not exactly on a milestone */
export function milestoneOf(n, every = 10) { return n > 0 && n % every === 0 ? n / every : 0; }
