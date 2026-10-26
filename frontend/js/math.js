// 纯函数与弹簧。场景布局用固定种子，保证每次加载的树/花位置一致。

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smooth = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/** 欠阻尼弹簧：快速变化时产生纸片回弹的过冲。子步有上限，避免一帧 dt 过大时死循环。 */
export class Spring {
  constructor(k = 90, zeta = 0.55, x = 0) {
    this.k = k;
    this.c = 2 * zeta * Math.sqrt(k);
    this.x = x;
    this.v = 0;
  }
  step(target, dt) {
    const n = Math.max(1, Math.min(8, Math.ceil(dt / 0.006)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

let _seed = 7;
export const rnd = () => {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
};
