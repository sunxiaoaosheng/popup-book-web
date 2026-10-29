import assert from 'node:assert/strict';
import test from 'node:test';
import { appliedGain, createStageShow, STAGE_LAYERS, stageBeat, stepStageShow } from '../../frontend/js/stage-show.js';
import { CLOUD_Z, cloudClearsSun, SUN_FRONT_Z } from '../../frontend/js/sky-order.js';
import { blankSave, createStore } from '../../frontend/js/store-core.js';

function frame(angle, extra = {}) {
  return {
    dt: 1 / 60,
    angle,
    speed: 0,
    dir: 0,
    closing: false,
    closeMax: 0,
    ...extra,
  };
}

/** 停在一个角度上，让暗角跟上。 */
function hold(state, angle, extra = {}, frames = 80) {
  let snap;
  for (let i = 0; i < frames; i++) snap = stepStageShow(state, frame(angle, extra));
  return snap;
}

test('each lid range is its own beat', () => {
  assert.equal(stageBeat(0), 'shut');
  assert.equal(stageBeat(11.9), 'shut');
  assert.equal(stageBeat(12), 'seam');
  assert.equal(stageBeat(40), 'rise');
  assert.equal(stageBeat(65), 'house');
  assert.equal(stageBeat(90), 'lights');
  assert.equal(stageBeat(105), 'play');
  assert.equal(stageBeat(120), 'night');
});

test('a full show opens the curtain as the lid rises, a seen show stays quiet', () => {
  const full = hold(createStageShow({ premiered: false }), 6);
  const quiet = hold(createStageShow({ premiered: true }), 6);
  assert.equal(full.beat, 'shut');
  assert.equal(full.mode, 'full');
  assert.ok(full.vignette > 0.7, full.vignette);
  assert.ok(full.slit < 0.2, full.slit);
  assert.ok(full.dim < 0.6, full.dim);
  assert.ok(quiet.mode === 'subtle');
  assert.ok(quiet.vignette < full.vignette - 0.25, `${quiet.vignette} vs ${full.vignette}`);

  const rise = hold(createStageShow(), 40);
  const lit = hold(createStageShow(), 100);
  const night = hold(createStageShow(), 122);
  assert.equal(rise.beat, 'rise');
  assert.equal(lit.beat, 'play');
  assert.equal(night.beat, 'night');
  assert.ok(rise.vignette > lit.vignette + 0.2);
  assert.ok(lit.slit > rise.slit);
  assert.ok(lit.dim > rise.dim);
  assert.ok(night.vignette > lit.vignette + 0.08);
  assert.ok(rise.unfold > full.unfold);
});

test('layers are still creased before the lights, ground ahead of the cabin', () => {
  const snap = hold(createStageShow(), 24);
  assert.ok(snap.layers.ground > snap.layers.cabin + 0.02, JSON.stringify(snap.layers));
  assert.ok(snap.layers.ground < 0.98);
  assert.ok(snap.layers.kitten <= snap.layers.ground);
});

test('crossing 90 the first time lights the stage once and pops layers in order', () => {
  const state = createStageShow();
  hold(state, 70, { dir: 1, speed: 20 });
  const hit = stepStageShow(state, frame(93, { dt: 1 / 60, dir: 1, speed: 24 }));
  assert.equal(hit.justPremiered, true);
  assert.equal(hit.premiered, true);
  assert.equal(hit.mode, 'full');
  assert.equal(hit.beat, 'lights');
  assert.ok(hit.sweepGlow > 0.05, hit.sweepGlow);

  const again = stepStageShow(state, frame(100, { dir: 1, speed: 10 }));
  assert.equal(again.justPremiered, false);

  /** @type {Record<string, number>} */
  const crossed = {};
  let snap = hit;
  for (let t = 0; t < 1.4; t += 1 / 60) {
    snap = stepStageShow(state, frame(100, { dt: 1 / 60, dir: 1, speed: 4 }));
    for (const id of STAGE_LAYERS) {
      if (crossed[id] == null && snap.layers[id] >= 0.98) crossed[id] = t;
    }
  }
  for (let i = 1; i < STAGE_LAYERS.length; i++) {
    const prev = STAGE_LAYERS[i - 1];
    const id = STAGE_LAYERS[i];
    assert.ok(crossed[prev] < crossed[id], `${prev}@${crossed[prev]} then ${id}@${crossed[id]}`);
  }
  assert.ok(Math.max(...STAGE_LAYERS.map((id) => snap.layers[id])) <= 1.2);
});

test('a closing lid does not premiere, and a second opening does not premiere again', () => {
  const closing = createStageShow();
  stepStageShow(closing, frame(40, { dir: 1 }));
  const slammed = stepStageShow(closing, frame(100, { dir: -1, speed: 160, closing: true, closeMax: 160 }));
  assert.equal(slammed.justPremiered, false);
  assert.equal(slammed.premiered, false);
  assert.equal(slammed.beat, 'curtain-slam');

  const state = createStageShow();
  assert.equal(stepStageShow(state, frame(96, { dir: 1, speed: 20 })).justPremiered, true);
  stepStageShow(state, frame(12, { dir: -1, speed: 30 }));
  const back = stepStageShow(state, frame(96, { dir: 1, speed: 20 }));
  assert.equal(back.justPremiered, false);
  assert.equal(back.live, true);
});

test('aborting a close keeps the first show; finishing it makes the next open subtle', () => {
  const state = createStageShow();
  stepStageShow(state, frame(100, { dir: 1, speed: 30, dt: 0.05 }));
  stepStageShow(state, frame(48, { dir: -1, speed: 30, closing: true, closeMax: 30 }));
  const aborted = stepStageShow(state, frame(88, { dir: 1, speed: 20, closing: false }));
  assert.equal(aborted.bow, 0);
  assert.equal(aborted.live, true);
  assert.equal(aborted.mode, 'full');

  const done = createStageShow();
  stepStageShow(done, frame(100, { dir: 1, speed: 20, dt: 0.05 }));
  for (let angle = 64; angle >= 6; angle -= 2) {
    stepStageShow(done, frame(angle, { dir: -1, speed: 24, closing: true, closeMax: 24 }));
  }
  const bow = stepStageShow(done, frame(3, { dir: -1, speed: 24, closing: false, closeMax: 24 }));
  assert.equal(bow.beat, 'curtain-gentle');
  assert.equal(bow.flash, 0);
  assert.equal(bow.mode, 'full');
  hold(done, 4, { dir: 0 }, 120);
  const next = hold(done, 8, { dir: 1 }, 40);
  assert.equal(next.mode, 'subtle');
  assert.equal(next.live, false);
  const fresh = hold(createStageShow(), 8);
  assert.ok(next.vignette < fresh.vignette - 0.2, `${next.vignette} vs ${fresh.vignette}`);
});

test('a slam catches the curtain and flashes; a gentle close lags and warms without a flash', () => {
  function run(speed, seconds) {
    const state = createStageShow({ premiered: true });
    hold(state, 90, { dir: 1, speed: 10 });
    let snap;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      snap = stepStageShow(state, frame(20, { speed, dir: -1, closing: true, closeMax: speed }));
    }
    return { state, snap };
  }
  const slam = run(200, 0.35);
  const gentle = run(20, 0.35);
  assert.equal(slam.snap.beat, 'curtain-slam');
  assert.equal(gentle.snap.beat, 'curtain-gentle');
  assert.ok(slam.snap.vignette > gentle.snap.vignette + 0.12, `${slam.snap.vignette} vs ${gentle.snap.vignette}`);
  assert.ok(slam.snap.slit < gentle.snap.slit);

  const slammed = stepStageShow(slam.state, frame(3, { speed: 200, dir: -1, closing: false, closeMax: 200 }));
  const eased = stepStageShow(gentle.state, frame(3, { speed: 20, dir: -1, closing: false, closeMax: 20 }));
  assert.ok(slammed.flash > 0.5, slammed.flash);
  assert.equal(eased.flash, 0);
  assert.equal(slammed.beat, 'curtain-slam');
  assert.equal(eased.beat, 'curtain-gentle');

  const lowSlam = stepStageShow(createStageShow({ premiered: true }), frame(10, { speed: 200, dir: -1, closing: true, closeMax: 200 }));
  const lowGentle = stepStageShow(createStageShow({ premiered: true }), frame(10, { speed: 20, dir: -1, closing: true, closeMax: 20 }));
  assert.ok(lowSlam.layers.ground < lowGentle.layers.ground);
  const midSlam = stepStageShow(createStageShow({ premiered: true }), frame(50, { speed: 200, dir: -1, closing: true, closeMax: 200 }));
  const midGentle = stepStageShow(createStageShow({ premiered: true }), frame(50, { speed: 20, dir: -1, closing: true, closeMax: 20 }));
  assert.ok(midGentle.layers.kitten < midSlam.layers.kitten - 0.15, `${midGentle.layers.kitten} vs ${midSlam.layers.kitten}`);
});

test('the curtain never moves the kitten or the sill it sits on', () => {
  for (const id of ['cabin', 'pop', 'kitten']) {
    assert.equal(appliedGain(id, 0.84), 1);
    assert.equal(appliedGain(id, 1.14), 1);
  }
  assert.equal(appliedGain('ground', 0.9), 0.9);
  assert.equal(appliedGain('trees', 1.05), 1.05);
});

test('clouds sit in front of the sun so the overlap does not z-fight', () => {
  assert.equal(cloudClearsSun(), true);
  assert.ok(CLOUD_Z > SUN_FRONT_Z);
  assert.equal(cloudClearsSun(SUN_FRONT_Z), false);
});

test('stageShown is remembered and reset with the save', () => {
  assert.equal(blankSave().stageShown, false);
  /** @type {string|null} */
  let raw = null;
  const io = {
    read: () => (raw ? JSON.parse(raw) : null),
    write: (data) => { raw = JSON.stringify(data); },
  };
  const store = createStore(io, null);
  assert.equal(store.stageShown, false);
  assert.equal(store.markStageShown(), true);
  assert.equal(store.markStageShown(), false);
  assert.equal(JSON.parse(raw).stageShown, true);

  const again = createStore(io, io.read());
  assert.equal(again.stageShown, true);
  again.reset();
  assert.equal(again.stageShown, false);

  const legacy = createStore({
    read: () => null,
    write: () => {},
  }, { cycles: 2, secrets: {}, seasons: { 0: 1 } });
  assert.equal(legacy.stageShown, false);
});
