/**
 * 存在存档里的记性。不管这一帧小猫站在哪。
 * 浏览器读写在 store-core，这里只做纯变换。
 */
import { TUNING } from './tuning.js';

/** @typedef {{seenAt:number, visits:number[], slammedAt:number}} KittenMemory */

/** @returns {KittenMemory} */
export function blankKittenMemory() {
  return { seenAt: 0, visits: [], slammedAt: 0 };
}

/** @param {Partial<KittenMemory>|null|undefined} raw */
export function normalizeKittenMemory(raw) {
  const m = blankKittenMemory();
  if (!raw || typeof raw !== 'object') return m;
  if (typeof raw.seenAt === 'number' && raw.seenAt > 0) m.seenAt = raw.seenAt;
  if (typeof raw.slammedAt === 'number' && raw.slammedAt > 0) m.slammedAt = raw.slammedAt;
  if (Array.isArray(raw.visits)) {
    m.visits = raw.visits.filter((t) => typeof t === 'number' && t > 0).slice(-12);
  }
  return m;
}

/** 玩家本地日历上的一天。跨过午夜才算「第二天」。 */
export function localDay(ms) {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * @param {number[]} visits
 * @param {number} now
 * @param {number} windowMs
 */
export function visitsInWindow(visits, now, windowMs) {
  let n = 0;
  for (let i = 0; i < visits.length; i++) {
    const gap = now - visits[i];
    if (gap >= 0 && gap < windowMs) n += 1;
  }
  return n;
}

/**
 * 这一次见面该说哪一种招呼。在把这次打开记进去之前调用。
 * @param {KittenMemory|null|undefined} memory
 * @param {number} now
 * @param {typeof TUNING.kitten} [t]
 * @returns {'first'|'soon'|'back'|'hours'|'nextday'|'shy'|'often'}
 */
export function greetingKind(memory, now, t = TUNING.kitten) {
  const seen = memory && memory.seenAt;
  if (!seen) return 'first';
  const gap = now - seen;
  if (gap < t.soonGapMs) return 'soon';
  const slammed = memory.slammedAt || 0;
  if (slammed && now - slammed >= 0 && now - slammed < t.shyAfterSlamMs) return 'shy';
  if (localDay(seen) !== localDay(now)) return 'nextday';
  if (gap >= t.hoursGapMs) return 'hours';
  const prior = visitsInWindow(memory.visits || [], now, t.oftenWindowMs);
  if (prior >= t.oftenCount) return 'often';
  return 'back';
}

/**
 * 记性给出的底色。打盹是这一局里闲出来的，不写在这里。
 * @param {KittenMemory|null|undefined} memory
 * @param {number} now
 * @param {typeof TUNING.kitten} [t]
 * @returns {'calm'|'excited'|'shy'}
 */
export function moodFromMemory(memory, now, t = TUNING.kitten) {
  const slammed = memory && memory.slammedAt;
  if (slammed && now - slammed >= 0 && now - slammed < t.shyAfterSlamMs) return 'shy';
  const n = visitsInWindow((memory && memory.visits) || [], now, t.oftenWindowMs);
  if (n >= t.oftenCount) return 'excited';
  return 'calm';
}

/**
 * 记一次打开。太密的重复不算新的一次。
 * @param {KittenMemory|null|undefined} memory
 * @param {number} now
 * @param {number} keep
 * @param {number} gapMs
 * @returns {KittenMemory}
 */
export function pushVisit(memory, now, keep, gapMs) {
  const m = normalizeKittenMemory(memory);
  const visits = m.visits.slice();
  const last = visits.length ? visits[visits.length - 1] : 0;
  m.seenAt = now;
  if (now - last < gapMs) {
    m.visits = visits;
    return m;
  }
  visits.push(now);
  m.visits = visits.slice(-keep);
  return m;
}
