/**
 * 手感与玩法阈值。只放数字，不放场景。
 * 单位：角度是度，速度是度/秒（平滑后的角速度），时间是秒。
 * 改这里会影响 `rules.js` 的判定和场景里的实际触发。
 */

/** @typedef {typeof TUNING} Tuning */

export const TUNING = {
  /** 慢于此时小猫害羞探头。 */
  shyBelow: 16,
  /** 快于此时纸张哗啦，并可能惊飞猫头鹰。 */
  fastAbove: 85,
  /** 合盖过程中最大角速度高于此时：啪。 */
  slamAbove: 120,
  /** 合盖过程中最大角速度低于此时：轻轻合上，算「晚安」。 */
  gentleBelow: 45,
  /** 停住多久触发隐藏剧情（缝里的眼睛、午觉、追萤火虫）。 */
  holdSeconds: 3,
  /** 判定「停住」允许的角度抖动。 */
  holdTol: 2.2,

  /**
   * 「一整天」：从 dayStart 以下起算，回退不超过 dayBackTol、
   * 角速度不超过 fastAbove，开到 dayEnd，用时至少 daySeconds。
   */
  dayStart: 30,
  dayEnd: 122,
  dayBackTol: 5,
  daySeconds: 9,
  /** 正午打喷嚏的间隔。 */
  sneezeEvery: 6.5,

  /** 清晨窗后伸懒腰的角度带，以及停住多久出字幕（不是秘密）。 */
  dawnLo: 36,
  dawnHi: 58,
  dawnHold: 2.2,

  /** 开着时换季：开盖进度把 SEASON.t 从 0 推到 1 的角度区间。 */
  seasonMorphLo: 22,
  seasonMorphHi: 65,

  // ---- 贴纸手账：靠近才揭提示。下面这些不改秘密本身的触发。 ----
  /** 邻近角度带比触发带每侧宽出的度数。 */
  stickerBandPad: 7,
  /** 离开邻近带再远这么多度，才算真正走开，避免边界抖动连算多次。 */
  stickerBandHyst: 3,
  /** 进过邻近带这么多次，才把含蓄提示写进贴纸格。 */
  stickerAttemptsForHint: 3,
  /** 摇晃来回够这么下、还没凑满秘密，算靠近。 */
  stickerShakeAlmost: 2,
  /** 角速度达到 fastAbove 的这个比例、又还没把猫头鹰惊飞，算靠近。 */
  stickerOwlSpeedFrac: 0.72,
  /** 合盖最大角速度低于 gentleBelow 乘这个数、又已经超过轻轻合上，算靠近晚安。 */
  stickerGentleAlmost: 1.45,
  /** 一整天：干净地开过这个角度、还没到终点，算靠近。 */
  stickerDayAlmost: 88,
};
