// 猫头鹰、天体、粒子、合盖结局、相机、声音和字幕。
import { clamp, lerp, sstep } from './math.js';
import { CAPTIONS } from './state.js';
import { SEASONS, SECRETS } from './story.js';
import { groundY } from './build-critters.js';
import { noteCamPose } from './sim-feel.js';
import { stepSeasonSweep } from './season-sweep.js';

const caption = document.getElementById('caption');
let lastCap = '';

export function stepAmbient(W, dt) {
  const { S, frame: F, O, owl } = W;
  const T = S.time;
  const A = S.filtered;
  const nightP = F.nightP;
  const v = W.tmp.v;
  const v2 = W.tmp.v2;
  const owlTree = W.owlTree;

  {
    const perchOK = owlTree && owlTree.q > 0.97 && A > 50;
    if (O.state === 'perched') {
      owl.visible = !!perchOK;
      if (perchOK) {
        owlTree.g.getWorldPosition(v);
        O.perch.set(v.x, v.y + owlTree.h * 0.58, v.z + 0.1);
        owl.position.copy(O.perch);
        owl.rotation.set(0, 0, 0);
        owl.scale.setScalar(0.85);
        const awake = nightP;
        const openO = lerp(0.18, 1, awake);
        O.blink -= dt;
        if (O.blink < 0) O.blink = 2 + Math.random() * 3;
        const bl = O.blink < 0.12 ? 0.08 : 1;
        for (let i = 0; i < 2; i++) {
          O.eyes[i].scale.set(1, Math.max(0.08, openO * bl), 1);
          O.pupils[i].position.set(S.lookX * 0.015 * awake, S.lookY * 0.012 * awake, 0);
        }
        O.body.rotation.z = 0.05 * Math.sin(T * 0.8) * (0.4 + awake) + (awake > 0.5 ? 0.12 * Math.sin(T * 0.45) : 0);
        for (const w of O.wings) w.rotation.z = 0;
        if (A > 104) {
          O.hootT -= dt;
          if (O.hootT < 0) { O.hootT = 8 + Math.random() * 5; W.sound.hoot(); }
        }
      }
    } else if (O.state === 'out') {
      O.t += dt / 1.7;
      const k = O.t;
      owl.visible = true;
      v2.set(O.p0.x + 1.4, O.p0.y + 2.4, O.p0.z + 2.0);
      owl.position.set(
        (1 - k) * (1 - k) * O.p0.x + 2 * (1 - k) * k * v2.x + k * k * O.p1.x,
        (1 - k) * (1 - k) * O.p0.y + 2 * (1 - k) * k * v2.y + k * k * O.p1.y,
        (1 - k) * (1 - k) * O.p0.z + 2 * (1 - k) * k * v2.z + k * k * O.p1.z,
      );
      const fl = Math.sin(T * 26);
      O.wings[0].rotation.z = 0.9 + 0.7 * fl;
      O.wings[1].rotation.z = -0.9 - 0.7 * fl;
      owl.rotation.z = -0.5 * k;
      owl.scale.setScalar(0.85 * (1 - 0.3 * k));
      for (let i = 0; i < 2; i++) O.eyes[i].scale.set(1.2, 1.2, 1);
      if (k >= 1) { O.state = 'away'; O.t = 0; O.away = 9 + Math.random() * 4; owl.visible = false; }
    } else if (O.state === 'away') {
      owl.visible = false;
      O.away -= dt;
      if (A < 40) O.away = Math.min(O.away, 0.5);
      if (O.away <= 0 && perchOK && A > 50) { O.state = 'in'; O.t = 0; O.p0.set(-8.5, 7, 4.2); }
    } else if (O.state === 'in') {
      O.t += dt / 2.2;
      const k = Math.min(1, O.t);
      owl.visible = true;
      owlTree.g.getWorldPosition(v);
      O.perch.set(v.x, v.y + owlTree.h * 0.58, v.z + 0.1);
      const e = 1 - (1 - k) * (1 - k);
      owl.position.set(
        lerp(O.p0.x, O.perch.x, e),
        lerp(O.p0.y, O.perch.y, e) + 1.0 * Math.sin(Math.PI * e) * (1 - e),
        lerp(O.p0.z, O.perch.z, e),
      );
      const fl = Math.sin(T * 22) * (1 - k);
      O.wings[0].rotation.z = (0.9 + 0.6 * fl) * (1 - k);
      O.wings[1].rotation.z = -(0.9 + 0.6 * fl) * (1 - k);
      owl.rotation.z = 0;
      owl.scale.setScalar(0.85);
      if (k >= 1) { O.state = 'perched'; O.hootT = 3; if (nightP > 0.5) W.sound.hoot(); }
    }
    if (O.state !== 'perched' && A < 30) O.state = 'perched';
  }

  const moonP = F.moonP;
  for (const c of W.clouds) {
    c.xNow = c.x + Math.sin(T * c.drift + c.ph) * 0.35;
    if (c.inCon === undefined) c.inCon = W.inConArea(c.x + 0.35 * c.base, c.y);
    const k = c.inCon ? 1 - S.conP : 1;
    c.k = Math.max(0.0001, c.base * k);
    c.visible = k > 0.01;
  }
  W.syncClouds();
  W.moon.visible = moonP > 0.002;
  W.moon.position.set(2.9, lerp(0.9, 4.75, moonP), 0);

  const conOn = W.store.hasSecret('fullday') && nightP > 0.45 ? 1 : 0;
  S.conP = clamp(S.conP + dt / (S.conBurst > 0 ? 3.2 : 1.4) * (conOn ? 1 : -1), 0, 1);
  const catStars = W.catStars;
  catStars.visible = S.conP > 0.003;
  if (catStars.visible) {
    const { pts, lines, lineM } = catStars.userData;
    const n = pts.length;
    for (const m of pts) {
      const k = sstep(m.userData.i / n * 0.7, m.userData.i / n * 0.7 + 0.25, S.conP);
      m.scale.setScalar(Math.max(0.0001, m.userData.s * k * (1 + 0.15 * Math.sin(T * 2.2 + m.userData.i))));
      m.rotation.z = 0.2 * Math.sin(T * 0.5 + m.userData.i);
    }
    lineM.opacity = 0.55 * sstep(0.75, 1, S.conP) * (0.85 + 0.15 * Math.sin(T * 1.3)) * (1 + 0.6 * S.conBurst);
    for (const l of lines) l.visible = lineM.opacity > 0.01;
  }

  for (const s of W.stars) {
    s.userData.inCon ??= W.inConArea(s.position.x, s.position.y);
    const target = sstep(s.userData.t0, s.userData.t0 + 5, A) * (s.userData.inCon ? 1 - S.conP : 1);
    const spr = s.userData.spr;
    if (target === 0 && spr.x < 1e-4 && Math.abs(spr.v) < 1e-4) {
      s.visible = false;
      continue;
    }
    const p = spr.step(target, dt);
    s.visible = p > 0.01;
    const tw = 1 + 0.18 * Math.sin(T * 2.5 + s.userData.ph);
    s.scale.setScalar(Math.max(0.0001, s.userData.s * clamp(p, 0, 1.4) * tw));
    s.rotation.z = Math.sin(T * 0.4 + s.userData.ph) * 0.2;
  }

  const flies = W.flies;
  for (let i = 0; i < flies.length; i++) {
    const f = flies[i];
    if (i === 0 && S.chaseP > 0.01) {
      f.s.visible = true;
      f.s.position.set(S.fx, S.fy + 0.03, S.fz + 2.65);
      f.s.scale.setScalar(0.38);
      f.s.material.opacity = 1;
      continue;
    }
    const fadeIn = sstep(f.t0, f.t0 + 6, A);
    f.s.visible = fadeIn > 0.01;
    if (!f.s.visible) continue;
    if (i === 0) f.s.scale.setScalar(0.24);
    f.s.position.set(
      f.x + Math.sin(T * f.sp + f.ph) * 0.6,
      f.y + Math.sin(T * f.sp * 1.3 + f.ph * 2) * 0.35,
      f.z + Math.cos(T * f.sp * 0.8 + f.ph) * 0.5,
    );
    f.s.material.opacity = fadeIn * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 2.6 * f.sp * 2 + f.ph * 5)));
  }

  if (W.partSeason >= 0) stepParticles(W, dt, A);
  stepSeasonSweep(W);

  if (A > 9) W.ui.hideEnding();
  S.slamT = Math.max(0, S.slamT - dt * 0.8);
  W.book.position.y = S.slamT > 0 ? 0.04 * Math.sin(S.slamT * 40) * S.slamT : 0;

  const cb = sstep(0, 95, A);
  const aspect = W.camera.aspect;
  const fit = Math.max(1, 1.78 / aspect);
  const tgt = v.set(0, lerp(0.2, 2.35, cb), lerp(3.2, 1.9, cb));
  const dir = v2.set(0, lerp(12.5, 4.0, cb), lerp(8.4, 13.6, cb)).multiplyScalar(fit);
  W.camera.position.copy(tgt).add(dir);
  W.camera.lookAt(tgt);
  noteCamPose(W, W.camera.position, tgt);

  W.sound.setEnv({ amb: sstep(10, 50, A), night: nightP, season: S.season, speed: S.vel, wind: 1 + F.flut }, dt);
  W.sound.tick(dt);

  let ct = (CAPTIONS.find(([a0, a1]) => A >= a0 && A < a1) || CAPTIONS[CAPTIONS.length - 1])[2];
  if (F.sleepyP > 0.5 && F.showK && A > 60) ct = '合上的时候，小猫打了个哈欠，睡着了 · Zzz';
  if (A > 70 && S.shy > 0.5) ct = '慢慢开 · 小猫害羞地探出半个脑袋…';
  if (A > 70 && !S.act.nap && !S.act.chase && S.shy < 0.5 && F.cabinE > 0.9) {
    ct = ct + `  ·  ${SEASONS[W.SEASON.t < 0.5 ? W.SEASON.from : W.SEASON.to].blurb}`;
  }
  if (S.tod && !(T < S.capUntil)) ct = `${S.tod} · ${ct}`;
  if (T < S.capUntil) ct = S.cap;
  if (ct !== lastCap) { caption.textContent = ct; lastCap = ct; }
  S.nudgeT += dt;
  if (S.nudgeT > 45 && A > 3 && W.store.foundCount() < SECRETS.length) {
    S.nudgeT = 0;
    const left = SECRETS.filter((s) => !W.store.hasSecret(s.id));
    W.ui.nudge(left[(Math.random() * left.length) | 0].hint);
  }
}

function stepParticles(W, dt, A) {
  const { S, frame: F } = W;
  const T = S.time;
  const cfg = W.PCFG[W.partSeason];
  const frac = sstep(22, 52, A) * (S.burstT > 0 ? 1 : 0.75);
  const nShow = Math.floor(cfg.n * frac);
  const mesh = W.pMesh;
  mesh.count = nShow;
  if (!nShow) return;
  const burstK = clamp(S.burstT, 0, 1);
  const wind = clamp(S.vel * 0.02, -2.2, 2.2) + F.flut * Math.sin(T * 5) * 1.6;
  const lim = F.th < 1.45;
  const { p: pos, e, q, sv, m4 } = W.tmp;
  const PA = W.PA;
  for (let i = 0; i < nShow; i++) {
    const p = PA[i];
    const sw = Math.sin(T * 0.8 * p.k + p.ph);
    p.vx += ((sw * cfg.sway * 0.6 + wind) - p.vx) * Math.min(1, dt * 2);
    const vyT = -cfg.fall * p.k * (1 + 0.3 * Math.sin(T * 1.7 + p.ph)) * (1 + 1.4 * burstK) + F.flut * 1.4 * Math.sin(T * 7 + p.ph * 3);
    p.vy += (vyT - p.vy) * Math.min(1, dt * 3);
    p.vz += (-p.vz) * Math.min(1, dt * 1.5);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt + F.flut * 0.3 * dt;
    p.rx += cfg.spin * dt * p.k;
    p.ry += cfg.spin * 0.7 * dt;
    p.rz += cfg.spin * 0.5 * dt * p.k;
    const gy = groundY(p.x, p.z);
    if (cfg.up ? p.y > 4.9 : p.y < gy) W.spawnParticle(p, cfg, false);
    const clip = lim && (p.y > F.lidY + p.z * F.tanTh - 0.08);
    const fade = cfg.up ? clamp((4.9 - p.y) / 0.7, 0, 1) * clamp((p.y - gy) / 0.12, 0, 1) : clamp((p.y - gy) / 0.25, 0, 1);
    const sc = clip ? 0 : cfg.size * p.k * fade;
    pos.set(p.x, p.y, p.z);
    e.set(p.rx, p.ry, p.rz);
    q.setFromEuler(e);
    sv.set(cfg.round ? sc : sc * 0.62, sc, sc);
    m4.compose(pos, q, sv);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
