/**
 * 每帧看一眼手账该不该长出提示。不参与秘密判定。
 */
import {
  createClosenessMemory, describeSlot, nudgeFor, observeCloseness, progressUpdates,
} from './journal-hints.js';
import { SECRETS } from './story.js';
import { TUNING } from './tuning.js';

const BY_ID = Object.fromEntries(SECRETS.map((s) => [s.id, s]));
const NUDGE_GAP = 20;

/** @param {any} W @param {typeof TUNING} [tuning] */
export function attachJournalWatch(W, tuning = TUNING) {
  const mem = createClosenessMemory();
  let cd = 0;
  let nearKey = '';

  return function watchJournal(dt) {
    const { S } = W;
    const observed = observeCloseness(mem, {
      angle: S.filtered,
      speed: S.sp,
      swings: S.sw.swings.length,
      dayOn: S.run.on,
      dayMax: S.run.max,
      dayBad: S.run.bad,
      dayDone: S.run.done,
      dayDur: S.run.dur,
      armed: S.armed,
      closing: S.closing,
      closeMax: S.closeMax,
      flutT: S.flutT,
    }, tuning);
    const updates = progressUpdates(observed, (id) => ({
      found: W.store.hasSecret(id),
      attempts: W.store.attemptCount(id),
      tier: W.store.hintTier(id),
    }), tuning);
    const changed = updates.length > 0 && W.store.applyJournal(updates);
    const near = observed.near.filter((id) => !W.store.hasSecret(id));
    S.journalNear = near;
    const key = near.join(',');
    if (key !== nearKey || changed) {
      nearKey = key;
      W.ui.setJournalNear(near, !!changed);
    }
    cd -= dt;
    if (cd > 0) return;
    const line = nudgeFor(observed.rises, observed.attempts, (id) => {
      const secret = BY_ID[id];
      if (!secret || W.store.hasSecret(id)) return { found: true, line: '' };
      const slot = describeSlot(secret, {
        found: false,
        tier: W.store.hintTier(id),
        near: near.includes(id),
      });
      return { found: false, line: slot.line };
    });
    if (!line) return;
    W.ui.nudge(line);
    cd = NUDGE_GAP;
  };
}
