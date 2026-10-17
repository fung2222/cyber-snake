// DOM HUD helper: screens, level banner, score popups, colour flash, toasts, confirm modal (used for rewarded-ad
// offers), loading / fatal error. Works with ui/hud.css. Missing containers are created automatically.
// v0.3.9: home icon bar (house / book / gear), optical brand+CTA layout, howto tabs + settings sheet.
import { t, getLang, setLang } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
function ensure(id, cls, html = '') {
  let e = $(id);
  if (!e) { e = document.createElement('div'); e.id = id; if (cls) e.className = cls; e.innerHTML = html; document.body.appendChild(e); }
  return e;
}

const ICO = {
  home: '<svg class="menu-ico" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" d="M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-3v6H5a1 1 0 0 1-1-1v-8.5z" fill="none" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  book: '<svg class="menu-ico" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" d="M5 4.5h6.5A2.5 2.5 0 0 1 14 7v13.5H7A2 2 0 0 1 5 18.5v-14zM19 4.5h-6.5A2.5 2.5 0 0 0 10 7v13.5h7A2 2 0 0 0 19 18.5v-14z" fill="none" stroke-width="1.7" stroke-linejoin="round"/><path stroke="currentColor" d="M12 7.2v13" fill="none" stroke-width="1.5"/></svg>',
  gear: '<svg class="menu-ico" viewBox="0 0 24 24" aria-hidden="true"><circle stroke="currentColor" cx="12" cy="12" r="3.1" fill="none" stroke-width="1.7"/><path stroke="currentColor" d="M12 3.4l.7 2.1a6.8 6.8 0 0 1 1.9.8l2.1-.8 1.4 2.4-1.6 1.5c.2.6.3 1.2.3 1.8s-.1 1.2-.3 1.8l1.6 1.5-1.4 2.4-2.1-.8a6.8 6.8 0 0 1-1.9.8l-.7 2.1h-2.8l-.7-2.1a6.8 6.8 0 0 1-1.9-.8l-2.1.8L3.9 15l1.6-1.5A6.8 6.8 0 0 1 5.2 12c0-.6.1-1.2.3-1.8L3.9 8.7 5.3 6.3l2.1.8a6.8 6.8 0 0 1 1.9-.8l.7-2.1H12z" fill="none" stroke-width="1.45" stroke-linejoin="round"/></svg>',
};

function topRight() {
  return document.querySelector('.menu-home .menu-top-right') || document.querySelector('.menu-top-right');
}
function homeRoot() {
  return document.querySelector('.menu-home') || $('screen-start');
}
function markIconBar() {
  const root = homeRoot();
  if (root) root.classList.add('ck-iconbar');
}
function iconBtn(id, ico, labelKey) {
  let b = $(id);
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'menu-icon-btn';
  } else {
    b.classList.add('menu-icon-btn');
    b.classList.remove('neon-btn', 'ghost', 'menu-howto', 'lang-btn');
  }
  b.innerHTML = ico;
  const paint = () => {
    const lab = t(labelKey);
    b.setAttribute('aria-label', lab);
    b.title = lab;
  };
  paint();
  if (typeof window !== 'undefined') window.addEventListener('cyber:langchange', paint);
  return b;
}

export class CyberUI {
  /** @param {{screens?: string[]}} [o]  screen names map to elements with id "screen-<name>" */
  constructor(o = {}) {
    this.screenNames = o.screens || ['start', 'pause', 'over'];
    this.current = null;
    this.el = {
      hud: $('hud'),
      flash: ensure('fx-flash', ''),
      popups: ensure('popups', ''),
      banner: ensure('banner', 'banner hidden', '<div class="banner-sub"></div><div class="banner-main"></div><div class="banner-note"></div>'),
      toast: ensure('ck-toast', 'ck-toast hidden'),
      loading: $('loading'),
      mute: $('btn-mute'),
    };
    this.el.bannerSub = this.el.banner.querySelector('.banner-sub');
    this.el.bannerMain = this.el.banner.querySelector('.banner-main');
    this.el.bannerNote = this.el.banner.querySelector('.banner-note');
    this.bannerT = -1;
    this._settings = null;
  }
  screen(name) { return $('screen-' + name); }
  /** show one screen by name (or null to hide all) */
  show(name) {
    this.current = name;
    for (const k of this.screenNames) {
      const e = this.screen(k); if (!e) continue;
      const on = k === name;
      e.classList.toggle('hidden', !on);
      // Inline !important beats any leftover .menu-home { display:flex !important } in cached CSS
      if (on) e.style.removeProperty('display');
      else e.style.setProperty('display', 'none', 'important');
    }
  }
  hud(on) { if (this.el.hud) this.el.hud.classList.toggle('hidden', !on); }
  loaded(delay = 250) { setTimeout(() => this.el.loading && this.el.loading.classList.add('done'), delay); }
  fatal(msg) {
    const e = ensure('err', 'err'); e.textContent = '⚠ ' + msg; e.classList.remove('hidden');
    this.el.loading && this.el.loading.classList.add('done');
  }
  /** bind a click handler to #id; stops propagation and blurs the button so Space/Enter don't re-trigger */
  on(id, fn) { const e = $(id); if (!e) return; e.addEventListener('click', (ev) => { ev.stopPropagation(); fn(ev); e.blur(); }); }
  setText(id, v) { const e = typeof id === 'string' ? $(id) : id; if (e && e.textContent !== String(v)) e.textContent = v; }
  bump(el) { el = typeof el === 'string' ? $(el) : el; if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  setMuted(m) { if (this.el.mute) this.el.mute.classList.toggle('muted', !!m); }
  /**
   * v0.3.0: "GLOW: LOW / HIGH" button (shared preference, localStorage cyber.glow). Uses #btn-glow if the page has one,
   * otherwise inserts a ghost neon button right after #<after> (default: the pause screen's resume button).
   */
  glowToggle(stage, { after = 'btn-resume', id = 'btn-glow', onChange = null } = {}) {
    if (!stage || !stage.setGlow) return null;
    let b = $(id);
    if (!b) {
      const ref = $(after); if (!ref) return null;
      b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'neon-btn ghost ck-glow-btn';
      ref.insertAdjacentElement('afterend', b);
    }
    const paint = () => { b.textContent = t('kit.glow', { v: t(stage.glow === 'high' ? 'kit.glowHigh' : 'kit.glowLow') }); b.title = t('kit.glowHint'); b.dataset.glow = stage.glow; };
    b.addEventListener('click', (ev) => { ev.stopPropagation(); stage.toggleGlow({ persist: true }); b.blur(); if (onChange) onChange(stage.glow); });
    stage.onGlow(paint);
    if (typeof window !== 'undefined') window.addEventListener('cyber:langchange', paint);
    paint();
    return b;
  }

  /** floating score text at CSS pixel (x, y) */
  popup(x, y, text, sub = '', cls = '') {
    const d = document.createElement('div');
    d.className = 'popup ' + cls;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; d.appendChild(s); }
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }
  /** big centred banner (level up / milestone). Call tick(dt) every frame. */
  banner(main, sub = '', note = '') {
    this.el.bannerMain.textContent = main; this.el.bannerMain.dataset.text = main;
    this.el.bannerSub.textContent = sub; this.el.bannerNote.textContent = note;
    this.el.banner.classList.remove('hidden');
    this.bannerT = 0; this.tick(0);
  }
  tick(dt) {
    if (this.bannerT < 0) return;
    this.bannerT += dt;
    const t0 = this.bannerT, b = this.el.banner;
    let op = 1, sx = 1, sy = 1, ty = 0, blur = 0;
    if (t0 < 0.22) { const k = t0 / 0.22; op = k; sx = 2.2 - 1.2 * k; sy = 0.2 + 0.8 * k; blur = 8 * (1 - k); }
    else if (t0 > 1.7) { const k = Math.min(1, (t0 - 1.7) / 0.4); op = 1 - k; ty = -30 * k; }
    b.style.opacity = op.toFixed(3);
    b.style.transform = `translateY(${ty}px) scale(${sx}, ${sy})`;
    b.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
    if (t0 > 2.1) { b.classList.add('hidden'); this.bannerT = -1; }
  }
  flash(color = 'rgba(255,255,255,0.5)', ms = 300) {
    const f = this.el.flash;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0';
  }
  toast(text, ms = 1800) {
    const e = this.el.toast; e.textContent = text; e.classList.remove('hidden', 'out'); void e.offsetWidth; e.classList.add('in');
    clearTimeout(this._tt); this._tt = setTimeout(() => { e.classList.add('out'); setTimeout(() => e.classList.add('hidden'), 300); }, ms);
  }
  /**
   * Neon confirm modal. Resolves true (ok) / false (cancel / back).
   * @param {{kicker?:string,title:string,text?:string,ok?:string,okSmall?:string,cancel?:string,cancelSmall?:string,icon?:string}} o
   */
  confirm(o) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'screen ck-modal';
      m.innerHTML = `<div class="panel small">
        ${o.kicker ? `<div class="kicker"></div>` : ''}
        <h2 class="title2 ck-modal-title"></h2>
        ${o.text ? `<p class="tagline ck-modal-text"></p>` : ''}
        <button class="neon-btn" data-ok><span></span><small></small></button>
        <button class="neon-btn ghost" data-cancel><span></span><small></small></button></div>`;
      if (o.kicker) m.querySelector('.kicker').textContent = o.kicker;
      m.querySelector('.ck-modal-title').textContent = o.title;
      if (o.text) m.querySelector('.ck-modal-text').textContent = o.text;
      const ok = m.querySelector('[data-ok]'), cancel = m.querySelector('[data-cancel]');
      ok.querySelector('span').textContent = o.ok || t('kit.watchAd'); ok.querySelector('small').textContent = o.okSmall ?? '';
      cancel.querySelector('span').textContent = o.cancel || t('kit.noThanks'); cancel.querySelector('small').textContent = o.cancelSmall ?? '';
      const done = (v) => { m.remove(); this._modal = null; resolve(v); };
      ok.addEventListener('click', (e) => { e.stopPropagation(); done(true); });
      cancel.addEventListener('click', (e) => { e.stopPropagation(); done(false); });
      this._modal = { close: () => done(false) };
      document.body.appendChild(m);
      ok.focus({ preventScroll: true });
    });
  }

  /** Restyle #btn-arcade-menu into a house icon (keeps existing hub gate / click handlers). */
  styleHubHome() {
    markIconBar();
    const b = $('btn-arcade-menu');
    if (!b) return null;
    b.classList.add('menu-icon-btn');
    b.classList.remove('neon-btn', 'ghost');
    b.innerHTML = ICO.home;
    const paint = () => {
      const lab = t('kit.arcadeMenu');
      b.setAttribute('aria-label', lab);
      b.title = lab;
    };
    paint();
    if (typeof window !== 'undefined' && !b.dataset.ckHomePaint) {
      b.dataset.ckHomePaint = '1';
      window.addEventListener('cyber:langchange', paint);
    }
    return b;
  }

  /**
   * Bilingual How-to sheet with tabs 玩法｜操控｜私隱 (v0.3.9).
   * @param {{title?:string, kicker?:string, sections?:{heading:string, body:string}[],
   *   rules?:string, controls?:string, privacyHtml?:string, privacyUrl?:string,
   *   closeLabel?:string, closeSmall?:string, tab?:'rules'|'controls'|'privacy'}} o
   */
  howto(o = {}) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'screen ck-modal ck-howto';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');

      const secs = o.sections || [];
      let rules = o.rules || '';
      let controls = o.controls || '';
      for (const s of secs) {
        const h = (s.heading || '').toLowerCase();
        if (!rules && (h.includes('規則') || h.includes('玩法') || h.includes('rule') || h.includes(t('kit.rules').toLowerCase()) || h.includes(t('kit.howto').toLowerCase()))) rules = s.body || '';
        else if (!controls && (h.includes('操作') || h.includes('操控') || h.includes('control') || h.includes(t('kit.controls').toLowerCase()))) controls = s.body || '';
        else if (!rules) rules = s.body || '';
        else if (!controls) controls = s.body || '';
      }
      if (!rules && secs[0]) rules = secs[0].body || '';
      if (!controls && secs[1]) controls = secs[1].body || '';

      const privacyUrl = o.privacyUrl || './privacy.html';
      const privacyHtml = o.privacyHtml || (
        `<p>${t('kit.privacyBlurb')}</p>` +
        `<p><a class="ck-howto-link" href="${privacyUrl}" target="_blank" rel="noopener">${t('kit.privacyFull')}</a></p>`
      );

      m.innerHTML = `<div class="panel ck-howto-panel">
        ${o.kicker ? '<div class="kicker ck-howto-kicker"></div>' : ''}
        <h2 class="title2 ck-howto-title"></h2>
        <div class="ck-tabs" role="tablist">
          <button type="button" class="ck-tab" data-tab="rules" role="tab"></button>
          <button type="button" class="ck-tab" data-tab="controls" role="tab"></button>
          <button type="button" class="ck-tab" data-tab="privacy" role="tab"></button>
        </div>
        <div class="ck-howto-scroll">
          <div class="ck-tab-panel" data-panel="rules"></div>
          <div class="ck-tab-panel hidden" data-panel="controls"></div>
          <div class="ck-tab-panel hidden" data-panel="privacy"></div>
        </div>
        <button type="button" class="neon-btn" data-ok><span></span><small></small></button>
      </div>`;
      if (o.kicker) m.querySelector('.ck-howto-kicker').textContent = o.kicker;
      m.querySelector('.ck-howto-title').textContent = o.title || t('kit.howto');
      m.querySelector('[data-tab="rules"]').textContent = t('kit.tabRules');
      m.querySelector('[data-tab="controls"]').textContent = t('kit.tabControls');
      m.querySelector('[data-tab="privacy"]').textContent = t('kit.tabPrivacy');
      m.querySelector('[data-panel="rules"]').innerHTML = rules || `<p class="ck-howto-empty">${t('kit.howto')}</p>`;
      m.querySelector('[data-panel="controls"]').innerHTML = controls || `<p class="ck-howto-empty">${t('kit.controls')}</p>`;
      m.querySelector('[data-panel="privacy"]').innerHTML = privacyHtml;

      const showTab = (name) => {
        m.querySelectorAll('.ck-tab').forEach((el) => el.classList.toggle('on', el.dataset.tab === name));
        m.querySelectorAll('.ck-tab-panel').forEach((el) => el.classList.toggle('hidden', el.dataset.panel !== name));
      };
      m.querySelectorAll('.ck-tab').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); showTab(el.dataset.tab); el.blur(); });
      });
      showTab(o.tab || 'rules');

      const ok = m.querySelector('[data-ok]');
      ok.querySelector('span').textContent = o.closeLabel || t('kit.howtoClose');
      ok.querySelector('small').textContent = o.closeSmall ?? t('kit.howtoCloseS');
      const done = () => { m.remove(); this._modal = null; resolve(true); };
      ok.addEventListener('click', (e) => { e.stopPropagation(); done(); });
      m.addEventListener('click', (e) => { if (e.target === m) done(); });
      this._modal = { close: () => done() };
      document.body.appendChild(m);
      ok.focus({ preventScroll: true });
    });
  }

  /**
   * Mount book icon on home menu (top-right). Hides text privacy/lang clutter; folds privacy into howto tabs.
   * @param {{getContent:()=>object, id?:string, onOpen?:Function, privacyUrl?:string, privacyHtml?:string}} o
   */
  mountHowto(o = {}) {
    if (!o.getContent) return null;
    this.styleHubHome();
    markIconBar();
    const id = o.id || 'btn-howto';
    const b = iconBtn(id, ICO.book, 'kit.howto');
    const right = topRight();
    if (right) {
      // Remove text clutter: privacy link + start-screen lang (lang lives in settings / pause)
      right.querySelectorAll('.menu-privacy, a.menu-privacy').forEach((el) => { el.classList.add('ck-bar-hide'); });
      right.querySelectorAll('.lang-btn, #btn-lang').forEach((el) => {
        if (el.closest('.menu-top')) el.classList.add('ck-bar-hide');
      });
      if (!b.parentElement) {
        const gear = right.querySelector('#btn-settings-home, .menu-settings');
        if (gear) right.insertBefore(b, gear);
        else right.appendChild(b);
      }
    } else if (!b.parentElement) {
      document.body.appendChild(b);
    }
    if (!b.dataset.ckHowtoBound) {
      b.dataset.ckHowtoBound = '1';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.blur();
        if (o.onOpen) try { o.onOpen(); } catch (_) {}
        const content = o.getContent() || {};
        if (o.privacyUrl && !content.privacyUrl) content.privacyUrl = o.privacyUrl;
        if (o.privacyHtml && !content.privacyHtml) content.privacyHtml = o.privacyHtml;
        this.howto(content);
      });
    }
    this._howtoOpts = o;
    return b;
  }

  /**
   * Settings sheet: language, mute/volume, glow, optional extras.
   * @param {{title?:string, audio?:object, stage?:object, extras?:Array, getGlow?:Function, setGlow?:Function, onOpen?:Function}} o
   */
  settings(o = {}) {
    return new Promise((resolve) => {
      const audio = o.audio || null;
      const stage = o.stage || null;
      const m = document.createElement('div');
      m.className = 'screen ck-modal ck-settings';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');

      const hasVol = !!(audio && typeof audio.setVolume === 'function');
      const hasMute = !!(audio && typeof audio.toggleMute === 'function');
      const hasGlow = !!(stage && typeof stage.toggleGlow === 'function') || (typeof o.getGlow === 'function' && typeof o.setGlow === 'function');

      m.innerHTML = `<div class="panel ck-settings-panel">
        <div class="kicker ck-settings-kicker"></div>
        <h2 class="title2 ck-settings-title"></h2>
        <div class="ck-settings-body"></div>
        <button type="button" class="neon-btn" data-ok><span></span><small></small></button>
      </div>`;
      m.querySelector('.ck-settings-kicker').textContent = t('kit.settingsK');
      m.querySelector('.ck-settings-title').textContent = o.title || t('kit.settings');
      const body = m.querySelector('.ck-settings-body');

      const row = (label, controlHtml) => {
        const d = document.createElement('div');
        d.className = 'ck-set-row';
        d.innerHTML = `<div class="ck-set-label"></div><div class="ck-set-ctrl"></div>`;
        d.querySelector('.ck-set-label').textContent = label;
        d.querySelector('.ck-set-ctrl').innerHTML = controlHtml;
        body.appendChild(d);
        return d;
      };

      // Language
      {
        const r = row(t('kit.language'), `<div class="ck-seg" data-set="lang">
          <button type="button" data-v="zh-HK">中</button>
          <button type="button" data-v="en">EN</button>
        </div>`);
        const paintLang = () => {
          const cur = getLang();
          r.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
        };
        paintLang();
        r.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            setLang(b.dataset.v);
            paintLang();
            // refresh sheet labels
            m.querySelector('.ck-settings-kicker').textContent = t('kit.settingsK');
            m.querySelector('.ck-settings-title').textContent = o.title || t('kit.settings');
            ok.querySelector('span').textContent = t('kit.howtoClose');
            ok.querySelector('small').textContent = t('kit.howtoCloseS');
            body.querySelectorAll('.ck-set-label').forEach((lab, i) => {
              // labels re-painted below via rebuild is heavy; just update known ones
            });
            r.querySelector('.ck-set-label').textContent = t('kit.language');
            const muteRow = body.querySelector('[data-row="mute"] .ck-set-label');
            if (muteRow) muteRow.textContent = t('kit.mute');
            const volRow = body.querySelector('[data-row="vol"] .ck-set-label');
            if (volRow) volRow.textContent = t('kit.volume');
            const glowRow = body.querySelector('[data-row="glow"] .ck-set-label');
            if (glowRow) glowRow.textContent = t('kit.glowLabel');
            b.blur();
          });
        });
      }

      if (hasMute) {
        const r = row(t('kit.mute'), `<button type="button" class="ck-toggle" data-set="mute"></button>`);
        r.dataset.row = 'mute';
        const btn = r.querySelector('[data-set="mute"]');
        const paint = () => {
          const on = !!audio.muted;
          btn.classList.toggle('on', on);
          btn.textContent = on ? t('kit.muteOn') : t('kit.muteOff');
        };
        paint();
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          try { audio.init && audio.init(); } catch (_) {}
          audio.toggleMute();
          this.setMuted(audio.muted);
          paint();
          btn.blur();
        });
      }

      if (hasVol) {
        const vols = (typeof audio.getVolumes === 'function' ? audio.getVolumes() : null) || { master: audio.volume ?? 1 };
        const r = row(t('kit.volume'), `<input type="range" min="0" max="100" step="1" class="ck-slider" data-set="vol" value="${Math.round((vols.master ?? 1) * 100)}"/>`);
        r.dataset.row = 'vol';
        const sl = r.querySelector('[data-set="vol"]');
        sl.addEventListener('input', () => {
          try { audio.init && audio.init(); } catch (_) {}
          audio.setVolume(sl.value / 100, 'master');
        });
      }

      if (hasGlow) {
        const r = row(t('kit.glowLabel'), `<div class="ck-seg" data-set="glow">
          <button type="button" data-v="low"></button>
          <button type="button" data-v="high"></button>
        </div>`);
        r.dataset.row = 'glow';
        const getG = () => (typeof o.getGlow === 'function' ? o.getGlow() : stage.glow) || 'low';
        const setG = (v) => {
          if (typeof o.setGlow === 'function') o.setGlow(v);
          else if (stage && stage.setGlow) stage.setGlow(v, { persist: true });
        };
        const paint = () => {
          const cur = getG();
          const low = r.querySelector('[data-v="low"]');
          const high = r.querySelector('[data-v="high"]');
          low.textContent = t('kit.glowLow');
          high.textContent = t('kit.glowHigh');
          low.classList.toggle('on', cur === 'low');
          high.classList.toggle('on', cur === 'high');
        };
        paint();
        r.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            setG(b.dataset.v);
            paint();
            b.blur();
          });
        });
      }

      // Custom extras: { id, labelKey|label, type:'toggle'|'seg', options?:[{v,labelKey}], get, set }
      for (const ex of (o.extras || [])) {
        const label = ex.labelKey ? t(ex.labelKey) : (ex.label || ex.id);
        if (ex.type === 'toggle') {
          const r = row(label, `<button type="button" class="ck-toggle" data-ex="${ex.id}"></button>`);
          const btn = r.querySelector('button');
          const paint = () => {
            const on = !!ex.get();
            btn.classList.toggle('on', on);
            btn.textContent = on ? (ex.onLabel ? t(ex.onLabel) : t('kit.on')) : (ex.offLabel ? t(ex.offLabel) : t('kit.off'));
          };
          paint();
          btn.addEventListener('click', (e) => { e.stopPropagation(); ex.set(!ex.get()); paint(); btn.blur(); });
        } else if (ex.type === 'seg' && ex.options) {
          const html = `<div class="ck-seg" data-ex="${ex.id}">${ex.options.map((op) =>
            `<button type="button" data-v="${op.v}">${op.labelKey ? t(op.labelKey) : op.label}</button>`).join('')}</div>`;
          const r = row(label, html);
          const paint = () => {
            const cur = ex.get();
            r.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(cur)));
          };
          paint();
          r.querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', (e) => { e.stopPropagation(); ex.set(b.dataset.v); paint(); b.blur(); });
          });
        }
      }

      const ok = m.querySelector('[data-ok]');
      ok.querySelector('span').textContent = t('kit.howtoClose');
      ok.querySelector('small').textContent = t('kit.howtoCloseS');
      const done = () => { m.remove(); this._modal = null; resolve(true); };
      ok.addEventListener('click', (e) => { e.stopPropagation(); done(); });
      m.addEventListener('click', (e) => { if (e.target === m) done(); });
      this._modal = { close: () => done() };
      document.body.appendChild(m);
      ok.focus({ preventScroll: true });
    });
  }

  /**
   * Mount gear icon on home menu (top-right, after book).
   * @param {{audio?:object, stage?:object, extras?:Array, getGlow?:Function, setGlow?:Function, onOpen?:Function, open?:Function, id?:string}} o
   *   If `open` is provided, gear calls that instead of the kit settings sheet (e.g. cyber-board's own screen).
   */
  mountSettings(o = {}) {
    this.styleHubHome();
    markIconBar();
    this._settings = o;
    const id = o.id || 'btn-settings-home';
    const b = iconBtn(id, ICO.gear, 'kit.settings');
    b.classList.add('menu-settings');
    const right = topRight();
    if (right) {
      right.querySelectorAll('.menu-privacy, a.menu-privacy').forEach((el) => { el.classList.add('ck-bar-hide'); });
      right.querySelectorAll('.lang-btn, #btn-lang').forEach((el) => {
        if (el.closest('.menu-top')) el.classList.add('ck-bar-hide');
      });
      if (!b.parentElement) right.appendChild(b);
    } else if (!b.parentElement) {
      document.body.appendChild(b);
    }
    if (!b.dataset.ckSettingsBound) {
      b.dataset.ckSettingsBound = '1';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.blur();
        if (o.onOpen) try { o.onOpen(); } catch (_) {}
        if (typeof o.open === 'function') { o.open(); return; }
        this.settings(o);
      });
    }
    return b;
  }

  get modalOpen() { return !!this._modal; }
  closeModal() { if (this._modal) { this._modal.close(); return true; } return false; }
}
