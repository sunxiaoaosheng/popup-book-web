// 盖页、日晷光线、台阶与树、小屋外壳。小猫的姿势在下一步。
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, sstep } from './math.js';
import { timeOfDay as timeOfDayName } from './rules.js';
import { emitAll } from './bus.js';
import { stepSeason } from './season-machine.js';
import { SUN_ARC, sunAt, TIMES } from './build-sky.js';
import { applySeasonLight } from './season-light.js';
import { doorNudgeYaw } from './tap-machine.js';

const glassOff = new THREE.Color('#7f8f9a');
const glassOn = new THREE.Color('#ffd37a');

function erect(b, q, obj, h, th, tanTh, lidY) {
  const want = Math.max(0, q) * Math.PI / 2;
  if (th >= 1.5) return want;
  obj.getWorldPosition(b);
  let phi = Math.min(want, Math.PI / 2);
  for (; phi > 0; phi -= 0.04) {
    const ty = b.y + h * Math.sin(phi) + 0.1;
    const tz = b.z + h * Math.cos(phi);
    if (ty < lidY + tz * tanTh) break;
  }
  phi = Math.max(0, phi);
  return want > Math.PI / 2 ? phi + (want - Math.PI / 2) : Math.min(phi, want);
}

export function stepStage(W, dt) {
  const { S, frame: F } = W;
  const T = S.time;
  const A = S.filtered;
  const flut = F.flut;
  const th = F.hingeA * Math.PI / 180;
  const lidY = 0.85 * (1 - sstep(0, 40, A));
  F.th = th;
  F.lidY = lidY;
  W.hinge.position.y = lidY;
  W.hinge.rotation.x = -th;

  const seam = 1 - sstep(10, 22, A);
  W.seamGlow.material.opacity = 0.95 * seam;
  W.seamLine.material.opacity = 0.9 * seam;
  const gapH = lidY + 0.14;
  W.seamGlow.scale.y = gapH * 1.5 + 0.3;
  W.seamGlow.position.y = gapH * 0.5;
  W.seamLine.scale.y = 0.8 + gapH * 3;
  W.seamLine.position.y = gapH * 0.5;
  W.gfx.seamLight.intensity = 14 * seam * (0.92 + 0.08 * Math.sin(T * 7));
  S.seamEye = smoothSeam(S.seamEye, S.act.seam ? 1 : 0, dt);
  const seamEyes = W.seamEyes;
  seamEyes.visible = S.seamEye > 0.02 && gapH > 0.3;
  if (seamEyes.visible) {
    seamEyes.position.y = gapH * 0.5;
    const sc = clamp((gapH - 0.1) / 0.55, 0.25, 1.1);
    seamEyes.scale.setScalar(sc * (0.6 + 0.4 * S.seamEye));
    const bl = (T % 3.7) < 0.12 ? 0.1 : 1;
    const lx = Math.sin(T * 0.9) * 0.55 + Math.sin(T * 2.3) * 0.25;
    const ly = Math.sin(T * 0.7 + 1) * 0.3;
    for (const e of seamEyes.userData.eyes) {
      e.g.scale.set(1, Math.max(0.08, bl), 1);
      e.ir.position.set(lx * 0.035, ly * 0.04, 0.001);
      e.pu.position.set(lx * 0.05, ly * 0.05, 0.002);
      e.hl.position.set(0.04 + lx * 0.03, 0.07 + ly * 0.03, 0.003);
      for (const c of e.g.children) c.material.opacity = S.seamEye;
    }
  }

  const SEASON = W.SEASON;
  emitAll(W.bus, stepSeason(SEASON, S, A, dt));

  const se = SEASON.t;
  const dayRaw = clamp((A - SUN_ARC.a0) / (SUN_ARC.a1 - SUN_ARC.a0), -0.08, 1.08);
  const sunU = S.sunU.step(dayRaw, dt);
  S.dayU = sunU;
  const uc = clamp(sunU, 0, 1);
  const elev = Math.sin(Math.PI * uc);
  const v2 = W.tmp.v2;
  sunAt(sunU, v2);
  W.paperSun.position.copy(v2);
  W.paperSun.visible = A > SUN_ARC.a0 - 4 && sunU < 1.07;
  W.paperSun.rotation.z = -T * 0.08 - sunU * 2.2;
  W.paperSun.userData.face.rotation.z = -W.paperSun.rotation.z;
  W.paperSun.userData.face.scale.y = lerp(1, 0.55, sstep(0.75, 1, uc));
  W.sunSlot.visible = A > SUN_ARC.a0 - 6;
  W.sunSlot.userData.mat.opacity = 0.1 * (1 - F.nightP);
  const nightP = F.nightP;
  const dawnP = (1 - sstep(0.05, 0.38, uc)) * sstep(SUN_ARC.a0 - 2, SUN_ARC.a0 + 6, A);
  const goldP = sstep(0.62, 0.97, uc) * (1 - nightP);
  const lowP = Math.max(dawnP, goldP);
  const sun = W.gfx.sun;
  const slx = lerp(13 * Math.cos(Math.PI * uc), 7, nightP);
  const sly = lerp(3.5 + 13 * elev, 13, nightP);
  sun.position.set(slx, sly, 11);
  applySeasonLight(W, { se, uc, nightP, dawnP, goldP, elev });
  W.paperSun.userData.halo.material.opacity = 0.32 + 0.3 * lowP;
  S.dayC = uc;
  S.goldP = goldP;
  F.goldP = goldP;
  S.nightP = nightP;
  S.tod = nightP > 0.5 ? '夜' : (A < SUN_ARC.a0 ? '' : timeOfDayName(uc, TIMES));

  for (const t of W.terraces) {
    const p = t.spr.step(sstep(t.t0, t.t1, A), dt);
    t.g.visible = p > 0.002;
    const r = -(1 - p) * Math.PI / 2;
    t.riser.rotation.x = r;
    t.top.rotation.x = r;
  }
  W.gfx.scene.updateMatrixWorld();
  const tanTh = Math.tan(Math.min(th, 1.5));
  F.tanTh = tanTh;
  const b = W.tmp.b;
  for (const t of W.trees) {
    const q = t.spr.step(sstep(t.t0, t.t0 + 8, A), dt);
    const phi = erect(b, q, t.g, t.h, th, tanTh, lidY);
    t.phi = phi;
    t.q = q;
    t.g.visible = q > 0.002;
    t.g.rotation.x = Math.PI / 2 - phi;
    t.g.rotation.z = Math.sin(T * 0.9 + t.ph) * 0.012 * clamp(q, 0, 1) + t.sw.step(0, dt) * 0.05 * clamp(q, 0, 1) + flut * 0.03 * Math.sin(T * 19 + t.ph * 3);
  }

  const cabinP = F.cabinP;
  const cabinPhi = erect(b, cabinP, W.cabin, 2.7, th, tanTh, lidY);
  const cabinE = cabinPhi / (Math.PI / 2);
  F.cabinE = cabinE;
  W.cabin.visible = cabinP > 0.002;
  W.cabin.rotation.x = Math.PI / 2 - cabinPhi;
  W.popG.scale.z = Math.max(0.001, sstep(0.55, 0.95, cabinE));
  const litP = F.litP;
  W.glassMat.color.lerpColors(glassOff, glassOn, litP);
  const dawnGlow = S.dawnW || 0;
  W.glassMat.opacity = lerp(0.82, 0.28, Math.max(litP * 0.65, dawnGlow));
  W.winGlow.material.opacity = (litP * (0.42 + 0.35 * nightP) + 0.38 * dawnGlow) * (0.95 + 0.05 * Math.sin(T * 9));
  W.gfx.windowLight.intensity = litP * (1.2 + 2.2 * nightP) + 1.4 * dawnGlow;
  const v = W.tmp.v;
  W.cabin.localToWorld(v.set(W.SILL_X, 1.1, 1.6));
  W.gfx.windowLight.position.copy(v);
  W.doorPivot.rotation.y = -F.doorP * 1.95 - doorNudgeYaw(S.tap.door);
  W.puffs.forEach((p, i) => {
    const ph = (T * 0.22 + p.ph) % 1;
    p.g.visible = cabinE > 0.9 && litP > 0.05;
    p.g.position.set(0.78 + 0.18 * ph + 0.06 * Math.sin(T * 1.7 + i * 2), 2.62 + ph * 1.5, -0.12);
    const s = 0.5 + ph * 1.5;
    p.g.scale.set(s, s, 1);
    p.g.rotation.z = ph * 1.2 + i;
    p.m.opacity = 0.9 * Math.sin(Math.PI * ph) * clamp((litP - 0.05) * 4, 0, 1);
  });
  const snowK = SEASON.to === 3 ? SEASON.t : (SEASON.from === 3 ? 1 - SEASON.t : 0);
  for (const s of W.roofSnow) {
    s.userData.y0 ??= s.position.y;
    s.visible = snowK > 0.01;
    s.scale.y = Math.max(0.01, snowK);
    s.position.y = s.userData.y0 - 0.04 * (1 - snowK);
  }
}

function smoothSeam(cur, target, dt) {
  return cur + (target - cur) * (1 - Math.exp(-dt / 0.5));
}
