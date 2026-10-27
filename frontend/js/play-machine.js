/**
 * 开合过程里的判定：摇晃、猛开、停住、一整天、合盖。
 * 改 S 上已有的字段（dbg 仍读得到），把副作用交给总线。
 */
import { clamp } from './math.js';
import { TUNING } from './tuning.js';
import {
  closeKind, holdBand, holdDuration, isStartleOpen, noteShake, stepFullday,
} from './rules.js';

/** @param {any} S @param {{angle:number, time:number}} input */
export function stepShake(S, { angle, time }) {
  if (!noteShake(S.sw, angle, time, S.lastShake)) return [];
  S.lastShake = time;
  S.shakeN++;
  return [{ type: 'shake', season: S.season }];
}

/**
 * 先扣冷却，再决定这一拍要不要惊飞。
 * @param {any} S
 * @param {{dt:number, angle:number, speed:number}} input
 */
export function stepStartle(S, { dt, angle, speed }) {
  S.flutCool -= dt;
  if (!(S.lastDir > 0 && isStartleOpen(speed, angle) && S.flutCool <= 0)) return [];
  S.flutCool = 3;
  S.flutT = 1.3;
  S.startled = 1;
  return [{ type: 'startle', angle }];
}

/**
 * @param {any} S
 * @param {{dt:number, time:number, angle:number, speed:number, cabinP:number, peekP:number, eggP:number, seasonMorphing:boolean}} input
 */
export function stepHolds(S, input) {
  const { dt, time, angle, speed, cabinP, peekP, eggP, seasonMorphing } = input;
  /** @type {object[]} */
  const events = [];

  if (eggP > 0.9 && S.lastDir !== 0) S.eggT += dt;
  else S.eggT = 0;
  const heart = S.eggT > 0.5;
  if (heart && !S._heartOn) events.push({ type: 'secret', id: 'heart' });
  S._heartOn = heart;

  const H = S.hold;
  if (Math.abs(angle - H.anchor) > TUNING.holdTol) {
    H.anchor = angle;
    H.t = 0;
    H.fired = false;
  } else H.t += dt;
  H.band = holdBand(H.anchor, cabinP, peekP);
  const holdNeed = holdDuration(H.band);
  S.holdRing = H.band && !H.fired && H.t > 0.7
    ? clamp((H.t - 0.7) / Math.max(0.4, holdNeed - 0.7), 0, 1)
    : -1;
  if (H.band && !H.fired && H.t >= holdNeed) {
    H.fired = true;
    if (H.band === 'dawn') {
      S.dawnHeld = true;
      if (!S.dawnSaid && !seasonMorphing) {
        S.dawnSaid = true;
        events.push({ type: 'dawn-line' });
      }
    } else {
      S.act[H.band] = true;
      events.push({ type: 'secret', id: H.band });
    }
  }
  if (S.act.seam && !(angle > 2.5 && angle < 18)) {
    S.act.seam = false;
    events.push({ type: 'act-clear', id: 'seam' });
  }
  if (S.act.nap && !(angle > 47 && angle < 76)) {
    S.act.nap = false;
    events.push({ type: 'act-clear', id: 'nap' });
  }
  if (S.act.chase && !(angle > 96 && angle < 131)) {
    S.act.chase = false;
    events.push({ type: 'act-clear', id: 'chase' });
  }

  const phase = stepFullday(S.run, angle, speed, time);
  if (phase) events.push({ type: 'fullday', phase });
  return events;
}

/** @param {any} S @param {{angle:number, speed:number}} input */
export function stepClose(S, { angle, speed }) {
  if (angle > 60) S.armed = true;
  if (angle < 65 && S.lastDir < 0 && angle > 6 && S.armed) {
    if (!S.closing) { S.closing = true; S.closeMax = 0; }
    S.closeMax = Math.max(S.closeMax, speed);
  }
  if (angle > 75) S.closing = false;
  if (S.armed && angle < 5 && S.closing) {
    S.armed = false;
    S.closing = false;
    return [{ type: 'close', kind: closeKind(S.closeMax) }];
  }
  return [];
}
