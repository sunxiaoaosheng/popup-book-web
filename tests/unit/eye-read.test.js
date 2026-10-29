import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEyeRead, applyEyeReadList, eyeReadGain, eyeReadPose } from '../../frontend/js/eye-read.js';
import { TUNING } from '../../frontend/js/tuning.js';

function eye(y = 1) {
  return {
    scale: { x: 1, y, z: 1 },
    position: { x: 0.1, y: 0.02, z: 0.05 },
    rotation: { x: 0.4, y: 0, z: 0 },
    userData: {
      restZ: 0.05,
      halo: { visible: false, material: { opacity: 1 } },
    },
  };
}

test('full boost below the lid band, none once the book is open', () => {
  assert.equal(TUNING.eyeReadBelow, 35);
  assert.ok(TUNING.eyeReadAbove > 35 && TUNING.eyeReadAbove <= 70);
  assert.equal(eyeReadGain(0), 1);
  assert.equal(eyeReadGain(20), 1);
  assert.equal(eyeReadGain(35), 1);
  assert.ok(eyeReadGain(35.5) < 1);
  assert.equal(eyeReadGain(TUNING.eyeReadAbove), 0);
  assert.equal(eyeReadGain(90), 0);
  assert.equal(eyeReadGain(130), 0);
  const mid = (TUNING.eyeReadBelow + TUNING.eyeReadAbove) / 2;
  assert.ok(Math.abs(eyeReadGain(mid) - 0.5) < 1e-9);
});

test('the band can be moved from tuning', () => {
  const tuning = { ...TUNING, eyeReadBelow: 10, eyeReadAbove: 10 };
  assert.equal(eyeReadGain(10, tuning), 1);
  assert.equal(eyeReadGain(10.1, tuning), 0);
  const wide = { ...TUNING, eyeReadBelow: 0, eyeReadAbove: 4 };
  assert.equal(eyeReadGain(0, wide), 1);
  assert.equal(eyeReadGain(4, wide), 0);
  assert.ok(eyeReadGain(2, wide) > 0 && eyeReadGain(2, wide) < 1);
});

test('pose stays modest and is exactly neutral at zero gain', () => {
  assert.ok(TUNING.eyeReadScaleX > 0 && TUNING.eyeReadScaleX <= 0.25);
  assert.ok(TUNING.eyeReadScaleY > TUNING.eyeReadScaleX && TUNING.eyeReadScaleY <= 0.45);
  assert.ok(TUNING.eyeReadTilt > 0 && TUNING.eyeReadTilt < 0.45);
  assert.ok(TUNING.eyeReadZ > 0 && TUNING.eyeReadZ < 0.04);
  assert.ok(TUNING.eyeReadGlow > 0 && TUNING.eyeReadGlow <= 0.55);
  const off = eyeReadPose(0);
  assert.equal(off.sx, 1);
  assert.equal(off.sy, 1);
  assert.equal(off.z, 0);
  assert.equal(off.tilt, 0);
  assert.equal(off.glow, 0);
  const on = eyeReadPose(1);
  assert.ok(on.sy > on.sx);
  assert.ok(on.sy < 1.5);
});

test('low lid multiplies the expression, a shut eye stays shut', () => {
  const shut = eye(0.08);
  const look = eye(1);
  look.scale.x = 1.12;
  applyEyeRead(shut, 12);
  applyEyeRead(look, 12);
  assert.ok(shut.scale.y < 0.15);
  assert.ok(Math.abs(shut.scale.y / 0.08 - look.scale.y / 1) < 1e-9);
  assert.ok(Math.abs(look.scale.x / 1.12 - (1 + TUNING.eyeReadScaleX)) < 1e-9);
  assert.ok(look.scale.y > 1.2 && look.scale.y < 1.45);
  assert.ok(shut.rotation.x < 0);
  assert.equal(shut.rotation.x, look.rotation.x);
  assert.ok(Math.abs(shut.rotation.x + TUNING.eyeReadTilt) < 1e-9);
  assert.equal(shut.position.x, 0.1);
  assert.ok(shut.position.z > 0.05);
  assert.equal(shut.position.z, look.position.z);
  assert.equal(shut.scale.z, 1);
  assert.equal(look.userData.halo.visible, true);
  assert.ok(Math.abs(look.userData.halo.material.opacity - TUNING.eyeReadGlow) < 1e-9);
});

test('fully open leaves the eye where the expression put it', () => {
  const open = eye(0.45);
  open.scale.x = 1.2;
  applyEyeRead(open, 110);
  assert.equal(open.scale.x, 1.2);
  assert.equal(open.scale.y, 0.45);
  assert.equal(open.position.z, 0.05);
  assert.equal(open.position.x, 0.1);
  assert.equal(open.rotation.x, 0);
  assert.equal(open.userData.halo.visible, false);
  assert.equal(open.userData.halo.material.opacity, 0);
});

test('seam fade scales only the rim, both eyes share one gain', () => {
  const a = eye(1);
  const b = eye(0.5);
  applyEyeReadList([a, b], 8, { fade: 0.5 });
  assert.ok(Math.abs(a.scale.y / 1 - b.scale.y / 0.5) < 1e-9);
  assert.ok(Math.abs(a.userData.halo.material.opacity - TUNING.eyeReadGlow * 0.5) < 1e-9);
  assert.equal(a.userData.halo.visible, true);
  const dim = eye(1);
  applyEyeRead(dim, 8, { fade: 0 });
  assert.equal(dim.userData.halo.visible, false);
  assert.equal(dim.userData.halo.material.opacity, 0);
  assert.ok(dim.scale.y > 1);
});

test('missing pieces are skipped', () => {
  assert.equal(applyEyeRead(null, 5), null);
  applyEyeReadList(null, 5);
  const bare = eye(1);
  delete bare.userData.restZ;
  delete bare.userData.halo;
  applyEyeRead(bare, 5);
  assert.equal(bare.position.z, 0.05);
  assert.ok(bare.scale.y > 1);
});
