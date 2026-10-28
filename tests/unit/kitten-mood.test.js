import assert from 'node:assert/strict';
import test from 'node:test';
import { SECRETS } from '../../frontend/js/story.js';
import { TUNING } from '../../frontend/js/tuning.js';
import { createStore } from '../../frontend/js/store-core.js';
import {
  blankKittenMemory, greetingKind, moodFromMemory, normalizeKittenMemory, pushVisit,
} from '../../frontend/js/kitten-memory.js';
import { GREETINGS } from '../../frontend/js/kitten-lines.js';
import {
  IDLE_ACTS, createKittenMood, onSlammed, prepareGreeting, stepKittenMood, takeIdle,
} from '../../frontend/js/kitten-mood.js';
import { applyKittenLook } from '../../frontend/js/kitten-look.js';

const K = TUNING.kitten;

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function memoryStore(initial) {
  /** @type {string|null} */
  let raw = initial ? JSON.stringify(initial) : null;
  const io = {
    read: () => (raw ? JSON.parse(raw) : null),
    write: (data) => { raw = JSON.stringify(data); },
  };
  return { store: createStore(io, io.read()), dump: () => JSON.parse(raw) };
}

function play(extra = {}) {
  return {
    dt: 1 / 60,
    angle: 92,
    speed: 0,
    visible: true,
    mode: 'play',
    captionBusy: false,
    distracted: false,
    rng: () => 0.99,
    ...extra,
  };
}

function at(h, m, day = 27) {
  return new Date(2026, 9, day, h, m, 0).getTime();
}

test('greetings differ for first visit, hours, and the next day', () => {
  const now = at(15, 0);
  assert.equal(greetingKind(blankKittenMemory(), now), 'first');
  assert.equal(greetingKind({ seenAt: now - 20 * 1000, visits: [], slammedAt: 0 }, now), 'soon');
  assert.equal(greetingKind({ seenAt: now - 10 * 60 * 1000, visits: [], slammedAt: 0 }, now), 'back');
  assert.equal(greetingKind({ seenAt: at(10, 0), visits: [], slammedAt: 0 }, now), 'hours');
  assert.equal(greetingKind({ seenAt: at(23, 50, 27), visits: [], slammedAt: 0 }, at(0, 20, 28)), 'nextday');
  const shy = { seenAt: now - 10 * 60 * 1000, visits: [], slammedAt: now - 10 * 60 * 1000 };
  assert.equal(greetingKind(shy, now), 'shy');
  const often = {
    seenAt: now - 10 * 60 * 1000,
    visits: [now - 30 * 60 * 1000, now - 20 * 60 * 1000, now - 10 * 60 * 1000],
    slammedAt: 0,
  };
  assert.equal(greetingKind(often, now), 'often');
  assert.equal(moodFromMemory(often, now), 'excited');
  assert.equal(moodFromMemory({ ...often, slammedAt: now - 5 * 60 * 1000 }, now), 'shy');
  assert.equal(GREETINGS.hours !== GREETINGS.nextday, true);
  assert.equal(GREETINGS.first.length > 0, true);
});

test('old saves gain a kitten memory and reset clears it', () => {
  const { store, dump } = memoryStore({
    cycles: 2, secrets: { nap: 1 }, seasons: { 0: 1 }, muted: false, pets: 0, opens: 1,
  });
  assert.equal(store.cycles, 2);
  assert.equal(store.hasSecret('nap'), true);
  assert.equal(store.kittenMemory().seenAt, 0);
  assert.deepEqual(store.kittenMemory().visits, []);
  const t = 1_700_000_000_000;
  store.rememberVisit(t, 8, 8000);
  store.rememberVisit(t + 1000, 8, 8000);
  assert.equal(store.kittenMemory().visits.length, 1);
  store.rememberVisit(t + 9000, 8, 8000);
  assert.equal(store.kittenMemory().visits.length, 2);
  store.rememberSlam(t + 20_000);
  assert.equal(dump().kitten.slammedAt, t + 20_000);
  assert.equal(dump().secrets.nap, 1);
  store.reset();
  assert.equal(store.cycles, 0);
  assert.equal(store.hasSecret('nap'), false);
  assert.equal(store.kittenMemory().seenAt, 0);
  assert.equal(store.kittenMemory().slammedAt, 0);
  assert.equal(normalizeKittenMemory({ seenAt: 'no', visits: [1, 'x', 2], slammedAt: -3 }).visits.length, 2);
});

test('idle acts never repeat back to back and a bag has each act once', () => {
  const M = createKittenMood();
  const rng = mulberry32(7);
  /** @type {string[]} */
  const ids = [];
  for (let i = 0; i < 42; i++) ids.push(takeIdle(M, rng));
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  for (let i = 0; i < 42; i += IDLE_ACTS.length) {
    const window = ids.slice(i, i + IDLE_ACTS.length);
    assert.equal(new Set(window).size, IDLE_ACTS.length);
    for (const id of IDLE_ACTS) assert.equal(window.includes(id), true);
  }
});

test('holding still puts the kitten to sleep, a tiny jitter wakes it', () => {
  const M = createKittenMood();
  M.greeted = true;
  const tuning = { ...K, seenEvery: 1e9 };
  for (let i = 0; i < 17 * 60; i++) stepKittenMood(M, play(), tuning);
  assert.equal(M.asleep, true);
  assert.equal(M.mood, 'sleepy');
  const noise = [];
  let angle = 92;
  for (let i = 0; i < 30 * 60; i++) {
    angle += 0.005;
    noise.push(...stepKittenMood(M, play({ angle, speed: 0.3 }), tuning));
  }
  assert.equal(M.asleep, true);
  assert.equal(noise.some((e) => e.type === 'kitten-wake'), false);
  const woke = stepKittenMood(M, play({ angle: angle + 1.4, speed: 8 }), tuning);
  assert.equal(M.asleep, false);
  assert.equal(M.mood, 'calm');
  assert.equal(woke.some((e) => e.type === 'kitten-wake'), true);
  assert.equal(typeof woke.find((e) => e.type === 'kitten-wake').text, 'string');
});

test('a hard move wakes without the gentle line, and wake hold blocks another nap', () => {
  const tuning = { ...K, idleSleepSec: 2, wakeHoldSec: 5, seenEvery: 1e9, lineChance: 0 };
  const M = createKittenMood();
  M.greeted = true;
  for (let i = 0; i < 3 * 60; i++) stepKittenMood(M, play(), tuning);
  assert.equal(M.asleep, true);
  const rough = stepKittenMood(M, play({ angle: 110, speed: 40 }), tuning);
  assert.equal(M.asleep, false);
  assert.equal(rough.some((e) => e.type === 'kitten-wake'), false);
  for (let i = 0; i < 3 * 60; i++) stepKittenMood(M, play({ angle: 110 }), tuning);
  assert.equal(M.asleep, false);
  assert.equal(M.mood, 'calm');
});

test('nap, chase and a busy caption do not steal the secret or the greeting', () => {
  assert.equal(SECRETS.length, 8);
  const nap = createKittenMood();
  nap.greeted = true;
  for (let i = 0; i < 20 * 60; i++) {
    stepKittenMood(nap, play({ mode: 'nap', angle: 60 }));
  }
  assert.equal(nap.asleep, false);
  assert.equal(nap.mood, 'calm');

  const chase = createKittenMood();
  chase.greeted = true;
  for (let i = 0; i < 20 * 60; i++) stepKittenMood(chase, play({ distracted: true }));
  assert.equal(chase.asleep, false);

  const hello = createKittenMood();
  prepareGreeting(hello, blankKittenMemory(), at(15, 0));
  assert.equal(hello.greetKind, 'first');
  const held = stepKittenMood(hello, play({ captionBusy: true, mode: 'hidden', visible: false }));
  assert.equal(hello.greeted, false);
  assert.equal(held.some((e) => e.type === 'kitten-greet'), false);
  const said = stepKittenMood(hello, play({ captionBusy: false }));
  assert.equal(said.some((e) => e.type === 'kitten-greet' && e.text === GREETINGS.first), true);
  const again = stepKittenMood(hello, play());
  assert.equal(again.some((e) => e.type === 'kitten-greet'), false);
});

test('opening past the door counts once per trip, a slam makes the kitten shy', () => {
  const M = createKittenMood();
  M.greeted = true;
  const tuning = { ...K, seenEvery: 1e9 };
  const kinds = (angle) => stepKittenMood(M, play({ angle, visible: angle > 70 }), tuning)
    .filter((e) => e.type === 'kitten-open');
  assert.equal(kinds(5).length, 0);
  assert.equal(kinds(80).length, 1);
  assert.equal(kinds(100).length, 0);
  assert.equal(kinds(4).length, 0);
  assert.equal(kinds(90).length, 1);
  M.asleep = true;
  M.mood = 'sleepy';
  onSlammed(M);
  assert.equal(M.asleep, false);
  assert.equal(M.mood, 'shy');
  assert.equal(M.base, 'shy');
  const kept = pushVisit({ seenAt: 1, visits: [1, 2, 3, 4, 5, 6, 7, 8, 9], slammedAt: 0 }, 20_000, 8, 8000);
  assert.equal(kept.visits.length, 8);
  assert.equal(kept.visits[kept.visits.length - 1], 20_000);
});

test('look changes the face and leaves the root where it was', () => {
  function stub() {
    const eye = () => ({ scale: { x: 1, y: 1 }, position: { x: 0, y: 0 } });
    return {
      eyes: [eye(), eye()],
      head: { rotation: { x: 0, y: 0, z: 0 }, position: { y: 0.6 } },
      earL: { rotation: { z: 0 } },
      earR: { rotation: { z: 0 } },
      tail: { rotation: { z: 0.2 } },
      body: { scale: { y: 1 } },
      blush: [{ material: { opacity: 0 } }, { material: { opacity: 0 } }],
      mouth: { visible: false, scale: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
      mouthLine: { visible: true },
      zzz: [{ ph: 0, s: { visible: false, material: { opacity: 0 } } }],
      root: { x: 0.2, y: 1.4, z: -0.2 },
    };
  }
  const asleep = stub();
  const sleepy = createKittenMood();
  sleepy.asleep = true;
  sleepy.mood = 'sleepy';
  applyKittenLook(asleep, sleepy, 1, 'play', false);
  assert.ok(asleep.eyes[0].scale.y < 0.4);
  assert.equal(asleep.zzz[0].s.visible, false);
  assert.equal(asleep.root.x, 0.2);
  assert.equal(asleep.head.position.y, 0.6);
  const asleepOut = stub();
  applyKittenLook(asleepOut, sleepy, 1, 'play', true);
  assert.equal(asleepOut.zzz[0].s.visible, true);
  assert.equal(asleepOut.root.x, 0.2);

  const nap = stub();
  applyKittenLook(nap, sleepy, 1, 'nap');
  assert.equal(nap.eyes[0].scale.y, 1);
  assert.equal(nap.root.z, -0.2);

  const shy = stub();
  const mood = createKittenMood();
  mood.mood = 'shy';
  mood.phase = 'act';
  mood.act = 'tilt';
  mood.actDur = 2;
  mood.phaseLeft = 1;
  applyKittenLook(shy, mood, 1, 'play');
  assert.ok(shy.blush[0].material.opacity >= 0.6);
  assert.equal(shy.root.y, 1.4);

  const wake = stub();
  wake.eyes[0].scale.y = 0.2;
  wake.eyes[1].scale.y = 0.2;
  const waking = createKittenMood();
  waking.wakeLeft = 1.15;
  waking.mood = 'calm';
  applyKittenLook(wake, waking, 1, 'play');
  assert.ok(wake.eyes[0].scale.y > 0.9);
  assert.ok(wake.earL.rotation.z < 0);
  assert.equal(wake.head.position.y, 0.6);
});
