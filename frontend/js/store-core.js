/**
 * 存档。不碰 localStorage：浏览器适配在 store.js，测试传入内存 read/write。
 */
import { normalizeFeel } from './hinge-feel.js';

/** @typedef {{attempts:Record<string, number>, tiers:Record<string, number>, finaleSeen:boolean}} JournalProgress */
/** @typedef {{cycles:number, secrets:Record<string, number>, seasons:Record<string, number>, muted:boolean, pets:number, opens:number, feel:string, stageShown:boolean, journal:JournalProgress}} SaveData */
/** @typedef {{read:() => (SaveData|null), write:(data:SaveData) => void}} StoreIO */
/** @typedef {{id:string, attempt?:boolean, tier?:number}} JournalUpdate */

/** @returns {JournalProgress} */
export function blankJournal() {
  return { attempts: {}, tiers: {}, finaleSeen: false };
}

/**
 * @param {unknown} src
 * @returns {Record<string, number>}
 */
function copyCounts(src) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (src))) {
    const n = +/** @type {number} */ (v);
    if (!k || !Number.isFinite(n) || n <= 0) continue;
    out[k] = Math.min(99, Math.floor(n));
  }
  return out;
}

/**
 * @param {unknown} src
 * @returns {JournalProgress}
 */
function loadJournal(src) {
  const journal = blankJournal();
  if (!src || typeof src !== 'object') return journal;
  const raw = /** @type {Partial<JournalProgress>} */ (src);
  journal.attempts = copyCounts(raw.attempts);
  const tiers = copyCounts(raw.tiers);
  for (const [k, n] of Object.entries(tiers)) journal.tiers[k] = n >= 2 ? 2 : 1;
  journal.finaleSeen = !!raw.finaleSeen;
  return journal;
}

/** @returns {SaveData} */
export function blankSave() {
  return { cycles: 0, secrets: {}, seasons: { 0: 1 }, muted: false, pets: 0, opens: 0, feel: 'normal', stageShown: false, journal: blankJournal() };
}

/**
 * @param {StoreIO} io
 * @param {Partial<SaveData>|null} [initial] 已读出的存档；null 表示空的
 */
export function createStore(io, initial = null) {
  const data = blankSave();
  if (initial && typeof initial === 'object') {
    data.cycles = initial.cycles || 0;
    data.muted = !!initial.muted;
    data.feel = normalizeFeel(initial.feel);
    data.pets = initial.pets || 0;
    data.opens = initial.opens || 0;
    data.stageShown = !!initial.stageShown;
    if (initial.secrets && typeof initial.secrets === 'object') data.secrets = { ...initial.secrets };
    if (initial.seasons && typeof initial.seasons === 'object') data.seasons = { .../** @type {Record<string, number>} */ (initial.seasons) };
    data.journal = loadJournal(/** @type {{ journal?: unknown }} */ (initial).journal);
  }
  const save = () => io.write(data);
  save();
  return {
    get data() { return data; },
    get cycles() { return data.cycles; },
    get muted() { return data.muted; },
    setMuted(m) { data.muted = !!m; save(); },
    get feel() { return data.feel; },
    setFeel(level) { data.feel = normalizeFeel(level); save(); },
    hasSecret(id) { return !!data.secrets[id]; },
    foundCount() { return Object.keys(data.secrets).length; },
    /** @param {string} id @returns {boolean} 第一次发现 */
    addSecret(id) {
      if (data.secrets[id]) return false;
      data.secrets[id] = Date.now();
      save();
      return true;
    },
    addCycle() { data.cycles += 1; save(); return data.cycles; },
    markSeason(i) { data.seasons[i] = (data.seasons[i] || 0) + 1; save(); },
    seasonSeen(i) { return !!data.seasons[i]; },
    addPet() { data.pets += 1; save(); return data.pets; },
    addOpen() { data.opens += 1; save(); },
    get stageShown() { return data.stageShown; },
    /** 首演亮过灯。已经记过就不再写。 */
    markStageShown() {
      if (data.stageShown) return false;
      data.stageShown = true;
      save();
      return true;
    },
    attemptCount(id) { return data.journal.attempts[id] || 0; },
    hintTier(id) { return data.journal.tiers[id] || 0; },
    /**
     * 一帧里把靠近次数和提示等级一起写上，只存一次。
     * @param {JournalUpdate[]} updates
     * @returns {boolean}
     */
    applyJournal(updates) {
      let dirty = false;
      const j = data.journal;
      for (const u of updates) {
        if (!u || !u.id) continue;
        if (u.attempt) {
          j.attempts[u.id] = (j.attempts[u.id] || 0) + 1;
          dirty = true;
        }
        const tier = u.tier || 0;
        if (tier > (j.tiers[u.id] || 0)) {
          j.tiers[u.id] = tier >= 2 ? 2 : 1;
          dirty = true;
        }
      }
      if (dirty) save();
      return dirty;
    },
    finalePlayed() { return !!data.journal.finaleSeen; },
    /** @returns {boolean} 第一次 */
    markFinalePlayed() {
      if (data.journal.finaleSeen) return false;
      data.journal.finaleSeen = true;
      save();
      return true;
    },
    reset() {
      const fresh = blankSave();
      data.cycles = fresh.cycles;
      data.secrets = fresh.secrets;
      data.seasons = fresh.seasons;
      data.muted = fresh.muted;
      data.feel = fresh.feel;
      data.pets = fresh.pets;
      data.opens = fresh.opens;
      data.stageShown = fresh.stageShown;
      data.journal = fresh.journal;
      save();
    },
  };
}
