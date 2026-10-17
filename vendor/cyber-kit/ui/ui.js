// DOM HUD helper: screens, level banner, score popups, colour flash, toasts, confirm modal (used for rewarded-ad
// offers), loading / fatal error. Works with ui/hud.css. Missing containers are created automatically.
import { t } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
function ensure(id, cls, html = '') {
  let e = $(id);
  if (!e) { e = document.createElement('div'); e.id = id; if (cls) e.className = cls; e.innerHTML = html; document.body.appendChild(e); }
  return e;
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
    const t = this.bannerT, b = this.el.banner;
    let op = 1, sx = 1, sy = 1, ty = 0, blur = 0;
    if (t < 0.22) { const k = t / 0.22; op = k; sx = 2.2 - 1.2 * k; sy = 0.2 + 0.8 * k; blur = 8 * (1 - k); }
    else if (t > 1.7) { const k = Math.min(1, (t - 1.7) / 0.4); op = 1 - k; ty = -30 * k; }
    b.style.opacity = op.toFixed(3);
    b.style.transform = `translateY(${ty}px) scale(${sx}, ${sy})`;
    b.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
    if (t > 2.1) { b.classList.add('hidden'); this.bannerT = -1; }
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
  /** true while a confirm() modal is open; closeModal() cancels it (e.g. Android back button) */

  /**
   * Bilingual How-to / Controls modal (scrollable). Content should already be translated via t().
   * @param {{title?:string, kicker?:string, sections:{heading:string, body:string}[], closeLabel?:string, closeSmall?:string}} o
   * body may contain safe HTML (<br>, <kbd>, <b>, <ul><li>).
   */
  howto(o = {}) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'screen ck-modal ck-howto';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      const sections = (o.sections || []).map((s) => {
        const h = document.createElement('div');
        h.className = 'ck-howto-sec';
        const title = document.createElement('h3');
        title.className = 'ck-howto-h';
        title.textContent = s.heading || '';
        const body = document.createElement('div');
        body.className = 'ck-howto-body';
        body.innerHTML = s.body || '';
        h.appendChild(title); h.appendChild(body);
        return h.outerHTML;
      }).join('');
      m.innerHTML = `<div class="panel ck-howto-panel">
        ${o.kicker ? '<div class="kicker ck-howto-kicker"></div>' : ''}
        <h2 class="title2 ck-howto-title"></h2>
        <div class="ck-howto-scroll">${sections}</div>
        <button type="button" class="neon-btn" data-ok><span></span><small></small></button>
      </div>`;
      if (o.kicker) m.querySelector('.ck-howto-kicker').textContent = o.kicker;
      m.querySelector('.ck-howto-title').textContent = o.title || t('kit.howto');
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
   * Mount a How-to button on the home menu (menu-top-right, before privacy/lang).
   * Preserves Arcade Menu top-left and EN/lang layout.
   * @param {{getContent:()=>{title?:string,kicker?:string,sections:{heading:string,body:string}[]}, id?:string, onOpen?:Function}} o
   */
  mountHowto(o = {}) {
    if (!o.getContent) return null;
    const id = o.id || 'btn-howto';
    let b = $(id);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.id = id; b.className = 'menu-howto';
      b.innerHTML = '<span data-i18n="kit.howto"></span>';
      const right = document.querySelector('.menu-home .menu-top-right') || document.querySelector('.menu-top-right');
      if (right) {
        const priv = right.querySelector('.menu-privacy, a.menu-privacy');
        if (priv) right.insertBefore(b, priv);
        else {
          const lang = right.querySelector('.lang-btn, #btn-lang');
          if (lang) right.insertBefore(b, lang);
          else right.prepend(b);
        }
      } else {
        document.body.appendChild(b);
      }
    }
    const paint = () => {
      const span = b.querySelector('[data-i18n]') || b;
      if (span.dataset && span.dataset.i18n) span.textContent = t(span.dataset.i18n);
      else if (!b.querySelector('span')) b.textContent = t('kit.howto');
      b.setAttribute('aria-label', t('kit.howto'));
      b.title = t('kit.howto');
    };
    paint();
    if (typeof window !== 'undefined') window.addEventListener('cyber:langchange', paint);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      b.blur();
      if (o.onOpen) try { o.onOpen(); } catch (_) {}
      const content = o.getContent() || {};
      this.howto(content);
    });
    return b;
  }

  get modalOpen() { return !!this._modal; }
  closeModal() { if (this._modal) { this._modal.close(); return true; } return false; }
}
