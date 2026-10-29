// 房间环境光 → 已经存在的白天 / 黄昏 / 夜。不新建季节，也不读合页角度。
// 开关关着、或没有读数时，调用方继续用书里的时刻。滞回阈值在 tuning.js。
import { lerp } from './math.js';
import { TUNING } from './tuning.js';

/** 开着时按钮写「关掉」。 */
export const AMBIENT_ON_LABEL = '关闭环境光';
/** 关着时按钮写「打开」。 */
export const AMBIENT_OFF_LABEL = '开启环境光';

/**
 * 三段气氛在现有天空权重里的位置。
 * 白天取正午（uc 0.5），黄昏取日弧尽头（uc 1），夜只抬 nightP。
 * dawn 不另做一档：环境光只问白天、黄昏、夜。
 * @type {Record<'day'|'dusk'|'night', {uc:number, nightP:number, dawnP:number, goldP:number, elev:number}>}
 */
const BAND_ATMOSPHERE = {
  day: { uc: 0.5, nightP: 0, dawnP: 0, goldP: 0, elev: 1 },
  dusk: { uc: 1, nightP: 0, dawnP: 0, goldP: 1, elev: 0 },
  night: { uc: 0.5, nightP: 1, dawnP: 0, goldP: 0, elev: 0 },
};

/**
 * @param {'day'|'dusk'|'night'|null} prev
 * @param {number} lux
 * @param {typeof TUNING.ambient} [tuning]
 * @returns {'day'|'dusk'|'night'}
 */
export function nextBand(prev, lux, tuning = TUNING.ambient) {
  const x = lux < 0 ? 0 : lux;
  const { nightOn, nightOff, dayOn, dayOff } = tuning;
  if (prev === 'night') {
    if (x < nightOff) return 'night';
    return x >= dayOn ? 'day' : 'dusk';
  }
  if (prev === 'day') {
    if (x > dayOff) return 'day';
    return x <= nightOn ? 'night' : 'dusk';
  }
  if (prev === 'dusk') {
    if (x <= nightOn) return 'night';
    if (x >= dayOn) return 'day';
    return 'dusk';
  }
  if (x <= nightOn) return 'night';
  if (x >= dayOn) return 'day';
  return 'dusk';
}

/** @param {'day'|'dusk'|'night'} band */
export function atmosphereFor(band) {
  return BAND_ATMOSPHERE[band] || BAND_ATMOSPHERE.day;
}

/**
 * @param {typeof TUNING.ambient} [tuning]
 */
export function createAmbientClock(tuning = TUNING.ambient) {
  /** @type {'day'|'dusk'|'night'|null} */
  let band = null;
  /** @type {number|null} */
  let lux = null;
  let at = 0;
  let mix = 0;
  const out = { se: 0, uc: 0, nightP: 0, dawnP: 0, goldP: 0, elev: 0 };

  function fresh(now) {
    return lux != null && now - at <= tuning.holdMs;
  }

  return {
    /**
     * 0 勒克斯是夜里，不是「没有读数」。非有限数字直接丢掉，也不刷新时间戳。
     * @param {unknown} value
     * @param {number} now
     */
    note(value, now) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      lux = value < 0 ? 0 : value;
      at = now;
      band = nextBand(band, lux, tuning);
    },
    /**
     * 开关关着，或读数已经过期：返回 null，天空回到书里的时间。
     * @param {boolean} enabled
     * @param {number} now
     * @returns {'day'|'dusk'|'night'|null}
     */
    bandAt(enabled, now) {
      if (!enabled || !fresh(now)) return null;
      return band;
    },
    /** @param {boolean} enabled @param {number} now */
    snapshot(enabled, now) {
      const live = fresh(now);
      return {
        on: !!enabled,
        band: enabled && live ? band : null,
        lux: live ? lux : null,
        mix: +mix.toFixed(3),
      };
    },
    /**
     * 合页样本是底。打开且读数还新时，才把气氛缓向环境光那一档。
     * `se` 是换季进度，原样留下。
     * @param {{se:number, uc:number, nightP:number, dawnP:number, goldP:number, elev:number}} book
     * @param {boolean} enabled
     * @param {number} now
     * @param {number} dt
     */
    paint(book, enabled, now, dt) {
      const live = !!(enabled && fresh(now) && band);
      const want = live ? 1 : 0;
      const tau = tuning.blendTau > 0 ? tuning.blendTau : 0.05;
      mix += (want - mix) * (1 - Math.exp(-Math.max(0, dt) / tau));
      if (mix < 0.001) mix = 0;
      else if (mix > 0.999) mix = 1;
      if (mix === 0 || !band) return book;
      const a = atmosphereFor(band);
      out.se = book.se;
      out.uc = lerp(book.uc, a.uc, mix);
      out.nightP = lerp(book.nightP, a.nightP, mix);
      out.dawnP = lerp(book.dawnP, a.dawnP, mix);
      out.goldP = lerp(book.goldP, a.goldP, mix);
      out.elev = lerp(book.elev, a.elev, mix);
      return out;
    },
  };
}
