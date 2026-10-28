import assert from 'node:assert/strict';
import test from 'node:test';
import { autoLabel, autoPressed, controlSource } from '../../frontend/js/control.js';

test('sensor wins unless the user explicitly starts the demo', () => {
  assert.equal(controlSource(null, 'live', 'sensor'), 'sensor');
  assert.equal(controlSource(false, 'live', 'sensor'), 'sensor');
  assert.equal(controlSource(true, 'live', 'sensor'), 'auto');
  assert.equal(autoPressed('sensor'), false);
  assert.equal(autoLabel(false), '▶ 自动演示');
});

test('fake bridge sweep is the auto demo and can be turned off', () => {
  assert.equal(controlSource(null, 'live', 'fake'), 'remote');
  assert.equal(controlSource(false, 'live', 'fake'), 'slider');
  assert.equal(controlSource(true, 'live', 'fake'), 'auto');
  assert.equal(autoPressed('remote'), true);
  assert.equal(autoLabel(true), '■ 停止演示');
});

test('no bridge means slider until the button is pressed', () => {
  assert.equal(controlSource(null, 'down', ''), 'slider');
  assert.equal(controlSource(null, 'wait', ''), 'slider');
  assert.equal(controlSource(null, 'stale', 'sensor'), 'slider');
  assert.equal(controlSource(true, 'down', ''), 'auto');
  assert.equal(controlSource(false, 'down', ''), 'slider');
});

test('a live socket with no mode still follows the angle', () => {
  assert.equal(controlSource(null, 'live', ''), 'sensor');
  assert.equal(controlSource(null, 'live', 'replay'), 'remote');
});
