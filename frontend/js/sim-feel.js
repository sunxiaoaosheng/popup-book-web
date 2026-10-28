/**
 * 把合页曲线套到相机和拟音上。
 * 基准机位由 sim-ambient 记下来，这里只加一层很轻的偏移。
 */
import { createFeelState, stepHingeFeel } from './hinge-feel.js';

export function noteCamPose(W, position, target) {
  let pose = W.camPose;
  if (!pose) {
    pose = {
      px: 0, py: 0, pz: 0,
      tx: 0, ty: 0, tz: 0,
      fov: W.camera.fov,
    };
    W.camPose = pose;
    W.feelState = createFeelState();
  }
  pose.px = position.x;
  pose.py = position.y;
  pose.pz = position.z;
  pose.tx = target.x;
  pose.ty = target.y;
  pose.tz = target.z;
}

export function stepFeel(W, dt) {
  const pose = W.camPose;
  if (!pose || !W.feelState || !W.tmp) return;
  const level = W.store && W.store.feel ? W.store.feel : 'normal';
  const out = stepHingeFeel(W.feelState, {
    angle: W.S.filtered,
    speed: W.S.vel,
    dt,
    time: W.S.time,
    level,
  });
  const cam = W.camera;
  if (out.fov === 0) {
    if (cam.fov !== pose.fov) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
  } else if (Math.abs(cam.fov - (pose.fov + out.fov)) > 0.002) {
    cam.fov = pose.fov + out.fov;
    cam.updateProjectionMatrix();
  }
  // 这一帧 ambient 已经把相机放回基准。只有偏移不为 0 时才再改一次。
  if (out.shakeX || out.shakeY || out.parX || out.parY) {
    const look = W.tmp.v;
    look.set(pose.tx + out.parX, pose.ty + out.parY, pose.tz);
    cam.position.set(pose.px, pose.py, pose.pz);
    cam.lookAt(look);
    cam.updateMatrix();
    const m = cam.matrix.elements;
    cam.position.x += m[0] * out.shakeX + m[4] * out.shakeY;
    cam.position.y += m[1] * out.shakeX + m[5] * out.shakeY;
    cam.position.z += m[2] * out.shakeX + m[6] * out.shakeY;
  }
  if (W.sound && W.sound.stepHinge) W.sound.stepHinge(out, dt);
}
