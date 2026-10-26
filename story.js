// 故事数据：小秘密清单、四季设定。纯数据，不依赖场景。
// 具体触发角度写在 README 的「剧透」章节里；这里的 hint 是游戏里给玩家看的含蓄提示。

export const SECRETS = [
  { id: 'seam', name: '缝里的眼睛', hint: '书刚裂开一道缝的时候，别急着往下开。', found: '缝里有一双眼睛，在偷看你。' },
  { id: 'nap', name: '烟囱边的午觉', hint: '小屋站起来、灯亮了以后，试着停下来，什么都不做。', found: '小猫趁你不动，靠着烟囱睡着了。' },
  { id: 'heart', name: '心动的直角', hint: '有一个角度，方方正正的。猫很喜欢那里。', found: '小猫眼睛亮了，冒出一颗小爱心。' },
  { id: 'owl', name: '受惊的猫头鹰', hint: '林子里还有一位邻居，它不喜欢太猛的动作。', found: '开得太猛，把猫头鹰吓飞了。' },
  { id: 'shake', name: '抖落一身', hint: '书页很轻。来回晃一晃，看看树上有什么。', found: '你把树上的东西全晃下来了。' },
  { id: 'chase', name: '追萤火虫', hint: '夜深了，萤火虫出来之后，在那里多停一会儿。', found: '小猫跳下窗台，追着萤火虫跑。' },
  { id: 'fullday', name: '陪它过完一整天', hint: '从天亮到天黑，慢慢来。别回头，也别着急。', found: '天上多了一只猫，以后每个夜晚都在。' },
  { id: 'goodnight', name: '晚安', hint: '合上书的方式，决定了它怎么说晚安。', found: '你轻轻合上了书，它回了你一句晚安。' },
];

export const SEASONS = [
  { key: 'spring', name: '春', title: '春 · 花瓣', blurb: '花瓣在飘，蝴蝶绕着窗台',
    night: [
      '晚安。小猫梦见一只会发光的蝴蝶。',
      '晚安。花瓣落满了小路，明天会更多。',
    ] },
  { key: 'summer', name: '夏', title: '夏 · 西瓜', blurb: '蝉在叫，小猫戴着草帽啃西瓜',
    night: [
      '晚安。风里都是西瓜的味道，小猫打了个嗝。',
      '晚安。蝉终于也累了，萤火虫替它们守夜。',
    ] },
  { key: 'autumn', name: '秋', title: '秋 · 落叶', blurb: '叶子落下来，小猫忍不住去扑',
    night: [
      '晚安。南瓜灯留给你，小猫先睡了。',
      '晚安。落叶盖好了小路，明天再去扑它们。',
    ] },
  { key: 'winter', name: '冬', title: '冬 · 初雪', blurb: '下雪了，小猫裹着围巾，窗台上有热可可',
    night: [
      '晚安。雪在屋顶上悄悄加了一层，小猫把围巾裹紧了。',
      '晚安。可可还剩半杯，梦里再喝。',
    ] },
];

// 手感阈值（单位：度 / 秒，针对平滑后的角速度）
export const TUNING = {
  shyBelow: 16,       // 慢于此：小猫害羞探头
  fastAbove: 85,      // 快于此：纸张哗啦 + 猫头鹰受惊
  slamAbove: 120,     // 合盖快于此：啪！
  gentleBelow: 45,    // 合盖过程中最大角速度低于此：算"轻轻合上"
  holdSeconds: 3,     // 停住多久触发隐藏剧情
  holdTol: 2.2,       // 判定"停住"的角度容差（度）
  // v4「一整天」：从 dayStart 以下开始，不回头（回退不超过 dayBackTol 度）、不猛开，一路开到 dayEnd，用时 ≥ daySeconds
  dayStart: 30, dayEnd: 122, dayBackTol: 5, daySeconds: 9,
  sneezeEvery: 6.5,   // 正午小猫打喷嚏的间隔（秒）
};
