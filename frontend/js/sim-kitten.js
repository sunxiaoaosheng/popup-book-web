// 小猫的一天：清晨伸懒腰、窗台、正午喷嚏、黄昏看日落、追萤火虫、抚摸。
import { clamp, lerp, smooth } from './math.js';
import { CHASE_BOX, chaseAim, doorPeek } from './kitten-place.js';
import { TUNING } from './tuning.js';
import { wantsDawnStretch } from './rules.js';
import { emitAll } from './bus.js';
import { stepKittenMode } from './kitten-machine.js';
import { stepKittenMood } from './kitten-mood.js';
import { applyKittenLook } from './kitten-look.js';
import { stepSeasonBeats } from './season-beats.js';

export function stepKitten(W, dt) {
  const { S, frame: F, K, kitten } = W;
  const T = S.time;
  const A = S.filtered;
  const { cabinE, peekP, hopP, eggP, sleepyP, nightP } = F;
  const goldP = F.goldP;
  const v = W.tmp.v;
  const v2 = W.tmp.v2;

  const mouseLook = T - S.mouseT < 4;
  S.napP = clamp(S.napP + dt / 0.9 * ((S.act.nap && S.napLock <= 0 && cabinE > 0.9) ? 1 : -1), 0, 1);
  S.chaseP = clamp(S.chaseP + dt / 1.1 * ((S.act.chase && hopP > 0.95) ? 1 : -1), 0, 1);
  if (S.napP < 0.01 && !S.act.nap && S.purring && !S.petDown) { W.sound.purr(false); S.purring = false; }
  S.petE = smooth(S.petE, S.petDown ? 1 : 0, dt, S.petDown ? 0.2 : 0.8);

  const napE = S.napP * S.napP * (3 - 2 * S.napP);
  const chE = S.chaseP * S.chaseP * (3 - 2 * S.chaseP);
  const baseVis = peekP > 0.003 && cabinE > 0.5 && S.napP < 0.004;
  const napVis = S.napP > 0.004 && cabinE > 0.8;
  const dawnWant = wantsDawnStretch(A, cabinE, peekP, hopP, napVis);
  S.dawnW = smooth(S.dawnW, dawnWant ? 1 : 0, dt, dawnWant ? 0.45 : 0.35);
  const dawnVis = S.dawnW > 0.04;
  const showK = baseVis || napVis || dawnVis;
  F.showK = showK;
  kitten.visible = showK;
  const seasonI = (W.SEASON.t < 0.5 ? W.SEASON.from : W.SEASON.to);
  emitAll(W.bus, stepKittenMode(S, { showK, napVis, dawnVis, peekP }));
  let lx = 0, ly = 0, pounce = 0, lick = 0, shiver = 0;
  let onSill = false;
  if (showK) {
    const sleepish = Math.max(sleepyP, napE);
    let px, py, pz, sxs, sys, rz = 0, ry = 0;
    if (S.kittenMode === 'nap') {
      px = lerp(0.36, 0.4, napE);
      py = lerp(1.65, 2.5, napE);
      pz = lerp(-0.55, 0.12, napE);
      sxs = sys = 0.5;
      rz = -0.5 * napE;
      K.head.rotation.x = 0;
      K.paws.visible = false;
    } else if (S.kittenMode === 'dawn') {
      const ph = (T * 0.32) % 1;
      S.dawnPhase = ph;
      const up = Math.sin(Math.PI * clamp((ph - 0.12) / 0.38, 0, 1));
      const hold = clamp((ph - 0.42) / 0.18, 0, 1) * (1 - clamp((ph - 0.68) / 0.22, 0, 1));
      const stretch = Math.max(up, hold);
      S.dawnStretch = stretch;
      px = W.SILL_X;
      py = W.WIN.y0 - 0.04 + 0.08 * stretch;
      pz = -0.05;
      sxs = 0.72 * (1 - 0.1 * stretch);
      sys = 0.72 * (1 + 0.38 * stretch);
      rz = -0.12 * stretch;
      lx = 0.1 * Math.sin(T * 0.7);
      ly = 0.45 + 0.35 * stretch;
      K.paws.visible = true;
      K.paws.children.forEach((g) => {
        const sx = g.userData.sx;
        g.position.set(sx * (0.1 + 0.04 * stretch), 0.42 + 0.32 * stretch, 0.08);
        g.rotation.z = sx * (-1.15 - 0.55 * stretch);
        g.rotation.x = -0.55 * stretch;
        g.scale.setScalar(1.05 + 0.25 * stretch);
      });
    } else {
      K.paws.visible = false;
      S.dawnStretch = 0;
      const u = clamp(hopP, 0, 1.06);
      const uc = clamp(u, 0, 1);
      const e = uc * uc * (3 - 2 * uc);
      const peek = doorPeek(clamp(peekP, 0, 1));
      px = lerp(peek.px, W.SILL_X, e);
      pz = lerp(peek.pz, 0.36, e);
      py = peek.py + W.SILL_TOP * e + 0.5 * Math.sin(Math.PI * uc) * (uc > 0 && uc < 1 ? 1 : 0);
      const air = Math.sin(Math.PI * uc);
      const sc = lerp(peek.scale, 0.9, e);
      sxs = sc * (1 - 0.1 * air);
      sys = sc * (1 + 0.16 * air);
      rz = (uc < 1 ? 0.35 * Math.sin(Math.PI * uc) * (1 - 2 * uc) : 0);
      if (S.shy > 0.01 && e > 0.55) {
        px -= 0.14 * S.shy * (1 - uc);
        py = Math.max(peek.py, py - 0.1 * S.shy * (1 - uc));
      }
      py += S.startled * 0.2 * Math.abs(Math.sin(T * 14)) * uc;
      sys *= 1 + 0.06 * S.startled;
      onSill = uc > 0.98 && S.chaseP < 0.01;
      if (onSill) {
        if (seasonI === 2) {
          S.leafT = (S.leafT || 0) + dt;
          const lu = (S.leafT % 7.5) / 7.5;
          pounce = Math.sin(Math.PI * clamp((lu - 0.6) / 0.2, 0, 1));
          W.kleaf.visible = lu < 0.78;
          const ly0 = lerp(2.5, 0.95, clamp(lu / 0.72, 0, 1));
          W.kleaf.position.set(0.55 + 0.28 * Math.sin(lu * 15) * (1 - lu * 0.6), ly0, 0.45);
          W.kleaf.rotation.set(0.3 * Math.sin(lu * 9), 0.9 * Math.sin(lu * 11), lu * 14);
          lx = clamp((W.kleaf.position.x - px) * 1.5, -1, 1);
          ly = clamp((W.kleaf.position.y - (py + 0.5)) * 0.9, -1, 1);
        } else W.kleaf.visible = false;
        if (seasonI === 0) {
          lx = clamp((W.bfly.position.x - px) * 1.3, -1, 1);
          ly = clamp((W.bfly.position.y - (py + 0.55)) * 1.0, -1, 1);
        }
        if (seasonI === 1) {
          const c = (T % 8) / 8;
          lick = c > 0.55 && c < 0.85 ? Math.sin(Math.PI * (c - 0.55) / 0.3) : 0;
          lx = 0.3 + 0.5 * lick;
          ly = -0.5 * lick;
        }
        if (seasonI === 3) {
          shiver = (T % 9) > 7 ? 1 : 0;
          lx = 0.4;
          ly = -0.3 + 0.3 * Math.sin(T * 0.5);
        }
      } else W.kleaf.visible = false;
      py += pounce * 0.22;
      sys *= 1 + 0.1 * pounce;
      sxs *= 1 - 0.05 * pounce;
      if (chE > 0.002) {
        S.flyAt += dt;
        const aim = chaseAim(S.flyAt);
        const fx = aim.fx;
        const fz = aim.fz;
        const fy = aim.fy;
        S.fx = fx; S.fz = fz; S.fy = fy;
        const prevx = S.kx;
        S.kx = clamp(smooth(S.kx || fx, fx, dt, 0.7), CHASE_BOX.x0, CHASE_BOX.x1);
        S.kz = clamp(smooth(S.kz, fz, dt, 0.8), CHASE_BOX.z0, CHASE_BOX.z1);
        const mv = (S.kx - prevx) / Math.max(dt, 1e-4);
        S.kvx = smooth(S.kvx, mv, dt, 0.2);
        const hopB = Math.abs(Math.sin(T * 7.5)) * 0.12 * clamp(Math.abs(S.kvx) * 1.2, 0.2, 1) + Math.pow(Math.max(0, Math.sin(T * 1.2)), 10) * 0.45;
        const gx = S.kx, gy = 0.06 + hopB, gz = S.kz;
        const arc = Math.sin(Math.PI * chE) * 0.9;
        px = lerp(px, gx, chE);
        py = lerp(py, gy, chE) + arc;
        pz = lerp(pz, gz, chE);
        sxs *= lerp(1, 0.78, chE);
        sys *= lerp(1, 0.78, chE);
        ry = clamp(S.kvx * 0.35, -0.5, 0.5) * chE;
        rz += clamp(-S.kvx * 0.12, -0.25, 0.25) * chE;
        lx = lerp(lx, clamp((fx - S.kx) * 1.4, -1, 1), chE);
        ly = lerp(ly, clamp((fy - 0.6 - gy) * 1.2, -1, 1), chE);
      }
      const watchT = (peekP > 0.6 && chE < 0.1 && ((goldP > 0.35 && W.paperSun.visible) || (nightP > 0.5 && W.moon.visible))) ? 1 : 0;
      S.watchW = smooth(S.watchW, watchT, dt, 0.5);
      if (S.watchW > 0.01) {
        (nightP > 0.5 ? W.moon : W.paperSun).getWorldPosition(v2);
        v2.project(W.camera);
        K.head.getWorldPosition(v).project(W.camera);
        const wx = clamp((v2.x - v.x) * 2.2, -1, 1);
        const wy = clamp((v2.y - v.y) * 1.6, -1, 1);
        lx = lerp(lx, wx, S.watchW);
        ly = lerp(ly, wy, S.watchW);
      }
      if (watchT && goldP > 0.35) {
        S.sunsetT += dt;
        if (S.sunsetT > 2 && !S.sunsetSaid) {
          S.sunsetSaid = true;
          W.say('黄昏 · 小猫转过头，静静看着太阳落山', 3.5);
        }
      } else S.sunsetT = 0;
    }
    if (mouseLook && !napVis && chE < 0.5) {
      K.head.getWorldPosition(v).project(W.camera);
      lx = clamp((S.mouseX - v.x) * 2.4, -1, 1);
      ly = clamp((S.mouseY - v.y) * 2.4, -1, 1);
      if (S.shy > 0.5) {
        const away = Math.sin(T * 0.8) > 0.55;
        if (away) { lx = -0.8; ly = -0.2; }
      }
    } else if (S.shy > 0.5 && !napVis && S.watchW < 0.5) {
      lx = Math.sin(T * 0.8) > 0.6 ? -0.8 : 0.5;
    }
    kitten.position.set(px, py, pz);
    kitten.scale.set(sxs, sys, Math.min(sxs, sys));
    kitten.rotation.z = rz + (shiver ? 0.012 * Math.sin(T * 48) : 0);
    kitten.rotation.y = ry;
    S.lookX = smooth(S.lookX, napVis ? 0 : lx, dt, 0.12);
    S.lookY = smooth(S.lookY, napVis ? 0 : ly, dt, 0.12);
    const peeking = peekP * (1 - hopP);
    K.body.scale.y = 1 + 0.02 * Math.sin(T * 2.1);
    K.head.position.y = 0.6 + 0.008 * Math.sin(T * 2.1 + 0.6) - 0.06 * sleepish;
    K.head.rotation.z = 0.16 * Math.sin(T * 1.6) * peeking + sleepish * 0.3 * Math.sin(T * 0.6) * 0.3 + sleepish * 0.28 - 0.25 * lick - 0.12 * pounce + S.petE * 0.18 * Math.sin(T * 5);
    K.head.rotation.y = S.lookX * 0.35;
    K.head.rotation.x = napVis ? 0.1 : -S.lookY * 0.2;
    K.earL.rotation.z = 0.12 * Math.max(0, Math.sin(T * 0.9 + 1)) ** 6 * 4 + 0.05 * Math.sin(T * 3) * peeking + 0.5 * S.startled + 0.35 * S.duck;
    K.earR.rotation.z = -0.1 * Math.max(0, Math.sin(T * 0.7)) ** 6 * 4 - 0.5 * S.startled - 0.35 * S.duck;
    const amp = lerp(hopP < 0.25 ? 0.04 : 0.12, 0.34, hopP) * lerp(1, 0.35, sleepish);
    K.tail.rotation.z = amp * Math.sin(T * lerp(3, 2.0, sleepish)) - 0.1 * sleepish + 0.5 * S.startled + S.petE * 0.18 * Math.sin(T * 6) + 0.4 * chE * Math.sin(T * 9);
    const yawnEnv = (S.yawnT < 1.8 && (S.lastDir < 0 && A > 76 && eggP < 0.2 && T - S.lastShake > 3)) ? Math.sin(Math.PI * clamp(S.yawnT / 1.8, 0, 1)) : 0;
    const mo = Math.max(yawnEnv, lick * (0.4 + 0.6 * Math.abs(Math.sin(T * 9))), S.startled > 0.3 ? 0.5 : 0);
    K.mouth.scale.set(1 + 0.2 * mo, Math.max(0.001, mo), 1);
    K.mouth.visible = mo > 0.03;
    K.mouthLine.visible = mo <= 0.03;
    K.head.position.y += 0.03 * yawnEnv;
    K.head.rotation.z -= 0.18 * yawnEnv;
    S.blinkT -= dt;
    if (S.blinkT < 0) S.blinkT = 2.5 + Math.random() * 3;
    const blink = S.blinkT < 0.13 ? 0.1 : 1;
    let open = lerp(0.45 + 0.5 * hopP, 0.05, sleepish);
    open *= blink;
    open = lerp(open, 1, eggP);
    open *= (1 - 0.92 * yawnEnv);
    open = lerp(open, 0.12, S.petE);
    open = lerp(open, 1.1, clamp(S.startled, 0, 1) * 0.8);
    const wide = 1 + 0.28 * eggP + 0.15 * S.startled;
    for (let i = 0; i < 2; i++) {
      const eye = K.eyes[i];
      eye.scale.set(wide, Math.max(0.08, open) * wide, 1);
      eye.position.x = (i ? 1 : -1) * 0.105 + S.lookX * 0.02;
      eye.position.y = 0.015 + S.lookY * 0.016;
    }
    if (S.dawnW > 0.2 && peekP < 0.35) {
      const st = S.dawnStretch || 0;
      const yawn = Math.max(0.2, st * 1.05);
      K.body.scale.y *= 1 + 0.18 * st;
      K.head.position.y += 0.14 * st;
      K.head.rotation.x -= 0.7 * st;
      K.head.rotation.z += 0.12 * Math.sin(T * 1.2) * (1 - st);
      for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * lerp(0.55, 0.12, st));
      K.mouth.scale.set(1 + 0.15 * yawn, Math.max(0.001, yawn), 1);
      K.mouth.visible = yawn > 0.08;
      K.mouthLine.visible = yawn <= 0.08;
      K.tail.rotation.z = 0.25 + 0.2 * Math.sin(T * 1.4);
    } else if (!dawnVis) K.paws.visible = false;
    const noonT = (!napVis && chE < 0.1 && nightP < 0.2 && S.dayC > 0.4 && S.dayC < 0.75 && W.paperSun.visible && peekP > 0.6) ? 1 : 0;
    S.noonW = smooth(S.noonW, noonT, dt, 0.6);
    let sneeze = 0;
    if (S.noonW > 0.6) {
      S.sneezeT += dt;
      const c = S.sneezeT % TUNING.sneezeEvery;
      if (c < dt && S.sneezeT > dt) {
        S.sneezes++;
        W.sound.mew();
        W.sound.log('sneeze');
        if (!S.sneezeSaid) { S.sneezeSaid = true; W.say('正午的太阳太亮了，小猫打了个小喷嚏', 3); }
      }
      sneeze = S.sneezeT > TUNING.sneezeEvery ? Math.max(0, Math.sin(Math.PI * clamp(c / 0.5, 0, 1))) * (c < 0.5 ? 1 : 0) : 0;
    } else S.sneezeT = Math.min(S.sneezeT, TUNING.sneezeEvery - 1.2);
    S.sneeze = sneeze;
    if (S.noonW > 0.01) {
      for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * lerp(1, 0.45, S.noonW) * (1 - 0.9 * sneeze));
      K.head.rotation.x += 0.35 * sneeze;
      K.head.position.y -= 0.05 * sneeze;
      K.body.scale.y *= 1 - 0.06 * sneeze;
      if (sneeze > 0.3) { K.mouth.visible = true; K.mouthLine.visible = false; K.mouth.scale.set(1, 0.35 * sneeze, 1); }
    }
    const blush = clamp(Math.max(S.shy * 0.9, S.petE, eggP * 0.8), 0, 1);
    for (const b of K.blush) b.material.opacity = blush * 0.75;
    K.heart.visible = eggP > 0.03;
    K.heartG.position.set(0.24, 0.98 + 0.12 * eggP + 0.03 * Math.sin(T * 5), 0.1);
    K.heartG.scale.setScalar(clamp(eggP, 0, 1.2) * (1 + 0.1 * Math.sin(T * 8)));
    for (const z of K.zzz) {
      const ph = (T * 0.35 + z.ph) % 1;
      z.s.visible = sleepish > 0.5;
      z.s.position.set(0.3 + 0.12 * ph + 0.05 * Math.sin(T + z.ph * 6), 0.95 + ph * 0.55, 0.1);
      z.s.scale.setScalar(0.12 + ph * 0.16);
      z.s.material.opacity = Math.sin(Math.PI * ph) * clamp((sleepish - 0.5) * 2, 0, 1);
    }
    if (peekP > 0.5 && S.prevPeek <= 0.5 && S.shy > 0.5) W.sound.mew();
    if (hopP > 0.5 && S.prevHop <= 0.5) W.sound.meow(1, 0.55, 0.4);
    S.prevPeek = peekP;
    S.prevHop = hopP;
  } else {
    S.prevPeek = peekP;
    S.prevHop = hopP;
    W.kleaf.visible = false;
    K.paws.visible = false;
    S.noonW = smooth(S.noonW, 0, dt, 0.3);
    S.watchW = smooth(S.watchW, 0, dt, 0.3);
    S.sunsetT = 0;
    S.dawnStretch = 0;
  }

  if (S.petDown) {
    S.petT += dt;
    S.heartCd -= dt;
    if (S.heartCd <= 0 && kitten.visible) {
      S.heartCd = 0.45;
      K.head.getWorldPosition(v);
      W.spawnHeart(v.x + (Math.random() - 0.5) * 0.3, v.y + 0.25, v.z + 0.15);
    }
  } else S.petT = 0;
  const camQ = W.camera.quaternion;
  for (const h of W.hearts) {
    if (h.t >= 1.4) { h.m.visible = false; continue; }
    h.t += dt;
    h.m.position.set(h.x + h.vx * h.t + 0.04 * Math.sin(h.t * 6), h.y + h.t * 0.55, h.z);
    h.m.scale.setScalar(0.1 + 0.08 * Math.sin(Math.min(1, h.t * 3) * 1.5));
    h.m.material.opacity = clamp(1.4 - h.t, 0, 1) * 0.9;
    h.m.quaternion.copy(camQ);
  }

  const bfly = W.bfly;
  bfly.visible = W.seasonWeight(0) > 0.35 && cabinE > 0.9 && A > 62 && A < 128 && !napVis && S.chaseP < 0.5;
  if (bfly.visible) {
    const u = T * 0.7;
    bfly.position.set(
      0.15 + 0.95 * Math.sin(u) + 0.2 * Math.sin(u * 2.7),
      1.45 + 0.45 * Math.sin(u * 1.3 + 1) + 0.12 * Math.sin(T * 9),
      0.7 + 0.3 * Math.cos(u),
    );
    const fl = Math.abs(Math.sin(T * 14));
    bfly.userData.wings[0].rotation.y = -fl * 1.2;
    bfly.userData.wings[1].rotation.y = fl * 1.2;
    bfly.rotation.z = 0.3 * Math.cos(u);
  }
  {
    const mug = W.props[3];
    if (mug.visible && cabinE > 0.9) {
      mug.userData.steam.forEach(({ s, ph }, i) => {
        const k = (T * 0.35 + ph) % 1;
        s.position.set(0.02 * Math.sin(T * 2 + i * 2) + 0.03 * (i - 1), 0.2 + k * 0.45, 0.05);
        s.scale.setScalar(0.1 + k * 0.18);
        s.material.opacity = Math.sin(Math.PI * k) * 0.4;
      });
    }
  }
  emitAll(W.bus, stepSeasonBeats(S.beats, {
    dt, season: seasonI, onSill, angle: A, captionBusy: T < S.capUntil,
  }));
  emitAll(W.bus, stepKittenMood(S.kittenMood, {
    dt,
    angle: A,
    speed: S.sp,
    visible: !!showK,
    mode: S.kittenMode,
    captionBusy: T < S.capUntil || T < S.moodUntil,
    distracted: !!(S.act.chase || S.act.nap || S.chaseP > 0.05 || S.napP > 0.2 || S.petDown || S.startled > 0.25),
    rng: Math.random,
  }));
  if (showK) applyKittenLook(K, S.kittenMood, T, S.kittenMode, F.hopP > 0.85 && S.chaseP < 0.05);
}
