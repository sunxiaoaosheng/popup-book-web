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
  /**
   * 从打开过的状态合到低于此时：季节 +1。
   * 合严时页面常被盖住，帧循环会停；低于此时的传感器样本仍要记上。
   */
  closeBelow: 5,
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
   * 锁屏解开时盖子往往已经开过上面这段。补播整场扫面要这么久，
   * 不跟当时的角度。页面一直可见时仍走角度，不用这个数。
   */
  seasonCatchupSec: 1.8,

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

  /**
   * 触控板逗猫。盖子够开、光标进小猫热点就粘住。
   * 轻压眯眼。贴纸揭开和换季落地可以请桥做一下很短的触控板轻点。
   * 没有力度或轻点时，粘住、Esc、眯眼字幕仍在。这里没有旋钮，也没有音量。
   */
  trackpad: {
    /** 高于此时才粘住。低于 stickOff 才松开，避免在直角附近抖。 */
    stickOn: 90,
    stickOff: 84,
    /** 归一化力度 ≥ 此时算轻压。1 大约是一次普通按下。没有力度时改看按下。 */
    lightForce: 0.4,
    /** 松开之后，眯眼用这么久睁开。按着的时候不往下减。 */
    squintSec: 0.85,
    /** 两句呼噜字幕至少隔这么久。 */
    purrGap: 1.15,
    purrCapSec: 2.6,
    /** 呼噜声再留这么久，免得下一帧被「没在摸」掐掉。 */
    purrSound: 0.9,
    /** 热点半径，NDC。射线打中小猫也算。 */
    hotspot: 0.12,
    /** 触控板滚动：每个像素换成多少 NDC。 */
    scrollNdc: 0.0035,
    /** 两次轻点请求至少隔这么久，贴纸和换季落在同一拍时只发一次。 */
    hapticGap: 0.12,
  },
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
