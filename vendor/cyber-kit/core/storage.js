// Namespaced localStorage.  Every key is  cyber.<gameId>.<key>  e.g. cyber.data-fuse.best
// Never throws (private mode / quota) - falls back to an in-memory map.

const mem = new Map();
function ls() { try { const t = '__cyber_t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; } catch { return null; } }
const LS = typeof window !== 'undefined' ? ls() : null;

export function createStore(gameId) {
  if (!/^[a-z0-9-]+$/.test(gameId)) throw new Error('cyber-kit: gameId must be kebab-case: ' + gameId);
  const prefix = `cyber.${gameId}.`;
  const raw = {
    get(k) { const key = prefix + k; try { return LS ? LS.getItem(key) : (mem.has(key) ? mem.get(key) : null); } catch { return null; } },
    set(k, v) { const key = prefix + k; try { if (LS) LS.setItem(key, v); else mem.set(key, v); } catch { mem.set(key, v); } },
    remove(k) { const key = prefix + k; try { LS && LS.removeItem(key); } catch {} mem.delete(key); },
  };
  return {
    gameId, prefix,
    get(k, def = null) { const v = raw.get(k); return v === null ? def : v; },
    set(k, v) { raw.set(k, String(v)); },
    remove: raw.remove,
    getNum(k, def = 0) { const n = parseFloat(raw.get(k)); return Number.isFinite(n) ? n : def; },
    setNum(k, n) { raw.set(k, String(n)); },
    getBool(k, def = false) { const v = raw.get(k); return v === null ? def : v === '1'; },
    setBool(k, b) { raw.set(k, b ? '1' : '0'); },
    getJSON(k, def = null) { try { const v = raw.get(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    setJSON(k, o) { try { raw.set(k, JSON.stringify(o)); } catch {} },
    /** best score helpers:  cyber.<game>.best */
    get best() { return this.getNum('best', 0); },
    submitBest(score) { const b = this.best; if (score > b) { this.setNum('best', score); return true; } return false; },
    /** wipe every key of this game */
    clear() {
      try { if (LS) { const ks = []; for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && k.startsWith(prefix)) ks.push(k); } ks.forEach(k => LS.removeItem(k)); } } catch {}
      for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
    },
  };
}
