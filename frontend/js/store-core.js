/**
 * 存档。不碰 localStorage：浏览器适配在 store.js，测试传入内存 read/write。
 * 小猫的记性是里面的 kitten 字段，变换在 kitten-memory.js。
 */
import { blankKittenMemory, normalizeKittenMemory, pushVisit } from './kitten-memory.js';

/** @typedef {import('./kitten-memory.js').KittenMemory} KittenMemory */
/** @typedef {{cycles:number, secrets:Record<string, number>, seasons:Record<string, number>, muted:boolean, pets:number, opens:number, kitten:KittenMemory}} SaveData */
/** @typedef {{read:() => (SaveData|null), write:(data:SaveData) => void}} StoreIO */

/** @returns {SaveData} */
export function blankSave() {
  return { cycles: 0, secrets: {}, seasons: { 0: 1 }, muted: false, pets: 0, opens: 0, kitten: blankKittenMemory() };
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
    data.pets = initial.pets || 0;
    data.opens = initial.opens || 0;
    if (initial.secrets && typeof initial.secrets === 'object') data.secrets = { ...initial.secrets };
    if (initial.seasons && typeof initial.seasons === 'object') data.seasons = { .../** @type {Record<string, number>} */ (initial.seasons) };
    data.kitten = normalizeKittenMemory(initial.kitten);
  }
  const save = () => io.write(data);
  save();
  return {
    get data() { return data; },
    get cycles() { return data.cycles; },
    get muted() { return data.muted; },
    setMuted(m) { data.muted = !!m; save(); },
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
    kittenMemory() { return data.kitten; },
    /** @param {number} now @param {number} [keep] @param {number} [gapMs] */
    rememberVisit(now, keep = 8, gapMs = 8000) {
      data.kitten = pushVisit(data.kitten, now, keep, gapMs);
      save();
      return data.kitten;
    },
    /** @param {number} now */
    rememberSlam(now) {
      data.kitten.slammedAt = now;
      if (!data.kitten.seenAt || now > data.kitten.seenAt) data.kitten.seenAt = now;
      save();
    },
    /** @param {number} now */
    touchSeen(now) {
      data.kitten.seenAt = now;
      save();
    },
    reset() {
      const fresh = blankSave();
      data.cycles = fresh.cycles;
      data.secrets = fresh.secrets;
      data.seasons = fresh.seasons;
      data.muted = fresh.muted;
      data.pets = fresh.pets;
      data.opens = fresh.opens;
      data.kitten = fresh.kitten;
      save();
    },
  };
}
