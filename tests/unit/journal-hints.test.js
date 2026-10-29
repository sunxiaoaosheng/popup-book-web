import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALMOST, STICKER_IDS, createClosenessMemory, describeSlot, nudgeFor, observeCloseness, progressUpdates,
} from '../../frontend/js/journal-hints.js';
import { holdBand, heartTarget, secretIds } from '../../frontend/js/rules.js';
import { stickerArtIds, stickerMarkup } from '../../frontend/js/sticker-art.js';
import { createStore } from '../../frontend/js/store-core.js';
import { SECRETS } from '../../frontend/js/story.js';
import { TUNING } from '../../frontend/js/tuning.js';

function obs(over = {}) {
  return {
    angle: 0, speed: 0, swings: 0,
    dayOn: false, dayMax: 0, dayBad: '', dayDone: false, dayDur: 0,
    armed: false, closing: false, closeMax: 0, flutT: 0,
    ...over,
  };
}

function memoryStore() {
  /** @type {string|null} */
  let raw = null;
  const io = {
    read: () => (raw ? JSON.parse(raw) : null),
    write: (data) => { raw = JSON.stringify(data); },
  };
  return createStore(io, null);
}

function blankKnown() {
  /** @type {Record<string, { found: boolean, attempts: number, tier: number }>} */
  const known = {};
  for (const id of STICKER_IDS) known[id] = { found: false, attempts: 0, tier: 0 };
  return known;
}

test('sticker ids match the eight secrets and each has its own drawing', () => {
  assert.deepEqual(STICKER_IDS, secretIds());
  assert.deepEqual(stickerArtIds(), secretIds());
  const marks = secretIds().map((id) => stickerMarkup(id));
  assert.equal(new Set(marks).size, 8);
  for (const markup of marks) {
    assert.equal(markup.includes('<image'), false);
    assert.equal(markup.includes('http'), false);
    assert.equal(markup.includes('<svg'), true);
  }
});

test('a fresh book shows no hints', () => {
  for (const secret of SECRETS) {
    const slot = describeSlot(secret, { found: false, tier: 0, near: false });
    assert.equal(slot.state, 'empty');
    assert.equal(slot.line, '');
    assert.equal(slot.title, '？？？');
    assert.notEqual(ALMOST[secret.id], secret.hint);
    assert.equal(ALMOST[secret.id].includes(secret.name), false);
  }
  const mem = createClosenessMemory();
  const observed = observeCloseness(mem, obs({ angle: 0 }), TUNING);
  assert.deepEqual(observed.near, []);
  assert.deepEqual(observed.attempts, []);
  assert.deepEqual(progressUpdates(observed, () => ({ found: false, attempts: 0, tier: 0 })), []);
  assert.equal(nudgeFor(observed.rises, observed.attempts, () => ({ found: false, line: '不该出现' })), '');
});

test('nearby covers the live hold bands and leaves the dawn stretch alone', () => {
  assert.equal(holdBand(8, 1, 0), 'seam');
  assert.equal(holdBand(60, 1, 0), 'nap');
  assert.equal(holdBand(115, 1, 0), 'chase');
  assert.equal(holdBand(45, 1, 0), 'dawn');
  assert.equal(heartTarget(90), 1);

  const at = (angle) => observeCloseness(createClosenessMemory(), obs({ angle }), TUNING).near;
  assert.ok(at(8).includes('seam'));
  assert.ok(at(60).includes('nap'));
  assert.equal(at(45).includes('nap'), false);
  assert.ok(at(115).includes('chase'));
  assert.ok(at(90).includes('heart'));
  assert.equal(at(70).includes('heart'), false);
  assert.equal(at(0).includes('seam'), false);
});

test('three seam visits earn the old hint; jitter does not count twice', () => {
  const store = memoryStore();
  const mem = createClosenessMemory();
  const secret = SECRETS[0];
  const stepAt = (angle) => {
    const observed = observeCloseness(mem, obs({ angle }), TUNING);
    store.applyJournal(progressUpdates(observed, (id) => ({
      found: store.hasSecret(id),
      attempts: store.attemptCount(id),
      tier: store.hintTier(id),
    })));
    return observed;
  };

  stepAt(8);
  assert.equal(store.attemptCount('seam'), 1);
  assert.equal(store.hintTier('seam'), 1);
  const close = describeSlot(secret, { found: false, tier: 1, near: true });
  assert.equal(close.line, ALMOST.seam);
  assert.notEqual(close.line, secret.hint);
  stepAt(24);
  stepAt(24);
  assert.equal(store.attemptCount('seam'), 1);

  stepAt(40);
  stepAt(8);
  stepAt(40);
  stepAt(8);
  assert.equal(store.attemptCount('seam'), 3);
  assert.equal(store.hintTier('seam'), 2);
  const earned = describeSlot(secret, { found: false, tier: store.hintTier('seam'), near: false });
  assert.equal(earned.state, 'hint');
  assert.equal(earned.line, secret.hint);
  assert.equal(earned.title, '？？？');
  for (const other of SECRETS.slice(1)) assert.equal(store.hintTier(other.id), 0);
});

test('nudge names only the secret you just brushed', () => {
  const mem = createClosenessMemory();
  const observed = observeCloseness(mem, obs({ angle: 8 }), TUNING);
  const known = blankKnown();
  for (const u of progressUpdates(observed, (id) => known[id])) {
    if (u.attempt) known[u.id].attempts += 1;
    known[u.id].tier = Math.max(known[u.id].tier, u.tier);
  }
  const line = nudgeFor(observed.rises, observed.attempts, (id) => {
    const secret = SECRETS.find((s) => s.id === id);
    const slot = describeSlot(secret, { found: false, tier: known[id].tier, near: observed.near.includes(id) });
    return { found: false, line: slot.line };
  });
  assert.equal(line, ALMOST.seam);
  assert.equal(line.includes('猫头鹰'), false);
});

test('owl, shake, fullday and goodnight use closeness instead of the trigger', () => {
  const owl = observeCloseness(createClosenessMemory(), obs({ angle: 80, speed: TUNING.fastAbove * TUNING.stickerOwlSpeedFrac }), TUNING);
  assert.ok(owl.near.includes('owl'));
  assert.ok(owl.attempts.includes('owl'));
  const slow = observeCloseness(createClosenessMemory(), obs({ angle: 80, speed: 10 }), TUNING);
  assert.equal(slow.near.includes('owl'), false);

  const early = observeCloseness(createClosenessMemory(), obs({ angle: 20, speed: 100, flutT: 1.2 }), TUNING);
  assert.ok(early.attempts.includes('owl'));
  assert.equal(early.near.includes('owl'), false);

  const shake = observeCloseness(createClosenessMemory(), obs({ angle: 40, swings: TUNING.stickerShakeAlmost }), TUNING);
  assert.ok(shake.near.includes('shake'));
  const still = observeCloseness(createClosenessMemory(), obs({ angle: 40, swings: 1 }), TUNING);
  assert.equal(still.near.includes('shake'), false);

  const dayMem = createClosenessMemory();
  const going = observeCloseness(dayMem, obs({
    angle: 100, dayOn: true, dayMax: TUNING.stickerDayAlmost, dayDone: false,
  }), TUNING);
  assert.ok(going.near.includes('fullday'));
  const failed = observeCloseness(dayMem, obs({
    angle: TUNING.dayEnd, dayOn: true, dayMax: TUNING.dayEnd, dayDone: true, dayDur: 5, dayBad: 'fast',
  }), TUNING);
  assert.ok(failed.attempts.includes('fullday'));
  const doneMem = createClosenessMemory();
  observeCloseness(doneMem, obs({ angle: 100, dayOn: true, dayMax: 100 }), TUNING);
  const success = observeCloseness(doneMem, obs({
    angle: TUNING.dayEnd, dayOn: true, dayMax: TUNING.dayEnd, dayDone: true, dayDur: TUNING.daySeconds, dayBad: '',
  }), TUNING);
  assert.equal(success.attempts.includes('fullday'), false);

  const night = createClosenessMemory();
  const almost = observeCloseness(night, obs({
    angle: 30, armed: true, closing: true, closeMax: TUNING.gentleBelow + 4,
  }), TUNING);
  assert.ok(almost.near.includes('goodnight'));
  assert.equal(almost.attempts.includes('goodnight'), false);
  const hard = observeCloseness(night, obs({
    angle: 3, armed: false, closing: false, closeMax: 80,
  }), TUNING);
  assert.ok(hard.attempts.includes('goodnight'));
  const soft = createClosenessMemory();
  observeCloseness(soft, obs({ angle: 40, armed: true, closing: true, closeMax: 10 }), TUNING);
  const closed = observeCloseness(soft, obs({ angle: 3, armed: false, closing: false, closeMax: 10 }), TUNING);
  assert.equal(closed.attempts.includes('goodnight'), false);
});

test('a found secret stops taking hint progress', () => {
  const observed = observeCloseness(createClosenessMemory(), obs({ angle: 8 }), TUNING);
  const updates = progressUpdates(observed, (id) => ({
    found: id === 'seam', attempts: 0, tier: 0,
  }));
  assert.equal(updates.some((u) => u.id === 'seam'), false);
  const secret = SECRETS[0];
  const slot = describeSlot(secret, { found: true, tier: 0, near: true });
  assert.equal(slot.state, 'got');
  assert.equal(slot.title, secret.name);
  assert.equal(slot.line, secret.found);
  assert.equal(slot.near, false);
});
