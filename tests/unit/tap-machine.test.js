import assert from 'node:assert/strict';
import test from 'node:test';
import { TUNING } from '../../frontend/js/tuning.js';
import { petalAccent } from '../../frontend/js/tap-accent.js';
import {
  catchupBlocksTaps, createTapState, doorNudgeYaw, lookUpBias, readTap, stageBlocksTaps, stepTap,
} from '../../frontend/js/tap-machine.js';

const light = { kind: 'slap', strength: TUNING.tapKeyLight };
const strong = { kind: 'slap', strength: TUNING.tapKeyStrong };
const dbl = { kind: 'double-knock', strength: TUNING.tapKeyKnock };
const triple = { kind: 'triple-knock', strength: TUNING.tapKeyKnock };

test('spec timings stay put', () => {
  assert.equal(TUNING.tapCooldown, 1);
  assert.equal(TUNING.tapPetalSec, 0.6);
  assert.ok(TUNING.tapKeyLight < TUNING.tapStrong);
  assert.ok(TUNING.tapKeyStrong >= TUNING.tapStrong);
});

test('light slap nudges the door and looks up', () => {
  const s = createTapState();
  const ev = stepTap(s, { dt: 0, taps: [light] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'tap');
  assert.equal(ev[0].gesture, 'light-slap');
  assert.equal(s.door, 1);
  assert.equal(s.look, 1);
  assert.equal(s.petal, 0);
  assert.equal(s.last, 'light-slap');
  assert.ok(Math.abs(doorNudgeYaw(1)) < 1e-9);
  assert.ok(doorNudgeYaw(0.5) > 0.2);
  assert.equal(doorNudgeYaw(0), 0);
  assert.ok(lookUpBias(0.5) > 0.9);
  stepTap(s, { dt: TUNING.tapDoorSec / 2, taps: [] });
  assert.ok(Math.abs(s.door - 0.5) < 1e-9);
});

test('a strong slap shares the shy path and does not nudge', () => {
  const s = createTapState();
  const ev = stepTap(s, { dt: 0, taps: [{ kind: 'slap', strength: TUNING.tapStrong }] });
  assert.equal(ev[0].gesture, 'strong-slap');
  assert.equal(s.door, 0);
  assert.equal(s.look, 0);
  const under = stepTap(createTapState(), { dt: 0, taps: [{ kind: 'slap', strength: TUNING.tapStrong - 0.001 }] });
  assert.equal(under[0].gesture, 'light-slap');
});

test('double-knock reveals the first near secret, or nothing', () => {
  const hit = stepTap(createTapState(), { dt: 0, taps: [dbl], near: ['nap', 'heart'] });
  assert.equal(hit[0].gesture, 'double-knock');
  assert.equal(hit[0].secret, 'nap');
  const miss = stepTap(createTapState(), { dt: 0, taps: [dbl], near: [] });
  assert.equal(miss[0].secret, '');
  const blank = stepTap(createTapState(), { dt: 0, taps: [dbl], near: ['', 'seam'] });
  assert.equal(blank[0].secret, 'seam');
});

test('triple-knock is a 0.6s petal accent and not a season sweep', () => {
  const s = createTapState();
  const ev = stepTap(s, { dt: 0, taps: [triple] });
  assert.equal(ev[0].gesture, 'triple-knock');
  assert.equal(s.petal, 0.6);
  assert.equal(s.door, 0);
  assert.equal('seasonT' in ev[0], false);
  assert.equal('waveform' in ev[0], false);
  stepTap(s, { dt: 0.6, taps: [] });
  assert.equal(s.petal, 0);

  let maxR = 0;
  for (let i = 0; i < TUNING.tapPetals; i++) {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const p = petalAccent(i, TUNING.tapPetals, u, 1.2);
      maxR = Math.max(maxR, Math.hypot(p.x, p.z));
      if (u === 0 || u === 1) assert.ok(p.alpha < 0.02, p.alpha);
    }
  }
  assert.ok(maxR < 1.2, maxR);
  assert.ok(petalAccent(3, 22, 0.5, 0).alpha > 0.9);
  const left = petalAccent(1, 22, 0.4, 0).x;
  const right = petalAccent(1, 22, 0.8, 0).x;
  assert.ok(Math.abs(right - left) < 0.5);
});

test('cooldown is about a second and does not extend', () => {
  const s = createTapState();
  stepTap(s, { dt: 0, taps: [light] });
  const ignored = stepTap(s, { dt: 0.2, taps: [strong, dbl] });
  assert.equal(ignored[0].reason, 'cooldown');
  assert.equal(ignored[1].reason, 'cooldown');
  assert.equal(s.last, 'light-slap');
  const again = stepTap(s, { dt: 0.8, taps: [triple] });
  assert.equal(again[0].gesture, 'triple-knock');
});

test('season catch-up and the opening stage drop the tap without cooling down', () => {
  const during = createTapState();
  const caught = stepTap(during, { dt: 0, taps: [light], catchup: true });
  assert.equal(caught[0].reason, 'catchup');
  assert.equal(during.cool, 0);
  assert.equal(during.door, 0);
  const staged = stepTap(createTapState(), { dt: 0, taps: [triple], staging: true });
  assert.equal(staged[0].reason, 'stage');
  assert.equal(staged[0].type, 'tap-ignored');
  const both = stepTap(createTapState(), { dt: 0, taps: [light], catchup: true, staging: true });
  assert.equal(both[0].reason, 'catchup');
  const after = stepTap(during, { dt: 0, taps: [light], catchup: false });
  assert.equal(after[0].gesture, 'light-slap');

  assert.equal(catchupBlocksTaps({ seasonCatchup: true }), true);
  assert.equal(catchupBlocksTaps({ revealOpen: true }), true);
  assert.equal(catchupBlocksTaps({}), false);
  assert.equal(stageBlocksTaps(null, false), true);
  assert.equal(stageBlocksTaps(null, true), false);
  assert.equal(stageBlocksTaps({ live: true, bow: 0, bowFull: false }, true), true);
  assert.equal(stageBlocksTaps({ live: false, bow: 0.4, bowFull: true }, true), true);
  assert.equal(stageBlocksTaps({ live: false, bow: 0, bowFull: false }, true), false);
});

test('waveform and unknown kinds never become a gesture', () => {
  const raw = { kind: 'slap', strength: 0.2, waveform: [0.1, 0.4, 0.9], samples: [1, 2, 3] };
  const tap = readTap(raw);
  assert.deepEqual(tap, { kind: 'slap', strength: 0.2 });
  assert.equal('waveform' in tap, false);
  const ev = stepTap(createTapState(), { dt: 0, taps: [raw] });
  assert.equal(ev[0].gesture, 'light-slap');
  assert.equal('samples' in ev[0], false);
  const bad = stepTap(createTapState(), { dt: 0, taps: [{ kind: 'wave', strength: 0.4, waveform: [1] }] });
  assert.equal(bad[0].reason, 'bad');
  assert.equal(bad[0].type, 'tap-ignored');
  assert.equal(readTap({ kind: 'slap', strength: NaN }), null);
  assert.equal(readTap(null), null);
});
