import { t } from '../vendor/cyber-kit/core/i18n.js';
// DOM HUD / screens controller.
const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), score: $('hud-score'), hi: $('hud-hi'), level: $('hud-level'), length: $('hud-length'),
      prog: $('hud-progress'), progText: $('hud-progress-text'), ticks: $('hud-ticks'),
      combo: $('hud-combo'), comboVal: $('hud-combo-val'), comboFill: $('hud-combo-fill'),
      start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'),
      startHi: $('start-hi'), banner: $('banner'), bannerMain: $('banner-main'), bannerSub: $('banner-sub'), bannerNote: $('banner-note'),
      popups: $('popups'), flash: $('fx-flash'), mute: $('btn-mute'), fps: $('fps'), demo: $('demo-tag'),
      overScore: $('over-score'), overLevel: $('over-level'), overLength: $('over-length'), overHi: $('over-hi'), overReason: $('over-reason'), newrecord: $('newrecord'),
      loading: $('loading'),
    };
    this.last = {};
    this.lastTarget = -1;
  }

  setThemeCss(c1, c2, c3) {
    const r = document.documentElement.style;
    r.setProperty('--c1', c1); r.setProperty('--c2', c2); r.setProperty('--c3', c3);
  }

  show(name) {
    for (const k of ['start', 'pause', 'over']) this.el[k].classList.toggle('hidden', k !== name);
  }
  hud(on) { this.el.hud.classList.toggle('hidden', !on); }

  set(key, val) {
    if (this.last[key] === val) return;
    const el = this.el[key];
    el.textContent = val;
    if (this.last[key] !== undefined && (key === 'score' || key === 'level' || key === 'length')) {
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    this.last[key] = val;
  }

  update(g, hi) {
    this.set('score', g.score.toLocaleString('en-US'));
    this.set('hi', Math.max(hi, 0).toLocaleString('en-US'));
    this.set('level', String(g.level));
    this.set('length', String(g.snake.length + g.grow));
    const tgt = g.target;
    if (tgt !== this.lastTarget) {
      this.el.ticks.innerHTML = '<i></i>'.repeat(tgt);
      this.lastTarget = tgt;
    }
    const pct = Math.min(100, (g.eatenThisLevel / tgt) * 100);
    this.el.prog.style.width = pct + '%';
    this.el.progText.textContent = `${g.eatenThisLevel} / ${tgt}`;
    const comboOn = g.combo >= 2 && g.comboTimer > 0;
    this.el.combo.classList.toggle('on', comboOn);
    if (comboOn) {
      const mult = 1 + Math.min(g.combo - 1, 4) * 0.5;
      const txt = 'x' + mult.toFixed(1);
      if (this.el.comboVal.textContent !== txt) { this.el.comboVal.textContent = txt; this.el.combo.classList.remove('pop'); void this.el.combo.offsetWidth; this.el.combo.classList.add('pop'); }
      this.el.comboFill.style.width = Math.max(0, g.comboTimer / 3.6 * 100) + '%';
    }
  }

  popup(x, y, text, sub = '') {
    const d = document.createElement('div');
    d.className = 'popup';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }

  banner(main, sub, note) {
    const b = this.el.banner;
    this.el.bannerMain.textContent = main; this.el.bannerMain.dataset.text = main;
    this.el.bannerSub.textContent = sub; this.el.bannerNote.textContent = note;
    b.classList.remove('hidden');
    this.bannerT = 0;
    this.tickBanner(0);
  }

  tickBanner(dt) {
    if (this.bannerT === undefined || this.bannerT < 0) return;
    this.bannerT += dt;
    const bt = this.bannerT, b = this.el.banner;
    let op = 1, sx = 1, sy = 1, ty = 0, blur = 0;
    if (bt < 0.22) { const k = bt / 0.22; op = k; sx = 2.2 - 1.2 * k; sy = 0.2 + 0.8 * k; blur = 8 * (1 - k); }
    else if (bt > 1.7) { const k = Math.min(1, (bt - 1.7) / 0.4); op = 1 - k; ty = -30 * k; }
    b.style.opacity = op.toFixed(3);
    b.style.transform = `translateY(${ty}px) scale(${sx}, ${sy})`;
    b.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
    if (bt > 2.1) { b.classList.add('hidden'); this.bannerT = -1; }
  }

  flash(color = 'rgba(255,255,255,0.5)', ms = 300) {
    const f = this.el.flash;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0';
  }

  gameOver(g, hi, isRecord) {
    this.el.overScore.textContent = g.score.toLocaleString('en-US');
    this.el.overLevel.textContent = g.level;
    this.el.overLength.textContent = g.snake.length;
    this.el.overHi.textContent = hi.toLocaleString('en-US');
    this.el.overReason.textContent = g.deathReason ? t('death.' + g.deathReason) : '';
    this.el.newrecord.classList.toggle('hidden', !isRecord);
    this.show('over');
  }

  setMuted(m) { this.el.mute.classList.toggle('muted', m); }
}
