/**
 * 低盖角时，视线和屏幕法线的夹角变大，纸片眼睛在屏幕上被压扁。
 * 小猫脸上的眼睛、合上时缝里那对眼睛，都走这里。
 * 只乘在这一帧已经算好的表情缩放上：眨眼、害羞、打盹的比例不动。
 * 不碰合页弹簧、镜头、开场幕布和换季。
 */
import { sstep } from './math.js';
import { TUNING } from './tuning.js';

/**
 * 1 = 用满补偿，0 = 和完全打开时一样。
 * 低于 eyeReadBelow 为 1，到 eyeReadAbove 收到 0。
 * @param {number} angle 盖子角度（度）
 * @param {typeof TUNING} [tuning]
 */
export function eyeReadGain(angle, tuning = TUNING) {
  const lo = tuning.eyeReadBelow;
  const hi = tuning.eyeReadAbove;
  if (!(hi > lo)) return angle <= lo ? 1 : 0;
  return 1 - sstep(lo, hi, angle);
}

/**
 * @param {number} gain 0..1
 * @param {typeof TUNING} [tuning]
 */
export function eyeReadPose(gain, tuning = TUNING) {
  const g = gain < 0 ? 0 : (gain > 1 ? 1 : gain);
  return {
    sx: 1 + g * tuning.eyeReadScaleX,
    sy: 1 + g * tuning.eyeReadScaleY,
    z: g * tuning.eyeReadZ,
    tilt: g * tuning.eyeReadTilt,
    glow: g * tuning.eyeReadGlow,
  };
}

/**
 * 轮廓环。材质是这一只眼睛自己的，不要用共享的纸色。
 * 环心挖空，depthTest 关掉，贴着眼睛边缘仍能读出轮廓。
 * @param {any} THREE
 * @param {number} rx
 * @param {number} ry
 * @param {number} [renderOrder]
 */
export function makeEyeRim(THREE, rx, ry, renderOrder = 6) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  const ix = rx * 0.64;
  const iy = ry * 0.64;
  hole.absellipse(0, 0, ix, iy, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  const rim = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 18),
    new THREE.MeshBasicMaterial({
      color: '#fff6d2',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  rim.renderOrder = renderOrder;
  rim.visible = false;
  rim.position.z = 0.004;
  return rim;
}

/** 记下静止的局部 z，接上轮廓环。每只眼睛建完调用一次。 */
export function bindEyeRead(group, rim) {
  if (!group.userData) group.userData = {};
  group.userData.restZ = group.position.z;
  group.userData.halo = rim || null;
  if (rim) group.add(rim);
  return group;
}

/**
 * 一帧调用一次，并且要排在表情缩放之后。再调一次会叠乘。
 * @param {any} eye 眼睛组
 * @param {number} angle
 * @param {{tuning?: typeof TUNING, fade?: number}} [opts]
 *   fade 乘在轮廓上，缝里的眼睛跟出现的透明度走。
 */
export function applyEyeRead(eye, angle, opts = {}) {
  if (!eye) return null;
  const tuning = opts.tuning || TUNING;
  const fade = opts.fade == null ? 1 : opts.fade;
  const pose = eyeReadPose(eyeReadGain(angle, tuning), tuning);
  if (eye.scale) {
    eye.scale.x *= pose.sx;
    eye.scale.y *= pose.sy;
  }
  const restZ = eye.userData && eye.userData.restZ;
  if (eye.position && typeof restZ === 'number') eye.position.z = restZ + pose.z;
  if (eye.rotation) eye.rotation.x = pose.tilt > 0 ? -pose.tilt : 0;
  const halo = eye.userData && eye.userData.halo;
  if (halo && halo.material) {
    const glow = pose.glow * fade;
    halo.material.opacity = glow;
    halo.visible = glow > 0.015;
  }
  return pose;
}

/** @param {any[] | null | undefined} eyes @param {number} angle @param {{tuning?: typeof TUNING, fade?: number}} [opts] */
export function applyEyeReadList(eyes, angle, opts) {
  if (!eyes) return;
  for (const eye of eyes) applyEyeRead(eye, angle, opts);
}
