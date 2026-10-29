import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMBIENT_OFF_LABEL,
  AMBIENT_ON_LABEL,
  atmosphereFor,
  createAmbientClock,
  nextBand,
} from '../../frontend/js/ambient-light.js';
import { sampleSky } from '../../frontend/js/sky-bands.js';
import { TUNING } from '../../frontend/js/tuning.js';

const bandOf = TUNING.ambient;

test('the button says exactly these two phrases', () => {
  assert.equal(AMBIENT_OFF_LABEL, '开启环境光');
  assert.equal(AMBIENT_ON_LABEL, '关闭环境光');
});

test('hysteresis thresholds leave a dusk gap', () => {
  const a = bandOf;
  assert.ok(a.nightOn < a.nightOff);
  assert.ok(a.nightOff < a.dayOff);
  assert.ok(a.dayOff < a.dayOn);
  assert.ok(a.holdMs > 0);
  assert.ok(a.blendTau > 0);
});

test('a band stays put until the light clears the far threshold', () => {
  const a = bandOf;
  let band = nextBand(null, a.nightOn, a);
  assert.equal(band, 'night');
  band = nextBand(band, a.nightOff - 0.1, a);
  assert.equal(band, 'night');
  band = nextBand(band, a.nightOff, a);
  assert.equal(band, 'dusk');
  band = nextBand(band, a.dayOn - 0.1, a);
  assert.equal(band, 'dusk');
  band = nextBand(band, a.dayOn, a);
  assert.equal(band, 'day');
  band = nextBand(band, a.dayOff + 0.1, a);
  assert.equal(band, 'day');
  band = nextBand(band, a.dayOff, a);
  assert.equal(band, 'dusk');
  band = nextBand(band, a.nightOn + 0.1, a);
  assert.equal(band, 'dusk');
  band = nextBand(band, a.nightOn, a);
  assert.equal(band, 'night');
  assert.equal(nextBand('night', a.dayOn, a), 'day');
  assert.equal(nextBand('day', a.nightOn, a), 'night');
});

test('ambient reuses the existing sky bands of the same season', () => {
  const season = 2;
  const tops = ['day', 'dusk', 'night'].map((name) => {
    const atm = atmosphereFor(name);
    const sky = sampleSky(season, atm.uc, atm.nightP);
    assert.ok(sky.weights.dawn < 0.01);
    return sky.top;
  });
  assert.equal(new Set(tops).size, 3);
  assert.ok(sampleSky(season, atmosphereFor('day').uc, 0).weights.day > 0.99);
  assert.ok(sampleSky(season, atmosphereFor('dusk').uc, 0).weights.dusk > 0.99);
  assert.ok(sampleSky(season, atmosphereFor('night').uc, 1).weights.night > 0.99);
});

test('off, missing, and stale light all leave the book sample alone', () => {
  const clock = createAmbientClock(bandOf);
  const book = { se: 0.4, uc: 0.22, nightP: 0.1, dawnP: 0.3, goldP: 0.2, elev: 0.6 };
  assert.equal(clock.paint(book, true, 0, 5), book);
  assert.equal(clock.bandAt(true, 0), null);

  clock.note(Number.NaN, 0);
  clock.note(undefined, 0);
  clock.note(null, 0);
  assert.equal(clock.bandAt(true, 0), null);

  clock.note(bandOf.nightOn, 1000);
  assert.equal(clock.bandAt(false, 1000), null);
  assert.equal(clock.paint(book, false, 1000, 10), book);
  const edge = 1000 + bandOf.holdMs;
  assert.equal(clock.bandAt(true, edge), 'night');
  // 坏读数不刷新时间戳，过了 holdMs 就回到书里的时间。
  clock.note(Number.NaN, edge);
  assert.equal(clock.bandAt(true, edge + 1), null);
  assert.equal(clock.paint(book, true, edge + 1, 10), book);
});

test('a fresh reading eases the sky and keeps the season morph', () => {
  const clock = createAmbientClock({ ...bandOf, blendTau: 1 });
  const book = { se: 0.37, uc: 0.2, nightP: 1, dawnP: 0.4, goldP: 0.1, elev: 0 };
  clock.note(bandOf.dayOn, 0);
  const mid = clock.paint(book, true, 0, Math.log(2));
  assert.equal(mid.se, 0.37);
  assert.ok(Math.abs(mid.nightP - 0.5) < 1e-6);
  assert.notEqual(mid, book);

  const settled = clock.paint(book, true, 0, 10);
  assert.equal(settled.se, 0.37);
  assert.ok(Math.abs(settled.nightP) < 1e-6);
  assert.ok(Math.abs(settled.uc - 0.5) < 1e-6);
  assert.equal(clock.snapshot(true, 0).band, 'day');
  assert.equal(clock.snapshot(false, 0).band, null);
});

test('zero lux is night, and a bad follow-up does not keep the reading alive', () => {
  const clock = createAmbientClock(bandOf);
  clock.note(0, 50);
  assert.equal(clock.bandAt(true, 50), 'night');
  clock.note(-4, 80);
  assert.equal(clock.snapshot(true, 80).lux, 0);
  assert.equal(clock.bandAt(true, 80), 'night');
});
