import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrackWeight, stepTrackWeight } from '../../frontend/js/track-weight.js';
import { TUNING } from '../../frontend/js/tuning.js';

const t = TUNING.trackWeight;

function pump(st, weight, sec, onSill) {
  const events = [];
  let left = sec;
  while (left > 1e-9) {
    const dt = Math.min(0.05, left);
    events.push(...stepTrackWeight(st, { weight, dt, onSill }, t));
    left -= dt;
  }
  return events;
}

test('missing weight stays idle and does not invent a gift', () => {
  const st = createTrackWeight();
  const events = pump(st, null, 3, true);
  assert.equal(events.length, 0);
  assert.equal(st.phase, 'idle');
  assert.equal(st.gift, 0);
  assert.equal(st.sniff, 0);
});

test('a single long step cannot skip the stable wait', () => {
  const st = createTrackWeight();
  const events = stepTrackWeight(st, { weight: 0.9, dt: 5, onSill: true }, t);
  assert.equal(events.length, 0);
  assert.notEqual(st.phase, 'sniff');
  assert.ok(st.stable <= 0.1 + 1e-9);
});

test('jitter does not place the gift', () => {
  const st = createTrackWeight();
  const events = [];
  for (let i = 0; i < 40; i++) {
    const weight = i % 2 ? 0.25 : 0.8;
    events.push(...stepTrackWeight(st, { weight, dt: 0.05, onSill: true }, t));
  }
  assert.equal(events.length, 0);
  assert.equal(st.phase, 'arming');
  assert.ok(st.gift < 0.05);
});

test('stable weight sniffs once, then removal recovers', () => {
  const st = createTrackWeight();
  const placed = pump(st, 0.4, t.stableSec + 0.1, true);
  assert.equal(placed.filter((e) => e.type === 'track-sniff').length, 1);
  assert.equal(st.phase, 'sniff');
  assert.ok(st.gift > 0.2);

  const held = pump(st, 0.4, t.sniffSec + 0.2, true);
  assert.equal(held.filter((e) => e.type === 'track-sniff').length, 0);
  assert.equal(st.phase, 'held');
  assert.ok(st.sniff < 0.05);
  assert.ok(st.gift > 0.9);

  const gone = pump(st, 0, 0.1, true);
  assert.equal(gone.filter((e) => e.type === 'track-recover').length, 1);
  pump(st, 0, t.recoverSec + 0.3, true);
  assert.equal(st.phase, 'idle');
  assert.ok(st.gift < 0.05);
});

test('gift size does not follow the weight reading', () => {
  const light = createTrackWeight();
  const heavy = createTrackWeight();
  pump(light, 0.3, t.stableSec + t.sniffSec + 0.4, true);
  pump(heavy, 0.95, t.stableSec + t.sniffSec + 0.4, true);
  assert.equal(light.phase, 'held');
  assert.equal(heavy.phase, 'held');
  assert.ok(Math.abs(light.gift - heavy.gift) < 0.05);
  assert.ok(light.gift > 0.9);
});

test('kitten off the sill waits, then sniffs once it arrives', () => {
  const st = createTrackWeight();
  const early = pump(st, 0.5, t.stableSec + 0.2, false);
  assert.equal(early.length, 0);
  assert.equal(st.phase, 'ready');
  assert.ok(st.gift > 0.2);
  const arrived = pump(st, 0.5, 0.1, true);
  assert.equal(arrived.filter((e) => e.type === 'track-sniff').length, 1);
});

test('the same resting weight does not sniff again until it is removed', () => {
  const st = createTrackWeight();
  const first = pump(st, 0.6, t.cooldownSec + 2, true);
  assert.equal(first.filter((e) => e.type === 'track-sniff').length, 1);
  assert.equal(st.phase, 'held');
});

test('a new placement during cooldown waits', () => {
  const st = createTrackWeight();
  pump(st, 0.6, t.stableSec + 0.1, true);
  pump(st, 0, t.recoverSec + 0.3, true);
  assert.equal(st.phase, 'idle');
  const again = pump(st, 0.6, t.stableSec + 0.3, true);
  assert.equal(again.filter((e) => e.type === 'track-sniff').length, 0);
  assert.equal(st.phase, 'ready');
});

test('a lost channel recovers without a zero reading', () => {
  const st = createTrackWeight();
  pump(st, 0.55, t.stableSec + t.sniffSec + 0.2, true);
  assert.equal(st.phase, 'held');
  const lost = pump(st, null, 0.1, true);
  assert.equal(lost.filter((e) => e.type === 'track-recover').length, 1);
  assert.equal(st.phase, 'recover');
});

test('hysteresis ignores a reading between off and on', () => {
  const st = createTrackWeight();
  pump(st, 0.16, 1.2, true);
  assert.equal(st.phase, 'idle');
  pump(st, 0.4, t.stableSec + 0.1, true);
  assert.equal(st.phase, 'sniff');
  const dipped = stepTrackWeight(st, { weight: 0.15, dt: 0.05, onSill: true }, t);
  assert.equal(dipped.length, 0);
  assert.equal(st.phase, 'sniff');
  const removed = stepTrackWeight(st, { weight: 0.05, dt: 0.05, onSill: true }, t);
  assert.equal(removed[0].type, 'track-recover');
});
