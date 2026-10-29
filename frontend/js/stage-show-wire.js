/**
 * 每帧问一次幕布状态机，再交给画面。首演亮灯时写进存档。
 */
import { createStageShow, stepStageShow } from './stage-show.js';
import { createStageView } from './stage-show-view.js';

/** @param {any} W @param {number} dt */
export function stepStageCurtain(W, dt) {
  const { S } = W;
  if (!W.stageShow) {
    W.stageShow = createStageShow({ premiered: !!(W.store && W.store.stageShown) });
    W.stageView = createStageView(W);
  }
  const snap = stepStageShow(W.stageShow, {
    dt,
    angle: S.filtered,
    speed: S.sp,
    dir: S.lastDir,
    closing: !!S.closing,
    closeMax: S.closeMax || 0,
  });
  if (snap.justPremiered && W.store && W.store.markStageShown) W.store.markStageShown();
  W.stageView.apply(snap);
  W.stageSnap = snap;
}
