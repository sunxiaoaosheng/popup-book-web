/**
 * 把心情画在已经摆好的纸模上：眼睛、耳朵、尾巴、嘴。
 * 不改小猫根节点的位置。落点仍由 kitten-place / sim-kitten 决定。
 */

/** @param {{actDur:number, phaseLeft:number}} M */
function bell(M) {
  if (!(M.actDur > 0)) return 0;
  const u = 1 - M.phaseLeft / M.actDur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u);
}

/**
 * @param {any} K
 * @param {number} time
 * @param {boolean} roomy 窗台以上才浮 Zzz。门洞里不往上冒，免得戳出墙。
 */
function applySleep(K, time, roomy) {
  for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * 0.22);
  K.head.rotation.x += 0.16;
  K.head.rotation.z += 0.06;
  K.earL.rotation.z += 0.22;
  K.earR.rotation.z -= 0.22;
  K.tail.rotation.z *= 0.4;
  if (!roomy) return;
  for (const z of K.zzz) {
    const ph = (time * 0.35 + z.ph) % 1;
    z.s.visible = true;
    z.s.material.opacity = Math.max(z.s.material.opacity, Math.sin(Math.PI * ph) * 0.85);
  }
}

/** @param {any} K @param {number} time @param {boolean} roomy 尾巴只在窗外多甩一点 */
function applyExcited(K, time, roomy) {
  for (const e of K.eyes) e.scale.y = Math.min(1.35, e.scale.y * 1.15);
  K.earL.rotation.z -= 0.16;
  K.earR.rotation.z += 0.16;
  if (roomy) K.tail.rotation.z += 0.32 * Math.sin(time * 9);
}

/** @param {any} K @param {number} time */
function applyShy(K, time) {
  const away = Math.sin(time * 0.7) > 0.15;
  K.head.rotation.y += away ? -0.28 : 0.04;
  K.head.rotation.x += 0.1;
  K.earL.rotation.z += 0.3;
  K.earR.rotation.z -= 0.3;
  K.body.scale.y *= 0.94;
  for (const b of K.blush) b.material.opacity = Math.max(b.material.opacity, 0.62);
}

/** @param {any} K @param {number} w 1 刚醒，0 结束 */
function applyWake(K, w) {
  for (const e of K.eyes) e.scale.y = Math.max(e.scale.y, 0.35 + 0.7 * w);
  K.earL.rotation.z -= 0.4 * w;
  K.earR.rotation.z += 0.4 * w;
  K.head.rotation.x -= 0.16 * w;
}

/** @param {any} K @param {any} M @param {number} env */
function applyAct(K, M, env) {
  if (env <= 0) return;
  const act = M.act;
  if (act === 'blink') {
    for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * (1 - 0.9 * env));
  } else if (act === 'ear') {
    K.earL.rotation.z += 0.5 * env;
  } else if (act === 'tilt') {
    K.head.rotation.z += 0.2 * env;
  } else if (act === 'tail') {
    K.tail.rotation.z += 0.4 * env;
  } else if (act === 'look') {
    K.head.rotation.y += 0.28 * env * (M.lookSign || 1);
  } else if (act === 'lick') {
    K.head.rotation.x += 0.16 * env;
    K.mouth.visible = true;
    K.mouthLine.visible = false;
    K.mouth.scale.set(1, Math.max(0.12, 0.4 * env), 1);
  } else if (act === 'yawn') {
    K.head.rotation.x -= 0.2 * env;
    K.mouth.visible = true;
    K.mouthLine.visible = false;
    K.mouth.scale.set(1.05, Math.max(0.16, 0.65 * env), 1);
    for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * (1 - 0.7 * env));
  }
}

/**
 * @param {any} K 纸模零件，不是小猫根节点
 * @param {any} M
 * @param {number} time
 * @param {string} mode hidden / nap / dawn / play
 * @param {boolean} [roomy] 已经站到窗台外
 */
export function applyKittenLook(K, M, time, mode, roomy = false) {
  if (!K || !M || mode === 'hidden' || mode === 'nap') return;
  const env = bell(M);
  if (mode === 'play' && M.asleep) applySleep(K, time, roomy);
  if (mode === 'play' && !M.asleep && M.mood === 'excited') applyExcited(K, time, roomy);
  if (mode === 'play' && !M.asleep && M.mood === 'shy') applyShy(K, time);
  if (M.wakeLeft > 0) applyWake(K, Math.min(1, M.wakeLeft / 1.15));
  else if (mode === 'play' && !M.asleep) applyAct(K, M, env);
}
