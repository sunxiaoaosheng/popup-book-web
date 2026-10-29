// 换季仪式的进度曲线和每季一句动机。不引用 Three，也不出声。
import { clamp } from './math.js';
import { seasonIndex } from './rules.js';
import { TUNING } from './tuning.js';

export const RITUAL_KINDS = ['petals', 'fireflies', 'leaves', 'snow'];

/** 扫向这一季时用哪一种锋面。 */
export function ritualKind(season) {
  return RITUAL_KINDS[seasonIndex(season)];
}

/** 0 和 1 时静音，正中为 1。换季两端收掉，中间才值得看。 */
export function ritualIntensity(t) {
  if (!(t > 0) || t >= 1) return 0;
  return Math.sin(Math.PI * clamp(t, 0, 1));
}

/** 锋面从书页左侧走到右侧。smoothstep，打开的前半段走得慢。 */
export function ritualFront(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function hash01(i, n, salt) {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7 + n * 0.17) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 一颗扫场粒子在归一化书页坐标里的位置。u 贴着锋面，v 是纵深，lift 是高度。
 * 传入 out 时不分配新对象。
 * @param {number} i
 * @param {number} n
 * @param {number} t
 * @param {number} time
 * @param {string} kind
 * @param {typeof TUNING} [tuning]
 * @param {{u:number, v:number, lift:number, spin:number, scale:number, alpha:number, front:number}} [out]
 */
export function sweepParticle(i, n, t, time, kind, tuning = TUNING, out) {
  const front = ritualFront(t);
  const band = tuning.ritualBand;
  const inten = ritualIntensity(t);
  const lane = hash01(i, n, 1);
  const depth = hash01(i, n, 2);
  const liftJ = hash01(i, n, 3);
  const spin0 = hash01(i, n, 4) * Math.PI * 2;
  const scale = 0.7 + hash01(i, n, 5) * 0.6;
  let u = front;
  let lift = liftJ;
  let spin = spin0;
  let alphaK = 1;

  if (kind === 'leaves') {
    const ang = time * (1.4 + hash01(i, n, 6)) + spin0;
    const rad = band * (0.25 + 0.55 * hash01(i, n, 7));
    u = clamp(front + Math.cos(ang) * rad, 0, 1);
    lift = clamp(0.42 + Math.sin(ang) * 0.38, 0.05, 0.95);
    spin = ang;
  } else if (kind === 'fireflies') {
    const bob = Math.sin(time * 2.4 + spin0);
    u = clamp(front + (lane - 0.5) * 2 * band * 0.9, 0, 1);
    lift = clamp(0.35 + 0.28 * bob + (liftJ - 0.5) * 0.2, 0.08, 0.92);
    spin = 0;
    alphaK = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(time * 7 + i));
  } else if (kind === 'snow') {
    u = clamp(front + (lane - 0.5) * band, 0, 1);
    lift = 0.06 + (liftJ + time * 0.12) % 1 * 0.9;
    spin = spin0 + time * 0.35;
  } else {
    u = clamp(front + (lane - 0.5) * 2 * band, 0, 1);
    const drift = 0.5 + 0.5 * Math.sin(time * 1.3 + spin0);
    lift = clamp(0.9 - hash01(i, n, 6) * 0.55 * (0.4 + 0.6 * front) + 0.08 * drift, 0.08, 0.96);
    spin = spin0 + time * (1.1 + hash01(i, n, 7));
  }

  const dist = Math.abs(u - front);
  const edge = clamp(1 - dist / Math.max(1e-4, band), 0, 1);
  const o = out || { u: 0, v: 0, lift: 0, spin: 0, scale: 0, alpha: 0, front: 0 };
  o.u = u;
  o.v = depth;
  o.lift = lift;
  o.spin = spin;
  o.scale = scale;
  o.alpha = inten * (0.4 + 0.6 * edge) * alphaK;
  o.front = front;
  return o;
}

/** @typedef {{t:number, f0:number, f1:number, dur:number, vol:number, wave:string}} MotifNote */

const note = (t, f0, f1, dur, vol, wave) => ({ t, f0, f1, dur, vol, wave });

/** 每季一句。vol 是相对音量，播放时再乘 TUNING.ritualMotifVol。 */
const MOTIF = [
  [
    note(0.00, 659, 784, 0.38, 0.7, 'sine'),
    note(0.32, 784, 880, 0.36, 0.65, 'sine'),
    note(0.62, 988, 1175, 0.42, 0.6, 'triangle'),
    note(1.05, 1175, 1319, 0.7, 0.55, 'sine'),
    note(1.55, 1568, 1568, 0.9, 0.4, 'sine'),
  ],
  [
    note(0.00, 392, 392, 1.6, 0.35, 'triangle'),
    note(0.10, 523, 659, 0.3, 0.55, 'triangle'),
    note(0.42, 659, 784, 0.32, 0.5, 'triangle'),
    note(0.74, 784, 880, 0.46, 0.48, 'sine'),
    note(1.10, 1760, 1980, 0.09, 0.22, 'sine'),
    note(1.22, 1860, 2100, 0.09, 0.2, 'sine'),
    note(1.34, 1680, 1900, 0.09, 0.2, 'sine'),
    note(1.50, 880, 880, 0.85, 0.4, 'sine'),
  ],
  [
    note(0.00, 440, 392, 0.5, 0.6, 'triangle'),
    note(0.42, 392, 349, 0.5, 0.55, 'triangle'),
    note(0.88, 349, 294, 0.55, 0.5, 'triangle'),
    note(1.40, 294, 262, 0.9, 0.45, 'sine'),
    note(1.90, 220, 196, 0.8, 0.3, 'sine'),
  ],
  [
    note(0.05, 1568, 1568, 1.1, 0.35, 'sine'),
    note(0.50, 1319, 1319, 1.1, 0.32, 'sine'),
    note(1.10, 1175, 1046, 1.3, 0.28, 'sine'),
    note(1.75, 2093, 2093, 0.9, 0.18, 'sine'),
  ],
];

/** @param {number} season */
export function motifEvents(season) {
  return MOTIF[seasonIndex(season)].map((ev) => ({ ...ev }));
}
