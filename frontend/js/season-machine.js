/**
 * 换季进度。合盖把季节号往前拨仍由 setSeason 做；这里只在打开的过程里推 SEASON.t。
 */
import { SEASONS } from './story.js';
import { TUNING } from './tuning.js';
import { morphProgress } from './rules.js';

/**
 * @param {{from:number, to:number, t:number}} SEASON
 * @param {{seasonMorphSaid:boolean}} S
 * @param {number} angle
 */
export function stepSeason(SEASON, S, angle) {
  /** @type {object[]} */
  const events = [];
  if (SEASON.t < 1 && angle >= TUNING.seasonMorphLo) {
    const p = morphProgress(angle);
    if (p > SEASON.t) {
      SEASON.t = p;
      events.push({ type: 'season', phase: 'morph', t: p });
    }
    if (!S.seasonMorphSaid && SEASON.from !== SEASON.to) {
      S.seasonMorphSaid = true;
      events.push({
        type: 'season',
        phase: 'caption',
        text: `${SEASONS[SEASON.from].name} → ${SEASONS[SEASON.to].name} · 换季了`,
      });
    }
  }
  return events;
}
