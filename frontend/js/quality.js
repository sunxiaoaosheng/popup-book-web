/**
 * 画质。隐藏标签页不画；像素比从 devicePixelRatio 封顶，帧时间持续偏高再往下降。
 * 像素比已经到 1 仍慢，阴影贴图再降一档。只降不升。
 */

export const DPR_CAP = 1.75;
export const SLOW_FRAME_S = 0.028;
export const QUALITY_WINDOW_S = 2;

/** @param {number} devicePixelRatio */
export function initialPixelRatio(devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, DPR_CAP);
}

/** @param {number} pr @param {number} avgFrameSec */
export function nextPixelRatio(pr, avgFrameSec) {
  if (avgFrameSec > SLOW_FRAME_S && pr > 1) {
    return Math.max(1, Math.round((pr - 0.25) * 100) / 100);
  }
  return pr;
}

/**
 * @param {number} size 当前阴影贴图边长
 * @param {number} pr
 * @param {number} avgFrameSec
 */
export function nextShadowSize(size, pr, avgFrameSec) {
  if (pr <= 1 && avgFrameSec > SLOW_FRAME_S && size > 1024) return 1024;
  return size;
}

/** @param {boolean} hidden */
export function shouldRender(hidden) {
  return !hidden;
}
