/**
 * 合页动手感的纯曲线。输入是角度、角速度和强度，
 * 输出是拟音参数和镜头偏移。不碰 WebAudio，也不碰 Three。
 */
import { clamp, smooth, sstep } from './math.js';
import { HINGE_FEEL } from './tuning.js';

export const FEEL_LEVELS = ['off', 'low', 'normal'];

const NEXT_FEEL = { normal: 'low', low: 'off', off: 'normal' };

/** @param {string} level */
export function normalizeFeel(level) {
  return FEEL_LEVELS.indexOf(level) >= 0 ? level : 'normal';
}

/** 常 → 低 → 关 → 常。 */
export function nextFeel(level) {
  return NEXT_FEEL[normalizeFeel(level)];
}

/**
 * @param {string} level
 * @param {typeof HINGE_FEEL} [feel]
 */
export function levelScale(level, feel = HINGE_FEEL) {
  const k = feel.levels[normalizeFeel(level)];
  return k == null ? 1 : k;
}

/**
 * 死区之后平滑抬到 1。速度取绝对值。
 * @param {number} speedDeg
 * @param {typeof HINGE_FEEL} [feel]
 */
export function speedAmount(speedDeg, feel = HINGE_FEEL) {
  return sstep(feel.speedDead, feel.speedFull, Math.abs(speedDeg));
}

/**
 * 立页那一段纸声更满，两端留一点底。
 * @param {number} angle
 * @param {typeof HINGE_FEEL} [feel]
 */
export function pageOpenness(angle, feel = HINGE_FEEL) {
  const rise = sstep(feel.rustleLo, feel.rustleRise, angle);
  const fall = 1 - sstep(feel.rustleFall, feel.rustleHi, angle);
  return 0.42 + 0.58 * rise * fall;
}

export function createFeelState() {
  return {
    prevAngle: 0,
    prevSpeed: 0,
    primed: false,
    coolRight: 0,
    coolOpen: 0,
    coolClosed: 0,
    coolClick: 0,
    smSpeed: 0,
    shakeX: 0,
    shakeY: 0,
    parX: 0,
    parY: 0,
    fov: 0,
    out: {
      creakGain: 0,
      creakHz: 220,
      creakQ: HINGE_FEEL.creakQ,
      clickGain: 0,
      clickHz: HINGE_FEEL.clickHz,
      rustle: [
        { gain: 0, hz: HINGE_FEEL.rustle[0].hz, q: HINGE_FEEL.rustle[0].q },
        { gain: 0, hz: HINGE_FEEL.rustle[1].hz, q: HINGE_FEEL.rustle[1].q },
        { gain: 0, hz: HINGE_FEEL.rustle[2].hz, q: HINGE_FEEL.rustle[2].q },
      ],
      thunks: [
        { id: '', gain: 0, hz0: 0, hz1: 0, dur: 0 },
        { id: '', gain: 0, hz0: 0, hz1: 0, dur: 0 },
        { id: '', gain: 0, hz0: 0, hz1: 0, dur: 0 },
      ],
      thunkCount: 0,
      shakeX: 0,
      shakeY: 0,
      parX: 0,
      parY: 0,
      fov: 0,
    },
  };
}

function ease(cur, target, dt, tau, cap) {
  if (cap <= 0) return 0;
  const next = smooth(cur, clamp(target, -cap, cap), dt, tau);
  return clamp(next, -cap, cap);
}

function creakHz(angle, speed, time, amount, feel) {
  const u = clamp(angle / Math.max(1, feel.travel), 0, 1);
  const base = feel.creakHzLo + (feel.creakHzHi - feel.creakHzLo) * u;
  const wob = Math.sin(time * 7.4) * feel.creakWobble + Math.sin(time * 12.7) * feel.creakWobble * 0.55;
  const bright = 1 + 0.18 * amount;
  const close = speed < 0 ? 0.9 : 1;
  return Math.max(40, base * (1 + wob) * bright * close);
}

function pushThunk(out, id, gain, spec) {
  const t = out.thunks[out.thunkCount];
  t.id = id;
  t.gain = gain;
  t.hz0 = spec.hz0;
  t.hz1 = spec.hz1;
  t.dur = spec.dur;
  out.thunkCount += 1;
}

/**
 * @param {ReturnType<typeof createFeelState>} state
 * @param {{angle:number, speed:number, dt:number, time:number, level:string}} input
 * @param {typeof HINGE_FEEL} [feel]
 */
export function stepHingeFeel(state, input, feel = HINGE_FEEL) {
  const angle = Number.isFinite(input.angle) ? input.angle : 0;
  const speed = Number.isFinite(input.speed) ? input.speed : 0;
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.1) : 0;
  const time = Number.isFinite(input.time) ? input.time : 0;
  const k = levelScale(input.level, feel);
  const out = state.out;

  state.coolRight = Math.max(0, state.coolRight - dt);
  state.coolOpen = Math.max(0, state.coolOpen - dt);
  state.coolClosed = Math.max(0, state.coolClosed - dt);
  state.coolClick = Math.max(0, state.coolClick - dt);

  const prev = state.prevAngle;
  const prevSpeed = state.prevSpeed;
  const primed = state.primed;
  state.prevAngle = angle;
  state.prevSpeed = speed;
  state.primed = true;

  out.creakGain = 0;
  out.clickGain = 0;
  out.clickHz = feel.clickHz;
  out.thunkCount = 0;
  out.shakeX = 0;
  out.shakeY = 0;
  out.parX = 0;
  out.parY = 0;
  out.fov = 0;
  for (let i = 0; i < out.rustle.length; i++) out.rustle[i].gain = 0;

  if (k <= 0) {
    state.smSpeed = 0;
    state.shakeX = 0;
    state.shakeY = 0;
    state.parX = 0;
    state.parY = 0;
    state.fov = 0;
    return out;
  }

  const amount = speedAmount(speed, feel);
  out.creakHz = creakHz(angle, speed, time, amount, feel);
  out.creakQ = feel.creakQ;
  out.creakGain = feel.creakGain * k * amount;

  const drive = amount * pageOpenness(angle, feel);
  for (let i = 0; i < feel.rustle.length; i++) {
    const spec = feel.rustle[i];
    const shaped = drive <= 0 ? 0 : Math.pow(drive, 0.8 + i * 0.45);
    const layer = out.rustle[i];
    layer.gain = spec.gain * shaped * k;
    layer.hz = spec.hz * (1 + 0.06 * amount);
    layer.q = spec.q;
  }

  if (primed) {
    const opening = angle > prev;
    const energy = clamp(Math.abs(speed) / Math.max(1, feel.thunkSpeedFull), 0, 1);
    const thunkGain = feel.thunkGain * k * (feel.thunkFloor + (1 - feel.thunkFloor) * energy);
    if (((prev < feel.right.angle && angle >= feel.right.angle) || (prev > feel.right.angle && angle <= feel.right.angle)) && state.coolRight <= 0) {
      state.coolRight = feel.thunkCooldown;
      pushThunk(out, 'right', thunkGain, feel.right);
    }
    if (prev < feel.open.angle && angle >= feel.open.angle && opening && state.coolOpen <= 0) {
      state.coolOpen = feel.thunkCooldown;
      pushThunk(out, 'open', thunkGain, feel.open);
    }
    if (prev > feel.closed.angle && angle <= feel.closed.angle && !opening && state.coolClosed <= 0) {
      state.coolClosed = feel.thunkCooldown;
      pushThunk(out, 'closed', thunkGain, feel.closed);
    }
    const reversed = prevSpeed * speed < 0
      && Math.abs(speed) >= feel.clickAbove
      && Math.abs(prevSpeed) >= feel.clickAbove * 0.4
      && state.coolClick <= 0;
    if (reversed) {
      state.coolClick = feel.clickCooldown;
      out.clickGain = feel.clickGain * k * (0.55 + 0.45 * amount);
    }
  }

  const sm = smooth(state.smSpeed, clamp(speed, -feel.speedFull, feel.speedFull), dt, feel.camTau);
  state.smSpeed = sm;
  const mag = speedAmount(sm, feel);
  const wob = Math.sin(time * feel.shakeHz * Math.PI * 2);
  const wob2 = Math.sin(time * feel.shakeHz * 0.73 * Math.PI * 2 + 1.2);
  const shakeCap = feel.shakeCap * k;
  const parCap = feel.parallaxCap * k;
  const fovCap = feel.fovCap * k;
  state.shakeX = ease(state.shakeX, shakeCap * mag * wob, dt, feel.camTau, shakeCap);
  state.shakeY = ease(state.shakeY, shakeCap * mag * 0.62 * wob2, dt, feel.camTau, shakeCap);
  state.parX = ease(state.parX, clamp(sm / Math.max(1, feel.speedFull), -1, 1) * parCap, dt, feel.camTau, parCap);
  state.parY = ease(state.parY, mag * parCap * 0.35, dt, feel.camTau, parCap);
  const breathe = 0.62 + 0.38 * Math.sin(time * feel.breatheHz * Math.PI * 2);
  state.fov = ease(state.fov, fovCap * mag * breathe, dt, feel.camTau, fovCap);
  out.shakeX = state.shakeX;
  out.shakeY = state.shakeY;
  out.parX = state.parX;
  out.parY = state.parY;
  out.fov = state.fov;
  return out;
}
