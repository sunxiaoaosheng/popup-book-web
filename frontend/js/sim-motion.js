// 开合手感、摇晃/猛开、停住彩蛋、一整天。不碰网格。
import { clamp, smooth, sstep } from './math.js';
import { TUNING } from './story.js';

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

  {
    const w = S.sw;
    const d = S.filtered - (S._pf ?? S.filtered);
    S._pf = S.filtered;
    if (Math.abs(d) > 0.02) {
      const dn = d > 0 ? 1 : -1;
      if (dn !== w.dir) {
        if (w.dir !== 0 && Math.abs(w.ext - (S.filtered - d)) > 1.6) w.swings.push(T);
        w.ext = S.filtered - d;
        w.dir = dn;
      }
    }
    while (w.swings.length && T - w.swings[0] > 1.6) w.swings.shift();
    if (w.swings.length >= 4 && T - S.lastShake > 2.6 && A > 22) {
      S.lastShake = T;
      w.swings.length = 0;
      S.shakeN++;
      W.shakeBurst();
      W.sound.shake(S.season);
      W.say(['哗啦——花瓣全抖落下来了', '哗啦——叶子和柳絮漫天都是', '哗啦——一场叶子雨', '哗啦——树上的雪全抖下来了'][S.season], 3.2);
      W.discover('shake');
    }
  }
  S.burstT = Math.max(0, S.burstT - dt);

  S.flutCool -= dt;
  if (S.lastDir > 0 && sp > TUNING.fastAbove && A > 14 && A < 126 && S.flutCool <= 0) {
    S.flutCool = 3;
    S.flutT = 1.3;
    S.startled = 1;
    for (const t of W.trees) t.sw.v += (Math.random() - 0.5) * 4;
    if (A > 46) W.startleOwl(true);
    else S.owlPend = 1.4;
    W.say('纸张被你翻得哗啦啦直抖', 2.2);
  }
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
  F.eggP = S.egg.step(1 - sstep(3, 6.5, Math.abs(A - 90)), dt);
  if (F.eggP > 0.9 && S.lastDir !== 0) S.eggT += dt;
  else S.eggT = 0;
  if (S.eggT > 0.5) W.discover('heart');
  const kittenAwake = A > 76;
  const sleepWant = (S.lastDir < 0 && kittenAwake && F.eggP < 0.2 && T - S.lastShake > 3) ? 1 : 0;
  F.sleepyP = S.sleepy.step(sleepWant, dt);

  {
    const H = S.hold;
    if (Math.abs(A - H.anchor) > TUNING.holdTol) {
      H.anchor = A;
      H.t = 0;
      H.fired = false;
    } else H.t += dt;
    const dawnBand = H.anchor >= TUNING.dawnLo && H.anchor <= TUNING.dawnHi && F.cabinP > 0.55 && F.peekP < 0.12;
    H.band = (H.anchor > 4 && H.anchor < 16) ? 'seam'
      : dawnBand ? 'dawn'
        : (H.anchor > 52 && H.anchor < 72 && F.cabinP > 0.9) ? 'nap'
          : (H.anchor > 109 && H.anchor < 124) ? 'chase' : '';
    const holdNeed = H.band === 'dawn' ? TUNING.dawnHold : TUNING.holdSeconds;
    const ring = H.band && !H.fired && H.t > 0.7 ? clamp((H.t - 0.7) / Math.max(0.4, holdNeed - 0.7), 0, 1) : -1;
    W.ui.setRing(ring);
    if (H.band && !H.fired && H.t >= holdNeed) {
      H.fired = true;
      if (H.band === 'dawn') {
        S.dawnHeld = true;
        if (!S.dawnSaid && !(W.SEASON.t < 1 && W.SEASON.from !== W.SEASON.to)) {
          S.dawnSaid = true;
          W.say('清晨 · 窗边伸了个懒腰', 3.5);
          W.sound.mew();
        }
      } else {
        S.act[H.band] = true;
        if (H.band === 'seam') { W.discover('seam'); W.sound.mew(); W.say('缝里有一双眼睛，在偷看你…', 4); }
        if (H.band === 'nap') { W.discover('nap'); W.say('小猫趁你不动，爬上屋顶靠着烟囱睡着了 · Zzz', 5); W.sound.purr(true); S.purring = true; }
        if (H.band === 'chase') { W.discover('chase'); W.say('小猫跳下窗台，追着萤火虫跑！', 5); W.sound.meow(1.2, 0.4, 0.35); }
      }
    }
    if (S.act.seam && !(A > 2.5 && A < 18)) S.act.seam = false;
    if (S.act.nap && !(A > 47 && A < 76)) {
      S.act.nap = false;
      if (S.purring && !S.petDown) { W.sound.purr(false); S.purring = false; }
    }
    if (S.act.chase && !(A > 96 && A < 131)) S.act.chase = false;
  }

  {
    const R = S.run;
    if (A < TUNING.dayStart) {
      R.on = true; R.t0 = T; R.max = A; R.bad = ''; R.done = false;
      S.sunsetSaid = false; S.sneezeSaid = false; S.dawnSaid = false; S.dawnHeld = false;
    } else if (R.on && !R.done) {
      if (A > R.max) R.max = A;
      if (A < R.max - TUNING.dayBackTol) R.bad = 'back';
      if (S.sp > TUNING.fastAbove) R.bad = 'fast';
      if (A >= TUNING.dayEnd) {
        R.done = true;
        R.dur = T - R.t0;
        if (!R.bad && R.dur >= TUNING.daySeconds) {
          const first = W.discover('fullday');
          S.conBurst = 1;
          W.say(first ? '你陪小猫慢慢过完了一整天——天上多了一只猫' : '又是完整的一天 · 猫座在等你', 5);
        } else if (!R.bad && R.dur >= TUNING.daySeconds * 0.45) W.say('这一天…过得有点快', 2.6);
      }
    }
    if (S.conBurst > 0) S.conBurst = Math.max(0, S.conBurst - dt / 6);
    if (S.napLock > 0) S.napLock -= dt;
  }
}
