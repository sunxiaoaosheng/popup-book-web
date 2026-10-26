// 日晷弧线与晨昏色。纯数据，给天空搭建和昼夜模拟共用。
import * as THREE from '../vendor/three.module.js';

export const SUN_ARC = { cx: 0, cy: 1.25, rx: 3.85, ry: 3.65, a0: 36, a1: 112 };
export const sunAt = (u, out) => out.set(
  SUN_ARC.cx + SUN_ARC.rx * Math.cos(Math.PI * u),
  SUN_ARC.cy + SUN_ARC.ry * Math.sin(Math.PI * u),
  0,
);
export const TIMES = [[0, '清晨'], [0.2, '上午'], [0.4, '正午'], [0.6, '午后'], [0.8, '黄昏']];
export const DAWN_SKY = new THREE.Color('#f3c7d6');
export const DAWN_GLOW = new THREE.Color('#ff9fb8');
export const DUSK_GLOW = new THREE.Color('#ff7a3a');
export const SUN_LOW = new THREE.Color('#ff9d5c');
