import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DPR_CAP, initialPixelRatio, nextPixelRatio, nextShadowSize, shouldRender, SLOW_FRAME_S,
} from '../../frontend/js/quality.js';

test('pixel ratio starts at the device value and never above the cap', () => {
  assert.equal(initialPixelRatio(1), 1);
  assert.equal(initialPixelRatio(3), DPR_CAP);
  assert.equal(initialPixelRatio(0), 1);
});

test('slow frames step the ratio down, then the shadow map', () => {
  const slow = SLOW_FRAME_S + 0.01;
  assert.equal(nextPixelRatio(1.5, slow), 1.25);
  assert.equal(nextPixelRatio(1.25, slow), 1);
  assert.equal(nextPixelRatio(1, slow), 1);
  assert.equal(nextPixelRatio(1.5, 0.016), 1.5);
  assert.equal(nextShadowSize(2048, 1.25, slow), 2048);
  assert.equal(nextShadowSize(2048, 1, slow), 1024);
  assert.equal(nextShadowSize(1024, 1, slow), 1024);
});

test('a hidden page does not render', () => {
  assert.equal(shouldRender(true), false);
  assert.equal(shouldRender(false), true);
});
