/**
 * 把礼物放在窗台上，并把「闻一下 / 收回」叠到已经摆好的纸模上。
 * 不建仪表，也不改合页。几何只分配一次。
 */
import * as THREE from '../vendor/three.module.js';
import { box } from './materials.js';

/** @param {any} W */
export function attachTrackGift(W) {
  if (W.trackGift) return;
  const gift = new THREE.Group();
  gift.add(box(0.18, 0.11, 0.15, '#f6e6cc', 0, 0, 0, true));
  gift.add(box(0.19, 0.018, 0.02, '#b94b45', 0, 0.012, 0, false));
  gift.add(box(0.02, 0.12, 0.16, '#b94b45', 0, 0, 0, false));
  gift.add(box(0.06, 0.035, 0.05, '#b94b45', 0, 0.075, 0, false));
  gift.visible = false;
  gift.scale.setScalar(0.001);
  const y = W.SILL_TOP + 0.055;
  gift.position.set(W.SILL_X - 0.36, y, 0.4);
  W.cabin.add(gift);
  W.trackGift = gift;
  W._trackGiftY = y;
}

/**
 * @param {any} W
 * @param {{gift:number, sniff:number, recover:number}} st
 */
export function applyTrackGift(W, st) {
  const gift = W.trackGift;
  if (!gift) return;
  const open = (W.frame.cabinE || 0) > 0.62;
  const show = open && st.gift > 0.03;
  gift.visible = show;
  if (show) {
    const g = Math.min(1, st.gift);
    gift.scale.setScalar(0.2 + 0.8 * g);
    gift.position.y = W._trackGiftY + (1 - g) * 0.08;
  }
  const K = W.K;
  if (!K || !K.head || !W.kitten || !W.kitten.visible) return;
  if (st.sniff > 0.001) {
    const s = st.sniff;
    K.head.rotation.x += 0.72 * s;
    K.head.rotation.y += 0.48 * s;
    K.head.position.y -= 0.045 * s;
    if (K.earL) K.earL.rotation.z -= 0.45 * s;
    if (K.earR) K.earR.rotation.z += 0.45 * s;
  } else if (st.recover > 0.001) {
    const r = st.recover;
    K.head.rotation.x -= 0.34 * r;
    if (K.earL) K.earL.rotation.z -= 0.22 * r;
    if (K.earR) K.earR.rotation.z += 0.22 * r;
  }
}
