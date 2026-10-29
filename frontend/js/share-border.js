/**
 * 分享卡的手绘边和纸边墨点。纯数字，不碰画布。
 */

/** @param {number} n */
export function hashUnit(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * 绕矩形走一圈。角点钉在矩形上，边的中段沿外法线抖一下。
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {number} amp
 * @param {number} seed
 * @param {number} steps
 */
export function handBorder(rect, amp, seed, steps) {
  const { x, y, w, h } = rect;
  const n = Math.max(2, steps | 0);
  const sides = [
    { ax: x, ay: y, dx: w / n, dy: 0, nx: 0, ny: -1 },
    { ax: x + w, ay: y, dx: 0, dy: h / n, nx: 1, ny: 0 },
    { ax: x + w, ay: y + h, dx: -w / n, dy: 0, nx: 0, ny: 1 },
    { ax: x, ay: y + h, dx: 0, dy: -h / n, nx: -1, ny: 0 },
  ];
  /** @type {{x:number,y:number}[]} */
  const pts = [];
  let i = 0;
  for (const s of sides) {
    for (let k = 0; k < n; k++) {
      const taper = k === 0 ? 0 : Math.sin((k / n) * Math.PI);
      const wobble = (hashUnit(seed * 997 + i + 1) * 2 - 1) * amp * taper;
      pts.push({
        x: +(s.ax + s.dx * k + s.nx * wobble).toFixed(2),
        y: +(s.ay + s.dy * k + s.ny * wobble).toFixed(2),
      });
      i++;
    }
  }
  return pts;
}

/**
 * 纸边空白处的小墨点。不进照片里。
 * @param {{w:number,h:number,photo:{x:number,y:number,w:number,h:number}}} layout
 * @param {number} seed
 * @param {number} count
 */
export function paperSpecks(layout, seed, count) {
  const { w, h, photo } = layout;
  /** @type {{x:number,y:number,r:number}[]} */
  const pts = [];
  for (let guard = 1; pts.length < count && guard < 500; guard++) {
    const x = hashUnit(seed * 131 + guard) * w;
    const y = hashUnit(seed * 917 + guard) * h;
    const inside = x > photo.x && x < photo.x + photo.w && y > photo.y && y < photo.y + photo.h;
    if (inside) continue;
    pts.push({
      x: +x.toFixed(1),
      y: +y.toFixed(1),
      r: +(0.6 + hashUnit(seed + guard) * 1.1).toFixed(2),
    });
  }
  return pts;
}
