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
};

/**
 * 分享卡。只有按下「分享」或 C 才会读这些数。
 * 主循环不读像素，也不为它保留绘图缓冲。
 * clipSec 只在打开「短片」或 `?shareclip=1` 时用，会被夹到 3–5 秒。默认分享不录。
 */
export const SHARE = {
  cardW: 1280,
  cardH: 960,
  margin: 56,
  footer: 168,
  borderAmp: 8,
  photoAmp: 3.5,
  borderSteps: 16,
  labelPx: 28,
  captionPx: 34,
  captionMinPx: 20,
  footPx: 22,
  speckCount: 18,
  clipSec: 4,
  clipFps: 12,
};

/**
 * 合页动手感。声音和镜头只读这些数字，映射在 hinge-feel.js。
 * 角度是度，速度是度/秒，增益是接到主音量之前的线性幅度。
 */
export const HINGE_FEEL = {
  /** off / low / normal 的总倍率。off 时镜头和拟音都是 0。 */
  levels: { off: 0, low: 0.42, normal: 1 },
  /** 低于此时不出嘎吱和纸声。盖住停住时的角度抖动。 */
  speedDead: 5,
  /** 角速度到此时，嘎吱、纸声和镜头到达满幅。 */
  speedFull: 150,
  /** 嘎吱中心频率沿开合行程从低走到高。 */
  travel: 130,
  creakHzLo: 190,
  creakHzHi: 640,
  creakQ: 7.2,
  creakGain: 0.2,
  /** 嘎吱音高的缓慢起伏，比例。 */
  creakWobble: 0.07,
  /** 方向反转且两边都够快时，短促的铰链咔哒。 */
  clickAbove: 32,
  clickCooldown: 0.09,
  clickGain: 0.16,
  clickHz: 1680,
  /** 纸声在立页的角度带里更满，合上和完全打开时收一点。 */
  rustleLo: 12,
  rustleRise: 36,
  rustleFall: 88,
  rustleHi: 120,
  rustle: [
    { hz: 820, q: 0.7, gain: 0.12 },
    { hz: 2300, q: 0.9, gain: 0.14 },
    { hz: 5600, q: 1.2, gain: 0.075 },
  ],
  /** 直角、开尽、合上各一下。同一落点在冷却内不连发。 */
  thunkCooldown: 0.42,
  thunkGain: 0.26,
  /** 慢慢经过也有一声轻的，猛地经过顶到 thunkGain。 */
  thunkFloor: 0.38,
  thunkSpeedFull: 110,
  right: { angle: 90, hz0: 172, hz1: 68, dur: 0.15 },
  open: { angle: 128, hz0: 104, hz1: 42, dur: 0.2 },
  closed: { angle: 2.2, hz0: 88, hz1: 36, dur: 0.22 },
  /** 镜头平滑时间常数。晃动频率压在 2Hz 以下，避免晕。 */
  camTau: 0.1,
  shakeCap: 0.055,
  shakeHz: 1.15,
  parallaxCap: 0.16,
  fovCap: 0.85,
  breatheHz: 0.32,
};
