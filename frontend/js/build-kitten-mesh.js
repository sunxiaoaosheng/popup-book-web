// 小猫纸模、四季行头、窗台道具、蝴蝶。由 buildCabin 调用，几何只建一次。
import * as THREE from '../vendor/three.module.js';
import { cut, box, polyShape, rectShape, ellipseShape, glowTex } from './materials.js';
import { FONT } from './state.js';
import { bindEyeRead, makeEyeRim } from './eye-read.js';

const FUR = '#f2a24a', FUR_D = '#c9722a', CREAM = '#fff0d6', PINK = '#f6a7b3', INK = '#2b1b14';

export function buildKittenMesh(kitten, K) {
  K.tail = new THREE.Group();
  K.tail.position.set(0.17, 0.1, -0.02);
  kitten.add(K.tail);
  {
    const c = (t) => [0.34 * t + 0.1 * Math.sin(t * 3.1), 0.62 * t * t + 0.05 * t];
    const L = [], R = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, [x, y] = c(t), [x2, y2] = c(Math.min(1, t + 0.02)), [x1, y1] = c(Math.max(0, t - 0.02));
      let tx = x2 - x1, ty = y2 - y1;
      const n = Math.hypot(tx, ty);
      tx /= n; ty /= n;
      const w = 0.062 * (1 - 0.3 * t);
      L.push([x - ty * w, y + tx * w]);
      R.push([x + ty * w, y - tx * w]);
    }
    K.tail.add(cut(polyShape(L.concat(R.reverse())), FUR, 0, 0.025));
    const [tx, ty] = c(1);
    K.tail.add(cut(ellipseShape(tx, ty, 0.06, 0.06), FUR_D, 0.0, 0.03));
    for (const t of [0.35, 0.6, 0.8]) {
      const [sx, sy] = c(t);
      K.tail.add(cut(ellipseShape(sx, sy, 0.04, 0.04), FUR_D, 0.025, 0.01));
    }
  }
  K.body = new THREE.Group();
  kitten.add(K.body);
  K.body.add(cut(ellipseShape(0, 0.3, 0.25, 0.31), FUR, 0, 0.03));
  K.body.add(cut(ellipseShape(0, 0.22, 0.13, 0.2), CREAM, 0.03, 0.01));
  for (const sx of [-1, 1]) {
    K.body.add(cut(ellipseShape(sx * 0.13, 0.05, 0.1, 0.055), FUR, 0.03, 0.012));
    K.body.add(cut(ellipseShape(sx * 0.075, 0.17, 0.05, 0.15), CREAM, 0.04, 0.012));
    K.body.add(cut(ellipseShape(sx * 0.075, 0.035, 0.065, 0.04), CREAM, 0.052, 0.012));
    for (let i = 0; i < 2; i++) {
      K.body.add(cut(polyShape([[sx * (0.17 + i * 0.03), 0.3 + i * 0.1], [sx * 0.26, 0.34 + i * 0.1], [sx * 0.17, 0.38 + i * 0.1]]), FUR_D, 0.03, 0.01));
    }
  }
  K.head = new THREE.Group();
  K.head.position.set(0, 0.6, 0);
  kitten.add(K.head);
  K.earL = new THREE.Group();
  K.earR = new THREE.Group();
  K.head.add(K.earL, K.earR);
  for (const [g, sx] of [[K.earL, -1], [K.earR, 1]]) {
    g.position.set(sx * 0.15, 0.13, 0);
    g.add(cut(polyShape([[-sx * 0.09, -0.03], [sx * 0.07, 0.25], [sx * 0.11, -0.04]]), FUR, -0.01, 0.025));
    g.add(cut(polyShape([[-sx * 0.04, 0], [sx * 0.06, 0.17], [sx * 0.085, 0]]), PINK, 0.015, 0.01));
  }
  K.head.add(cut(ellipseShape(0, 0, 0.28, 0.23), FUR, 0, 0.035));
  for (const sx of [-1, 1]) K.head.add(cut(ellipseShape(sx * 0.15, -0.06, 0.1, 0.07), CREAM, 0.035, 0.01));
  K.head.add(cut(ellipseShape(0, -0.08, 0.09, 0.065), CREAM, 0.045, 0.01));
  for (const [dx, h] of [[0, 0.09], [-0.07, 0.07], [0.07, 0.07]]) {
    K.head.add(cut(polyShape([[dx - 0.018, 0.2], [dx + 0.018, 0.2], [dx, 0.2 - h]]), FUR_D, 0.035, 0.01));
  }
  K.head.add(cut(polyShape([[-0.028, -0.045], [0.028, -0.045], [0, -0.078]]), PINK, 0.056, 0.012));
  K.mouth = new THREE.Group();
  K.mouth.position.set(0, -0.125, 0.056);
  K.head.add(K.mouth);
  K.mouth.add(cut(ellipseShape(0, -0.03, 0.04, 0.05), '#7a2f3a', 0, 0.012));
  K.mouth.add(cut(ellipseShape(0, -0.055, 0.025, 0.02), PINK, 0.012, 0.006));
  K.mouthLine = cut(polyShape([[-0.05, -0.095], [0, -0.115], [0.05, -0.095], [0, -0.105]]), INK, 0.056, 0.008);
  K.head.add(K.mouthLine);
  K.eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.105, 0.015, 0.05);
    K.head.add(e);
    e.add(cut(ellipseShape(0, 0, 0.056, 0.07), INK, 0, 0.012));
    e.add(cut(ellipseShape(0, 0, 0.042, 0.055), '#79d36b', 0.012, 0.01));
    e.add(cut(ellipseShape(0, 0, 0.022, 0.045), INK, 0.022, 0.01));
    e.add(cut(ellipseShape(0.016, 0.026, 0.014, 0.014), '#ffffff', 0.032, 0.008));
    bindEyeRead(e, makeEyeRim(THREE, 0.074, 0.092, 4));
    K.eyes.push(e);
  }
  for (const sx of [-1, 1]) {
    for (const [dy, rot] of [[0.02, 0.12], [-0.015, -0.02], [-0.05, -0.16]]) {
      const w = box(0.2, 0.006, 0.008, '#8a6a52', sx * 0.25, -0.075 + dy, 0.052);
      w.rotation.z = sx * rot;
      K.head.add(w);
    }
  }
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.5);
  hs.bezierCurveTo(-0.95, 0.05, -0.55, 0.75, 0, 0.3);
  hs.bezierCurveTo(0.55, 0.75, 0.95, 0.05, 0, -0.5);
  K.heart = cut(hs, '#ff6b8b', 0, 0.03);
  K.heart.scale.setScalar(0.17);
  K.heart.visible = false;
  K.heartG = new THREE.Group();
  K.heartG.add(K.heart);
  kitten.add(K.heartG);

  const zzz = [];
  const zc = document.createElement('canvas');
  zc.width = zc.height = 64;
  const zg = zc.getContext('2d');
  zg.font = `bold 52px ${FONT}`;
  zg.textAlign = 'center';
  zg.textBaseline = 'middle';
  zg.fillStyle = '#fff4d8';
  zg.strokeStyle = '#6b4a8a';
  zg.lineWidth = 6;
  zg.strokeText('z', 32, 34);
  zg.fillText('z', 32, 34);
  const zTex = new THREE.CanvasTexture(zc);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    kitten.add(s);
    zzz.push({ s, ph: i / 3 });
  }
  kitten.scale.setScalar(0.9);
  kitten.visible = false;
  K.paws = new THREE.Group();
  kitten.add(K.paws);
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.14, 0.42, 0.06);
    g.add(cut(ellipseShape(0, 0.1, 0.055, 0.13), FUR, 0, 0.02));
    g.add(cut(ellipseShape(0, 0.2, 0.07, 0.05), CREAM, 0.02, 0.012));
    for (const dx of [-0.035, 0, 0.035]) g.add(cut(ellipseShape(dx, 0.245, 0.018, 0.028), PINK, 0.03, 0.008));
    g.userData.sx = sx;
    K.paws.add(g);
  }
  K.paws.visible = false;
  K.zzz = zzz;
}

export function buildAccessories(kitten, K) {
  const sp = new THREE.Group();
  sp.position.set(-0.17, 0.2, 0.045);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    sp.add(cut(ellipseShape(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.034, 0.034), '#ff9fb8', 0, 0.012));
  }
  sp.add(cut(ellipseShape(0, 0, 0.026, 0.026), '#ffe27a', 0.012, 0.012));
  const su = new THREE.Group();
  su.position.set(0, 0.18, 0.045);
  su.add(cut(ellipseShape(0, 0, 0.31, 0.05), '#e9c46a', 0, 0.02));
  su.add(cut(ellipseShape(0, 0.06, 0.15, 0.09), '#f2d684', 0.02, 0.02));
  su.add(cut(rectShape(-0.147, 0.02, 0.294, 0.035), '#e5533d', 0.042, 0.008));
  const au = new THREE.Group();
  au.position.set(0.1, 0.2, 0.045);
  au.rotation.z = -0.5;
  au.add(cut(polyShape([[0, -0.06], [0.03, -0.02], [0.07, -0.04], [0.05, 0.02], [0.09, 0.05], [0.03, 0.05], [0, 0.1], [-0.03, 0.05], [-0.09, 0.05], [-0.05, 0.02], [-0.07, -0.04], [-0.03, -0.02]]), '#e0792a', 0, 0.012));
  au.add(cut(rectShape(-0.006, -0.1, 0.012, 0.06), '#8a4a1c', 0, 0.012));
  const wi = new THREE.Group();
  wi.position.set(0, 0.41, 0.05);
  wi.add(cut(ellipseShape(0, 0, 0.2, 0.055), '#d6453d', 0, 0.025));
  wi.add(cut(polyShape([[0.07, -0.035], [0.19, -0.03], [0.21, -0.27], [0.09, -0.25]]), '#d6453d', 0.02, 0.02));
  wi.add(cut(rectShape(0.085, -0.16, 0.12, 0.03), '#fff0d6', 0.042, 0.008));
  wi.add(cut(rectShape(-0.12, -0.02, 0.03, 0.05), '#fff0d6', 0.026, 0.008));
  wi.add(cut(rectShape(0.0, -0.025, 0.03, 0.05), '#fff0d6', 0.026, 0.008));
  K.head.add(sp, su, au);
  kitten.add(wi);
  K.blush = [];
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(
      new THREE.ShapeGeometry(ellipseShape(0, 0, 0.055, 0.032), 14),
      new THREE.MeshBasicMaterial({ color: '#ff6f8f', transparent: true, opacity: 0, depthWrite: false }),
    );
    b.position.set(sx * 0.19, -0.045, 0.058);
    K.head.add(b);
    K.blush.push(b);
  }
  return [sp, su, au, wi];
}

export function buildProps(cabin, SILL_TOP) {
  const props = [];
  const mk = () => {
    const g = new THREE.Group();
    // 窗台小猫在 z≈0.36。道具再靠前一点，并抬高 1 厘米，避免和窗台顶面、尾巴穿在一起。
    g.position.set(1.18, SILL_TOP + 0.012, 0.5);
    g.visible = false;
    cabin.add(g);
    props.push(g);
    return g;
  };
  const pot = mk();
  pot.add(cut(polyShape([[-0.07, 0], [0.07, 0], [0.09, 0.12], [-0.09, 0.12]]), '#c4673a', 0, 0.05));
  pot.add(cut(rectShape(-0.01, 0.12, 0.02, 0.15), '#4a9a58', 0.01, 0.02));
  pot.add(cut(ellipseShape(-0.05, 0.19, 0.05, 0.022), '#5cb86a', 0.01, 0.02));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    pot.add(cut(ellipseShape(Math.cos(a) * 0.045, 0.31 + Math.sin(a) * 0.045, 0.034, 0.034), '#ff8fb0', 0.02, 0.015));
  }
  pot.add(cut(ellipseShape(0, 0.31, 0.026, 0.026), '#ffe27a', 0.035, 0.012));
  const wm = mk();
  {
    const arc = (r, n = 18) => {
      const p = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI + i / n * Math.PI;
        p.push([Math.cos(a) * r, 0.17 + Math.sin(a) * r]);
      }
      return p;
    };
    wm.add(cut(polyShape(arc(0.17)), '#3f9a45', 0, 0.05));
    wm.add(cut(polyShape(arc(0.15)), '#f4f0d0', 0.05, 0.012));
    wm.add(cut(polyShape(arc(0.135)), '#ff5d73', 0.062, 0.012));
    for (const [x, y] of [[-0.07, 0.11], [0.0, 0.07], [0.07, 0.11], [-0.03, 0.13], [0.04, 0.14]]) {
      wm.add(cut(ellipseShape(x, y, 0.012, 0.02), '#2b1b14', 0.074, 0.006));
    }
  }
  const pk = mk();
  pk.add(cut(ellipseShape(0, 0.1, 0.15, 0.105), '#f08a2a', 0, 0.06));
  for (const sx of [-1, 1]) pk.add(cut(ellipseShape(sx * 0.075, 0.1, 0.05, 0.1), '#d97020', 0.06, 0.01));
  pk.add(cut(rectShape(-0.014, 0.17, 0.028, 0.1), '#6a8a3a', 0.058, 0.016));
  pk.add(cut(polyShape([[-0.07, 0.12], [-0.03, 0.12], [-0.05, 0.16]]), '#7a3a10', 0.082, 0.006));
  pk.add(cut(polyShape([[0.03, 0.12], [0.07, 0.12], [0.05, 0.16]]), '#7a3a10', 0.082, 0.006));
  pk.add(cut(polyShape([[-0.06, 0.07], [0.06, 0.07], [0.03, 0.045], [-0.03, 0.045]]), '#7a3a10', 0.082, 0.006));
  const mug = mk();
  mug.add(cut(rectShape(-0.07, 0, 0.14, 0.16), '#f4efe4', 0, 0.06));
  {
    const s = ellipseShape(0.1, 0.085, 0.052, 0.052);
    const h = new THREE.Path();
    h.absellipse(0.1, 0.085, 0.028, 0.028, 0, Math.PI * 2, true);
    s.holes.push(h);
    mug.add(cut(s, '#f4efe4', 0.01, 0.03));
  }
  mug.add(cut(rectShape(-0.07, 0.05, 0.14, 0.035), '#d6453d', 0.06, 0.008));
  mug.add(cut(ellipseShape(0, 0.16, 0.07, 0.014), '#6b3a22', 0.03, 0.03));
  mug.userData.steam = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    mug.add(s);
    mug.userData.steam.push({ s, ph: i / 3 });
  }
  return props;
}

export function buildButterfly(cabin) {
  const bfly = new THREE.Group();
  cabin.add(bfly);
  bfly.visible = false;
  bfly.userData.wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.add(cut(ellipseShape(sx * 0.06, 0.02, 0.07, 0.05), '#ffb3d9', 0, 0.01));
    w.add(cut(ellipseShape(sx * 0.04, -0.035, 0.04, 0.035), '#a58bff', 0.01, 0.01));
    bfly.add(w);
    bfly.userData.wings.push(w);
  }
  bfly.add(cut(ellipseShape(0, 0, 0.012, 0.05), '#4a3a5a', 0.02, 0.01));
  return bfly;
}
