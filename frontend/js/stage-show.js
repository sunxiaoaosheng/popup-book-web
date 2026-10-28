/**
 * 开场幕布。纯函数：盖子角度进，这一帧的暗角、光缝、扫光、分层折纸出。
 * 不改小秘密的判定，也不碰网格。画面在 stage-show-view.js。
 *
 * 首演（存档还没有 stageShown）跟着角度走完一场：合着是幕，
 * 过直角时全场亮灯，纸片按地面→树→小屋→立体件→小猫→天光的顺序展平。
 * 看过之后只留 stageSubtleMix 那么一点。轻轻合上和啪各有自己的落幕。
 */
import { clamp, lerp, sstep } from './math.js';
import { closeKind } from './rules.js';
import { TUNING } from './tuning.js';

/** 弹起的顺序。越靠后越晚站直。 */
export const STAGE_LAYERS = ['ground', 'trees', 'cabin', 'pop', 'kitten', 'sky'];

/**
 * 小猫的落点由 kitten-place 算好：脚在门洞地板、窗台或追萤火虫的平地上。
 * cabin 托着身体，pop 里是窗台。幕布若再改这三层的姿态，脚就会离开落点。
 */
export const FIXED_LAYERS = new Set(['cabin', 'pop', 'kitten']);

/** 画面实际采用的倍率。托着小猫的层永远是 1。 */
export function appliedGain(id, gain) {
  return FIXED_LAYERS.has(id) ? 1 : gain;
}

/** 每一层自己的角度窗，和书页上原来的折起区间对齐，只是首演时先留一截折痕。 */
const LAYER_SPAN = {
  ground: [8, 26],
  trees: [16, 40],
  cabin: [32, 58],
  pop: [46, 72],
  kitten: [68, 94],
  sky: [96, 120],
};

const RANK = { '': 0, gentle: 1, normal: 2, slam: 3 };

/**
 * @param {number} angle
 * @param {typeof TUNING} [tuning]
 * @returns {'shut'|'seam'|'rise'|'house'|'lights'|'play'|'night'}
 */
export function stageBeat(angle, tuning = TUNING) {
  if (angle < tuning.stageShut) return 'shut';
  if (angle < tuning.stageSeam) return 'seam';
  if (angle < tuning.stageRise) return 'rise';
  if (angle < tuning.stageHouse) return 'house';
  if (angle < tuning.stageLights) return 'lights';
  if (angle < tuning.stagePlay) return 'play';
  return 'night';
}

/**
 * @param {{premiered?: boolean}} [opts]
 */
export function createStageShow(opts = {}) {
  const seen = !!opts.premiered;
  return {
    premiered: seen,
    /** 这一场还在演首演（直到第一次真正合上）。 */
    live: !seen,
    popT: -1,
    swept: false,
    prevAngle: 0,
    /** @type {''|'gentle'|'slam'|'normal'} */
    closeStyle: '',
    closingSeen: false,
    bow: 0,
    /** 这次落幕要不要用首演的幅度。 */
    bowFull: false,
    flash: 0,
    sweepP: 0,
    sweepOn: false,
    sweepAmp: 0,
    sweepDur: 0.9,
    vignette: seen ? 0.2 : 0.78,
    slit: seen ? 0.16 : 0.05,
    dim: seen ? 0.92 : 0.46,
    unfold: seen ? 0.2 : 0.05,
  };
}

/**
 * @param {ReturnType<typeof createStageShow>} state
 * @param {{dt:number, angle:number, speed:number, dir:number, closing:boolean, closeMax:number}} input
 * @param {typeof TUNING} [tuning]
 */
export function stepStageShow(state, input, tuning = TUNING) {
  const dt = Math.max(0, input.dt || 0);
  const angle = input.angle;
  const opening = input.dir > 0 && !input.closing;
  const crossed = state.prevAngle < tuning.stagePremiereAt && angle >= tuning.stagePremiereAt;
  state.prevAngle = angle;

  let justPremiered = false;
  if (opening && crossed) {
    if (!state.premiered) {
      state.premiered = true;
      state.popT = 0;
      justPremiered = true;
      beginSweep(state, true, tuning);
      state.swept = true;
    } else if (!state.swept) {
      beginSweep(state, false, tuning);
      state.swept = true;
    }
  }
  if (angle < tuning.stageSeam) state.swept = false;
  if (state.popT >= 0) state.popT += dt;

  latchClose(state, input, tuning);

  const curtain = state.bow > 0.02 || state.closingSeen;
  const style = state.closeStyle;
  const openBeat = stageBeat(angle, tuning);
  /** @type {'shut'|'seam'|'rise'|'house'|'lights'|'play'|'night'|'curtain-gentle'|'curtain-slam'|'curtain'} */
  let beat = openBeat;
  if (curtain) {
    beat = style === 'slam' ? 'curtain-slam' : style === 'gentle' ? 'curtain-gentle' : 'curtain';
  }

  const fullShow = state.live || (state.bow > 0 && state.bowFull);
  const look = mixTowardShut(openBeat, angle, curtain, fullShow ? 1 : tuning.stageSubtleMix, tuning);
  const tau = curtain ? closeTau(style, tuning) : tuning.stageOpenTau;
  state.vignette = approach(state.vignette, look.vignette, dt, tau);
  state.slit = approach(state.slit, look.slit, dt, tau);
  state.dim = approach(state.dim, look.dim, dt, tau);
  state.unfold = approach(state.unfold, look.unfold, dt, tau);

  if (state.sweepOn) {
    state.sweepP += dt / Math.max(0.05, state.sweepDur);
    if (state.sweepP >= 1) {
      state.sweepP = 1;
      state.sweepOn = false;
    }
  }
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt / 0.18);
  if (state.bow > 0 && !input.closing) {
    const bowTau = style === 'slam' ? 0.28 : 0.95;
    state.bow = Math.max(0, state.bow - dt / bowTau);
  }
  if (state.bow === 0) state.bowFull = false;

  const premiereHold = state.live && state.popT < 0;
  const waving = state.popT >= 0;
  /** @type {Record<string, number>} */
  const layers = {};
  for (let i = 0; i < STAGE_LAYERS.length; i++) {
    const id = STAGE_LAYERS[i];
    let gain = layerGain(angle, i, id, state.popT, premiereHold || waving, tuning);
    if (curtain) gain = foldForClose(gain, angle, i, style);
    layers[id] = gain;
  }

  const sweepGlow = state.sweepP > 0 && state.sweepP < 1
    ? Math.sin(state.sweepP * Math.PI) * state.sweepAmp
    : 0;

  return {
    beat,
    mode: fullShow ? 'full' : 'subtle',
    vignette: state.vignette,
    slit: state.slit,
    dim: state.dim,
    unfold: state.unfold,
    sweep: state.sweepP,
    sweepGlow,
    flash: state.flash,
    bow: state.bow,
    closeStyle: style,
    layers,
    premiered: state.premiered,
    justPremiered,
    live: state.live,
  };
}

/**
 * @param {ReturnType<typeof createStageShow>} state
 * @param {boolean} full
 * @param {typeof TUNING} tuning
 */
function beginSweep(state, full, tuning) {
  state.sweepP = 0;
  state.sweepOn = true;
  state.sweepAmp = full ? 1 : tuning.stageSubtleMix;
  state.sweepDur = full ? tuning.stageSweep : tuning.stageSweepSubtle;
}

/**
 * @param {ReturnType<typeof createStageShow>} state
 * @param {{angle:number, speed:number, closing:boolean, closeMax:number}} input
 * @param {typeof TUNING} tuning
 */
function latchClose(state, input, tuning) {
  if (input.closing) {
    const peak = Math.max(input.closeMax || 0, input.speed || 0);
    const kind = closeKind(peak, tuning);
    state.closeStyle = (RANK[kind] || 0) > (RANK[state.closeStyle] || 0) ? kind : state.closeStyle;
    state.closingSeen = true;
    return;
  }
  if (!state.closingSeen) {
    if (input.angle > 30 && state.bow === 0) state.closeStyle = '';
    return;
  }
  if (input.angle < 8) {
    state.bowFull = state.live;
    state.bow = 1;
    state.closingSeen = false;
    state.live = false;
    state.popT = -1;
    state.swept = false;
    if (state.closeStyle === 'slam') state.flash = tuning.stageFlash;
    return;
  }
  state.closingSeen = false;
  state.closeStyle = '';
}

/** @param {'gentle'|'slam'|'normal'|''} style @param {typeof TUNING} tuning */
function closeTau(style, tuning) {
  if (style === 'slam') return tuning.stageSlamTau;
  if (style === 'gentle') return tuning.stageGentleTau;
  return tuning.stageNormalTau;
}

/**
 * 开着时的一拍，合盖过程中再往「幕布合上」混一截。
 * 混多少只跟角度走，轻轻和啪的差别在时间常数和纸片收法。
 */
function mixTowardShut(openBeat, angle, curtain, fullK, tuning) {
  const full = beatLook(openBeat);
  const subtle = angle < tuning.stageHouse ? SUBTLE_SHUT : (openBeat === 'night' ? SUBTLE_NIGHT : SUBTLE_OPEN);
  let look = mixLook(subtle, full, fullK);
  if (!curtain) return look;
  const kClose = 1 - sstep(12, 80, angle);
  const shutFull = beatLook('shut');
  const shut = mixLook(SUBTLE_SHUT, shutFull, fullK);
  look = mixLook(look, shut, kClose);
  return look;
}

const SUBTLE_OPEN = { slit: 0.94, vignette: 0.1, dim: 1, unfold: 0.97 };
const SUBTLE_SHUT = { slit: 0.2, vignette: 0.26, dim: 0.9, unfold: 0.22 };
const SUBTLE_NIGHT = { slit: 0.94, vignette: 0.18, dim: 1, unfold: 0.97 };

/** @param {'shut'|'seam'|'rise'|'house'|'lights'|'play'|'night'} beat */
function beatLook(beat) {
  switch (beat) {
    case 'shut': return { slit: 0.05, vignette: 0.84, dim: 0.42, unfold: 0.04 };
    case 'seam': return { slit: 0.24, vignette: 0.68, dim: 0.52, unfold: 0.24 };
    case 'rise': return { slit: 0.46, vignette: 0.5, dim: 0.64, unfold: 0.5 };
    case 'house': return { slit: 0.66, vignette: 0.34, dim: 0.74, unfold: 0.72 };
    case 'lights': return { slit: 0.92, vignette: 0.14, dim: 1, unfold: 0.96 };
    case 'play': return { slit: 1, vignette: 0.06, dim: 1, unfold: 1 };
    default: return { slit: 1, vignette: 0.22, dim: 1, unfold: 1 };
  }
}

/**
 * @param {{slit:number, vignette:number, dim:number, unfold:number}} a
 * @param {{slit:number, vignette:number, dim:number, unfold:number}} b
 * @param {number} k
 */
function mixLook(a, b, k) {
  return {
    slit: lerp(a.slit, b.slit, k),
    vignette: lerp(a.vignette, b.vignette, k),
    dim: lerp(a.dim, b.dim, k),
    unfold: lerp(a.unfold, b.unfold, k),
  };
}

function layerGain(angle, index, id, popT, theatrical, tuning) {
  const span = LAYER_SPAN[id];
  const gate = sstep(span[0], span[1], angle);
  if (!theatrical) return lerp(0.975, 1, gate);
  const held = lerp(tuning.stageHold, tuning.stageHold + (1 - tuning.stageHold) * 0.28, gate);
  const wave = popWave(popT, index, tuning.stagePopGap, tuning.stagePopDur);
  const base = lerp(held, 1, wave.finale);
  return base * (1 + tuning.stagePop * wave.pulse);
}

/** @returns {{finale:number, pulse:number}} */
function popWave(clock, index, gap, dur) {
  if (clock < 0) return { finale: 0, pulse: 0 };
  const u = (clock - index * gap) / Math.max(0.05, dur);
  if (u <= 0) return { finale: 0, pulse: 0 };
  if (u >= 1) return { finale: 1, pulse: 0 };
  const finale = u * u * (3 - 2 * u);
  return { finale, pulse: Math.sin(u * Math.PI) };
}

function foldForClose(gain, angle, index, style) {
  if (style === 'slam') {
    const drop = sstep(4, 42, angle);
    return gain * lerp(0.32, 1, drop);
  }
  const at = 16 + index * 13;
  const fold = sstep(at - 22, at + 6, angle);
  const keep = style === 'gentle' ? 0.5 : 0.35;
  return gain * lerp(fold, 1, keep);
}

function approach(cur, target, dt, tau) {
  if (dt <= 0) return cur;
  return clamp(cur + (target - cur) * (1 - Math.exp(-dt / Math.max(0.02, tau))), 0, 1.2);
}
