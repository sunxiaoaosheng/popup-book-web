import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeqGate, linkState, parseAngleMessage, STALE_MS } from '../../frontend/js/protocol.js';

test('legacy angle frame', () => {
  const f = parseAngleMessage('{"angle": 87.3, "extra": 1}');
  assert.equal(f.v, 0);
  assert.equal(f.type, 'angle');
  assert.equal(f.angle, 87.3);
  assert.equal(f.legacy, true);
  assert.equal(f.seq, null);
});

test('v1 angle keeps unknown fields out of the result', () => {
  const f = parseAngleMessage('{"v":1,"seq":4,"t":12.5,"type":"angle","angle":3,"vendor":{"x":1}}');
  assert.deepEqual(Object.keys(f).sort(), ['angle', 'legacy', 'mode', 'seq', 't', 'type', 'v']);
  assert.equal(f.mode, '');
  assert.equal(f.v, 1);
  assert.equal(f.seq, 4);
  assert.equal(f.t, 12.5);
  assert.equal(f.legacy, false);
});

test('heartbeat and future type that still carries an angle', () => {
  const beat = parseAngleMessage('{"v":1,"seq":2,"t":9,"type":"heartbeat"}');
  assert.equal(beat.type, 'heartbeat');
  assert.equal(beat.angle, null);
  const future = parseAngleMessage('{"v":9,"seq":3,"t":10,"type":"lidar","angle":12}');
  assert.equal(future.type, 'angle');
  assert.equal(future.angle, 12);
  assert.equal(future.v, 9);
});

test('mode rides along and stays off legacy frames', () => {
  const sensor = parseAngleMessage('{"v":1,"seq":1,"t":1,"type":"angle","angle":12,"mode":"sensor"}');
  assert.equal(sensor.mode, 'sensor');
  const fakeBeat = parseAngleMessage('{"v":1,"seq":2,"t":2,"type":"heartbeat","mode":"fake"}');
  assert.equal(fakeBeat.type, 'heartbeat');
  assert.equal(fakeBeat.mode, 'fake');
  const legacy = parseAngleMessage('{"angle": 1}');
  assert.equal(legacy.mode, '');
});

test('rejects junk', () => {
  assert.equal(parseAngleMessage(''), null);
  assert.equal(parseAngleMessage('{'), null);
  assert.equal(parseAngleMessage('[]'), null);
  assert.equal(parseAngleMessage('{"type":"heartbeat","angle":"nope"}').type, 'heartbeat');
  assert.equal(parseAngleMessage('{"type":"nope"}'), null);
  assert.equal(parseAngleMessage('{"angle":null}'), null);
});

test('seq gate drops duplicates and resets on a new socket', () => {
  const g = createSeqGate();
  const frame = (seq) => ({ v: 1, type: 'angle', angle: 1, seq, t: seq, legacy: false });
  assert.equal(g.accept(frame(1)), true);
  assert.equal(g.accept(frame(1)), false);
  assert.equal(g.accept(frame(2)), true);
  assert.equal(g.accept({ ...frame(null), seq: null }), true);
  g.reset();
  assert.equal(g.accept(frame(1)), true);
});

test('link state', () => {
  assert.equal(linkState(false, 0, 1000), 'down');
  assert.equal(linkState(true, 0, 1000), 'wait');
  assert.equal(linkState(true, 1000, 1000 + STALE_MS), 'live');
  assert.equal(linkState(true, 1000, 1000 + STALE_MS + 1), 'stale');
});
