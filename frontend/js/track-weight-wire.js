/**
 * 把可选的力度样本送进礼物状态机，再画到窗台上。
 * 字段缺着的时候样本保持空，状态机收到 null，不报错。
 */
import { TUNING } from './tuning.js';
import { emitAll } from './bus.js';
import { stepTrackWeight } from './track-weight.js';
import { applyTrackGift, attachTrackGift } from './track-weight-view.js';

/** @param {any} W */
export function wireTrackWeight(W) {
  attachTrackGift(W);
  const { S } = W;
  W.bus.on('track-sniff', () => {
    S.moodCap = '它凑过去闻了闻';
    S.moodUntil = S.time + 2.6;
    S.moodKind = 'sniff';
    if (W.sound) W.sound.mew();
  });
}

/** 小猫已经蹲在窗台外、醒着，才算能闻。追萤火虫和打盹先让过去。 */
function onSill(W) {
  const { S, frame: F } = W;
  if (!F.showK || S.kittenMode !== 'play') return false;
  if (S.kittenMood && S.kittenMood.asleep) return false;
  if (S.chaseP > 0.05 || S.napP > 0.2) return false;
  return F.hopP > 0.98;
}

/** @param {any} W @param {number} dt */
export function stepTrackGift(W, dt) {
  const { S } = W;
  const tuning = TUNING.trackWeight;
  const sample = S.trackSample;
  let weight = null;
  if (sample && typeof sample.value === 'number' && Number.isFinite(sample.value)) {
    const age = (performance.now() - sample.at) / 1000;
    if (age <= tuning.lostSec) weight = sample.value;
  }
  const events = stepTrackWeight(S.track, { weight, dt, onSill: onSill(W) }, tuning);
  emitAll(W.bus, events);
  applyTrackGift(W, S.track);
}
