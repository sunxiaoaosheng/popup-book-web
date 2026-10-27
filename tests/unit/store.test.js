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
  assert.deepEqual(blankSave().secrets, {});
});

test('loads an existing save and reset clears it', () => {
  const { store } = memoryStore({ cycles: 3, secrets: { nap: 1 }, seasons: { 0: 1, 2: 1 }, muted: true, pets: 4, opens: 2 });
  assert.equal(store.cycles, 3);
  assert.equal(store.hasSecret('nap'), true);
  assert.equal(store.muted, true);
  store.reset();
  assert.equal(store.cycles, 0);
  assert.equal(store.hasSecret('nap'), false);
  assert.equal(store.muted, false);
});
