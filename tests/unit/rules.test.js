import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeKind, heartTarget, holdBand, holdDuration, isStartleOpen, morphProgress,
  noteShake, seasonIndex, secretIds, stepFullday, timeOfDay, wantsDawnStretch,
} from '../../frontend/js/rules.js';
import { TUNING } from '../../frontend/js/tuning.js';

const blankRun = () => ({ on: false, t0: 0, max: 0, bad: '', done: false, dur: 0 });

test('eight secrets, stable ids', () => {
  assert.deepEqual(secretIds(), ['seam', 'nap', 'heart', 'owl', 'shake', 'chase', 'fullday', 'goodnight']);
});

test('season wraps', () => {
  assert.equal(seasonIndex(0), 0);
  assert.equal(seasonIndex(4), 0);
  assert.equal(seasonIndex(-1), 3);
});

test('morph progress is the open fraction inside the band', () => {
  assert.equal(morphProgress(10), 0);
  assert.equal(morphProgress(TUNING.seasonMorphLo), 0);
  const mid = (TUNING.seasonMorphLo + TUNING.seasonMorphHi) / 2;
  assert.ok(Math.abs(morphProgress(mid) - 0.5) < 1e-9);
  assert.equal(morphProgress(90), 1);
});

test('time of day names follow the sundial marks', () => {
  const times = [[0, '清晨'], [0.2, '上午'], [0.4, '正午'], [0.6, '午后'], [0.8, '黄昏']];
  assert.equal(timeOfDay(0, times), '清晨');
  assert.equal(timeOfDay(0.4, times), '正午');
  assert.equal(timeOfDay(0.9, times), '黄昏');
});

test('hold bands cover seam, dawn, nap, chase', () => {
  assert.equal(holdBand(8, 0, 0), 'seam');
  assert.equal(holdBand(45, 1, 0), 'dawn');
  assert.equal(holdBand(60, 1, 0), 'nap');
  assert.equal(holdBand(55, 1, 0), 'dawn');
  assert.equal(holdBand(115, 1, 0), 'chase');
  assert.equal(holdBand(30, 1, 0), '');
  assert.equal(holdDuration('dawn'), TUNING.dawnHold);
  assert.equal(holdDuration('seam'), TUNING.holdSeconds);
});

test('heart, dawn, startle, close', () => {
  assert.equal(heartTarget(90), 1);
  assert.equal(heartTarget(0), 0);
  assert.equal(wantsDawnStretch(45, 1, 0, 0, false), true);
  assert.equal(wantsDawnStretch(45, 1, 0.2, 0, false), false);
  assert.equal(isStartleOpen(TUNING.fastAbove + 1, 40), true);
  assert.equal(isStartleOpen(10, 40), false);
  assert.equal(closeKind(10), 'gentle');
  assert.equal(closeKind(80), 'normal');
  assert.equal(closeKind(TUNING.slamAbove + 1), 'slam');
});

test('shake needs four reversals', () => {
  const sw = { dir: 0, ext: 0, swings: [] };
  let t = 0;
  const push = (angle) => noteShake(sw, angle, t, -99);
  push(30);
  t = 0.1;
  assert.equal(push(40), false);
  t = 0.2;
  assert.equal(push(30), false);
  t = 0.3;
  assert.equal(push(40), false);
  t = 0.4;
  assert.equal(push(30), false);
  t = 0.5;
  assert.equal(push(40), true);
});

test('fullday: slow discover, fast hint, back invalidates', () => {
  const slow = blankRun();
  assert.equal(stepFullday(slow, 10, 1, 0), 'arm');
  assert.equal(stepFullday(slow, 80, 1, 5), '');
  assert.equal(stepFullday(slow, 122, 1, 10), 'discover');
  assert.ok(slow.dur >= TUNING.daySeconds);

  const fast = blankRun();
  stepFullday(fast, 10, 1, 0);
  assert.equal(stepFullday(fast, 122, 1, 5), 'fast');

  const back = blankRun();
  stepFullday(back, 10, 1, 0);
  stepFullday(back, 80, 1, 4);
  stepFullday(back, 70, 1, 5);
  assert.equal(back.bad, 'back');
  assert.equal(stepFullday(back, 122, 1, 12), '');
});
