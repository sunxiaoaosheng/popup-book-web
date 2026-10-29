// 月亮、星星、纸太阳、日晷槽、地平线霞光、猫座。由 buildSky 在远山和云之后调用（星星要接着消耗同一条 rnd 序列）。
import * as THREE from '../vendor/three.module.js';
import { Spring, rnd } from './math.js';
import { cut, polyShape, ellipseShape, paperGlow, edgeMat, addMat } from './materials.js';
import { PW } from './state.js';
import { sunAt } from './sky-data.js';
import { biasSunBehind } from './sky-order.js';

export function buildMoon(backFace) {
  const moon = new THREE.Group();
  backFace.add(moon);
  const R = 0.78, r = 0.66, cxx = 0.3, cyy = 0.14, d = Math.hypot(cxx, cyy);
  const a = (R * R - r * r + d * d) / (2 * d), hh = Math.sqrt(R * R - a * a);
  const ux = cxx / d, uy = cyy / d, px = -uy, py = ux;
  const P1 = [a * ux + hh * px, a * uy + hh * py], P2 = [a * ux - hh * px, a * uy - hh * py];
  const up = P1[1] > P2[1] ? P1 : P2, lo = P1[1] > P2[1] ? P2 : P1;
  const phiUp = Math.atan2(up[1], up[0]), phiLo = Math.atan2(lo[1], lo[0]);
  const psiUp = Math.atan2(up[1] - cyy, up[0] - cxx), psiLo = Math.atan2(lo[1] - cyy, lo[0] - cxx);
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = phiUp + (phiLo + 2 * Math.PI - phiUp) * i / N;
    pts.push([R * Math.cos(t), R * Math.sin(t)]);
  }
  let ps0 = psiLo, ps1 = psiUp - 2 * Math.PI;
  if (ps1 > ps0) ps1 -= 2 * Math.PI;
  for (let i = 1; i < N; i++) {
    const t = ps0 + (ps1 - ps0) * i / N;
    pts.push([cxx + r * Math.cos(t), cyy + r * Math.sin(t)]);
  }
  const crescent = new THREE.Mesh(
    new THREE.ExtrudeGeometry(polyShape(pts), { depth: 0.05, bevelEnabled: false }),
    [new THREE.MeshBasicMaterial({ color: '#fff0b8' }), edgeMat],
  );
  crescent.castShadow = true;
  crescent.rotation.z = -0.35;
  crescent.position.z = 0.06;
  moon.add(crescent);
  const halo1 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), addMat('#ffe9a0', 0.38));
  halo1.position.z = 0.05;
  moon.add(halo1);
  return moon;
}

export function buildStars(backFace) {
  const stars = [];
  const star = (R, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      p.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return polyShape(p);
  };
  const starMat = new THREE.MeshBasicMaterial({ color: '#ffeaa0' });
  for (let i = 0; i < 34; i++) {
    let x, y;
    do {
      x = (rnd() - 0.5) * 9.2;
      y = 2.9 + rnd() * 3.1;
    } while (Math.hypot(x - 2.9, y - 4.7) < 1.1);
    const s = 0.07 + rnd() * 0.11;
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(star(1, 0.45), { depth: 0.03, bevelEnabled: false }), [starMat, edgeMat]);
    m.position.set(x, y, 0.05);
    m.userData = { s, t0: 100 + rnd() * 20, ph: rnd() * 6, spr: new Spring(70, 0.4, 0) };
    m.scale.setScalar(0.0001);
    m.visible = false;
    backFace.add(m);
    stars.push(m);
  }
  return stars;
}

export function buildPaperSun(backFace) {
  const paperSun = new THREE.Group();
  backFace.add(paperSun);
  const rays = [];
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, r = i % 2 ? 0.47 : 0.66;
    rays.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const rayM = cut(polyShape(rays), '#ffb43c', 0.05, 0.03);
  rayM.material[0] = paperGlow('#ffb43c');
  paperSun.add(rayM);
  const disc = cut(ellipseShape(0, 0, 0.42, 0.42), '#ffd765', 0.08, 0.03);
  disc.material[0] = paperGlow('#ffd765');
  paperSun.add(disc);
  const face = new THREE.Group();
  face.position.z = 0.112;
  paperSun.add(face);
  const ink = new THREE.MeshBasicMaterial({ color: '#b5651d' });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 4, 12, Math.PI), ink);
    e.position.set(sx * 0.14, 0.06, 0);
    e.rotation.z = Math.PI;
    face.add(e);
  }
  const mo = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.017, 4, 14, Math.PI), ink);
  mo.position.set(0, -0.1, 0);
  mo.rotation.z = Math.PI;
  face.add(mo);
  for (const sx of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshBasicMaterial({ color: '#ff9a6a', transparent: true, opacity: 0.6 }));
    ch.position.set(sx * 0.25, -0.07, -0.001);
    face.add(ch);
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), addMat('#ffd27a', 0.42));
  halo.position.z = 0.04;
  paperSun.add(halo);
  paperSun.userData = { rays: rayM, halo, face };
  biasSunBehind(paperSun);
  return paperSun;
}

export function buildSunSlot(backFace) {
  const sunSlot = new THREE.Group();
  backFace.add(sunSlot);
  const dotM = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.1, depthWrite: false });
  const P = new THREE.Vector3();
  for (let i = 0; i <= 44; i++) {
    sunAt(i / 44, P);
    if (P.y < 2.2) continue;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), dotM);
    d.position.set(P.x, P.y, 0.02);
    sunSlot.add(d);
  }
  sunSlot.userData.mat = dotM;
  return sunSlot;
}

export function buildHorizon(backFace) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const horizonTex = new THREE.CanvasTexture(c);
  horizonTex.colorSpace = THREE.SRGBColorSpace;
  const horizonMat = new THREE.MeshBasicMaterial({ color: '#ff8a4c', map: horizonTex, transparent: true, opacity: 0, depthWrite: false });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.4, 3.2), horizonMat);
  horizon.position.set(0, 2.0 + 1.6 - 0.4, 0.015);
  backFace.add(horizon);
  return { horizon, horizonMat };
}

const CON = { x: -2.75, y: 4.45, s: 1.05 };
const CON_PTS = [[-0.55, 0.8], [-0.3, 0.52], [-0.05, 0.8], [0.02, 0.38], [-0.32, 0.12], [0.5, 0.08], [0.72, -0.45], [-0.18, -0.5], [1.18, -0.08]];
const CON_SEG = [[0, 1], [1, 2], [2, 3], [0, 4], [3, 5], [5, 6], [6, 7], [7, 4], [6, 8]];

export function buildConstellation(backFace) {
  const catStars = new THREE.Group();
  catStars.position.set(CON.x, CON.y, 0.07);
  catStars.scale.setScalar(CON.s);
  backFace.add(catStars);
  const star = (R, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      p.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return polyShape(p);
  };
  const m0 = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  const lineM = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, depthWrite: false });
  catStars.userData = { pts: [], lines: [], lineM };
  CON_PTS.forEach(([x, y], i) => {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(star(1, 0.45), { depth: 0.03, bevelEnabled: false }), [m0, edgeMat]);
    m.position.set(x, y, 0.01);
    m.scale.setScalar(0.0001);
    m.userData = { s: i === 1 || i === 6 ? 0.19 : 0.14, i };
    catStars.add(m);
    catStars.userData.pts.push(m);
  });
  for (const [a, b] of CON_SEG) {
    const [x0, y0] = CON_PTS[a], [x1, y1] = CON_PTS[b], len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.Group();
    const n = Math.max(3, Math.round(len / 0.09));
    for (let k = 1; k < n; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6), lineM);
      d.position.set(x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n), 0);
      g.add(d);
    }
    catStars.add(g);
    catStars.userData.lines.push(g);
  }
  catStars.visible = false;
  const inConArea = (x, y) => Math.abs(x - (CON.x + 0.3)) < 1.25 && Math.abs(y - CON.y) < 1.05;
  return { catStars, inConArea };
}
