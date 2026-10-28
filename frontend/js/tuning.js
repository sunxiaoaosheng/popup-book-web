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
   * 小猫的记性和心情。墙钟用毫秒，书里的时间用秒，角度用度。
   * 判定在 kitten-memory.js / kitten-mood.js，不改落点。
   */
  kitten: {
    /** 短于此时再见面，不另打招呼（刷新、刚合上又打开）。 */
    soonGapMs: 45 * 1000,
    /** 同一天离开超过此时，说「隔了好久」。日历换了一天则说「新的一天」。 */
    hoursGapMs: 3 * 60 * 60 * 1000,
    /** 这段时间内打开次数达到 oftenCount，心情变兴奋。 */
    oftenWindowMs: 45 * 60 * 1000,
    oftenCount: 3,
    /** 被猛地合上之后，害羞持续这么久。 */
    shyAfterSlamMs: 20 * 60 * 1000,
    /** 两次打开隔得比这更近，只算一次。 */
    reopenGapMs: 8 * 1000,
    /** 存档里留下最近多少次打开。 */
    visitKeep: 8,
    /** 开着的时候，隔这么多秒把「最后见面」写进存档。 */
    seenEvery: 60,
    /** 低于此时算合上，再开过 openAbove 记一次打开。 */
    shutBelow: 12,
    openAbove: 72,
    /** 小猫在玩的姿势里几乎不动这么久，就打盹。大约 8–10 秒，方便一眼看见。 */
    idleSleepSec: 9,
    /** 低于这个角速度（度/秒）算停着。 */
    idleSpeed: 2.4,
    /** 睡着时，角度在一小段里抖过这么多度、速度也落下来，才轻轻醒来。 */
    wakeJitterDeg: 1,
    /** 一次移动超过此时，只当普通开合，不说轻轻叫醒那句。 */
    wakeJitterMax: 8,
    /** 累积角度还在上面的窗口里时，角速度要低于此时才出那句。 */
    wakeSpeed: 28,
    /** 单帧角度变化小于此时，当成传感器噪声，不累加。 */
    jitterFloor: 0.02,
    /** 噪声累积的衰减时间常数（秒）。 */
    jitterDecay: 1.4,
    /** 醒来后至少醒着这么久，才肯再睡。 */
    wakeHoldSec: 6,
    /** 醒来那一下伸懒腰、瞪眼的时间。 */
    wakeFlash: 1.85,
    /** 招呼、叫醒、打盹、闲话在屏幕上各停这么久。招呼要盖过开到窗台的那几秒。 */
    greetSec: 7,
    wakeCapSec: 6,
    sleepCapSec: 5,
    lineSec: 3.6,
    /** 两句闲话之间至少隔这么久。 */
    lineGapSec: 8,
    /** 一个小动作结束时，说一句的概率。打盹那句不受这个概率限制。 */
    lineChance: 0.55,
    /** 小动作短、间隔更短，换着来才看得出来不是在循环。 */
    idleMin: 0.85,
    idleMax: 1.45,
    idleGapMin: 0.18,
    idleGapMax: 0.5,
  },
};
