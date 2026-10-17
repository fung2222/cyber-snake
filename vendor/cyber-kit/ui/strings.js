// Common HUD / screen strings. Traditional Chinese (Hong Kong, Cantonese flavour) first, English subtitle second.
export const STR = {
  start: ['開始遊戲', 'START'],
  resume: ['繼續', 'RESUME'],
  retry: ['再嚟一鋪', 'RETRY'],
  menu: ['主畫面', 'MAIN MENU'],
  paused: ['已暫停', 'PAUSED'],
  gameOver: ['遊戲結束', 'GAME OVER'],
  newRecord: ['★ 新紀錄 NEW RECORD ★', ''],
  score: ['分數', 'SCORE'],
  best: ['最高分', 'BEST'],
  level: ['等級', 'LEVEL'],
  sound: ['聲音', 'SOUND'],
  mute: ['靜音', 'MUTE'],
  undo: ['復原', 'UNDO'],
  newGame: ['新一局', 'NEW GAME'],
  watchAd: ['睇廣告', 'WATCH AD'],
  noThanks: ['唔使喇', 'NO THANKS'],
  continue: ['繼續挑戰', 'CONTINUE'],
  loading: ['系統啟動中…', 'BOOTING…'],
  demo: ['DEMO · 自動示範', ''],
  privacy: ['私隱政策', 'PRIVACY POLICY'],
  adLabel: ['廣告', 'AD'],
  webgl: ['你的瀏覽器唔支援 WebGL，無法運行遊戲。', 'WebGL not available'],
  rewardOffline: ['暫時冇廣告可以睇，遲啲再試下。', 'No ad available right now.'],
};
/** "中文 English" helper */
export const t2 = (k) => STR[k] ? (STR[k][1] ? `${STR[k][0]} ${STR[k][1]}` : STR[k][0]) : k;
