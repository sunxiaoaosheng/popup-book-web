/**
 * 三连敲的花瓣点缀。围着门转一小圈，大约 0.6 秒。
 * 不沿书页走锋面，也不读换季进度。
 */
import { clamp } from './math.js';

/**
 * @param {number} i
 * @param {number} n
 * @param {number} u 0 刚起，1 结束
 * @param {number} time
 */
export function petalAccent(i, n, u, time) {
  const count = Math.max(1, n);
  const t = clamp(u, 0, 1);
  const ang = (i / count) * Math.PI * 2 + time * 1.7;
  const puff = Math.sin(Math.PI * t);
  const r = 0.08 + 0.42 * t;
  return {
    x: Math.cos(ang) * r,
    y: 0.15 + puff * 0.85 + 0.06 * Math.sin(time * 3 + i),
    z: Math.sin(ang) * r * 0.45,
    spin: ang + t * 5,
    alpha: puff,
    scale: 0.65 + 0.5 * puff,
  };
}
