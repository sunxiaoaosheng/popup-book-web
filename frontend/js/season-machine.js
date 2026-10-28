/**
 * 换季进度。合盖把季节号往前拨仍由 setSeason 做；这里只在打开的过程里推 SEASON.t。
 * 页面一直可见时，t 跟盖子在 22°–65° 里的位置走。
 * 锁屏解开后盖子往往已经过了这段：revealOpen 让整场按时间补播一次，播完就清掉。
 */
import { SEASONS } from './story.js';
import { TUNING } from './tuning.js';
import { morphProgress } from './rules.js';

/**
 * 从隐藏回到可见。angle 用当时的盖子读数（S.target），不要用还没追上的 filtered。
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
  // 补播看「已经张开」，不看是不是还停在 22°–65° 里面。
  // 合严若赶在同一帧才入账，过滤角会被拉回 5° 以下，下一帧再开始，避免和这次合盖抢。
  if (!S.seasonCatchup && S.revealOpen && angle >= tuning.seasonMorphLo) {
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
