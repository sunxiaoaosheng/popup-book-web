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

  /**
   * 换季仪式。粒子锋面只在 SEASON.t 从 0 走到 1 时出现，平时实例 count 为 0。
   * ritualBand：锋面半宽，0–1，横跨书页。
   * ritualParticles：实例上限，不超过场景里一次分配的 96，换季不新建几何。
   * ritualHaze：夏天扫场时蝉雾的峰值不透明度。
   * ritualMotifVol：每季一句环境动机的音量。
   * ritualTwilight：晨昏时天边色带再亮多少。
   */
  ritualBand: 0.2,
  ritualParticles: 80,
  ritualHaze: 0.36,
  ritualMotifVol: 0.08,
  ritualTwilight: 0.55,
};
