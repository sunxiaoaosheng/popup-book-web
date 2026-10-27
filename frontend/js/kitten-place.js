// 小猫在小屋局部坐标里的落点。门洞和台阶的尺寸跟 build-cabin / build-forest 对齐。
import { clamp } from './math.js';

/** 小屋原点在书页上的 z。台阶近沿（朝读者）在书页 z = 4.4。 */
export const CABIN_Z = 2.65;

/**
 * 探头时必须待在门洞里面。墙洞大约是 x [-0.75, -0.05]、底边 y = 0。
 * 这里再收一圈，给纸模厚度和尾巴摆动留边。
 */
export const DOOR_HOLE = { x0: -0.72, x1: -0.08, floor: 0.04 };

/** 比例 1 时，原点在脚底。right 含向右翘的尾巴。 */
export const KIT_EXT = { left: 0.26, right: 0.58 };

/**
 * 追萤火虫只走两侧台阶之间的平地。
 * 台阶近沿在书页 z = 4.4，内沿在 |x| = 1.65。这里用小屋局部坐标。
 */
export const CHASE_BOX = { x0: -1.05, x1: 0.55, z0: 2.05, z1: 2.75 };

/** @param {number} peekP 0..1 */
export function doorPeek(peekP) {
  const rise = clamp(peekP, 0, 1);
  const scale = 0.5 + 0.2 * rise;
  const left = KIT_EXT.left * scale;
  const right = KIT_EXT.right * scale;
  const mid = (DOOR_HOLE.x0 + DOOR_HOLE.x1) / 2;
  return {
    px: mid - (right - left) / 2,
    py: DOOR_HOLE.floor,
    pz: -0.22,
    scale,
  };
}

/** @param {number} flyAt 追逐相位（秒） */
export function chaseAim(flyAt) {
  const fx = clamp(Math.sin(flyAt * 0.55) * 0.7 - 0.25, CHASE_BOX.x0, CHASE_BOX.x1);
  const fz = clamp(2.4 + 0.32 * Math.sin(flyAt * 0.37 + 1.0), CHASE_BOX.z0, CHASE_BOX.z1);
  const fy = 0.55 + 0.3 * Math.sin(flyAt * 1.7);
  return { fx, fz, fy };
}

/** @param {number} peekP */
export function doorSpan(peekP) {
  const p = doorPeek(peekP);
  return {
    x0: p.px - KIT_EXT.left * p.scale,
    x1: p.px + KIT_EXT.right * p.scale,
    py: p.py,
    pz: p.pz,
    scale: p.scale,
  };
}
