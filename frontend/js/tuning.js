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
   * 开场幕布。数字只服务画面：暗角、光缝、分层纸片、约 90° 的一次亮灯。
   * 不参与小秘密判定。首演看存档 stageShown；看过之后 stageSubtleMix 把幅度收小。
   */
  stagePremiereAt: 90,
  /** 角度带到哪一拍。shut < stageShut ≤ seam < stageSeam ≤ … < stagePlay ≤ night。 */
  stageShut: 12,
  stageSeam: 28,
  stageRise: 52,
  stageHouse: 78,
  stageLights: 98,
  stagePlay: 114,
  /** 首演里纸片在亮灯前先留一截折痕，亮灯时再一层层展平。 */
  stageHold: 0.84,
  /** 看过首演之后，开场目标只保留这么多（0 几乎看不出，1 和首演一样）。 */
  stageSubtleMix: 0.24,
  /** 亮灯那一道光扫过全场要多久。再次经过直角时用较短的那一档。 */
  stageSweep: 0.92,
  stageSweepSubtle: 0.4,
  /** 分层弹起：每一层比上一层晚 stagePopGap 秒，自身用 stagePopDur 秒展平。 */
  stagePopGap: 0.075,
  stagePopDur: 0.3,
  /** 展平时的过冲，纸片会略微超过站直再落回来。 */
  stagePop: 0.14,
  /** 合盖时暗角跟上盖子的快慢。轻轻合上拖得久，啪几乎贴着盖子。 */
  stageGentleTau: 0.7,
  stageSlamTau: 0.08,
  stageNormalTau: 0.34,
  stageOpenTau: 0.22,
  /** 啪地合上时白闪的峰值。 */
  stageFlash: 0.7,
};
