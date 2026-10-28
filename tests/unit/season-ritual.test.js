import assert from 'node:assert/strict';
import test from 'node:test';
import { morphProgress } from '../../frontend/js/rules.js';
import { motifEvents, ritualFront, ritualIntensity, ritualKind, sweepParticle } from '../../frontend/js/season-ritual.js';
import { playSeasonMotif } from '../../frontend/js/season-motif.js';
import { sampleSky, skyWeights, twilightPulse } from '../../frontend/js/sky-bands.js';
import { TUNING } from '../../frontend/js/tuning.js';

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex) => rgb(hex).reduce((s, v) => s + v, 0) / 3;
const sat = (hex) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

test('ritual kinds follow the season you are entering', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, -1].map(ritualKind),
    ['petals', 'fireflies', 'leaves', 'snow', 'petals', 'snow'],
  );
});

test('intensity is a bell and the front crosses the page', () => {
  assert.equal(ritualIntensity(0), 0);
  assert.equal(ritualIntensity(1), 0);
  assert.ok(ritualIntensity(0.5) > 0.99);
  assert.ok(ritualIntensity(0.15) > 0.4);
  assert.equal(ritualFront(0), 0);
  assert.equal(ritualFront(1), 1);
  assert.ok(ritualFront(0.2) < ritualFront(0.5) && ritualFront(0.5) < ritualFront(0.8));
  const span = TUNING.seasonMorphHi - TUNING.seasonMorphLo;
  const early = ritualFront(morphProgress(TUNING.seasonMorphLo + span * 0.25));
  const late = ritualFront(morphProgress(TUNING.seasonMorphLo + span * 0.75));
  assert.ok(early < 0.35 && late > 0.65);
});

test('sweep particles stay on the front and move with time', () => {
  const n = 48;
  for (const kind of ['petals', 'fireflies', 'leaves', 'snow']) {
    for (const t of [0.25, 0.5, 0.75]) {
      const front = ritualFront(t);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const p = sweepParticle(i, n, t, 0.4, kind);
        sum += p.u;
        assert.ok(Math.abs(p.u - front) <= TUNING.ritualBand + 1e-6, `${kind} ${t} ${p.u}`);
        assert.ok(p.alpha > 0 && p.alpha <= 1);
        assert.ok(p.lift > 0 && p.lift < 1);
        assert.ok(p.v >= 0 && p.v < 1);
      }
      assert.ok(Math.abs(sum / n - front) < 0.12, `${kind} mean ${sum / n} front ${front}`);
    }
  }
  const slot = { u: 0, v: 0, lift: 0, spin: 0, scale: 0, alpha: 0, front: 0 };
  assert.equal(sweepParticle(2, 16, 0.4, 0, 'snow', TUNING, slot), slot);
  const still = sweepParticle(3, 32, 0.5, 0, 'petals');
  const later = sweepParticle(3, 32, 0.5, 2, 'petals');
  assert.notEqual(still.spin, later.spin);
  assert.equal(sweepParticle(1, 8, 0, 1, 'snow').alpha, 0);
});

test('each season has its own short motif', () => {
  const sigs = [0, 1, 2, 3].map((s) => motifEvents(s).map((e) => e.f0).join(','));
  assert.equal(new Set(sigs).size, 4);
  for (let s = 0; s < 4; s++) {
    const ev = motifEvents(s);
    assert.ok(ev.length >= 4);
    for (const e of ev) {
      assert.ok(e.t >= 0 && e.dur > 0 && e.dur < 2);
      assert.ok(e.f0 > 40 && e.f1 > 40 && e.vol > 0 && e.vol <= 1);
      assert.ok(e.wave === 'sine' || e.wave === 'triangle');
    }
    const end = Math.max(...ev.map((e) => e.t + e.dur));
    assert.ok(end < 4);
  }
  assert.ok(motifEvents(1).some((e) => e.f0 > 1400));
  const avg = (s) => {
    const ev = motifEvents(s);
    return ev.reduce((sum, e) => sum + e.f0, 0) / ev.length;
  };
  assert.ok(avg(3) > avg(2));
});

test('motif player schedules notes and stays quiet before unlock', () => {
  /** @type {any[]} */
  const calls = [];
  playSeasonMotif({
    ready: true,
    log(name) { calls.push(name); },
    _now() { return 1; },
    _tone(wave, f0, f1, t0, dur, vol) { calls.push({ wave, f0, f1, t0, dur, vol }); },
  }, 0);
  assert.equal(calls[0], 'motif-0');
  const tones = calls.slice(1);
  assert.equal(tones.length, motifEvents(0).length);
  assert.ok(tones.every((tone) => tone.t0 >= 1 && tone.vol > 0 && tone.vol < 0.2));
  /** @type {string[]} */
  const quiet = [];
  playSeasonMotif({
    ready: false,
    log(name) { quiet.push(name); },
    _now() { return 0; },
    _tone() { quiet.push('tone'); },
  }, 3);
  assert.deepEqual(quiet, ['motif-3']);
});

test('sky weights cover dawn, noon, dusk and night', () => {
  const sum = (w) => w.dawn + w.day + w.dusk + w.night;
  const dawn = skyWeights(0, 0);
  const noon = skyWeights(0.5, 0);
  const dusk = skyWeights(1, 0);
  const night = skyWeights(0.4, 1);
  for (const w of [dawn, noon, dusk, night]) assert.ok(Math.abs(sum(w) - 1) < 1e-6);
  assert.ok(dawn.dawn > 0.8);
  assert.ok(noon.day > 0.8);
  assert.ok(dusk.dusk > 0.8);
  assert.ok(night.night > 0.95);
  assert.ok(twilightPulse(0.08, 0) > 0.9);
  assert.ok(twilightPulse(0.5, 0) < 0.15);
  assert.ok(twilightPulse(0.9, 0) > 0.9);
  assert.ok(twilightPulse(0.9, 1) < 0.05);
});

test('season and time of day pull the sky apart, without blowing the lights', () => {
  const summerNoon = sampleSky(1, 0.5, 0);
  const autumnDusk = sampleSky(2, 0.98, 0);
  const winterNoon = sampleSky(3, 0.5, 0);
  const winterNight = sampleSky(3, 0.9, 1);
  const springDawn = sampleSky(0, 0.02, 0);
  assert.ok(rgb(summerNoon.top)[2] > rgb(autumnDusk.horizon)[2]);
  assert.ok(rgb(autumnDusk.horizon)[0] > rgb(summerNoon.top)[0] + 80);
  assert.ok(sat(summerNoon.top) > sat(winterNoon.top) + 0.3);
  assert.ok(lum(winterNight.top) < lum(summerNoon.top) * 0.5);
  assert.ok(rgb(springDawn.horizon)[0] > 220);
  for (const sample of [summerNoon, autumnDusk, winterNoon, winterNight, springDawn]) {
    assert.ok(sample.sunK > 0.8 && sample.sunK < 1.15);
    assert.ok(sample.hemiK > 0.8 && sample.hemiK < 1.15);
  }
});

test('ritual tuning stays inside the instance budget', () => {
  assert.ok(TUNING.ritualParticles >= 24 && TUNING.ritualParticles <= 96);
  assert.ok(TUNING.ritualBand > 0.05 && TUNING.ritualBand < 0.45);
  assert.ok(TUNING.ritualHaze > 0 && TUNING.ritualHaze < 0.6);
  assert.ok(TUNING.ritualMotifVol > 0 && TUNING.ritualMotifVol < 0.2);
  assert.ok(TUNING.ritualTwilight > 0 && TUNING.ritualTwilight <= 1);
});
