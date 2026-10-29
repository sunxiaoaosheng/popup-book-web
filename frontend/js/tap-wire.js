/**
 * 轻拍事件的副作用。判定在 tap-machine.js。
 * 重拍和猛地合上共用同一种害羞：rememberSlam + onSlammed，不另写一份心情。
 */
import { SECRETS } from './story.js';
import { TUNING } from './tuning.js';
import { emitAll } from './bus.js';
import { onSlammed } from './kitten-mood.js';
import { catchupBlocksTaps, stageBlocksTaps, stepTap } from './tap-machine.js';

/** @param {any} W */
export function wireTap(W) {
  const { S } = W;
  W.bus.on('tap', (e) => {
    if (e.gesture === 'light-slap') {
      W.sound.tap();
      return;
    }
    if (e.gesture === 'strong-slap') {
      const t = Date.now();
      W.store.rememberSlam(t);
      onSlammed(S.kittenMood);
      W.sound.mew();
      W.say('小猫缩了一下', 2.2);
      return;
    }
    if (e.gesture === 'double-knock') {
      const id = e.secret || '';
      const secret = id && SECRETS.find((s) => s.id === id);
      if (secret && !W.store.hasSecret(id)) {
        if (W.ui.showJournal) W.ui.showJournal();
        if (W.discover(id)) W.say(secret.found, 4);
        return;
      }
      W.sound.tap();
      return;
    }
    if (e.gesture === 'triple-knock') W.sound.bellTwinkle(0.05);
  });
}

/** 每帧先走判定，画面随后才能读到门和抬头。 @param {any} W @param {number} dt */
export function stepTapGesture(W, dt) {
  const { S } = W;
  const taps = W.input && W.input.takeTaps ? W.input.takeTaps() : [];
  const events = stepTap(S.tap, {
    dt,
    taps,
    catchup: catchupBlocksTaps(S),
    staging: stageBlocksTaps(W.stageShow, !!(W.store && W.store.stageShown)),
    near: S.journalNear || [],
  }, TUNING);
  emitAll(W.bus, events.filter((e) => e.type === 'tap'));
}
