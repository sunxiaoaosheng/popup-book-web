/**
 * 小猫这一拍站在哪种姿势上。网格插值仍在 sim-kitten，这里只决定模式切换。
 * hidden：看不见。nap：屋顶午觉。dawn：窗后伸懒腰。play：探头、窗台、追萤火虫。
 */

/**
 * @param {{showK:boolean, napVis:boolean, dawnVis:boolean, peekP:number}} input
 * @returns {'hidden'|'nap'|'dawn'|'play'}
 */
export function resolveKittenMode({ showK, napVis, dawnVis, peekP }) {
  if (napVis) return 'nap';
  if (dawnVis && peekP < 0.35) return 'dawn';
  if (showK) return 'play';
  return 'hidden';
}

/** @param {{kittenMode?: string}} S @param {{showK:boolean, napVis:boolean, dawnVis:boolean, peekP:number}} input */
export function stepKittenMode(S, input) {
  const next = resolveKittenMode(input);
  const prev = S.kittenMode || 'hidden';
  S.kittenMode = next;
  if (next === prev) return [];
  return [{ type: 'kitten', from: prev, to: next }];
}
