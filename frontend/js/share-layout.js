/**
 * 分享卡的文案和排版。不碰 DOM，不碰 WebGL。
 * 画到画布在 share-draw.js，读像素和下载在 share-capture.js。
 */
import { SEASONS, SECRETS } from './story.js';
import { seasonIndex } from './rules.js';
import { SHARE } from './tuning.js';
import { handBorder, paperSpecks } from './share-border.js';

export { handBorder, paperSpecks } from './share-border.js';

const TOD_SLUG = {
  清晨: 'dawn',
  上午: 'morning',
  正午: 'noon',
  午后: 'afternoon',
  黄昏: 'dusk',
  夜: 'night',
};

const PAPER = {
  spring: '#f8efe6',
  summer: '#f3f6ea',
  autumn: '#f8ecdf',
  winter: '#eef2f6',
};

const ACCENT = {
  spring: '#b85a62',
  summer: '#2f7a58',
  autumn: '#c46a2f',
  winter: '#3d5f8a',
};

const INK = '#3a2a1e';
const INK_SOFT = '#8a6a4a';
const MARK = '林间小屋';

/** @param {typeof SHARE} [tune] */
export function cardLayout(tune = SHARE) {
  const w = tune.cardW;
  const h = tune.cardH;
  const m = tune.margin;
  const photo = { x: m, y: m, w: w - m * 2, h: h - m * 2 - tune.footer };
  const foot = photo.y + photo.h;
  const row = foot + 128;
  return {
    w,
    h,
    frame: { x: 20, y: 20, w: w - 40, h: h - 40 },
    photo,
    label: { x: m, y: foot + 40 },
    caption: { x: w / 2, y: foot + 88, maxW: photo.w },
    seal: { x: m, y: row, w: 22, h: 22 },
    mark: { x: m + 32, y: row + 11 },
    secrets: { x: w - m, y: row + 11 },
  };
}

/**
 * 把源图铺满目标框时该裁哪一块。
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} dstW
 * @param {number} dstH
 */
export function coverCrop(srcW, srcH, dstW, dstH) {
  const srcA = srcW / Math.max(1, srcH);
  const dstA = dstW / Math.max(1, dstH);
  if (srcA > dstA) {
    const sw = srcH * dstA;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstA;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/**
 * @param {{kittenMode?:string, tod?:string, angle?:number, sceneCaption?:string}} input
 */
export function kittenCaption(input) {
  const mode = input.kittenMode || 'hidden';
  const tod = input.tod || '';
  const angle = input.angle || 0;
  if (mode === 'dawn') return '清晨 · 窗后伸了个懒腰';
  if (mode === 'nap') return '它靠着烟囱打了个盹';
  if (mode === 'play' && Math.abs(angle - 90) <= 6.5) return '直角那里，眼睛亮了一下';
  if (tod === '夜') return '夜里抬头看月亮';
  if (tod === '黄昏') return '它转过头去看落日';
  if (tod === '正午') return '正午太亮，它眯起了眼';
  if (mode === 'play') return '蹲在窗台上，尾巴轻轻摆';
  if (angle < 16) return '还躲在合上的书里';
  const scene = (input.sceneCaption || '').trim();
  if (scene) return scene;
  return '今天的林间小屋';
}

/**
 * @param {string} seasonName
 * @param {string} tod
 * @param {string} [morphFrom]
 * @param {string} [morphTo]
 */
export function seasonStamp(seasonName, tod, morphFrom, morphTo) {
  const head = morphFrom && morphTo && morphFrom !== morphTo
    ? `${morphFrom} → ${morphTo}`
    : seasonName;
  return tod ? `${head} · ${tod}` : head;
}

/** @param {number} found @param {number} total */
export function secretsLine(found, total) {
  const n = Math.max(0, found | 0);
  const t = Math.max(1, total | 0);
  return `小秘密 ${n}/${t}`;
}

/**
 * 一句太长就缩小字号，直到放进 maxW，但不小于 min。
 * 宽度按汉字约 0.95em 估算，单测不依赖画布。
 * @param {string} text
 * @param {number} maxW
 * @param {number} base
 * @param {number} min
 */
export function captionFontPx(text, maxW, base, min) {
  const len = [...text].length || 1;
  let px = base;
  while (px > min && len * px * 0.95 > maxW) px -= 2;
  return px;
}

/** @param {number} n */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {Date} date
 * @param {string} seasonKey
 * @param {string} tod
 */
export function shareFileBase(date, seasonKey, tod) {
  const slug = TOD_SLUG[tod] || 'book';
  const key = seasonKey || 'season';
  return `cabin-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${key}-${slug}`;
}

const WEBM_TYPES = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];

/** @param {(type:string)=>boolean} isTypeSupported */
export function pickWebmMime(isTypeSupported) {
  for (const type of WEBM_TYPES) if (isTypeSupported(type)) return type;
  return '';
}

/**
 * 支持录制时给一段 3–5 秒的 WebM。调用方传入 seconds 时允许更短（冒烟用），上限仍是 5。
 * @param {boolean} supported
 * @param {typeof SHARE} [tune]
 * @param {number} [seconds]
 */
export function clipPlan(supported, tune = SHARE, seconds) {
  if (!supported) return { kind: 'png', seconds: 0, fps: 0 };
  const explicit = seconds != null;
  const requested = explicit ? seconds : tune.clipSec;
  const lo = explicit ? 0.4 : 3;
  return {
    kind: 'webm',
    seconds: Math.min(5, Math.max(lo, requested)),
    fps: Math.max(1, tune.clipFps | 0),
  };
}

/**
 * @param {{
 *   season?: number,
 *   tod?: string,
 *   angle?: number,
 *   kittenMode?: string,
 *   sceneCaption?: string,
 *   found?: number,
 *   total?: number,
 *   date?: Date,
 *   seed?: number,
 *   morphFromName?: string,
 *   morphToName?: string,
 * }} input
 * @param {typeof SHARE} [tune]
 */
export function composeShare(input, tune = SHARE) {
  const idx = seasonIndex(input.season || 0);
  const season = SEASONS[idx];
  const tod = input.tod || '';
  const caption = kittenCaption(input);
  const layout = cardLayout(tune);
  const seed = input.seed == null ? 1 : input.seed;
  return {
    label: seasonStamp(season.name, tod, input.morphFromName || '', input.morphToName || ''),
    caption,
    secrets: secretsLine(input.found || 0, input.total == null ? SECRETS.length : input.total),
    mark: MARK,
    fileBase: shareFileBase(input.date || new Date(), season.key, tod),
    paper: PAPER[season.key],
    accent: ACCENT[season.key],
    ink: INK,
    inkSoft: INK_SOFT,
    layout,
    border: handBorder(layout.frame, tune.borderAmp, seed, tune.borderSteps),
    photoBorder: handBorder(layout.photo, tune.photoAmp, seed + 17, tune.borderSteps),
    specks: paperSpecks(layout, seed + 3, tune.speckCount),
    fonts: {
      label: tune.labelPx,
      caption: captionFontPx(caption, layout.caption.maxW, tune.captionPx, tune.captionMinPx),
      foot: tune.footPx,
    },
  };
}
