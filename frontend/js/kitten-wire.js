/**
 * 心情事件的副作用：一句短字幕、一声轻喵、把记性写进现有存档。
 * 故事字幕仍走 say()。这里用旁边的一条，免得盖住秘密和换季。
 */
import { TUNING } from './tuning.js';
import { onSlammed, prepareGreeting, syncBase } from './kitten-mood.js';

/** @param {any} W @param {number} [now] */
export function wireKitten(W, now = Date.now()) {
  const { S } = W;
  const M = S.kittenMood;
  const kitten = TUNING.kitten;
  prepareGreeting(M, W.store.kittenMemory(), now);
  W.store.touchSeen(now);

  /** @param {string} text @param {number} sec */
  const show = (text, sec) => {
    S.moodCap = text;
    S.moodUntil = S.time + sec;
  };

  W.bus.on('kitten-greet', (e) => {
    show(e.text, 3.4);
    W.sound.mew();
  });
  W.bus.on('kitten-line', (e) => {
    show(e.text, 2.8);
  });
  W.bus.on('kitten-wake', (e) => {
    show(e.text, 2.6);
    W.sound.mew();
  });
  W.bus.on('kitten-open', () => {
    const t = Date.now();
    W.store.rememberVisit(t, kitten.visitKeep, kitten.reopenGapMs);
    syncBase(M, W.store.kittenMemory(), t);
  });
  W.bus.on('kitten-seen', () => {
    W.store.touchSeen(Date.now());
  });
  W.bus.on('close', (e) => {
    const t = Date.now();
    if (e.kind === 'slam') {
      W.store.rememberSlam(t);
      onSlammed(M);
    } else W.store.touchSeen(t);
  });
}
