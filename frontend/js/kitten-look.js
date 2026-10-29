/**
 * 把心情画在已经摆好的纸模上：眼睛、耳朵、尾巴、嘴。
 * 不改小猫根节点的位置。落点仍由 kitten-place / sim-kitten 决定。
 * 幅度故意做大，门洞里比窗台收一点，避免耳朵和 Zzz 戳出墙。
 */

/** 动作的大部分时间停在最大幅度，方便看出这一下和下一只不一样。 */
function bell(M) {
  if (!(M.actDur > 0)) return 0;
  const u = 1 - M.phaseLeft / M.actDur;
  if (u <= 0 || u >= 1) return 0;
  const edge = 0.16;
  if (u < edge) return u / edge;
  if (u > 1 - edge) return (1 - u) / edge;
  return 1;
}

/**
 * @param {any} K
 * @param {number} time
 * @param {boolean} roomy 窗台上空，Zzz 可以再大一号
 */
function applySleep(K, time, roomy) {
  for (const e of K.eyes) {
    e.scale.y = 0.08;
    e.scale.x *= 0.92;
  }
  K.head.rotation.x += 0.48;
  K.head.rotation.z += roomy ? 0.22 : 0.1;
  K.earL.rotation.z += 0.7;
  K.earR.rotation.z -= 0.7;
  K.tail.rotation.z *= 0.25;
  K.body.scale.y *= 0.84;
  const rise = roomy ? 1.2 : 0.92;
  const big = roomy ? 0.78 : 0.5;
  for (const z of K.zzz) {
    const ph = (time * 0.45 + z.ph) % 1;
    z.s.visible = true;
    z.s.position.set(0.02 + 0.42 * ph, rise + ph * 0.38, 0.34);
    z.s.scale.setScalar(big + ph * 0.28);
    z.s.material.opacity = 0.72 + 0.28 * Math.sin(Math.PI * ph);
  }
}

/** @param {any} K @param {number} time @param {boolean} roomy */
function applyExcited(K, time, roomy) {
  for (const e of K.eyes) {
    e.scale.y = Math.min(1.6, e.scale.y * 1.35);
    e.scale.x *= 1.12;
  }
  K.earL.rotation.z -= 0.45;
  K.earR.rotation.z += 0.45;
  if (roomy) K.tail.rotation.z += 0.85 * Math.sin(time * 9);
}

/** @param {any} K @param {number} time @param {boolean} roomy */
function applyShy(K, time, roomy) {
  const away = Math.sin(time * 0.7) > -0.2;
  const turn = roomy ? 0.85 : 0.55;
  K.head.rotation.y += away ? -turn : turn * 0.25;
  K.head.rotation.x += 0.38;
  K.head.rotation.z += roomy ? 0.28 : 0.14;
  K.earL.rotation.z += 0.95;
  K.earR.rotation.z -= 0.95;
  K.body.scale.y *= 0.72;
  K.tail.rotation.z += roomy ? -0.7 : -0.35;
  for (const e of K.eyes) e.scale.y = Math.max(0.1, e.scale.y * 0.45);
  for (const b of K.blush) b.material.opacity = 1;
}

/** @param {any} K @param {number} w 1 刚醒 @param {number} time @param {boolean} roomy */
function applyWake(K, w, time, roomy) {
  const pop = 0.45 + 1.25 * w;
  for (const e of K.eyes) {
    e.scale.y = Math.max(e.scale.y, pop);
    e.scale.x = Math.max(e.scale.x, 1.05 + 0.45 * w);
  }
  const flick = Math.sin(time * 26) * 0.55 * w;
  K.earL.rotation.z -= 1.05 * w + flick;
  K.earR.rotation.z += 1.05 * w + flick;
  K.head.rotation.x -= (roomy ? 0.62 : 0.28) * w;
  if (roomy) {
    K.body.scale.y *= 1 + 0.4 * w;
    K.head.position.y += 0.1 * w;
  }
}

/** @param {any} K @param {any} M @param {number} env @param {boolean} roomy */
function applyAct(K, M, env, roomy) {
  if (env <= 0) return;
  const act = M.act;
  const big = roomy ? 1 : 0.72;
  if (act === 'blink') {
    for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * (1 - env));
  } else if (act === 'ear') {
    K.earL.rotation.z += 1.15 * env * big;
    K.earR.rotation.z -= 0.35 * env;
  } else if (act === 'tilt') {
    K.head.rotation.z += (roomy ? 0.78 : 0.5) * env;
  } else if (act === 'tail') {
    K.tail.rotation.z += (roomy ? 1.15 : 0.55) * env;
  } else if (act === 'look') {
    K.head.rotation.y += (roomy ? 0.8 : 0.42) * env * (M.lookSign || 1);
  } else if (act === 'lick') {
    K.head.rotation.x += 0.42 * env;
    K.head.rotation.z += 0.2 * env;
    K.mouth.visible = true;
    K.mouthLine.visible = false;
    K.mouth.scale.set(1.2, Math.max(0.35, 0.85 * env), 1);
  } else if (act === 'yawn') {
    K.head.rotation.x -= 0.48 * env;
    K.mouth.visible = true;
    K.mouthLine.visible = false;
    K.mouth.scale.set(1.15, Math.max(0.4, 1.05 * env), 1);
    for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * (1 - 0.92 * env));
    if (roomy) K.body.scale.y *= 1 + 0.18 * env;
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
  if (mode === 'play' && !M.asleep && M.mood === 'shy') applyShy(K, time, roomy);
  if (M.wakeLeft > 0) {
    const dur = M.wakeDur > 0 ? M.wakeDur : M.wakeLeft;
    applyWake(K, Math.min(1, M.wakeLeft / dur), time, roomy);
  } else if (mode === 'play' && !M.asleep) applyAct(K, M, env, roomy);
}
