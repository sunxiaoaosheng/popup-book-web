// 开合手感、摇晃/猛开、停住彩蛋、一整天。不碰网格。
import { clamp, smooth, sstep } from './math.js';
import { TUNING } from './tuning.js';
import { heartTarget } from './rules.js';
import { emitAll } from './bus.js';
import { stepHolds, stepShake, stepStartle } from './play-machine.js';

export function stepMotion(W, dt) {
  const { S, frame: F } = W;
  const T = (S.time += dt);
  const a = clamp(S.target, 0, 130);
  S.filtered += (a - S.filtered) * (1 - Math.exp(-dt / 0.035));
  const v = (S.filtered - S.prevFiltered) / Math.max(dt, 1e-4);
  S.prevFiltered = S.filtered;
  S.vel += (v - S.vel) * (1 - Math.exp(-dt / 0.12));
  S.sp += (Math.abs(S.vel) - S.sp) * (1 - Math.exp(-dt / 0.2));
  const A = S.filtered;
  if (S.vel > 6) {
    if (S.lastDir < 0) S.yawnT = 99;
    S.lastDir = 1;
  } else if (S.vel < -6) {
    if (S.lastDir > 0) S.yawnT = 0;
    S.lastDir = -1;
  }
  if (S.yawnT < 99) S.yawnT += dt;
  const sp = S.sp;

  emitAll(W.bus, stepShake(S, { angle: A, time: T }));
  S.burstT = Math.max(0, S.burstT - dt);
  emitAll(W.bus, stepStartle(S, { dt, angle: A, speed: sp }));
  if (S.owlPend > 0) {
    S.owlPend -= dt;
    if (A > 46 && W.owl.visible && W.startleOwl(true)) S.owlPend = 0;
  }
  S.flutT = Math.max(0, S.flutT - dt);
  S.startled = Math.max(0, S.startled - dt * 0.7);
  F.flut = clamp(S.flutT / 1.3, 0, 1);

  const idle = 0.35 * Math.sin(T * 1.3) * sstep(5, 20, A);
  F.hingeA = S.hinge.step(A, dt) + idle + F.flut * 0.9 * Math.sin(T * 31) + F.flut * 0.5 * Math.sin(T * 17.3);
  F.nightP = S.night.step(sstep(100, 126, A), dt);
  F.moonP = S.moonUp.step(sstep(100, 118, A), dt);
  F.litP = S.lit.step(sstep(42, 55, A), dt);
  F.doorP = S.door.step(sstep(68, 77, A), dt);
  F.cabinP = S.cabin.step(sstep(34, 52, A), dt);

  const shyTarget = (S.lastDir > 0 && A > 66 && A < 108 && sp < TUNING.shyBelow) ? 1 : 0;
  S.shy = smooth(S.shy, shyTarget, dt, shyTarget ? 0.6 : 0.35);
  S.duck = smooth(S.duck, (S.shy > 0.4 && sp > 40) ? 1 : 0, dt, 0.25);
  F.peekP = S.peek.step(sstep(76, 90, A) * (1 - 0.55 * S.duck), dt);
  F.hopP = S.hop.step(sstep(91 + 10 * S.shy, 100 + 12 * S.shy, A), dt);
  F.eggP = S.egg.step(heartTarget(A), dt);
  const kittenAwake = A > 76;
  const sleepWant = (S.lastDir < 0 && kittenAwake && F.eggP < 0.2 && T - S.lastShake > 3) ? 1 : 0;
  F.sleepyP = S.sleepy.step(sleepWant, dt);

  emitAll(W.bus, stepHolds(S, {
    dt, time: T, angle: A, speed: S.sp,
    cabinP: F.cabinP, peekP: F.peekP, eggP: F.eggP,
    seasonMorphing: W.SEASON.t < 1 && W.SEASON.from !== W.SEASON.to,
  }));
  W.ui.setRing(S.holdRing);
  if (S.conBurst > 0) S.conBurst = Math.max(0, S.conBurst - dt / 6);
  if (S.napLock > 0) S.napLock -= dt;
}
