import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus, emitAll } from '../../frontend/js/bus.js';
import { resolveKittenMode, stepKittenMode } from '../../frontend/js/kitten-machine.js';
import { stepClose, stepHolds, stepShake, stepStartle } from '../../frontend/js/play-machine.js';
import { noteHiddenClose } from '../../frontend/js/rules.js';
import { ritualIntensity } from '../../frontend/js/season-ritual.js';
import { stepSeasonBeats } from '../../frontend/js/season-beats.js';
import { noteSeasonReveal, stepSeason } from '../../frontend/js/season-machine.js';
import { TUNING } from '../../frontend/js/tuning.js';

function book() {
  return {
    season: 0,
    sw: { dir: 0, ext: 0, swings: [] },
    lastShake: -99,
    shakeN: 0,
    lastDir: 1,
    flutCool: 0,
    flutT: 0,
    startled: 0,
    eggT: 0,
    _heartOn: false,
    hold: { anchor: 8, t: 0, band: '', fired: false },
    holdRing: -1,
    act: { seam: false, nap: false, chase: false },
    dawnHeld: false,
    dawnSaid: false,
    seasonMorphSaid: false,
    run: { on: false, t0: 0, max: 0, bad: '', done: false, dur: 0 },
    armed: false,
    closing: false,
    closeMax: 0,
    kittenMode: 'hidden',
    beats: { springSaid: false, winterSaid: false, springT: 0 },
  };
}

test('bus delivers in subscription order and unsubscribe stops it', () => {
  const bus = createBus();
  const seen = [];
  const off = bus.on('secret', (e) => seen.push(e.id));
  bus.on('secret', () => seen.push('second'));
  emitAll(bus, [{ type: 'secret', id: 'seam' }]);
  off();
  bus.emit('secret', { id: 'nap' });
  assert.deepEqual(seen, ['seam', 'second', 'second']);
});

test('kitten mode prefers nap, then dawn, then play', () => {
  assert.equal(resolveKittenMode({ showK: true, napVis: true, dawnVis: true, peekP: 0 }), 'nap');
  assert.equal(resolveKittenMode({ showK: true, napVis: false, dawnVis: true, peekP: 0 }), 'dawn');
  assert.equal(resolveKittenMode({ showK: true, napVis: false, dawnVis: true, peekP: 0.5 }), 'play');
  assert.equal(resolveKittenMode({ showK: false, napVis: false, dawnVis: false, peekP: 0 }), 'hidden');
  const S = book();
  const first = stepKittenMode(S, { showK: true, napVis: false, dawnVis: true, peekP: 0 });
  assert.equal(first[0].to, 'dawn');
  assert.deepEqual(stepKittenMode(S, { showK: true, napVis: false, dawnVis: true, peekP: 0 }), []);
});

test('hold at the seam fires the secret once per stay', () => {
  const S = book();
  let hit = 0;
  for (let t = 0; t < 4; t += 1 / 60) {
    const ev = stepHolds(S, {
      dt: 1 / 60, time: t, angle: 8, speed: 0, cabinP: 0, peekP: 0, eggP: 0, seasonMorphing: false,
    });
    hit += ev.filter((e) => e.id === 'seam').length;
  }
  assert.equal(hit, 1);
  assert.equal(S.act.seam, true);
});

test('dawn hold is not a secret and waits out a season morph', () => {
  const S = book();
  S.hold.anchor = 45;
  const common = { dt: 0.05, angle: 45, speed: 0, cabinP: 1, peekP: 0, eggP: 0 };
  let events = [];
  let ring = -1;
  for (let t = 0; t < 3; t += 0.05) {
    events = events.concat(stepHolds(S, { ...common, time: t, seasonMorphing: true }));
    ring = Math.max(ring, S.holdRing);
  }
  assert.equal(events.filter((e) => e.type === 'dawn-line').length, 0);
  assert.equal(events.some((e) => e.type === 'secret'), false);
  assert.equal(S.dawnHeld, false);
  assert.equal(S.hold.fired, false);
  assert.equal(ring, -1);
  const again = stepHolds(S, { ...common, time: 4, seasonMorphing: false });
  assert.equal(again.filter((e) => e.type === 'dawn-line').length, 1);
  assert.equal(S.dawnSaid, true);
  const repeat = stepHolds(S, { ...common, time: 5, seasonMorphing: false });
  assert.equal(repeat.filter((e) => e.type === 'dawn-line').length, 0);
  assert.equal(S.holdRing, -1);
});

test('a finished hold in a paying band always emits, and a stale dawn anchor does not eat nap', () => {
  const frame = (S, angle, extra = {}) => stepHolds(S, {
    dt: 1 / 60, time: 1, angle, speed: 0, cabinP: 1, peekP: 0, eggP: 0, seasonMorphing: false, ...extra,
  });
  const until = (S, angle, sec, extra = {}) => {
    const ev = [];
    for (let t = 0; t < sec; t += 1 / 60) ev.push(...frame(S, angle, extra));
    return ev;
  };

  const seam = book();
  assert.equal(until(seam, 8, 3.2).filter((e) => e.id === 'seam').length, 1);

  const nap = book();
  const napEv = until(nap, 60, 3.2, { seasonMorphing: true });
  assert.equal(napEv.filter((e) => e.id === 'nap').length, 1);
  assert.equal(napEv.some((e) => e.type === 'dawn-line'), false);

  const chase = book();
  assert.equal(until(chase, 115, 3.2).filter((e) => e.id === 'chase').length, 1);

  const edge = book();
  assert.equal(until(edge, 72, 3.2).some((e) => e.id === 'nap'), false);
  const inside = book();
  assert.equal(until(inside, 71, 3.2).filter((e) => e.id === 'nap').length, 1);

  const heart = book();
  const heartEv = until(heart, 90, 1.2, { eggP: 0.95 });
  assert.equal(heartEv.filter((e) => e.id === 'heart').length, 1);
  assert.equal(heart.holdRing, -1);

  const stale = book();
  stale.hold = { anchor: 58, t: 2.6, band: 'dawn', fired: false };
  const moved = frame(stale, 60, { seasonMorphing: true });
  assert.equal(moved.some((e) => e.type === 'secret'), false);
  assert.equal(stale.hold.anchor, 60);
  assert.equal(stale.hold.band, 'nap');
  assert.ok(stale.hold.t < 0.05);
  const caught = until(stale, 60, 3.2, { seasonMorphing: true });
  assert.equal(caught.filter((e) => e.id === 'nap').length, 1);
});

test('heart secret is the rising edge at a right angle', () => {
  const S = book();
  const frame = (eggP) => stepHolds(S, {
    dt: 0.2, time: 1, angle: 90, speed: 0, cabinP: 1, peekP: 1, eggP, seasonMorphing: false,
  });
  assert.equal(frame(0.95).some((e) => e.id === 'heart'), false);
  assert.equal(frame(0.95).some((e) => e.id === 'heart'), false);
  assert.equal(frame(0.95).some((e) => e.id === 'heart'), true);
  assert.equal(frame(0.95).some((e) => e.id === 'heart'), false);
});

test('fullday discover and a fast open both come through the machine', () => {
  const slow = book();
  let found = '';
  for (let t = 0; t <= 14; t += 1 / 30) {
    const angle = Math.min(128, (t / 14) * 128);
    const ev = stepHolds(slow, {
      dt: 1 / 30, time: t, angle, speed: 9, cabinP: 1, peekP: 0, eggP: 0, seasonMorphing: false,
    });
    const hit = ev.find((e) => e.type === 'fullday' && e.phase === 'discover');
    if (hit) found = hit.phase;
  }
  assert.equal(found, 'discover');

  const fast = book();
  let phase = '';
  for (let t = 0; t <= 6; t += 1 / 30) {
    const angle = Math.min(128, (t / 6) * 128);
    const ev = stepHolds(fast, {
      dt: 1 / 30, time: t, angle, speed: 20, cabinP: 1, peekP: 0, eggP: 0, seasonMorphing: false,
    });
    const hit = ev.find((e) => e.type === 'fullday' && (e.phase === 'fast' || e.phase === 'discover'));
    if (hit) phase = hit.phase;
  }
  assert.equal(phase, 'fast');
});

test('a lid shut while the page is hidden still advances the close once', () => {
  const S = book();
  S.armed = true;
  S.filtered = 90;
  S.prevFiltered = 90;
  let track = { t: null, a: null, max: 0 };
  track = noteHiddenClose(S, track, 70, 1000);
  track = noteHiddenClose(S, track, 20, 1500);
  track = noteHiddenClose(S, track, 1, 2000);
  assert.equal(track.a, 1);
  assert.equal(S.lidShut, true);
  const ev = stepClose(S, { angle: 40, speed: 0 });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'close');
  assert.equal(ev[0].kind, 'normal');
  assert.ok(S.filtered < TUNING.seasonMorphLo);
  assert.equal(stepClose(S, { angle: 4, speed: 0 }).length, 0);
  assert.equal(S.lidShut, false);
});

test('shut sample before the book was opened does not count', () => {
  const S = book();
  noteHiddenClose(S, { t: null, a: null, max: 0 }, 0, 0);
  assert.equal(!!S.lidShut, false);
  assert.equal(stepClose(S, { angle: 12, speed: 0 }).length, 0);
});

test('gentle close is gentle, a slam is a slam', () => {
  const gentle = book();
  gentle.lastDir = -1;
  stepClose(gentle, { angle: 80, speed: 10 });
  stepClose(gentle, { angle: 40, speed: 10 });
  const g = stepClose(gentle, { angle: 4, speed: 10 });
  assert.equal(g[0].kind, 'gentle');

  const slam = book();
  slam.lastDir = -1;
  stepClose(slam, { angle: 90, speed: 10 });
  stepClose(slam, { angle: 40, speed: 200 });
  const s = stepClose(slam, { angle: 3, speed: 200 });
  assert.equal(s[0].kind, 'slam');
});

test('startle arms once, shake counts four reversals', () => {
  const S = book();
  assert.equal(stepStartle(S, { dt: 0.016, angle: 50, speed: TUNING.fastAbove + 1 }).length, 1);
  assert.equal(stepStartle(S, { dt: 0.016, angle: 50, speed: TUNING.fastAbove + 1 }).length, 0);

  const sh = book();
  let n = 0;
  [30, 40, 30, 40, 30, 40].forEach((angle, i) => {
    n += stepShake(sh, { angle, time: i * 0.1 }).length;
  });
  assert.equal(n, 1);
});

test('season morph caption happens once inside the band', () => {
  const SEASON = { from: 0, to: 1, t: 0 };
  const S = book();
  assert.equal(stepSeason(SEASON, S, 10).length, 0);
  const mid = stepSeason(SEASON, S, 40);
  assert.ok(mid.some((e) => e.phase === 'morph'));
  assert.ok(mid.some((e) => e.phase === 'caption' && e.text.includes('换季了')));
  assert.ok(SEASON.t > 0.2 && SEASON.t < 0.7);
  assert.equal(stepSeason(SEASON, S, 40).length, 0);
});

test('pending season + become visible while already open → morph once', () => {
  const S = book();
  S.armed = true;
  S.filtered = 90;
  S.pageHidden = true;
  let track = { t: null, a: null, max: 0 };
  track = noteHiddenClose(S, track, 70, 1000);
  track = noteHiddenClose(S, track, 2, 1600);
  assert.equal(track.a, 2);
  assert.equal(S.lidShut, true);
  const closed = stepClose(S, { angle: 90, speed: 0 });
  assert.equal(closed[0].type, 'close');
  assert.ok(S.filtered < TUNING.seasonMorphLo);

  const SEASON = { from: 0, to: 1, t: 0 };
  S.seasonMorphSaid = false;
  S.seasonCatchup = false;
  S.pageHidden = true;
  assert.equal(noteSeasonReveal(SEASON, S, 96, true), true);
  assert.equal(S.revealOpen, true);

  const dt = 0.05;
  const first = stepSeason(SEASON, S, 96, dt);
  assert.equal(S.seasonCatchup, true);
  assert.equal(S.revealOpen, false);
  assert.ok(first.some((e) => e.phase === 'morph'));
  assert.ok(first.some((e) => e.phase === 'caption' && e.text.includes('换季了')));
  assert.ok(SEASON.t > 0 && SEASON.t < 0.2);
  assert.ok(ritualIntensity(SEASON.t) > 0.05);
  assert.ok(SEASON.t < 1 && SEASON.from !== SEASON.to);

  const hold = book();
  hold.hold.anchor = 50;
  stepHolds(hold, {
    dt: 3, time: 5, angle: 50, speed: 0, cabinP: 1, peekP: 0, eggP: 0,
    seasonMorphing: SEASON.t < 1 && SEASON.from !== SEASON.to,
  });
  assert.equal(hold.holdRing, -1);
  assert.equal(hold.dawnSaid, false);

  let captions = 1;
  for (let i = 0; i < 80 && SEASON.t < 1; i++) {
    const ev = stepSeason(SEASON, S, 120, dt);
    captions += ev.filter((e) => e.phase === 'caption').length;
  }
  assert.equal(SEASON.t, 1);
  assert.equal(captions, 1);
  assert.equal(S.seasonCatchup, false);
  assert.equal(stepSeason(SEASON, S, 120, dt).length, 0);

  S.pageHidden = true;
  assert.equal(noteSeasonReveal(SEASON, S, 120, true), false);
  assert.equal(stepSeason(SEASON, S, 120, dt).length, 0);
});

test('a hidden close that lands as the page is shown still catches up once', () => {
  const S = book();
  S.armed = true;
  S.lidShut = true;
  S.pageHidden = true;
  const SEASON = { from: 0, to: 0, t: 1 };
  assert.equal(noteSeasonReveal(SEASON, S, 88, true), true);
  SEASON.from = 0;
  SEASON.to = 1;
  SEASON.t = 0;
  S.seasonCatchup = false;
  S.seasonMorphSaid = false;
  assert.equal(stepSeason(SEASON, S, 4, 0.05).length, 0);
  assert.equal(SEASON.t, 0);
  assert.equal(S.revealOpen, true);
  const ev = stepSeason(SEASON, S, 90, 0.05);
  assert.ok(SEASON.t > 0 && SEASON.t < 0.2);
  assert.equal(S.seasonCatchup, true);
  assert.ok(ev.some((e) => e.phase === 'caption'));
  assert.equal(stepSeason(SEASON, S, 90, TUNING.seasonCatchupSec).filter((e) => e.phase === 'caption').length, 0);
  assert.equal(SEASON.t, 1);
});

test('shown while still closed keeps the angle morph, and a visible fast open still snaps', () => {
  const shut = book();
  shut.pageHidden = true;
  const SEASON = { from: 2, to: 3, t: 0 };
  assert.equal(noteSeasonReveal(SEASON, shut, 3, true), false);
  assert.equal(shut.revealOpen, false);
  const mid = stepSeason(SEASON, shut, 40, 0.05);
  assert.ok(mid.some((e) => e.phase === 'morph'));
  assert.ok(SEASON.t > 0.2 && SEASON.t < 0.8);
  assert.equal(!!shut.seasonCatchup, false);

  const fast = book();
  const jumped = { from: 0, to: 1, t: 0 };
  const ev = stepSeason(jumped, fast, 100, 0.016);
  assert.equal(jumped.t, 1);
  assert.equal(!!fast.seasonCatchup, false);
  assert.ok(ev.some((e) => e.phase === 'caption'));
});

test('spring and winter beats are not secrets and yield to a busy caption', () => {
  const beats = { springSaid: false, winterSaid: false, springT: 0 };
  let spring = null;
  for (let t = 0; t < 2.2; t += 0.1) {
    const ev = stepSeasonBeats(beats, { dt: 0.1, season: 0, onSill: true, angle: 96, captionBusy: false });
    if (ev.length) spring = ev[0];
  }
  assert.equal(spring.id, 'butterfly');
  assert.equal(stepSeasonBeats(beats, { dt: 0.1, season: 0, onSill: true, angle: 96, captionBusy: false }).length, 0);

  const winter = { springSaid: false, winterSaid: false, springT: 0 };
  assert.equal(stepSeasonBeats(winter, { dt: 0.1, season: 3, onSill: true, angle: 96, captionBusy: true }).length, 0);
  const line = stepSeasonBeats(winter, { dt: 0.1, season: 3, onSill: true, angle: 96, captionBusy: false });
  assert.equal(line[0].id, 'shiver');
  stepSeasonBeats(winter, { dt: 0.1, season: 3, onSill: false, angle: 10, captionBusy: false });
  assert.equal(winter.winterSaid, false);
});
