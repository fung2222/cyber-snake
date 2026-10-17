import { t } from '../core/i18n.js';
// Ads wrapper. Web build = no ads at all (no-op). Native Capacitor build = Google AdMob through
// @capacitor-community/admob (v8, Capacitor 8). NEVER AdSense inside the app.
//
// Policy built in (see cyber-arcade/docs/ARCADE-HANDOFF.md):
//   * interstitials ONLY at natural breaks (game over -> before the next round / between levels),
//     never at app launch, app exit, or while a level is starting; frequency-capped by time AND by number of breaks
//   * rewarded ads are always opt-in (player taps "watch ad" for an undo / continue) and the reward is granted only
//     when the SDK reports it
//   * UMP consent form shown on first launch where required (EEA/UK), privacy options entry point exposed
//
//   const ads = createAds({ gameId: 'data-fuse', units: { android: { interstitial: '...', rewarded: '...' } } });
//   await ads.init();                               // call once at boot (safe on web)
//   await ads.naturalBreak('gameover');             // may show an interstitial (capped). resolves true if shown
//   const r = await ads.rewarded('undo');           // { rewarded: boolean, reason }
import { Platform, isNative } from './platform.js';
import { flags as defaultFlags } from '../core/flags.js';

// Google's public TEST ad units. Replace with real units in the game's ads config before release.
export const TEST_UNITS = {
  android: { appId: 'ca-app-pub-3940256099942544~3347511713', interstitial: 'ca-app-pub-3940256099942544/1033173712', rewarded: 'ca-app-pub-3940256099942544/5224354917' },
  ios: { appId: 'ca-app-pub-3940256099942544~1458002511', interstitial: 'ca-app-pub-3940256099942544/4411468910', rewarded: 'ca-app-pub-3940256099942544/1712485313' },
};

const EV = {
  rewarded: 'onRewardedVideoAdReward', rewardDismissed: 'onRewardedVideoAdDismissed', rewardFailShow: 'onRewardedVideoAdFailedToShow',
  interDismissed: 'interstitialAdDismissed', interFailShow: 'interstitialAdFailedToShow',
};

/**
 * @param {object} o
 * @param {string} o.gameId
 * @param {object} [o.units]  { android: { interstitial, rewarded }, ios: {...} }  default = Google test units
 * @param {boolean} [o.testing=true]   request test ads (set false only for the signed release build)
 * @param {number} [o.interstitialCooldownSec=180]  min seconds between interstitials
 * @param {number} [o.breaksBetweenInterstitials=3] show at most one interstitial every N natural breaks
 * @param {number} [o.graceSec=120]   no interstitial in the first N seconds after launch
 * @param {'grant'|'deny'} [o.webReward='grant']   what rewarded() does on the web build (no ads exist there)
 * @param {(on:boolean)=>void} [o.onAdOpen]  called true before a full-screen ad, false after (pause game, duck audio)
 * @param {string} [o.maxAdContentRating='ParentalGuidance']
 */
export function createAds(o = {}) {
  const flags = o.flags || defaultFlags;
  const cfg = Object.assign({ testing: true, interstitialCooldownSec: 180, breaksBetweenInterstitials: 3, graceSec: 120, webReward: 'grant', maxAdContentRating: 'ParentalGuidance' }, o);
  const plat = Platform.name === 'ios' ? 'ios' : 'android';
  const units = Object.assign({}, TEST_UNITS[plat], cfg.units?.[plat]);
  const bootAt = Date.now();
  const st = { ready: false, native: false, canRequestAds: false, privacyRequired: false, lastInterstitial: 0, breaks: 0, interLoaded: false, rewardLoaded: false, shown: { interstitial: 0, rewarded: 0 }, log: [] };
  const log = (m) => { st.log.push(Date.now() - bootAt + 'ms ' + m); if (st.log.length > 50) st.log.shift(); if (flags.debug) console.info('[ads]', m); };
  const AdMob = () => Platform.plugin('AdMob');
  const notify = (on) => { try { cfg.onAdOpen && cfg.onAdOpen(on); } catch {} };

  async function preloadInterstitial() {
    if (!st.native || !st.canRequestAds || st.interLoaded) return;
    try { await AdMob().prepareInterstitial({ adId: units.interstitial, isTesting: cfg.testing, immersiveMode: true }); st.interLoaded = true; log('inter loaded'); }
    catch (e) { log('inter load fail ' + (e?.message || e)); }
  }
  async function preloadRewarded() {
    if (!st.native || !st.canRequestAds || st.rewardLoaded) return;
    try { await AdMob().prepareRewardVideoAd({ adId: units.rewarded, isTesting: cfg.testing, immersiveMode: true }); st.rewardLoaded = true; log('reward loaded'); }
    catch (e) { log('reward load fail ' + (e?.message || e)); }
  }

  // simulated full-screen ad for testing the flow in a browser (?adsim=1)
  function simulate(kind, seconds = 2) {
    return new Promise((resolve) => {
      notify(true);
      const d = document.createElement('div'); d.className = 'ck-adsim';
      d.innerHTML = `<div>${kind === 'rewarded' ? t('kit.adsimRewarded') : t('kit.adsimInter')}</div><b>${seconds}</b><small>${t('kit.adsimNote')}</small>`;
      document.body.appendChild(d);
      let n = seconds; const b = d.querySelector('b');
      const iv = setInterval(() => { n--; b.textContent = String(Math.max(n, 0)); if (n <= 0) { clearInterval(iv); d.remove(); notify(false); resolve(true); } }, 1000);
    });
  }

  const api = {
    get state() { return { ...st, units, native: st.native, sinceBoot: (Date.now() - bootAt) / 1000 }; },
    get isNative() { return st.native; },
    /** Initialise the SDK + UMP consent. Safe (no-op) on the web. Never shows an ad. */
    async init() {
      if (st.ready) return api;
      st.ready = true;
      st.native = isNative() && !!AdMob();
      if (!st.native) { log('web: ads disabled' + (flags.adsim ? ' (adsim on)' : '')); return api; }
      try {
        await AdMob().initialize({ initializeForTesting: cfg.testing, testingDevices: cfg.testingDevices || [], tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false, maxAdContentRating: cfg.maxAdContentRating });
        let info = await AdMob().requestConsentInfo(cfg.consentDebug || {});
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob().showConsentForm();
        st.canRequestAds = info.canRequestAds !== false;
        st.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        log('consent ' + info.status + ' canRequestAds=' + st.canRequestAds);
      } catch (e) { log('init fail ' + (e?.message || e)); st.canRequestAds = false; }
      preloadInterstitial(); preloadRewarded();
      return api;
    },
    /** true when the app should show a "privacy options" button (EEA users must be able to change consent) */
    get privacyOptionsRequired() { return st.privacyRequired; },
    async showPrivacyOptions() { if (st.native) try { await AdMob().showPrivacyOptionsForm(); } catch (e) { log('privacy form fail'); } },

    /** Would an interstitial be allowed right now? (cooldown + break counter + launch grace) */
    canShowInterstitial() {
      const now = Date.now();
      if ((now - bootAt) / 1000 < cfg.graceSec) return false;
      if (st.lastInterstitial && (now - st.lastInterstitial) / 1000 < cfg.interstitialCooldownSec) return false;
      return st.breaks >= cfg.breaksBetweenInterstitials;
    },
    /**
     * Report a natural break (game over, level cleared). Shows an interstitial only if every cap allows.
     * Call it from the "play again" / "next" button handler, NOT on app start / exit / level start.
     * @returns {Promise<boolean>} true if an ad was shown
     */
    async naturalBreak(placement = 'break') {
      st.breaks++;
      if (!api.canShowInterstitial()) { log(`break ${placement} #${st.breaks}: capped`); return false; }
      if (!st.native) {
        if (!flags.adsim) return false;
        await simulate('interstitial'); st.lastInterstitial = Date.now(); st.breaks = 0; st.shown.interstitial++; return true;
      }
      if (!st.interLoaded) { preloadInterstitial(); return false; }
      return new Promise(async (resolve) => {
        let done = false; const handles = [];
        const finish = (shown) => { if (done) return; done = true; handles.forEach(h => h.remove && h.remove()); notify(false); st.interLoaded = false; preloadInterstitial(); resolve(shown); };
        try {
          handles.push(await AdMob().addListener(EV.interDismissed, () => finish(true)));
          handles.push(await AdMob().addListener(EV.interFailShow, () => finish(false)));
          notify(true);
          await AdMob().showInterstitial();
          st.lastInterstitial = Date.now(); st.breaks = 0; st.shown.interstitial++; log('inter shown ' + placement);
        } catch (e) { log('inter show fail'); finish(false); }
      });
    },
    /** Is a rewarded ad (or the web fallback) available right now? Use to enable / hide the "watch ad" button. */
    rewardedAvailable() {
      if (!st.native) return cfg.webReward === 'grant' || flags.adsim;
      if (!st.rewardLoaded) preloadRewarded();
      return st.rewardLoaded;
    },
    /**
     * Opt-in rewarded ad. Only grant the reward when the result says rewarded:true.
     * @returns {Promise<{rewarded:boolean, reason:string}>}
     */
    async rewarded(placement = 'reward') {
      if (!st.native) {
        if (flags.adsim) { await simulate('rewarded'); st.shown.rewarded++; return { rewarded: true, reason: 'sim' }; }
        return cfg.webReward === 'grant' ? { rewarded: true, reason: 'web' } : { rewarded: false, reason: 'web' };
      }
      if (!st.rewardLoaded) { preloadRewarded(); return { rewarded: false, reason: 'not-loaded' }; }
      return new Promise(async (resolve) => {
        let got = false, done = false; const handles = [];
        const finish = (reason) => { if (done) return; done = true; handles.forEach(h => h.remove && h.remove()); notify(false); st.rewardLoaded = false; preloadRewarded(); resolve({ rewarded: got, reason }); };
        try {
          handles.push(await AdMob().addListener(EV.rewarded, () => { got = true; }));
          handles.push(await AdMob().addListener(EV.rewardDismissed, () => finish(got ? 'ok' : 'dismissed')));
          handles.push(await AdMob().addListener(EV.rewardFailShow, () => finish('fail-show')));
          notify(true);
          const item = await AdMob().showRewardVideoAd();
          if (item) got = true;
          st.shown.rewarded++; log('reward shown ' + placement);
          setTimeout(() => finish(got ? 'ok' : 'dismissed'), 60000); // safety net
        } catch (e) { log('reward show fail'); finish('error'); }
      });
    },
  };
  return api;
}
