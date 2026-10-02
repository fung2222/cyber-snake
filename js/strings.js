// CYBER SNAKE string table {key: [zh-HK, en]} — uses cyber-kit v0.2.1 core/i18n.js (vendored standalone; the rest of the game predates the kit).
import { i18n } from '../vendor/cyber-kit/core/i18n.js';
i18n.add({
  'doc.title': ['賽博蛇 CYBER SNAKE · 霓虹九龍', 'CYBER SNAKE · Neon Kowloon'],
  score: ['分數', 'SCORE'], hi: ['最高分', 'HI-SCORE'], nextLevel: ['下一級', 'NEXT LEVEL'], level: ['等級', 'LEVEL'], length: ['長度', 'LENGTH'],
  pauseTip: ['暫停 (P / Esc)', 'Pause (P / Esc)'], camTip: ['切換鏡頭 (C)', 'Switch camera (C)'], muteTip: ['靜音 (M)', 'Mute (M)'],
  demo: ['DEMO · 自動示範', 'DEMO · AUTOPLAY'],
  title: ['賽博蛇', 'CYBER SNAKE'], titleEn: ['CYBER SNAKE', '賽博蛇'],
  tagline: ['喺霓虹九龍嘅數據網格入面，吞噬數據核心，不斷進化。關卡無盡，挑戰你嘅最遠紀錄。', 'Devour data cores in the neon grid of Kowloon and keep evolving. The levels never end — chase your best.'],
  start: ['開始遊戲', 'START'], startS: ['START · ENTER', 'ENTER'],
  keysMove: ['<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動', '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move'],
  keysOther: ['<kbd>P</kbd> / <kbd>Esc</kbd> 暫停　<kbd>M</kbd> 靜音　<kbd>C</kbd> 鏡頭', '<kbd>P</kbd> / <kbd>Esc</kbd> pause　<kbd>M</kbd> mute　<kbd>C</kbd> camera'],
  touchHint: ['手機：喺畫面上滑動控制方向', 'Touch: swipe on the screen to steer'],
  bestLevel: ['最遠等級（無盡紀錄）', 'ENDLESS BEST LEVEL'], privacy: ['私隱政策', 'Privacy'],
  paused: ['已暫停', 'PAUSED'], pausedS: ['PAUSED', '已暫停'], resume: ['繼續', 'RESUME'], menu: ['返回主畫面', 'MAIN MENU'], menuShort: ['主畫面', 'MENU'],
  overK: ['SYSTEM FAILURE', '系統崩潰'], over: ['系統崩潰', 'GAME OVER'], overS: ['GAME OVER', '系統崩潰'], newRecord: ['★ 新紀錄 ★', '★ NEW RECORD ★'],
  retry: ['再嚟一鋪', 'RETRY'], loading: ['BOOTING NEURAL GRID…', 'BOOTING NEURAL GRID…'],
  'death.wall': ['撞到能量牆', 'WALL COLLISION'], 'death.self': ['咬到自己', 'SELF COLLISION'], 'death.obstacle': ['撞到障礙物', 'OBSTACLE HIT'],
  levelN: ['第 {n} 關', 'LEVEL {n}'], levelUp: ['升級', 'LEVEL UP'], levelNote: ['速度提升 · {zone} · 目標 {target} 粒', 'SPEED UP · {zone} · TARGET {target}'],
  endless: ['無盡', 'ENDLESS'], milestone: ['里程碑！+{pts} 分', 'MILESTONE! +{pts}'],
  noWebgl: ['你的瀏覽器唔支援 WebGL，無法運行遊戲。', 'Your browser does not support WebGL, so the game cannot run.'],
});
export { i18n };
