import assert from 'node:assert/strict';
import test from 'node:test';
import { CABIN_Z, CHASE_BOX, DOOR_HOLE, chaseAim, doorSpan, hopProgress } from '../../frontend/js/kitten-place.js';

test('peeking kitten stays inside the door and above the floor', () => {
  for (const peekP of [0, 0.57, 1]) {
    const s = doorSpan(peekP);
    assert.ok(s.x0 >= DOOR_HOLE.x0 - 0.001, `left ${s.x0} at peek ${peekP}`);
    assert.ok(s.x1 <= DOOR_HOLE.x1 + 0.001, `right ${s.x1} at peek ${peekP}`);
    assert.ok(s.py >= 0.03, `feet ${s.py}`);
    assert.ok(s.pz < -0.05, `depth ${s.pz}`);
  }
});

test('by 100° the hop has landed even if the kitten is shy', () => {
  assert.equal(hopProgress(100, 0), 1);
  assert.equal(hopProgress(107, 1), 1);
  assert.equal(hopProgress(110, 1), 1);
  assert.equal(hopProgress(80, 1), 0);
  assert.ok(hopProgress(93, 1) < hopProgress(93, 0));
});

test('chase path stays on the open floor in front of the terraces', () => {
  for (let t = 0; t < 40; t += 0.31) {
    const a = chaseAim(t);
    assert.ok(a.fx >= CHASE_BOX.x0 && a.fx <= CHASE_BOX.x1, `x ${a.fx}`);
    assert.ok(a.fz >= CHASE_BOX.z0 && a.fz <= CHASE_BOX.z1, `z ${a.fz}`);
    const bookZ = CABIN_Z + a.fz;
    assert.ok(bookZ > 4.55 && bookZ < 5.9, `book z ${bookZ}`);
    assert.ok(Math.abs(a.fx) + 0.5 < 1.65, `clear of terrace ${a.fx}`);
  }
});
