import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFeelState, levelScale, nextFeel, normalizeFeel, pageOpenness, speedAmount, stepHingeFeel,
} from '../../frontend/js/hinge-feel.js';
import { HINGE_FEEL } from '../../frontend/js/tuning.js';

const DT = 1 / 60;

function step(state, over = {}) {
  return stepHingeFeel(state, {
    angle: 40,
    speed: 0,
    dt: DT,
    time: 0,
    level: 'normal',
    ...over,
  });
}

function run(level, speed, seconds, angle = 50) {
  const state = createFeelState();
  let out = step(state, { level, speed, angle, time: 0 });
  const n = Math.round(seconds / DT);
  let peak = 0;
  let flips = 0;
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    out = step(state, { level, speed, angle, time: i * DT, dt: DT });
    peak = Math.max(peak, Math.abs(out.shakeX), Math.abs(out.shakeY), Math.abs(out.parX), Math.abs(out.parY), out.fov);
    if (i > 60 && prev * out.shakeX < 0) flips += 1;
    prev = out.shakeX;
  }
  return { out, peak, flips, state };
}

test('feel level names and the step-down cycle', () => {
  assert.equal(normalizeFeel('low'), 'low');
  assert.equal(normalizeFeel('nope'), 'normal');
  assert.equal(normalizeFeel(undefined), 'normal');
  assert.equal(nextFeel('normal'), 'low');
  assert.equal(nextFeel('low'), 'off');
  assert.equal(nextFeel('off'), 'normal');
  assert.equal(levelScale('off'), 0);
  assert.equal(levelScale('low'), HINGE_FEEL.levels.low);
  assert.equal(levelScale('normal'), 1);
});

test('speed curve is a deadzone then a smooth rise, and it saturates', () => {
  assert.equal(speedAmount(0), 0);
  assert.equal(speedAmount(HINGE_FEEL.speedDead - 0.1), 0);
  assert.equal(speedAmount(HINGE_FEEL.speedFull), 1);
  assert.equal(speedAmount(HINGE_FEEL.speedFull + 500), 1);
  assert.ok(speedAmount(30) > speedAmount(12));
  assert.ok(speedAmount(-80) === speedAmount(80));
});

test('paper rustle is fuller while the pages are standing up', () => {
  assert.ok(pageOpenness(18) < pageOpenness(40));
  assert.ok(pageOpenness(50) > pageOpenness(125));
  assert.ok(pageOpenness(0) > 0.3 && pageOpenness(0) < 0.5);
});

test('creak and rustle follow speed, and low is a fixed fraction of normal', () => {
  const gains = [0, 4, 12, 40, 90, 150, 800].map((sp) => step(createFeelState(), { speed: sp, angle: 48, time: 0.2 }).creakGain);
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i] >= gains[i - 1] - 1e-9);
  assert.equal(gains[0], 0);
  assert.equal(gains[1], 0);
  assert.ok(gains[4] > gains[3]);
  const normal = step(createFeelState(), { speed: 70, angle: 48, time: 0.4 });
  const low = step(createFeelState(), { speed: 70, angle: 48, time: 0.4, level: 'low' });
  const off = step(createFeelState(), { speed: 70, angle: 48, time: 0.4, level: 'off' });
  assert.ok(Math.abs(low.creakGain / normal.creakGain - HINGE_FEEL.levels.low) < 1e-9);
  assert.ok(Math.abs(low.rustle[1].gain / normal.rustle[1].gain - HINGE_FEEL.levels.low) < 1e-9);
  assert.equal(off.creakGain, 0);
  assert.equal(off.rustle[0].gain, 0);
  assert.ok(normal.rustle[2].gain < normal.rustle[0].gain);
  assert.ok(normal.creakHz > 40 && normal.creakHz < 2000);
  const bogus = step(createFeelState(), { speed: 70, angle: 48, time: 0.4, level: 'loud' });
  assert.equal(bogus.creakGain, normal.creakGain);
});

test('thunks: right angle both ways, open only outward, closed only inward, once per crossing', () => {
  const s = createFeelState();
  assert.equal(step(s, { angle: 130, speed: 200 }).thunkCount, 0);
  let out = step(s, { angle: 80, speed: -40, time: 0.05 });
  assert.equal(out.thunkCount, 1);
  assert.equal(out.thunks[0].id, 'right');
  out = step(s, { angle: 70, speed: -40, time: 0.08 });
  assert.equal(out.thunkCount, 0);
  out = step(s, { angle: 95, speed: 40, time: 0.1 });
  assert.equal(out.thunkCount, 0);
  for (let i = 0; i < 40; i++) step(s, { angle: 95, speed: 0, time: 0.2 + i * DT });
  out = step(s, { angle: 80, speed: -30, time: 1 });
  assert.equal(out.thunks[0].id, 'right');

  const opening = createFeelState();
  step(opening, { angle: 120, speed: 20 });
  out = step(opening, { angle: 130, speed: 80, time: 0.05 });
  assert.equal(out.thunkCount, 1);
  assert.equal(out.thunks[0].id, 'open');
  const closing = createFeelState();
  step(closing, { angle: 130, speed: -20 });
  out = step(closing, { angle: 110, speed: -80, time: 0.05 });
  assert.equal(out.thunkCount, 0);

  const shut = createFeelState();
  step(shut, { angle: 8, speed: -10 });
  out = step(shut, { angle: 0, speed: -40, time: 0.05 });
  assert.equal(out.thunks[0].id, 'closed');
  const leaving = createFeelState();
  step(leaving, { angle: 0, speed: 10 });
  out = step(leaving, { angle: 8, speed: 40, time: 0.05 });
  assert.equal(out.thunkCount, 0);

  const gentle = createFeelState();
  step(gentle, { angle: 88, speed: 8 });
  const soft = step(gentle, { angle: 92, speed: 8, time: 0.05 });
  const hard = createFeelState();
  step(hard, { angle: 88, speed: 400 });
  const slam = step(hard, { angle: 92, speed: 400, time: 0.05 });
  assert.ok(soft.thunks[0].gain < slam.thunks[0].gain);
  assert.ok(slam.thunks[0].gain <= HINGE_FEEL.thunkGain + 1e-9);
  assert.ok(soft.thunks[0].gain >= HINGE_FEEL.thunkGain * HINGE_FEEL.thunkFloor - 1e-9);
});

test('a direction change clicks once, then waits out the cooldown', () => {
  const s = createFeelState();
  step(s, { speed: 80, angle: 40 });
  const click = step(s, { speed: -80, angle: 39, time: 0.02 });
  assert.ok(click.clickGain > 0);
  const again = step(s, { speed: 90, angle: 40, time: 0.04 });
  assert.equal(again.clickGain, 0);
  const same = createFeelState();
  step(same, { speed: 80 });
  assert.equal(step(same, { speed: 100, time: 0.02 }).clickGain, 0);
});

test('camera stays inside the caps, eases in, and goes quiet when feel is off', () => {
  assert.ok(HINGE_FEEL.shakeHz <= 2);
  assert.ok(HINGE_FEEL.breatheHz <= 1.2);
  assert.ok(HINGE_FEEL.fovCap <= 1.5);
  assert.ok(HINGE_FEEL.shakeCap <= 0.12);
  assert.ok(HINGE_FEEL.parallaxCap <= 0.35);

  const hot = run('normal', 5000, 3);
  assert.ok(hot.peak <= Math.max(HINGE_FEEL.shakeCap, HINGE_FEEL.parallaxCap, HINGE_FEEL.fovCap) + 1e-9);
  assert.ok(Math.abs(hot.out.shakeX) <= HINGE_FEEL.shakeCap + 1e-9);
  assert.ok(Math.abs(hot.out.parX) <= HINGE_FEEL.parallaxCap + 1e-9);
  assert.ok(hot.out.fov <= HINGE_FEEL.fovCap + 1e-9);
  assert.ok(hot.out.fov >= 0);
  assert.ok(hot.peak > HINGE_FEEL.shakeCap * 0.2);
  assert.ok(hot.flips >= 2 && hot.flips <= 8);
  assert.ok(hot.out.parX > 0);

  const closing = run('normal', -5000, 2);
  assert.ok(closing.out.parX < 0);
  assert.ok(closing.out.fov >= 0);

  const spike = step(createFeelState(), { speed: 5000, dt: DT, time: 0.2 });
  assert.ok(Math.abs(spike.shakeX) < HINGE_FEEL.shakeCap * 0.25);

  const hitch = step(createFeelState(), { speed: 5000, dt: 1, time: 0.5 });
  assert.ok(Math.abs(hitch.shakeX) <= HINGE_FEEL.shakeCap + 1e-9);
  assert.ok(Math.abs(hitch.parX) <= HINGE_FEEL.parallaxCap + 1e-9);
  assert.ok(hitch.fov <= HINGE_FEEL.fovCap + 1e-9);

  const low = run('low', 5000, 3);
  const normal = run('normal', 5000, 3);
  if (Math.abs(normal.out.shakeX) > 1e-4) {
    assert.ok(Math.abs(low.out.shakeX / normal.out.shakeX - HINGE_FEEL.levels.low) < 1e-6);
  }
  assert.ok(Math.abs(low.out.fov / normal.out.fov - HINGE_FEEL.levels.low) < 1e-6 || normal.out.fov === 0);

  const s = createFeelState();
  for (let i = 0; i < 90; i++) step(s, { speed: 120, angle: 80, time: i * DT });
  const killed = step(s, { speed: 120, angle: 100, time: 2, level: 'off' });
  assert.equal(killed.shakeX, 0);
  assert.equal(killed.fov, 0);
  assert.equal(killed.creakGain, 0);
  assert.equal(killed.thunkCount, 0);
  assert.equal(killed.parX, 0);
});

test('the same inputs always produce the same curve', () => {
  const a = run('normal', 60, 1.2, 70).out;
  const b = run('normal', 60, 1.2, 70).out;
  assert.equal(a.creakGain, b.creakGain);
  assert.equal(a.creakHz, b.creakHz);
  assert.equal(a.shakeX, b.shakeX);
  assert.equal(a.fov, b.fov);
  assert.equal(a.rustle[1].gain, b.rustle[1].gain);
});
