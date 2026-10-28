/**
 * 贴纸手账的靠近与提示。只看角度、速度和次数，不改秘密触发。
 * 触发仍在 rules.js / play-machine.js。
 */
import { closeKind } from './rules.js';
import { TUNING } from './tuning.js';

export const STICKER_IDS = ['seam', 'nap', 'heart', 'owl', 'shake', 'chase', 'fullday', 'goodnight'];

/** 刚靠近时的短句。试过几次才换成 story.js 里原来的含蓄提示。 */
export const ALMOST = {
  seam: '就在这一道缝附近。',
  nap: '屋子站着的这一段，好像差一点。',
  heart: '这个角度，方得有点可疑。',
  owl: '有谁被风惊到了，还没飞起来。',
  shake: '页已经在响了。',
  chase: '天色已经暗下来了。',
  fullday: '这一天还没走完。',
  goodnight: '合上的力气，还可以再轻一点。',
};

/** 和 holdBand 对齐的有效区间。清晨那一段留给伸懒腰，不算午觉。 */
const BANDS = {
  seam: [4, 16],
  nap: [58, 72],
  chase: [109, 124],
};

export function createClosenessMemory() {
  /** @type {Record<string, boolean>} */
  const prevNear = {};
  for (const id of STICKER_IDS) prevNear[id] = false;
  return { prevNear, prevDayDone: false, prevArmed: false, prevFlut: 0 };
}

/**
 * @param {boolean} was
 * @param {boolean} enter
 * @param {boolean} release
 */
function latch(was, enter, release) {
  if (enter && !was) return true;
  if (was && release) return false;
  return was;
}

/**
 * @param {number} angle
 * @param {number} lo
 * @param {number} hi
 * @param {number} pad
 */
function bandEnter(angle, lo, hi, pad) {
  return angle > Math.max(lo - pad, 1.5) && angle < hi + pad;
}

/**
 * @param {number} angle
 * @param {number} lo
 * @param {number} hi
 * @param {number} pad
 * @param {number} hyst
 */
function bandRelease(angle, lo, hi, pad, hyst) {
  return angle <= Math.max(lo - pad - hyst, 0.4) || angle >= hi + pad + hyst;
}

/**
 * 0 空白，1 快了，2 原来的含蓄提示。已经贴上的格子不走这里。
 * @param {{ attempts?: number, near?: boolean }} progress
 * @param {typeof TUNING} [tuning]
 * @returns {0|1|2}
 */
export function tierFromProgress(progress, tuning = TUNING) {
  const attempts = progress.attempts || 0;
  if (attempts >= tuning.stickerAttemptsForHint) return 2;
  if (attempts > 0 || progress.near) return 1;
  return 0;
}

/**
 * @param {{ id: string, name: string, hint: string, found: string }} secret
 * @param {{ found: boolean, tier: number, near: boolean }} progress
 */
export function describeSlot(secret, progress) {
  if (progress.found) return { state: 'got', title: secret.name, line: secret.found, near: false };
  const near = !!progress.near;
  if ((progress.tier || 0) >= 2) return { state: 'hint', title: '？？？', line: secret.hint, near };
  if ((progress.tier || 0) >= 1 || near) {
    return { state: 'close', title: '？？？', line: ALMOST[secret.id] || '快了。', near };
  }
  return { state: 'empty', title: '？？？', line: '', near: false };
}

/**
 * 飘字只讲这一拍新靠近、或刚记上一次尝试的那一张。
 * @param {string[]} rises
 * @param {string[]} attempts
 * @param {(id: string) => { found: boolean, line: string }} view
 */
export function nudgeFor(rises, attempts, view) {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const id of [...rises, ...attempts]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const slot = view(id);
    if (slot && !slot.found && slot.line) return slot.line;
  }
  return '';
}

/**
 * 这一拍该写进存档的次数和提示等级。已经发现的秘密跳过。
 * @param {{ near: string[], rises: string[], attempts: string[] }} observed
 * @param {(id: string) => { found: boolean, attempts: number, tier: number }} known
 * @param {typeof TUNING} [tuning]
 */
export function progressUpdates(observed, known, tuning = TUNING) {
  const attemptSet = new Set(observed.attempts);
  const nearSet = new Set(observed.near);
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {{ id: string, attempt?: boolean, tier: number }[]} */
  const updates = [];
  for (const id of [...observed.rises, ...observed.attempts, ...observed.near]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const cur = known(id);
    if (!cur || cur.found) continue;
    const attempt = attemptSet.has(id);
    const count = cur.attempts + (attempt ? 1 : 0);
    const tier = tierFromProgress({ attempts: count, near: nearSet.has(id) }, tuning);
    if (attempt || tier > cur.tier) updates.push({ id, attempt, tier });
  }
  return updates;
}

/**
 * @param {ReturnType<typeof createClosenessMemory>} mem
 * @param {{
 *   angle: number, speed: number, swings: number,
 *   dayOn: boolean, dayMax: number, dayBad: string, dayDone: boolean, dayDur: number,
 *   armed: boolean, closing: boolean, closeMax: number, flutT: number,
 * }} obs
 * @param {typeof TUNING} [tuning]
 * @returns {{ near: string[], rises: string[], attempts: string[] }}
 */
export function observeCloseness(mem, obs, tuning = TUNING) {
  const pad = tuning.stickerBandPad;
  const hyst = tuning.stickerBandHyst;
  const angle = obs.angle;
  const speed = obs.speed;
  /** @type {Record<string, boolean>} */
  const enter = {};
  /** @type {Record<string, boolean>} */
  const release = {};

  for (const id of /** @type {('seam'|'nap'|'chase')[]} */ (['seam', 'nap', 'chase'])) {
    const [lo, hi] = BANDS[id];
    enter[id] = bandEnter(angle, lo, hi, pad);
    release[id] = bandRelease(angle, lo, hi, pad, hyst);
  }

  const heartR = 6.5 + pad;
  enter.heart = Math.abs(angle - 90) <= heartR;
  release.heart = Math.abs(angle - 90) >= heartR + hyst;

  const owlSpeed = tuning.fastAbove * tuning.stickerOwlSpeedFrac;
  const owlLo = 46 - pad;
  const owlHi = 126;
  enter.owl = angle > owlLo && angle < owlHi && speed >= owlSpeed;
  release.owl = angle <= owlLo - hyst || angle >= owlHi + hyst || speed < owlSpeed * 0.8;

  const shakeN = tuning.stickerShakeAlmost;
  enter.shake = obs.swings >= shakeN && angle > 22;
  release.shake = obs.swings < shakeN || angle < 18;

  const dayBad = !!obs.dayBad;
  enter.fullday = !!(obs.dayOn && !obs.dayDone && !dayBad
    && obs.dayMax >= tuning.stickerDayAlmost && angle < tuning.dayEnd);
  release.fullday = !obs.dayOn || !!obs.dayDone || dayBad || angle >= tuning.dayEnd
    || obs.dayMax < tuning.stickerDayAlmost - 10;

  const gentleHi = tuning.gentleBelow * tuning.stickerGentleAlmost;
  enter.goodnight = !!(obs.closing && obs.closeMax >= tuning.gentleBelow && obs.closeMax < gentleHi);
  release.goodnight = !obs.closing || obs.closeMax >= gentleHi;

  /** @type {string[]} */
  const near = [];
  /** @type {string[]} */
  const rises = [];
  /** @type {string[]} */
  const attempts = [];
  for (const id of STICKER_IDS) {
    const was = !!mem.prevNear[id];
    const on = latch(was, !!enter[id], !!release[id]);
    if (on && !was) {
      rises.push(id);
      if (id !== 'goodnight') attempts.push(id);
    }
    mem.prevNear[id] = on;
    if (on) near.push(id);
  }

  if (obs.dayDone && !mem.prevDayDone) {
    const failed = dayBad || obs.dayDur < tuning.daySeconds;
    if (failed && !attempts.includes('fullday')) attempts.push('fullday');
  }
  mem.prevDayDone = !!obs.dayDone;

  if (mem.prevArmed && !obs.armed && angle < 8 && closeKind(obs.closeMax, tuning) !== 'gentle') {
    if (!attempts.includes('goodnight')) attempts.push('goodnight');
  }
  mem.prevArmed = !!obs.armed;

  const flut = obs.flutT || 0;
  if (flut > 1 && mem.prevFlut <= 1 && angle <= 46 && !attempts.includes('owl')) attempts.push('owl');
  mem.prevFlut = flut;

  return { near, rises, attempts };
}
