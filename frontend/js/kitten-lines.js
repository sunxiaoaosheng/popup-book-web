// 小猫偶尔说的短句。不是秘密，也不进手账。

export const GREETINGS = {
  first: '你来啦',
  shy: '……门别关那么响',
  nextday: '新的一天，又见到你了',
  hours: '隔了好久，你还记得我',
  often: '你今天来了好多次',
  back: '又见面了',
};

/** @type {Record<string, string[]>} */
const LINES = {
  calm: ['它用尾巴尖点了点窗台', '阳光停在它耳朵上', '它看了你一眼'],
  excited: ['尾巴摇成了一小团', '你一来，它就坐直了', '今天的光，软软的'],
  shy: ['它把脸埋进爪子里', '耳朵还是竖着的', '它偷偷看了你一眼'],
  sleepy: ['眼皮一点一点沉下去', '呼吸变得很轻'],
  wake: ['唔……你动了一下', '它睁开一只眼'],
  blink: ['眼睛慢慢眨了一下'],
  ear: ['一只耳朵抖了抖'],
  tilt: ['脑袋歪向一边'],
  tail: ['尾巴尖画了个小圈'],
  look: ['它往旁边看了看'],
  lick: ['它舔了舔爪子'],
  yawn: ['打了个小小的哈欠'],
};

/**
 * @param {string} bucket 心情，或 wake / sleepy
 * @param {() => number} rng [0, 1)
 * @param {string} [act] 当前小动作。大约一半时间用动作自己的句子
 */
export function lineFor(bucket, rng, act) {
  const specific = act ? LINES[act] : undefined;
  const mood = LINES[bucket] || LINES.calm;
  const pool = specific && rng() < 0.55 ? specific : mood;
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i];
}
