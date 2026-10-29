import assert from 'node:assert/strict';
import test from 'node:test';
import { createHapticLink, encodeHapticTap } from '../../frontend/js/trackpad-haptic.js';
import {
  createPetStick, followPetCursor, inHotspot, pinCursor, pressNow, PURR_LINE,
  sampleForce, stepPetStick, wheelNdc,
} from '../../frontend/js/trackpad-pet.js';
import { TUNING } from '../../frontend/js/tuning.js';

const T = TUNING.trackpad;

function input(over = {}) {
  return {
    dt: 0.016,
    angle: 100,
    over: false,
    present: true,
    escape: false,
    down: false,
    force: null,
    forceKnown: false,
    ...over,
  };
}

test('cursor sticks only inside the hotspot once the lid is open enough', () => {
  const low = createPetStick();
  assert.equal(stepPetStick(low, input({ over: true, angle: T.stickOn - 0.1 }), T).length, 0);
  assert.equal(low.stuck, false);

  const shut = createPetStick();
  assert.equal(stepPetStick(shut, input({ over: true, present: false, angle: 120 }), T).length, 0);

  const s = createPetStick();
  const ev = stepPetStick(s, input({ over: true, angle: T.stickOn }), T);
  assert.equal(ev[0].type, 'pet-stick');
  assert.equal(s.stuck, true);
  assert.equal(stepPetStick(s, input({ over: false, angle: 110 }), T).length, 0);
  assert.equal(s.stuck, true);
});

test('stuck cursor ignores finger and trackpad scroll, then pins to the cat', () => {
  const s = createPetStick();
  s.stuck = true;
  s.x = 0.2;
  s.y = -0.1;
  assert.equal(followPetCursor(s, {
    pointer: { x: 0.9, y: 0.4 },
    wheel: { dx: 0.5, dy: -0.5 },
  }), 'stuck');
  assert.equal(s.x, 0.2);
  assert.equal(s.y, -0.1);
  assert.equal(pinCursor(s, 0.05, 0.4), true);
  assert.deepEqual({ x: s.x, y: s.y, via: s.via }, { x: 0.05, y: 0.4, via: 'stuck' });

  const free = createPetStick();
  assert.equal(pinCursor(free, 1, 1), false);
  assert.equal(followPetCursor(free, { pointer: { x: 2, y: -2 }, wheel: { dx: 1, dy: 1 } }), 'pointer');
  assert.deepEqual({ x: free.x, y: free.y, via: free.via }, { x: 1, y: -1, via: 'pointer' });
  const scrolled = createPetStick();
  assert.equal(scrolled.seen, false);
  const nudge = wheelNdc(0, 40, 0, T.scrollNdc);
  assert.equal(followPetCursor(scrolled, { wheel: nudge }), 'wheel');
  assert.ok(Math.abs(scrolled.y - nudge.dy) < 1e-9);
  assert.equal(scrolled.x, 0);
  assert.equal(scrolled.via, 'wheel');
  assert.equal(scrolled.seen, true);
});

test('trackpad scroll nudges in NDC and a finger sample wins the same frame', () => {
  assert.deepEqual(wheelNdc(10, 20, 0, 0.01), { dx: 0.1, dy: -0.2 });
  assert.deepEqual(wheelNdc(0, 1, 1, 0.01), { dx: 0, dy: -0.16 });
  assert.deepEqual(wheelNdc(0, 1000, 0, 0.01), { dx: 0, dy: -0.8 });
  const s = createPetStick();
  followPetCursor(s, { pointer: null, wheel: { dx: 0.2, dy: 0.2 } });
  assert.equal(s.via, 'wheel');
  followPetCursor(s, { pointer: { x: -0.25, y: 0.5 }, wheel: { dx: 0.2, dy: 0.2 } });
  assert.deepEqual({ x: s.x, y: s.y, via: s.via }, { x: -0.25, y: 0.5, via: 'pointer' });
});

test('hotspot is a radius around the kitten', () => {
  assert.equal(inHotspot({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.12), true);
  assert.equal(inHotspot({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 0.12), false);
  assert.equal(inHotspot({ x: 0, y: 0 }, null, 0.12), false);
});

test('Esc lets go and does not stick again until the cursor leaves', () => {
  const s = createPetStick();
  stepPetStick(s, input({ over: true }), T);
  const left = stepPetStick(s, input({ over: true, escape: true }), T);
  assert.equal(left[0].reason, 'esc');
  assert.equal(s.stuck, false);
  assert.equal(s.holdOff, true);
  assert.equal(stepPetStick(s, input({ over: true }), T).length, 0);
  assert.equal(s.stuck, false);
  stepPetStick(s, input({ over: false }), T);
  assert.equal(s.holdOff, false);
  assert.equal(stepPetStick(s, input({ over: true }), T)[0].type, 'pet-stick');
});

test('a low lid lets go, and opening again can stick without leaving first', () => {
  const s = createPetStick();
  stepPetStick(s, input({ over: true, angle: 100 }), T);
  assert.equal(stepPetStick(s, input({ over: true, angle: T.stickOff + 1 }), T).length, 0);
  assert.equal(s.stuck, true);
  const low = stepPetStick(s, input({ over: true, angle: T.stickOff - 0.1 }), T);
  assert.equal(low[0].reason, 'lid');
  assert.equal(s.holdOff, false);
  assert.equal(stepPetStick(s, input({ over: true, angle: T.stickOn - 1 }), T).length, 0);
  assert.equal(stepPetStick(s, input({ over: true, angle: T.stickOn }), T)[0].type, 'pet-stick');
});

test('kitten leaving unsticks even if the lid stays open', () => {
  const s = createPetStick();
  stepPetStick(s, input({ over: true }), T);
  const gone = stepPetStick(s, input({ over: true, present: false }), T);
  assert.equal(gone[0].reason, 'gone');
  assert.equal(s.stuck, false);
});

test('light force or a plain press squints and says purr once', () => {
  const armed = createPetStick();
  const clickedOn = stepPetStick(armed, input({ over: true, down: true }), T);
  assert.equal(clickedOn.some((e) => e.type === 'pet-purr'), false);
  assert.equal(armed.stuck, true);

  stepPetStick(armed, input({ over: true, down: false }), T);
  const purr = stepPetStick(armed, input({ over: true, down: true }), T);
  assert.equal(purr.filter((e) => e.type === 'pet-purr').length, 1);
  assert.equal(purr.find((e) => e.type === 'pet-purr').text, PURR_LINE);
  assert.equal(purr.find((e) => e.type === 'pet-purr').gain, undefined);
  assert.equal(armed.squint, 1);
  const held = stepPetStick(armed, input({ over: true, down: true, dt: 0.2 }), T);
  assert.equal(held.some((e) => e.type === 'pet-purr'), false);
  assert.equal(armed.squint, 1);

  const force = createPetStick();
  stepPetStick(force, input({ over: true }), T);
  const soft = stepPetStick(force, input({ over: true, forceKnown: true, force: T.lightForce - 0.1 }), T);
  assert.equal(soft.some((e) => e.type === 'pet-purr'), false);
  const light = stepPetStick(force, input({
    over: true, forceKnown: true, force: T.lightForce, down: false,
  }), T);
  assert.equal(light.filter((e) => e.type === 'pet-purr').length, 1);
  assert.equal(light.find((e) => e.type === 'pet-purr').volume, undefined);

  const deep = createPetStick();
  stepPetStick(deep, input({ over: true }), T);
  const hard = stepPetStick(deep, input({ over: true, forceKnown: true, force: 3, down: false }), T);
  assert.equal(hard.filter((e) => e.type === 'pet-purr').length, 1);
  assert.equal(hard[0].text, PURR_LINE);

  const fallback = createPetStick();
  stepPetStick(fallback, input({ over: true }), T);
  const press = stepPetStick(fallback, input({
    over: true, forceKnown: true, force: 0.1, down: true,
  }), T);
  assert.equal(press.some((e) => e.type === 'pet-purr'), true);
});

test('purr caption waits out its gap, squint lets go after the press', () => {
  const s = createPetStick();
  stepPetStick(s, input({ over: true }), T);
  stepPetStick(s, input({ over: true, down: true }), T);
  stepPetStick(s, input({ over: true, down: false }), T);
  const again = stepPetStick(s, input({ over: true, down: true, dt: 0.05 }), T);
  assert.equal(again.some((e) => e.type === 'pet-purr'), false);
  assert.equal(s.squint, 1);
  stepPetStick(s, input({ over: true, down: false, dt: T.squintSec }), T);
  assert.equal(s.squint, 0);
  stepPetStick(s, input({ over: true, down: false, dt: T.purrGap }), T);
  const later = stepPetStick(s, input({ over: true, down: true }), T);
  assert.equal(later.filter((e) => e.type === 'pet-purr').length, 1);
});

test('force is real only from webkitForce or a pen, not a mouse pressure of 0.5', () => {
  assert.deepEqual(sampleForce({ pressure: 0.5, pointerType: 'mouse' }), { forceKnown: false, force: null });
  assert.deepEqual(sampleForce({ webkitForce: 1, forceBasis: 1 }), { forceKnown: true, force: 1 });
  assert.deepEqual(sampleForce({ webkitForce: 0.4, forceBasis: 1 }), { forceKnown: true, force: 0.4 });
  assert.deepEqual(sampleForce({ pressure: 0.4, pointerType: 'pen' }), { forceKnown: true, force: 0.4 });
  assert.equal(pressNow({ forceKnown: false, force: null, down: true }, T.lightForce), true);
  assert.equal(pressNow({ forceKnown: false, force: null, down: false }, T.lightForce), false);
  assert.equal(pressNow({ forceKnown: true, force: 0.2, down: false }, T.lightForce), false);
});

test('haptic tap has no knob or volume and degrades when send fails', () => {
  const body = JSON.parse(encodeHapticTap());
  assert.deepEqual(body, { v: 1, type: 'haptic', pattern: 'tap' });
  assert.equal(body.gain, undefined);
  assert.equal(body.volume, undefined);
  assert.equal(body.knob, undefined);

  const sent = [];
  const link = createHapticLink((raw) => { sent.push(raw); return true; }, 0.12);
  assert.equal(link.pulse(1), true);
  assert.equal(link.pulse(1.05), false);
  assert.equal(sent.length, 1);
  assert.equal(link.pulse(1.2), true);

  const down = createHapticLink(() => false, 0);
  assert.equal(down.pulse(0), false);
  const broken = createHapticLink(() => { throw new Error('closed'); }, 0);
  assert.equal(broken.pulse(0), false);
  assert.equal(createHapticLink(null, 0).pulse(0), false);
});
