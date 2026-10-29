// 季节 × 时刻的天空与光色。纯数据，不引用 Three。画面在 season-light.js 里按权重混合。
import { clamp } from './math.js';
import { seasonIndex } from './rules.js';

/** @typedef {{top:string, horizon:string, glow:string, sun:string, hemi:string, ground:string, sunK:number, hemiK:number}} SkyBand */

const band = (top, horizon, glow, sun, hemi, ground, sunK, hemiK) => (
  { top, horizon, glow, sun, hemi, ground, sunK, hemiK }
);

/** 春、夏、秋、冬，每季清晨 / 白天 / 黄昏 / 夜。sunK、hemiK 只在原来的强度上小幅缩放。 */
export const SKY_RITUAL = [
  [
    band('#f7b7c8', '#ffd4ae', '#ff8fab', '#ffe2c6', '#fff1ea', '#b08978', 0.98, 1.02),
    band('#6ebfed', '#d7f0c4', '#fff1b8', '#fff4dc', '#f2fbff', '#7ea06e', 1.04, 1.00),
    band('#b86eae', '#ff9a6a', '#ff6d6a', '#ffb07a', '#ffe0cc', '#8d604e', 0.94, 0.96),
    band('#1a245c', '#3c2a55', '#ffb4cc', '#c6d2ff', '#6676b8', '#26243f', 0.96, 0.92),
  ],
  [
    band('#ffc898', '#ffe7a4', '#ffb15a', '#fff0c4', '#fff5e2', '#c2aa84', 1.02, 1.02),
    band('#2f92e2', '#fff3b0', '#ffe08a', '#fffcee', '#e7f6ff', '#a9be7a', 1.08, 1.04),
    band('#e85a3a', '#ff9a32', '#ffc56a', '#ff8d4a', '#ffd7a8', '#a15f38', 0.96, 0.98),
    band('#0e2744', '#163628', '#d4ff6a', '#b7c6ff', '#4a6884', '#152830', 0.92, 0.90),
  ],
  [
    band('#e39a72', '#ffc49a', '#ff8648', '#ffd2a4', '#ffe6d0', '#9a7054', 0.98, 1.00),
    band('#e2a56e', '#f0c48e', '#ffd2a0', '#ffe0b4', '#fff0dc', '#8a6844', 1.00, 1.00),
    band('#5c2848', '#ff5e22', '#ffaa3c', '#ff7434', '#ffd0a4', '#6a3c2c', 0.94, 0.96),
    band('#221226', '#4a2030', '#ff8850', '#d0b4ff', '#64506e', '#261c28', 0.90, 0.90),
  ],
  [
    band('#d0dff2', '#f3d4e0', '#ffc6d4', '#f6e8ff', '#eef2ff', '#a8b2c0', 0.90, 0.96),
    band('#c3d6ec', '#eef3f8', '#ffffff', '#f6f9ff', '#f3f6ff', '#c2ccd6', 0.90, 0.98),
    band('#7f97b8', '#e7b0c4', '#ffb4cc', '#ffd0c4', '#e4e8f4', '#8a909e', 0.88, 0.94),
    band('#0c1734', '#1a3058', '#b9d6ff', '#9eb4ea', '#425580', '#1a2236', 0.86, 0.88),
  ],
];

const NAMES = ['dawn', 'day', 'dusk', 'night'];

function smooth01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * 清晨、白天、黄昏、夜的权重，和为 1。
 * @param {number} uc 0 清晨 … 1 入夜前
 * @param {number} nightP
 * @param {{dawn:number, day:number, dusk:number, night:number}} [out]
 */
export function skyWeights(uc, nightP, out) {
  const u = clamp(uc, 0, 1);
  const n = clamp(nightP, 0, 1);
  const dawn = (1 - smooth01(u / 0.42)) * (1 - n);
  const dusk = smooth01((u - 0.55) / 0.45) * (1 - n);
  const day = Math.max(0, (1 - n) - dawn - dusk);
  const night = n;
  const sum = dawn + day + dusk + night || 1;
  const o = out || { dawn: 0, day: 0, dusk: 0, night: 0 };
  o.dawn = dawn / sum;
  o.day = day / sum;
  o.dusk = dusk / sum;
  o.night = night / sum;
  return o;
}

/** 晨昏各有一个脉冲，正午和深夜接近 0。用来把天边的色带再推亮一档。 */
export function twilightPulse(uc, nightP) {
  const u = clamp(uc, 0, 1);
  const day = 1 - clamp(nightP, 0, 1);
  const dawn = Math.exp(-((u - 0.08) ** 2) / 0.012) * day;
  const dusk = Math.exp(-((u - 0.9) ** 2) / 0.014) * day;
  return clamp(Math.max(dawn, dusk), 0, 1);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * 按权重混出这一季、这一刻的十六进制色。测试用。
 * 画面里同一组权重在线性空间混合，两边的色相关系一致。
 * @param {number} season
 * @param {number} uc
 * @param {number} nightP
 */
export function sampleSky(season, uc, nightP) {
  const bands = SKY_RITUAL[seasonIndex(season)];
  const w = skyWeights(uc, nightP);
  const mix = (key) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 4; i++) {
      const [rr, gg, bb] = hexToRgb(bands[i][key]);
      const k = w[NAMES[i]];
      r += rr * k;
      g += gg * k;
      b += bb * k;
    }
    return rgbToHex(r, g, b);
  };
  let sunK = 0;
  let hemiK = 0;
  for (let i = 0; i < 4; i++) {
    sunK += bands[i].sunK * w[NAMES[i]];
    hemiK += bands[i].hemiK * w[NAMES[i]];
  }
  return {
    top: mix('top'),
    horizon: mix('horizon'),
    glow: mix('glow'),
    sun: mix('sun'),
    hemi: mix('hemi'),
    ground: mix('ground'),
    sunK,
    hemiK,
    weights: w,
  };
}
