/**
 * 玩法判定。输入是数字和普通对象，输出是名字或事件。
 * 场景模块负责副作用（字幕、声音、网格），这里不引用 Three。
 */
import { clamp, sstep } from './math.js';
import { TUNING } from './tuning.js';
import { SECRETS } from './story.js';

/** @param {number} n */
export function seasonIndex(n) {
  return ((n % 4) + 4) % 4;
}

/**
 * 开盖进度对应的换季 t。角度低于下沿时是 0，高于上沿时是 1。
 * @param {number} angle
 * @param {typeof TUNING} [tuning]
 */
export function morphProgress(angle, tuning = TUNING) {
  const lo = tuning.seasonMorphLo;
  const hi = tuning.seasonMorphHi;
  if (angle < lo) return 0;
  return clamp((angle - lo) / Math.max(1e-6, hi - lo), 0, 1);
}

/**
 * @param {number} uc 0 清晨 … 1 入夜前
 * @param {Array<[number, string]>} times
 */
export function timeOfDay(uc, times) {
  let name = times[0][1];
  for (let i = 1; i < times.length; i++) if (uc >= times[i][0]) name = times[i][1];
  return name;
}

/**
 * 停住彩蛋落在哪一条带。清晨带优先于午觉带。
 * @param {number} anchor
 * @param {number} cabinP
 * @param {number} peekP
 * @param {typeof TUNING} [tuning]
 * @returns {'seam'|'dawn'|'nap'|'chase'|''}
 */
export function holdBand(anchor, cabinP, peekP, tuning = TUNING) {
  const dawn = anchor >= tuning.dawnLo && anchor <= tuning.dawnHi && cabinP > 0.55 && peekP < 0.12;
  if (anchor > 4 && anchor < 16) return 'seam';
  if (dawn) return 'dawn';
  if (anchor > 52 && anchor < 72 && cabinP > 0.9) return 'nap';
  if (anchor > 109 && anchor < 124) return 'chase';
  return '';
}

/** @param {string} band @param {typeof TUNING} [tuning] */
export function holdDuration(band, tuning = TUNING) {
  return band === 'dawn' ? tuning.dawnHold : tuning.holdSeconds;
}

/**
 * 直角爱心的弹簧目标。正好 90° 时为 1，离开约 6.5° 后为 0。
 * @param {number} angle
 */
export function heartTarget(angle) {
  return 1 - sstep(3, 6.5, Math.abs(angle - 90));
}

/**
 * @param {number} angle
 * @param {number} cabinE
 * @param {number} peekP
 * @param {number} hopP
 * @param {boolean} napVis
 * @param {typeof TUNING} [tuning]
 */
export function wantsDawnStretch(angle, cabinE, peekP, hopP, napVis, tuning = TUNING) {
  return cabinE > 0.55 && angle >= tuning.dawnLo && angle <= tuning.dawnHi && peekP < 0.1 && hopP < 0.05 && !napVis;
}

/**
 * @param {number} closeMax 这次合盖过程中的最大角速度
 * @param {typeof TUNING} [tuning]
 * @returns {'slam'|'gentle'|'normal'}
 */
export function closeKind(closeMax, tuning = TUNING) {
  if (closeMax > tuning.slamAbove) return 'slam';
  if (closeMax < tuning.gentleBelow) return 'gentle';
  return 'normal';
}

/**
 * @param {number} speed
 * @param {number} angle
 * @param {typeof TUNING} [tuning]
 */
export function isStartleOpen(speed, angle, tuning = TUNING) {
  return speed > tuning.fastAbove && angle > 14 && angle < 126;
}

/**
 * 来回晃动计数。状态放在调用方的 sw 上（dir / ext / swings / _pf）。
 * @param {{dir:number, ext:number, swings:number[], _pf?:number}} sw
 * @param {number} angle
 * @param {number} time
 * @param {number} lastShake
 */
export function noteShake(sw, angle, time, lastShake) {
  const prev = sw._pf ?? angle;
  const d = angle - prev;
  sw._pf = angle;
  if (Math.abs(d) > 0.02) {
    const dn = d > 0 ? 1 : -1;
    if (dn !== sw.dir) {
      if (sw.dir !== 0 && Math.abs(sw.ext - (angle - d)) > 1.6) sw.swings.push(time);
      sw.ext = angle - d;
      sw.dir = dn;
    }
  }
  while (sw.swings.length && time - sw.swings[0] > 1.6) sw.swings.shift();
  if (sw.swings.length >= 4 && time - lastShake > 2.6 && angle > 22) {
    sw.swings.length = 0;
    return true;
  }
  return false;
}

/**
 * 「一整天」状态机。就地改 run，返回这一拍的事件。
 * arm：还在起算线以下（调用方清掉本轮的字幕标记）。
 * discover：够慢、没回头、没猛开。
 * fast：到了终点但用时偏短，只提示、不算秘密。
 * @param {{on:boolean, t0:number, max:number, bad:string, done:boolean, dur:number}} run
 * @param {number} angle
 * @param {number} speed
 * @param {number} time
 * @param {typeof TUNING} [tuning]
 * @returns {'arm'|'discover'|'fast'|''}
 */
export function stepFullday(run, angle, speed, time, tuning = TUNING) {
  if (angle < tuning.dayStart) {
    run.on = true;
    run.t0 = time;
    run.max = angle;
    run.bad = '';
    run.done = false;
    run.dur = 0;
    return 'arm';
  }
  if (!(run.on && !run.done)) return '';
  if (angle > run.max) run.max = angle;
  if (angle < run.max - tuning.dayBackTol) run.bad = 'back';
  if (speed > tuning.fastAbove) run.bad = 'fast';
  if (angle < tuning.dayEnd) return '';
  run.done = true;
  run.dur = time - run.t0;
  if (!run.bad && run.dur >= tuning.daySeconds) return 'discover';
  if (!run.bad && run.dur >= tuning.daySeconds * 0.45) return 'fast';
  return '';
}

/** 手账里的 8 个秘密 id，顺序与故事数据一致。 */
export function secretIds() {
  return SECRETS.map((s) => s.id);
}
