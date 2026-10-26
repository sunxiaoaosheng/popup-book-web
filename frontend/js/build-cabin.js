// 小木屋壳体：墙、门窗、屋顶、烟。小猫纸模在 build-kitten-mesh.js。
import * as THREE from '../vendor/three.module.js';
import { Spring } from './math.js';
import { cut, box, polyShape, rectShape, ellipseShape, addMat, noiseTex } from './materials.js';
import { buildKittenMesh, buildAccessories, buildProps, buildButterfly } from './build-kitten-mesh.js';

export function buildCabin(W) {
  const { book, S } = W;
  const cabin = new THREE.Group();
  cabin.position.set(0, 0.03, 2.65);
  book.add(cabin);
  const popG = new THREE.Group();
  cabin.add(popG);
  const cabinSpr = new Spring(70, 0.5, 0);
  const wallC = '#a8693f', logC = '#8a522f';
  const DOOR = { x0: -0.75, x1: -0.05, h: 1.05 };
  const WIN = { x0: 0.45, x1: 1.15, y0: 0.75, y1: 1.3 };

  {
    const s = polyShape([[-1.4, 0], [DOOR.x0, 0], [DOOR.x0, DOOR.h], [DOOR.x1, DOOR.h], [DOOR.x1, 0], [1.4, 0], [1.4, 1.5], [0, 2.3], [-1.4, 1.5]]);
    const hole = new THREE.Path();
    [[WIN.x0, WIN.y0], [WIN.x1, WIN.y0], [WIN.x1, WIN.y1], [WIN.x0, WIN.y1]].forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath();
    s.holes.push(hole);
    cabin.add(cut(s, wallC, -0.06, 0.06));
    const hw = (y) => (y <= 1.5 ? 1.32 : 1.4 * (1 - (y - 1.5) / 0.8) - 0.1);
    for (let y = 0.3; y < 2.1; y += 0.3) {
      let segs = [[-hw(y), hw(y)]];
      const sub = (a, b) => {
        const out = [];
        for (const [s0, s1] of segs) {
          if (b <= s0 || a >= s1) out.push([s0, s1]);
          else {
            if (a > s0) out.push([s0, a]);
            if (b < s1) out.push([b, s1]);
          }
        }
        segs = out;
      };
      if (y < DOOR.h + 0.08) sub(DOOR.x0 - 0.05, DOOR.x1 + 0.05);
      if (y > WIN.y0 - 0.08 && y < WIN.y1 + 0.08) sub(WIN.x0 - 0.05, WIN.x1 + 0.05);
      for (const [a, b] of segs) if (b - a > 0.08) cabin.add(box(b - a, 0.035, 0.03, logC, (a + b) / 2, y, 0.012));
    }
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0, DOOR.h), new THREE.MeshBasicMaterial({ color: '#6e3f26' }));
    inner.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, -0.38);
    popG.add(inner);
    const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), addMat('#ff9a40', 0.5));
    innerGlow.position.set(-0.4, 0.55, -0.36);
    popG.add(innerGlow);
    for (const x of [DOOR.x0 - 0.005, DOOR.x1 + 0.005]) {
      popG.add(box(0.01, DOOR.h, 0.34, '#4d2c1a', x + (x < -0.4 ? 0.005 : -0.005), DOOR.h / 2, -0.2));
    }
  }

  const glassMat = new THREE.MeshBasicMaterial({ color: '#7f8f9a', transparent: true, opacity: 0.72, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), glassMat);
  glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, -0.03);
  cabin.add(glass);
  {
    const cxw = (WIN.x0 + WIN.x1) / 2, cyw = (WIN.y0 + WIN.y1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, fc = '#fff2d8';
    popG.add(
      box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y1 + 0.04, 0.0),
      box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y0 - 0.04, 0.0),
      box(0.08, wh, 0.06, fc, WIN.x0 - 0.04, cyw, 0.0),
      box(0.08, wh, 0.06, fc, WIN.x1 + 0.04, cyw, 0.0),
      box(0.04, wh, 0.04, fc, cxw, cyw, 0.0),
      box(ww, 0.04, 0.04, fc, cxw, cyw, 0.0),
    );
  }
  const sill = box(1.0, 0.07, 0.46, '#c98f55', (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.08 + 0.035, 0.23);
  sill.position.y = 0.72;
  popG.add(sill);
  const SILL_TOP = 0.755, SILL_X = (WIN.x0 + WIN.x1) / 2;
  const winGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), addMat('#ffbf5e', 0));
  winGlow.position.set(SILL_X, 1.02, 0.03);
  cabin.add(winGlow);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(DOOR.x0 + 0.01, 0, -0.05);
  cabin.add(doorPivot);
  {
    const dw = DOOR.x1 - DOOR.x0 - 0.03;
    doorPivot.add(cut(rectShape(0, 0, dw, DOOR.h - 0.02), '#9c4a33', 0, 0.04));
    doorPivot.add(cut(rectShape(0.1, 0.12, dw - 0.2, 0.38), '#b35c42', 0.04, 0.012));
    doorPivot.add(cut(rectShape(0.1, 0.58, dw - 0.2, 0.38), '#b35c42', 0.04, 0.012));
    doorPivot.add(cut(ellipseShape(dw - 0.09, 0.5, 0.04, 0.04), '#ffd45e', 0.05, 0.015));
  }
  const doorSpr = new Spring(90, 0.5, 0);

  const roofBoxes = [];
  {
    const ang = Math.atan2(0.8, 1.4), L = Math.hypot(1.4, 0.8) + 0.35, depthZ = 0.8;
    for (const sgn of [-1, 1]) {
      const r = box(L, 0.09, depthZ, sgn < 0 ? '#b0483a' : '#9a3b30', sgn * 0.7 - sgn * 0.12, 1.9 + 0.09 + 0.02, -0.22);
      const nx = Math.sin(ang), ny = Math.cos(ang);
      r.position.set(sgn * 0.66 + sgn * nx * 0.06, 1.9 + ny * 0.06 + 0.02, -0.2);
      r.rotation.z = -sgn * ang;
      popG.add(r);
      roofBoxes.push(r);
      const e = box(L, 0.05, 0.05, '#e4a05b', 0, 0, 0);
      e.position.set(r.position.x, r.position.y, 0.2);
      e.rotation.z = r.rotation.z;
      e.position.x += sgn * nx * 0.02;
      e.position.y += ny * 0.02;
      popG.add(e);
    }
    popG.add(box(0.34, 0.8, 0.32, '#8a8a92', 0.78, 2.1, -0.18));
    popG.add(box(0.44, 0.08, 0.42, '#5d5d66', 0.78, 2.54, -0.18));
    for (const y of [1.9, 2.1, 2.3]) popG.add(box(0.345, 0.025, 0.325, '#6d6d76', 0.78, y, -0.18));
  }

  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.MeshLambertMaterial({ color: '#f1f1f4', transparent: true, opacity: 0, map: noiseTex });
    const g = new THREE.Group();
    for (const [dx, dy, r] of [[0, 0, 0.16], [0.13, 0.05, 0.13], [-0.12, 0.04, 0.12]]) {
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(dx, dy, r, r * 0.85), 14), m));
    }
    g.visible = false;
    cabin.add(g);
    puffs.push({ g, m, ph: i / 7 });
  }

  const kitten = new THREE.Group();
  cabin.add(kitten);
  const K = {};
  buildKittenMesh(kitten, K);

  const accs = buildAccessories(kitten, K);
  const props = buildProps(cabin, SILL_TOP);
  const kleaf = cut(polyShape([[0, -0.07], [0.035, -0.02], [0.08, -0.04], [0.055, 0.02], [0.1, 0.05], [0.035, 0.05], [0, 0.11], [-0.035, 0.05], [-0.1, 0.05], [-0.055, 0.02], [-0.08, -0.04], [-0.035, -0.02]]), '#e0792a', 0, 0.012);
  kleaf.visible = false;
  cabin.add(kleaf);
  const bfly = buildButterfly(cabin);

  const roofSnow = [];
  for (const r of roofBoxes) {
    const s = box(r.geometry.parameters.width - 0.12, 0.08, 0.74, '#fbfdff', 0, 0.085, 0);
    r.add(s);
    roofSnow.push(s);
  }
  {
    const s = box(0.46, 0.07, 0.44, '#fbfdff', 0.78, 2.62, -0.18);
    popG.add(s);
    roofSnow.push(s);
  }

  S.door = doorSpr;
  S.cabin = cabinSpr;
  Object.assign(W, {
    cabin, popG, cabinSpr, doorSpr, doorPivot, glassMat, winGlow, puffs, kitten, K,
    accs, props, kleaf, bfly, roofSnow, SILL_TOP, SILL_X, WIN, DOOR,
  });
}
