/**
 * 换季进度。合盖把季节号往前拨仍由 setSeason 做；这里只在打开的过程里推 SEASON.t。
 * 页面一直可见时，t 跟盖子在 22°–65° 里的位置走。
 * 锁屏解开后盖子往往已经过了这段：revealOpen 让整场按时间补播一次，播完就清掉。
 */
import { SEASONS } from './story.js';
import { TUNING } from './tuning.js';
import { morphProgress } from './rules.js';

/**
 * 从隐藏回到可见。angle 必须是 input.tick() 已经写进 S.target 的盖子读数。
 * 不要在 visibilitychange / focus 里提前调用：那时最新一帧可能还在套接字队列里。
 * 只有这次真的从隐藏里出来、而且盖子已经开过换季下沿，才挂上补播。
 * 盖子还在下沿以下就什么都不做，接下来仍按角度慢慢打开。
 * @param {{from:number, to:number, t:number}} SEASON
 * @param {{pageHidden?:boolean, revealOpen?:boolean, seasonCatchup?:boolean, lidShut?:boolean, armed?:boolean}} S
 * @param {number} angle
 * @param {boolean} nowVisible
 * @param {typeof TUNING} [tuning]
 * @returns {boolean} 这一拍是否挂上了补播
 */
export function noteSeasonReveal(SEASON, S, angle, nowVisible, tuning = TUNING) {
  if (!nowVisible) {
    S.pageHidden = true;
    return false;
  }
  const became = !!S.pageHidden;
  S.pageHidden = false;
  if (!became || S.seasonCatchup) return false;
  const pending = SEASON.t < 1 && SEASON.from !== SEASON.to;
  const closeDue = !!(S.lidShut && S.armed);
  if (angle < tuning.seasonMorphLo || (!pending && !closeDue)) {
    S.revealOpen = false;
    return false;
  }
  S.revealOpen = true;
  return true;
}

/**
 * 这一帧扫场会走到的 t。补播还没翻 seasonCatchup 时，revealOpen 也算。
 * 纸艺张开用同一个数，避免先弹开再放粒子。
 * @param {{from:number, to:number, t:number}|null|undefined} SEASON
 * @param {{revealOpen?:boolean, seasonCatchup?:boolean}} S
 * @param {number} [dt]
 * @param {typeof TUNING} [tuning]
 * @returns {number|null}
 */
export function nextSeasonCatchT(SEASON, S, dt = 0, tuning = TUNING) {
  if (!(S.revealOpen || S.seasonCatchup)) return null;
  if (!SEASON || !(SEASON.t < 1 && SEASON.from !== SEASON.to)) return null;
  const dur = Math.max(0.05, tuning.seasonCatchupSec);
  return Math.min(1, SEASON.t + Math.max(0, dt) / dur);
}

/** 补播时纸页从合上的位置走到当前盖子，t 和扫场共用。 */
export function catchupAngle(latch, goal, t) {
  return latch + (goal - latch) * t;
}

/**
 * 补播途中盖子又合上。停掉扫场，把这一季的画面退回起点，等下次按角度打开。
 * @param {{from:number, to:number, t:number}} SEASON
 * @param {{revealOpen?:boolean, seasonCatchup?:boolean, poseLatch?:number|null, seasonMorphSaid?:boolean}} S
 */
export function cancelSeasonCatchup(SEASON, S) {
  if (!(S.revealOpen || S.seasonCatchup)) return false;
  S.revealOpen = false;
  S.seasonCatchup = false;
  S.poseLatch = null;
  if (SEASON && SEASON.from !== SEASON.to && SEASON.t < 1) {
    SEASON.t = 0;
    S.seasonMorphSaid = false;
  }
  return true;
}

/**
 * @param {{from:number, to:number, t:number}} SEASON
 * @param {{seasonMorphSaid:boolean, seasonCatchup?:boolean, revealOpen?:boolean}} S
 * @param {number} angle
 * @param {number} [dt]
 * @param {typeof TUNING} [tuning]
 */
export function stepSeason(SEASON, S, angle, dt = 0, tuning = TUNING) {
  /** @type {object[]} */
  const events = [];
  const pending = SEASON.t < 1 && SEASON.from !== SEASON.to;
  if (!pending) {
    S.seasonCatchup = false;
    return events;
  }
  // 盖子够不够开，noteSeasonReveal 已经用排空后的 S.target 判过。
  // 这里不再看过滤角：纸页要跟着扫场慢慢张开，不能等它先弹过 22°。
  if (!S.seasonCatchup && S.revealOpen) {
    S.seasonCatchup = true;
    S.revealOpen = false;
  }
  if (S.seasonCatchup) {
    const dur = Math.max(0.05, tuning.seasonCatchupSec);
    const p = Math.min(1, SEASON.t + Math.max(0, dt) / dur);
    if (p > SEASON.t) {
      SEASON.t = p;
      events.push({ type: 'season', phase: 'morph', t: p });
    }
    pushCaption(SEASON, S, events);
    if (SEASON.t >= 1) S.seasonCatchup = false;
    return events;
  }
  if (angle >= tuning.seasonMorphLo) {
    const p = morphProgress(angle, tuning);
    if (p > SEASON.t) {
      SEASON.t = p;
      events.push({ type: 'season', phase: 'morph', t: p });
    }
    pushCaption(SEASON, S, events);
  }
  return events;
}

/**
 * @param {{from:number, to:number}} SEASON
 * @param {{seasonMorphSaid:boolean}} S
 * @param {object[]} events
 */
function pushCaption(SEASON, S, events) {
  if (S.seasonMorphSaid || SEASON.from === SEASON.to) return;
  S.seasonMorphSaid = true;
  events.push({
    type: 'season',
    phase: 'caption',
    text: `${SEASONS[SEASON.from].name} → ${SEASONS[SEASON.to].name} · 换季了`,
  });
}
