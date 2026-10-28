import assert from 'node:assert/strict';
import test from 'node:test';
import { blankSave, createStore } from '../../frontend/js/store-core.js';

function memoryStore(initial) {
  /** @type {string|null} */
  let raw = initial ? JSON.stringify(initial) : null;
  const io = {
    read: () => (raw ? JSON.parse(raw) : null),
    write: (data) => { raw = JSON.stringify(data); },
  };
  return { store: createStore(io, io.read()), dump: () => JSON.parse(raw) };
}

test('blank save and first secret', () => {
  const { store, dump } = memoryStore(null);
  assert.equal(store.foundCount(), 0);
  assert.equal(store.cycles, 0);
  assert.equal(store.addSecret('seam'), true);
  assert.equal(store.addSecret('seam'), false);
  assert.equal(store.foundCount(), 1);
  assert.equal(store.addCycle(), 1);
  store.markSeason(1);
  assert.equal(store.seasonSeen(1), true);
  store.setMuted(true);
  assert.equal(dump().muted, true);
  assert.equal(store.feel, 'normal');
  store.setFeel('low');
  assert.equal(dump().feel, 'low');
  assert.equal(store.muted, true);
  store.setFeel('nope');
  assert.equal(store.feel, 'normal');
  store.setFeel('off');
  store.reset();
  assert.equal(store.feel, 'normal');
  assert.equal(store.muted, false);
  assert.deepEqual(blankSave().secrets, {});
});

test('loads an existing save and reset clears it', () => {
  const { store } = memoryStore({ cycles: 3, secrets: { nap: 1 }, seasons: { 0: 1, 2: 1 }, muted: true, pets: 4, opens: 2 });
  assert.equal(store.cycles, 3);
  assert.equal(store.hasSecret('nap'), true);
  assert.equal(store.muted, true);
  assert.equal(store.feel, 'normal');
  assert.equal(store.attemptCount('seam'), 0);
  assert.equal(store.finalePlayed(), false);
  store.reset();
  assert.equal(store.cycles, 0);
  assert.equal(store.hasSecret('nap'), false);
  assert.equal(store.muted, false);
  assert.equal(store.feel, 'normal');
});

test('a saved feel level comes back, and an unknown one falls back to normal', () => {
  const kept = memoryStore({ feel: 'off', muted: false });
  assert.equal(kept.store.feel, 'off');
  assert.equal(kept.store.muted, false);
  const junk = memoryStore({ feel: 'max' });
  assert.equal(junk.store.feel, 'normal');
});

test('sticker progress sticks on the old save and reset clears it', () => {
  const { store, dump } = memoryStore({
    cycles: 2,
    secrets: { seam: 5 },
    journal: { attempts: { owl: 4 }, tiers: { owl: 9, nap: 1 }, finaleSeen: 1 },
  });
  assert.equal(store.hasSecret('seam'), true);
  assert.equal(store.attemptCount('owl'), 4);
  assert.equal(store.hintTier('owl'), 2);
  assert.equal(store.hintTier('nap'), 1);
  assert.equal(store.finalePlayed(), true);
  assert.equal(store.applyJournal([{ id: 'heart', attempt: true, tier: 1 }]), true);
  assert.equal(store.applyJournal([{ id: 'heart', tier: 1 }]), false);
  assert.equal(store.attemptCount('heart'), 1);
  assert.equal(store.hintTier('heart'), 1);
  assert.equal(dump().journal.finaleSeen, true);
  store.reset();
  assert.equal(store.hasSecret('seam'), false);
  assert.equal(store.attemptCount('owl'), 0);
  assert.equal(store.hintTier('heart'), 0);
  assert.equal(store.finalePlayed(), false);
});
