// 林间小屋 · 立体翻翻书 —— 由笔记本盖角 angle(0~130°) 驱动
// 纯前端、无构建：Three.js 已放在 ./vendor/three.module.js
import * as THREE from './vendor/three.module.js';
import { Sound } from './audio.js';
import { store } from './store.js';
import { SECRETS, SEASONS, TUNING } from './story.js';
import { initUI } from './ui.js';

/* ============================================================ 工具 */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const MAX_ANGLE = 130;
const FONT = '"PingFang SC","Hiragino Sans GB","Songti SC","Microsoft YaHei","Noto Serif CJK SC","Noto Sans CJK SC",sans-serif';

// 欠阻尼弹簧：快速变化时产生"纸片回弹"的过冲
class Spring {
  constructor(k = 90, zeta = 0.55, x = 0) { this.k = k; this.c = 2 * zeta * Math.sqrt(k); this.x = x; this.v = 0; }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}
// 伪随机（固定种子，保证每次加载布局一致）
let _seed = 7;
const rnd = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };

/* ============================================================ 渲染器 / 场景 */
const stageEl = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a211b');
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

const hemi = new THREE.HemisphereLight('#fff3e0', '#7a6a5a', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0dc', 2.6);
sun.position.set(-6, 15, 12);
sun.target.position.set(0, 1, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
scene.add(sun, sun.target);

const seamLight = new THREE.PointLight('#ffb25a', 0, 14, 1.2);   // 合上时从缝里漏出的暖光
seamLight.position.set(0, 0.45, 3.2);
scene.add(seamLight);
const windowLight = new THREE.PointLight('#ffc36b', 0, 6, 1.5);   // 窗户的光
scene.add(windowLight);

/* ============================================================ 纸张材质 */
function makeNoise() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 215 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  for (let i = 0; i < 160; i++) {      // 纸纤维
    g.strokeStyle = 'rgba(190,190,190,0.25)'; g.lineWidth = 0.6; g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 14, y + (Math.random() - .5) * 14); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const noiseTex = makeNoise();
const matCache = new Map();
const paper = (color) => {
  if (!matCache.has(color)) { const m = new THREE.MeshLambertMaterial({ color, map: noiseTex }); m.userData.orig = color; matCache.set(color, m); }
  return matCache.get(color);
};
const paperGlow = (color) => new THREE.MeshLambertMaterial({ color, map: noiseTex, emissive: color, emissiveIntensity: 0.55 });
const edgeMat = new THREE.MeshLambertMaterial({ color: '#d9bd8f' });   // 瓦楞纸/卡纸切面颜色

// 把 2D Shape 拉伸成薄纸片：z 起点 z0，厚度 depth
function cut(shape, color, z0 = 0, depth = 0.03) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 });
  geo.translate(0, 0, z0);
  const m = new THREE.Mesh(geo, [paper(color), edgeMat]);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const polyShape = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; };
const rectShape = (x, y, w, h) => polyShape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
const ellipseShape = (cx, cy, rx, ry) => { const s = new THREE.Shape(); s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0); return s; };
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paper(color));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, map: glowTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/* ============================================================ 书本骨架 */
const PW = 10, PH = 6.2;              // 页面宽、深(高)
const book = new THREE.Group(); scene.add(book);

const desk = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshLambertMaterial({ color: '#43352b' }));
desk.rotation.x = -Math.PI / 2; desk.position.y = -0.125; desk.receiveShadow = true; scene.add(desk);

// 底页（水平，贴着桌面）
const floorBox = box(PW, 0.12, PH, '#f0e2c2', 0, -0.06, PH / 2); book.add(floorBox);
const floorFace = new THREE.Group();          // 本地 (x, y) -> 世界 (x, -z)，本地 z -> 世界 y(向上)
floorFace.rotation.x = -Math.PI / 2; book.add(floorFace);
floorFace.add(cut(rectShape(-4.75, -(PH - 0.25), 9.5, PH - 0.35), '#86bb86', 0, 0.02));   // 草地

// 小径（从门口蜿蜒到书口）
{
  const pts = [];
  const cx = (z) => -0.45 - 0.55 * Math.sin((z - 2.8) * 0.9) * 0.6 - (z - 2.8) * 0.12;
  const w = (z) => 0.32 + (z - 2.8) * 0.07;
  for (let z = 2.75; z <= 5.95; z += 0.2) pts.push([cx(z) - w(z), -z]);
  for (let z = 5.95; z >= 2.75; z -= 0.2) pts.push([cx(z) + w(z), -z]);
  floorFace.add(cut(polyShape(pts), '#f2dfb5', 0.02, 0.02));
  // 路上几块小石片
  for (let z = 3.3; z < 5.8; z += 0.55) floorFace.add(cut(ellipseShape(cx(z) + (rnd() - .5) * .3, -z, .1, .06), '#e0c797', 0.04, 0.01));
}
// 小花
for (let i = 0; i < 18; i++) {
  const x = (rnd() - .5) * 8.6, z = 2.9 + rnd() * 3.0;
  if (Math.abs(x + 0.9) < 1.0 && z > 2.6) continue;
  const col = ['#ff8fa3', '#fff6e0', '#ffd45e', '#b9a4ff'][i % 4];
  const f = new THREE.Group(); f.position.set(x, -z, 0.04);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; f.add(cut(ellipseShape(Math.cos(a) * .06, Math.sin(a) * .06, .045, .045), col, 0, 0.012)); }
  f.add(cut(ellipseShape(0, 0, .035, .035), '#f4a43a', 0.012, 0.012)); floorFace.add(f);
}

// 盖页（绕书脊旋转；背面=封面，正面=背景）
const hinge = new THREE.Group(); book.add(hinge);
const backBox = box(PW, 0.12, PH, '#f0e2c2', 0, 0.06, PH / 2);     // 内表面在 local y=0
hinge.add(backBox);
const backFace = new THREE.Group();   // 本地 (x,y)=(横向,页面向上)，本地 z=离开纸面的距离
backFace.rotation.x = Math.PI / 2; hinge.add(backFace);

/* ---- 封面 ---- */
const COVER_W = 1280, COVER_H = Math.round(1280 * PH / PW);
const coverCanvas = document.createElement('canvas'); coverCanvas.width = COVER_W; coverCanvas.height = COVER_H;
const COVER_SKY = [['#244e4a', '#173a37'], ['#1f5560', '#14383f'], ['#4a3a3a', '#2e2326'], ['#2d4560', '#1b2b42']];
function drawCover(season = 0, cycles = 0, found = 0) {
  const W = COVER_W, H = COVER_H, c = coverCanvas; const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#efe0bd'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#b4854f'; g.lineWidth = 8; g.strokeRect(34, 34, W - 68, H - 68);
  g.strokeStyle = '#d4ae7a'; g.lineWidth = 3; g.strokeRect(54, 54, W - 108, H - 108);
  const grd = g.createLinearGradient(0, 80, 0, H - 80); grd.addColorStop(0, COVER_SKY[season][0]); grd.addColorStop(1, COVER_SKY[season][1]);
  g.fillStyle = grd; g.fillRect(80, 80, W - 160, H - 160);
  g.save(); g.beginPath(); g.rect(80, 80, W - 160, H - 160); g.clip();
  // 月亮与星
  g.fillStyle = '#ffeaa8'; g.beginPath(); g.arc(W - 200, 175, 46, 0, 7); g.fill();
  g.fillStyle = COVER_SKY[season][0]; g.beginPath(); g.arc(W - 180, 162, 40, 0, 7); g.fill();
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,238,180,.8)'; g.fillRect(120 + ((i * 7919) % 1000) / 1000 * (W - 240), 110 + ((i * 104729) % 1000) / 1000 * 230, 3, 3); }
  // 松林剪影
  const pine = (x, y, s, col) => { g.fillStyle = col; for (let i = 0; i < 4; i++) { g.beginPath(); const w = (110 - i * 22) * s, yy = y - i * 55 * s; g.moveTo(x - w, yy); g.lineTo(x, yy - 90 * s); g.lineTo(x + w, yy); g.fill(); } g.fillRect(x - 8 * s, y, 16 * s, 40 * s); };
  for (let i = 0; i < 9; i++) pine(120 + i * 135 + (i % 2) * 30, H - 140, 0.8 + (i % 3) * 0.15, i % 2 ? '#102a28' : '#0d2321');
  // 小屋与暖光窗
  g.fillStyle = '#0b1c1b'; g.fillRect(W / 2 - 120, H - 300, 240, 150);
  g.beginPath(); g.moveTo(W / 2 - 150, H - 300); g.lineTo(W / 2, H - 390); g.lineTo(W / 2 + 150, H - 300); g.fill();
  g.shadowColor = '#ffb04a'; g.shadowBlur = 40; g.fillStyle = '#ffc766'; g.fillRect(W / 2 + 30, H - 270, 60, 55); g.shadowBlur = 0;
  g.restore();
  // 标题
  g.textAlign = 'center'; g.fillStyle = '#fff1d2'; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 10;
  g.font = `bold 200px ${FONT}`; g.fillText('林间小屋', W / 2, 330);
  g.shadowBlur = 0; g.font = `600 46px ${FONT}`; g.fillStyle = '#ffd48a'; g.fillText('一 只 小 猫 的 立 体 故 事', W / 2, 410);
  // 本次翻开的季节 + 收集进度（让人想再翻一次）
  g.font = `600 40px ${FONT}`; g.fillStyle = '#ffe9b8';
  g.fillText(`第 ${cycles + 1} 次翻开  ·  ${SEASONS[season].title}`, W / 2, H - 150);
  g.font = `30px ${FONT}`; g.fillStyle = 'rgba(255,241,210,.75)';
  g.fillText(`小秘密 ${found} / ${SECRETS.length}   ·   慢慢打开这本书`, W / 2, H - 100);
  coverTex.needsUpdate = true;
}
const coverTex = new THREE.CanvasTexture(coverCanvas); coverTex.colorSpace = THREE.SRGBColorSpace; coverTex.anisotropy = 8;
const cover = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshLambertMaterial({ map: coverTex }));
cover.rotation.x = -Math.PI / 2; cover.position.set(0, 0.122, PH / 2); cover.receiveShadow = true;
hinge.add(cover);

/* ---- 背景：天空 / 月 / 星 / 远山（都贴在盖页内侧，分层有厚度） ---- */
const skyMat = new THREE.MeshBasicMaterial({ color: '#f6c99b' });
const sky = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.4, PH - 0.35), skyMat);
sky.position.set(0, PH / 2 + 0.0, 0.01); sky.receiveShadow = false; backFace.add(sky);

function hillShape(base, amp, f, ph, x0 = -PW / 2 + 0.2, x1 = PW / 2 - 0.2) {
  const pts = [[x0, -0.0]];
  for (let x = x0; x <= x1 + 1e-6; x += 0.25) pts.push([x, base + amp * Math.sin(f * x + ph) + amp * 0.4 * Math.sin(2.3 * f * x + ph * 2)]);
  pts.push([x1, 0]); return pts;
}
const hillDefs = [
  { base: 2.35, amp: .38, f: .55, ph: .5, col: '#a5c8a0', z: .12 },
  { base: 1.85, amp: .32, f: .7, ph: 2.2, col: '#69a885', z: .34 },
  { base: 1.25, amp: .26, f: .9, ph: 4.0, col: '#3f7f69', z: .56 },
];
const hillRidge = [];
for (const h of hillDefs) {
  backFace.add(cut(polyShape(hillShape(h.base, h.amp, h.f, h.ph)), h.col, h.z, 0.05));
  hillRidge.push(h);
}
// 远处小松树（贴在两层山脊上）
const pineShapes = (w, h, tiers, tw, th) => {
  const s = (h - th) / (0.62 * (tiers - 1) + 1), L = [[0, 0], [-tw, 0], [-tw, th]];
  for (let i = 0; i < tiers; i++) {
    const yb = th + i * 0.62 * s, wi = (w / 2) * (1 - 0.5 * (tiers > 1 ? i / (tiers - 1) : 0));
    L.push([-wi, yb]); if (i < tiers - 1) L.push([-wi * 0.32, yb + 0.88 * s]);
  }
  L.push([0, h]);
  const R = L.map(([x, y]) => [-x, y]).reverse();
  return [polyShape(L), polyShape(R)];
};
function makePine(w, h, tiers, cDark, cLight, tw = 0.05, th = 0.18, depth = 0.04) {
  const g = new THREE.Group(); const [l, r] = pineShapes(w, h, tiers, tw, th);
  g.add(cut(l, cDark, 0, depth), cut(r, cLight, 0, depth));
  return g;
}
const mapY = (h, x) => h.base + h.amp * Math.sin(h.f * x + h.ph) + h.amp * 0.4 * Math.sin(2.3 * h.f * x + h.ph * 2);
for (const [hi, step, dark, light] of [[1, 0.55, '#2f6a55', '#3b7b63'], [2, 0.7, '#245a49', '#2e6b57']]) {
  const h = hillDefs[hi];
  for (let x = -4.6; x < 4.7; x += step * (0.8 + rnd() * 0.5)) {
    const sz = 0.55 + rnd() * 0.45;
    const t = makePine(0.5 * sz, 0.9 * sz, 3, dark, light, 0.04, 0.12, 0.04);
    t.position.set(x, mapY(h, x) - 0.05, h.z + 0.05); backFace.add(t);
  }
}
// 纸云
const clouds = []; const cloudMat = paperGlow('#fff3e2');
for (const [x, y, s] of [[-2.8, 4.6, 1], [1.6, 5.3, 0.8], [3.6, 3.9, 0.7]]) {
  const g = new THREE.Group();
  for (const [dx, dy, r] of [[0, 0, .32], [.35, .08, .4], [.75, 0, .3], [.35, -.1, .5]]) { const cm = cut(ellipseShape(dx, dy - 0.05, r * 1.2, r * 0.7), '#fff3e2', 0, 0.03); cm.material[0] = cloudMat; g.add(cm); }
  g.position.set(x, y, 0.08); g.scale.setScalar(s); g.userData = { x, s: 0.3 + rnd() * 0.3, ph: rnd() * 6 };
  backFace.add(g); clouds.push(g);
}
// 月亮（新月，纸片+光晕）
const moon = new THREE.Group(); backFace.add(moon);
{
  const R = 0.78, r = 0.66, cxx = 0.3, cyy = 0.14, d = Math.hypot(cxx, cyy);
  const a = (R * R - r * r + d * d) / (2 * d), hh = Math.sqrt(R * R - a * a);
  const ux = cxx / d, uy = cyy / d, px = -uy, py = ux;
  const P1 = [a * ux + hh * px, a * uy + hh * py], P2 = [a * ux - hh * px, a * uy - hh * py];
  const up = P1[1] > P2[1] ? P1 : P2, lo = P1[1] > P2[1] ? P2 : P1;
  const phiUp = Math.atan2(up[1], up[0]), phiLo = Math.atan2(lo[1], lo[0]);
  const psiUp = Math.atan2(up[1] - cyy, up[0] - cxx), psiLo = Math.atan2(lo[1] - cyy, lo[0] - cxx);
  const pts = []; const N = 40;
  for (let i = 0; i <= N; i++) { const t = phiUp + (phiLo + 2 * Math.PI - phiUp) * i / N; pts.push([R * Math.cos(t), R * Math.sin(t)]); }
  let ps0 = psiLo, ps1 = psiUp - 2 * Math.PI; if (ps1 > ps0) ps1 -= 2 * Math.PI;
  for (let i = 1; i < N; i++) { const t = ps0 + (ps1 - ps0) * i / N; pts.push([cxx + r * Math.cos(t), cyy + r * Math.sin(t)]); }
  const crescent = new THREE.Mesh(new THREE.ExtrudeGeometry(polyShape(pts), { depth: 0.05, bevelEnabled: false }),
    [new THREE.MeshBasicMaterial({ color: '#fff0b8' }), edgeMat]);
  crescent.castShadow = true; crescent.rotation.z = -0.35; crescent.position.z = 0.06; moon.add(crescent);
  const halo1 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), addMat('#ffe9a0', 0.38)); halo1.position.z = 0.05; moon.add(halo1);
}
// 星星
const stars = [];
{
  const star = (R, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return polyShape(p); };
  const starMat = new THREE.MeshBasicMaterial({ color: '#ffeaa0' });
  for (let i = 0; i < 34; i++) {
    let x, y; do { x = (rnd() - .5) * 9.2; y = 2.9 + rnd() * 3.1; } while (Math.hypot(x - 2.9, y - 4.7) < 1.1);
    const s = 0.07 + rnd() * 0.11;
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(star(1, 0.45), { depth: 0.03, bevelEnabled: false }), [starMat, edgeMat]);
    m.position.set(x, y, 0.05); m.userData = { s, t0: 100 + rnd() * 20, ph: rnd() * 6, spr: new Spring(70, 0.4, 0) };
    m.scale.setScalar(0.0001); m.visible = false; backFace.add(m); stars.push(m);
  }
}

/* ---- v3「日晷」：一枚纸太阳插在盖页的弧形滑槽里，盖子开多大，太阳就走到哪 ----
   约 36° 从右边山后升起 → 约 74° 正午最高 → 约 112° 从左边山后落下（月亮随后从右边升起）。
   太阳的位置同时驱动平行光的方向：开合盖子 = 推着太阳走，树和小屋的影子会跟着在地上扫过去。 */
const SUN_ARC = { cx: 0, cy: 1.25, rx: 3.85, ry: 3.65, a0: 36, a1: 112 };
const sunAt = (u, out) => out.set(SUN_ARC.cx + SUN_ARC.rx * Math.cos(Math.PI * u), SUN_ARC.cy + SUN_ARC.ry * Math.sin(Math.PI * u), 0);
const paperSun = new THREE.Group(); backFace.add(paperSun);
{
  const rays = []; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 0.47 : 0.66; rays.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const rayM = cut(polyShape(rays), '#ffb43c', 0.05, 0.03); rayM.material[0] = paperGlow('#ffb43c'); paperSun.add(rayM);
  const disc = cut(ellipseShape(0, 0, 0.42, 0.42), '#ffd765', 0.08, 0.03); disc.material[0] = paperGlow('#ffd765'); paperSun.add(disc);
  // 纸太阳的小脸（闭眼微笑），黄昏时会困
  const face = new THREE.Group(); face.position.z = 0.112; paperSun.add(face);
  const ink = new THREE.MeshBasicMaterial({ color: '#b5651d' });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 4, 12, Math.PI), ink); e.position.set(sx * 0.14, 0.06, 0); e.rotation.z = Math.PI; face.add(e); }
  const mo = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.017, 4, 14, Math.PI), ink); mo.position.set(0, -0.1, 0); mo.rotation.z = Math.PI; face.add(mo);
  for (const sx of [-1, 1]) { const ch = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshBasicMaterial({ color: '#ff9a6a', transparent: true, opacity: 0.6 })); ch.position.set(sx * 0.25, -0.07, -0.001); face.add(ch); }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), addMat('#ffd27a', 0.42)); halo.position.z = 0.04; paperSun.add(halo);
  paperSun.userData = { rays: rayM, halo, face };
}
// 弧形滑槽：天空纸上一排压痕小点，暗示"太阳是插在槽里推着走的"
const sunSlot = new THREE.Group(); backFace.add(sunSlot);
{
  const dotM = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.1, depthWrite: false });
  const P = new THREE.Vector3();
  for (let i = 0; i <= 44; i++) { sunAt(i / 44, P); if (P.y < 2.2) continue; const d = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), dotM); d.position.set(P.x, P.y, 0.02); sunSlot.add(d); }
  sunSlot.userData.mat = dotM;
}
// 地平线霞光：清晨粉紫、黄昏橘红（竖向渐变纸，贴在远山后面）
const horizonTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const horizonMat = new THREE.MeshBasicMaterial({ color: '#ff8a4c', map: horizonTex, transparent: true, opacity: 0, depthWrite: false });
const horizon = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.4, 3.2), horizonMat); horizon.position.set(0, 2.0 + 1.6 - 0.4, 0.015); backFace.add(horizon);
const DAWN_SKY = new THREE.Color('#f3c7d6'), DAWN_GLOW = new THREE.Color('#ff9fb8'), DUSK_GLOW = new THREE.Color('#ff7a3a');
const SUN_LOW = new THREE.Color('#ff9d5c');
const TIMES = [[0, '清晨'], [0.2, '上午'], [0.4, '正午'], [0.6, '午后'], [0.8, '黄昏']];

/* ---- v4「陪它过完一整天」：从合着开始，不回头、不着急地一路开到天黑，天上就会多出一只"猫座" ----
   之后每个夜晚它都在（存档记住）。星座由纸星星 + 压痕连线组成，第一次出现时一颗一颗亮起来。 */
const CON = { x: -2.75, y: 4.45, s: 1.05 };
const CON_PTS = [[-0.55, 0.8], [-0.3, 0.52], [-0.05, 0.8], [0.02, 0.38], [-0.32, 0.12], [0.5, 0.08], [0.72, -0.45], [-0.18, -0.5], [1.18, -0.08]];
const CON_SEG = [[0, 1], [1, 2], [2, 3], [0, 4], [3, 5], [5, 6], [6, 7], [7, 4], [6, 8]];
const catStars = new THREE.Group(); catStars.position.set(CON.x, CON.y, 0.07); catStars.scale.setScalar(CON.s); backFace.add(catStars);
{
  const star = (R, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return polyShape(p); };
  const m0 = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  const lineM = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, depthWrite: false });
  catStars.userData = { pts: [], lines: [], lineM };
  CON_PTS.forEach(([x, y], i) => {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(star(1, 0.45), { depth: 0.03, bevelEnabled: false }), [m0, edgeMat]);
    m.position.set(x, y, 0.01); m.scale.setScalar(0.0001); m.userData = { s: i === 1 || i === 6 ? 0.19 : 0.14, i };
    catStars.add(m); catStars.userData.pts.push(m);
  });
  for (const [a, b] of CON_SEG) {
    const [x0, y0] = CON_PTS[a], [x1, y1] = CON_PTS[b], len = Math.hypot(x1 - x0, y1 - y0);
    // 压痕虚线：一串小点
    const g = new THREE.Group(); const n = Math.max(3, Math.round(len / 0.09));
    for (let k = 1; k < n; k++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6), lineM); d.position.set(lerp(x0, x1, k / n), lerp(y0, y1, k / n), 0); g.add(d); }
    catStars.add(g); catStars.userData.lines.push(g);
  }
  catStars.visible = false;
}
const inConArea = (x, y) => Math.abs(x - (CON.x + 0.3)) < 1.25 && Math.abs(y - CON.y) < 1.05;

// 书脊暖光缝（合上时漏光）
const seamGlow = new THREE.Mesh(new THREE.PlaneGeometry(PW, 1), addMat('#ffb050', 0));
seamGlow.position.set(0, 0.5, PH + 0.02); book.add(seamGlow);
const seamLine = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.2, 0.06), new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
seamLine.position.set(0, 0.5, PH + 0.03); book.add(seamLine);

/* ============================================================ 地面折叠：台阶草坡（折纸式 riser + top） */
const terraces = [];
function makeTerrace(cx, zFront, w, h, depth, cTop, cRiser, cx0 = 0) {
  const g = new THREE.Group(); g.position.set(cx, 0.02, zFront);
  const riser = new THREE.Group(); g.add(riser);
  riser.add(cut(rectShape(-w / 2, 0, w, h), cRiser, -0.03, 0.03));
  const top = new THREE.Group(); top.position.y = h; riser.add(top);
  const geo = new THREE.ExtrudeGeometry(rectShape(-w / 2, 0, w, depth), { depth: 0.03, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -0.03, 0);
  const slab = new THREE.Mesh(geo, [paper(cTop), edgeMat]); slab.castShadow = slab.receiveShadow = true; top.add(slab);
  book.add(g);
  const t = { g, riser, top, w, h, depth, spr: new Spring(80, 0.45, 0), t0: 0, t1: 0 };
  terraces.push(t); return t;
}
const T_back = makeTerrace(0, 2.15, 9.5, 0.45, 2.15, '#9ccf98', '#5d9c74'); T_back.t0 = 10; T_back.t1 = 21;
const T_left = makeTerrace(-3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a'); T_left.t0 = 14; T_left.t1 = 25;
const T_right = makeTerrace(3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a'); T_right.t0 = 16; T_right.t1 = 27;

/* ============================================================ 纸松树（左半深色/右半浅色，像折过的纸） */
const trees = [];
function addTree(parent, x, z, h, tiers, cDark, cLight, t0, y = 0, row = 'back') {
  const w = h * 0.5 + 0.1;
  const tr = makePine(w, h, tiers, cDark, cLight, 0.06, h * 0.12, 0.04);
  tr.position.set(x, y, z);
  parent.add(tr);
  trees.push({ g: tr, h, spr: new Spring(95, 0.34, 0), sw: new Spring(60, 0.14, 0), t0, ph: rnd() * 6, row, top: parent === book ? 0.02 : 0.47 });
}
// 后排（站在后面的高坡上）。盖页会顶住树尖：树要在 ~40–50° 前站直，
// 所以后排放得离书脊远一点（z≈1.85）、矮一点（1.0–1.45），让它们刚好跟着盖页一起立起来。
{
  let i = 0;
  for (let x = -4.5; x <= 4.6; x += 0.95) {
    const h = 1.0 + rnd() * 0.45;
    addTree(T_back.top, x + (rnd() - .5) * 0.3, -0.3 - rnd() * 0.15, h, 4, '#1f5a49', '#2a6e58', 17 + i * 0.4, 0, 'back'); i++;
  }
}
// 中排（直接站在地上，小屋两侧）
{
  const xs = [-2.55, -3.4, -4.4, 2.6, 3.5, 4.45];
  xs.forEach((x, i) => addTree(book, x, 2.55 + rnd() * 0.3, 1.5 + rnd() * 0.6, 4, '#2c7a5b', '#38906a', 20 + i * 0.6, 0.02, 'mid'));
}
// 前排（左右两侧小坡上，矮一些）
[T_left, T_right].forEach((T, k) => {
  [-0.95, 0.15, 1.1].forEach((x, i) => {
    const xx = k === 0 ? x - 0.6 : x + 0.6;
    addTree(T.top, xx, -0.5 - i * 0.28, 1.0 + rnd() * 0.45, 3, '#3a9a68', '#4cb07a', 24 + k * 1.2 + i * 0.7, 0, 'front');
  });
});

/* ============================================================ 小木屋 */
const cabin = new THREE.Group();   // 绕底边向上翻起
cabin.position.set(0, 0.03, 2.65); book.add(cabin);
// 有进深的部件（屋顶、烟囱、窗框、窗台、门洞）放进 popG：平躺时压扁成一张纸，站起来时才"鼓"出来——折叠阶段不再有一堆东西乱戳。
const popG = new THREE.Group(); cabin.add(popG);
const cabinSpr = new Spring(70, 0.5, 0);
const wallC = '#a8693f', logC = '#8a522f';
const DOOR = { x0: -0.75, x1: -0.05, h: 1.05 }, WIN = { x0: 0.45, x1: 1.15, y0: 0.75, y1: 1.3 };
{
  const s = polyShape([[-1.4, 0], [DOOR.x0, 0], [DOOR.x0, DOOR.h], [DOOR.x1, DOOR.h], [DOOR.x1, 0], [1.4, 0], [1.4, 1.5], [0, 2.3], [-1.4, 1.5]]);
  const hole = new THREE.Path(); [[WIN.x0, WIN.y0], [WIN.x1, WIN.y0], [WIN.x1, WIN.y1], [WIN.x0, WIN.y1]].forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y)); hole.closePath();
  s.holes.push(hole);
  cabin.add(cut(s, wallC, -0.06, 0.06));
  // 原木横纹
  const hw = (y) => y <= 1.5 ? 1.32 : 1.4 * (1 - (y - 1.5) / 0.8) - 0.1;
  for (let y = 0.3; y < 2.1; y += 0.3) {
    let segs = [[-hw(y), hw(y)]];
    const sub = (a, b) => { const out = []; for (const [s0, s1] of segs) { if (b <= s0 || a >= s1) out.push([s0, s1]); else { if (a > s0) out.push([s0, a]); if (b < s1) out.push([b, s1]); } } segs = out; };
    if (y < DOOR.h + 0.08) sub(DOOR.x0 - 0.05, DOOR.x1 + 0.05);
    if (y > WIN.y0 - 0.08 && y < WIN.y1 + 0.08) sub(WIN.x0 - 0.05, WIN.x1 + 0.05);
    for (const [a, b] of segs) if (b - a > 0.08) cabin.add(box(b - a, 0.035, 0.03, logC, (a + b) / 2, y, 0.012));
  }
  // 门洞内部（暖色）
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0, DOOR.h), new THREE.MeshBasicMaterial({ color: '#6e3f26' }));
  inner.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, -0.38); popG.add(inner);
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), addMat('#ff9a40', 0.5)); innerGlow.position.set(-0.4, 0.55, -0.36); popG.add(innerGlow);
  for (const x of [DOOR.x0 - 0.005, DOOR.x1 + 0.005]) { const side = box(0.01, DOOR.h, 0.34, '#4d2c1a', x + (x < -0.4 ? 0.005 : -0.005), DOOR.h / 2, -0.2); popG.add(side); }
}
// 窗：灯光玻璃 + 窗框 + 十字
const glassMat = new THREE.MeshBasicMaterial({ color: '#7f8f9a', transparent: true, opacity: 0.72, depthWrite: false });
const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), glassMat);
glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, -0.03); cabin.add(glass);
{
  const cxw = (WIN.x0 + WIN.x1) / 2, cyw = (WIN.y0 + WIN.y1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, fc = '#fff2d8';
  popG.add(box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y1 + 0.04, 0.0), box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y0 - 0.04, 0.0),
    box(0.08, wh, 0.06, fc, WIN.x0 - 0.04, cyw, 0.0), box(0.08, wh, 0.06, fc, WIN.x1 + 0.04, cyw, 0.0),
    box(0.04, wh, 0.04, fc, cxw, cyw, 0.0), box(ww, 0.04, 0.04, fc, cxw, cyw, 0.0));
}
const sill = box(1.0, 0.07, 0.46, '#c98f55', (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.08 + 0.035 - 0.0, 0.23);
sill.position.y = 0.72; popG.add(sill);
const SILL_TOP = 0.755, SILL_X = (WIN.x0 + WIN.x1) / 2;
const winGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), addMat('#ffbf5e', 0)); winGlow.position.set(SILL_X, 1.02, 0.03); cabin.add(winGlow);
// 门（绕左边合页开）
const doorPivot = new THREE.Group(); doorPivot.position.set(DOOR.x0 + 0.01, 0, -0.05); cabin.add(doorPivot);
{
  const dw = DOOR.x1 - DOOR.x0 - 0.03;
  doorPivot.add(cut(rectShape(0, 0, dw, DOOR.h - 0.02), '#9c4a33', 0, 0.04));
  doorPivot.add(cut(rectShape(0.1, 0.12, dw - 0.2, 0.38), '#b35c42', 0.04, 0.012));
  doorPivot.add(cut(rectShape(0.1, 0.58, dw - 0.2, 0.38), '#b35c42', 0.04, 0.012));
  doorPivot.add(cut(ellipseShape(dw - 0.09, 0.5, 0.04, 0.04), '#ffd45e', 0.05, 0.015));
}
const doorSpr = new Spring(90, 0.5, 0);
// 屋顶（两片斜纸板，向后伸出一点进深）+ 烟囱
const roofBoxes = [];
{
  const ang = Math.atan2(0.8, 1.4), L = Math.hypot(1.4, 0.8) + 0.35, depthZ = 0.8;
  for (const sgn of [-1, 1]) {
    const r = box(L, 0.09, depthZ, sgn < 0 ? '#b0483a' : '#9a3b30', sgn * 0.7 - sgn * 0.12, 1.9 + 0.09 + 0.02, -0.22);
    const nx = Math.sin(ang), ny = Math.cos(ang);     // 斜面外法线（略抬高避免穿模）
    r.position.set(sgn * 0.66 + sgn * nx * 0.06, 1.9 + ny * 0.06 + 0.02, -0.2);
    r.rotation.z = -sgn * ang; popG.add(r); roofBoxes.push(r);
    // 屋檐前缘浅色条（像叠了一层卡纸）
    const e = box(L, 0.05, 0.05, '#e4a05b', 0, 0, 0); e.position.set(r.position.x, r.position.y + 0.0, 0.2 + 0.0); e.rotation.z = r.rotation.z; e.position.x += sgn * nx * 0.02; e.position.y += ny * 0.02; popG.add(e);
  }
  popG.add(box(0.34, 0.8, 0.32, '#8a8a92', 0.78, 2.1, -0.18));
  popG.add(box(0.44, 0.08, 0.42, '#5d5d66', 0.78, 2.54, -0.18));
  for (const y of [1.9, 2.1, 2.3]) popG.add(box(0.345, 0.025, 0.325, '#6d6d76', 0.78, y, -0.18));
}
// 烟雾（纸云团，循环）
const puffs = [];
for (let i = 0; i < 7; i++) {
  const m = new THREE.MeshLambertMaterial({ color: '#f1f1f4', transparent: true, opacity: 0, map: noiseTex });
  const g = new THREE.Group();
  for (const [dx, dy, r] of [[0, 0, .16], [.13, .05, .13], [-.12, .04, .12]]) { const c = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(dx, dy, r, r * .85), 14), m); g.add(c); }
  g.visible = false; cabin.add(g); puffs.push({ g, m, ph: i / 7 });
}

/* ============================================================ 小猫 */
const FUR = '#f2a24a', FUR_D = '#c9722a', CREAM = '#fff0d6', PINK = '#f6a7b3', INK = '#2b1b14';
const kitten = new THREE.Group(); cabin.add(kitten);
const K = {};   // 部件引用
{
  const ZS = 0.02;
  // 尾巴
  K.tail = new THREE.Group(); K.tail.position.set(0.17, 0.1, -0.02); kitten.add(K.tail);
  {
    const c = (t) => [0.34 * t + 0.1 * Math.sin(t * 3.1), 0.62 * t * t + 0.05 * t];
    const L = [], R = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, [x, y] = c(t), [x2, y2] = c(Math.min(1, t + 0.02)), [x1, y1] = c(Math.max(0, t - 0.02));
      let tx = x2 - x1, ty = y2 - y1; const n = Math.hypot(tx, ty); tx /= n; ty /= n;
      const w = 0.062 * (1 - 0.3 * t);
      L.push([x - ty * w, y + tx * w]); R.push([x + ty * w, y - tx * w]);
    }
    K.tail.add(cut(polyShape(L.concat(R.reverse())), FUR, 0, 0.025));
    const [tx, ty] = c(1); K.tail.add(cut(ellipseShape(tx, ty, 0.06, 0.06), FUR_D, 0.0, 0.03));
    for (const t of [0.35, 0.6, 0.8]) { const [sx, sy] = c(t); K.tail.add(cut(ellipseShape(sx, sy, 0.04, 0.04), FUR_D, 0.025, 0.01)); }
  }
  K.body = new THREE.Group(); kitten.add(K.body);
  K.body.add(cut(ellipseShape(0, 0.3, 0.25, 0.31), FUR, 0, 0.03));
  K.body.add(cut(ellipseShape(0, 0.22, 0.13, 0.2), CREAM, 0.03, 0.01));
  for (const sx of [-1, 1]) {
    K.body.add(cut(ellipseShape(sx * 0.13, 0.05, 0.1, 0.055), FUR, 0.03, 0.012));
    K.body.add(cut(ellipseShape(sx * 0.075, 0.17, 0.05, 0.15), CREAM, 0.04, 0.012));
    K.body.add(cut(ellipseShape(sx * 0.075, 0.035, 0.065, 0.04), CREAM, 0.052, 0.012));
    for (let i = 0; i < 2; i++) K.body.add(cut(polyShape([[sx * (0.17 + i * 0.03), 0.3 + i * 0.1], [sx * 0.26, 0.34 + i * 0.1], [sx * 0.17, 0.38 + i * 0.1]]), FUR_D, 0.03, 0.01));
  }
  // 头
  K.head = new THREE.Group(); K.head.position.set(0, 0.6, 0.0); kitten.add(K.head);
  K.earL = new THREE.Group(); K.earR = new THREE.Group(); K.head.add(K.earL, K.earR);
  for (const [g, sx] of [[K.earL, -1], [K.earR, 1]]) {
    g.position.set(sx * 0.15, 0.13, 0);
    g.add(cut(polyShape([[-sx * 0.09, -0.03], [sx * 0.07, 0.25], [sx * 0.11, -0.04]]), FUR, -0.01, 0.025));
    g.add(cut(polyShape([[-sx * 0.04, -0.0], [sx * 0.06, 0.17], [sx * 0.085, 0.0]]), PINK, 0.015, 0.01));
  }
  K.head.add(cut(ellipseShape(0, 0, 0.28, 0.23), FUR, 0.0, 0.035));
  for (const sx of [-1, 1]) K.head.add(cut(ellipseShape(sx * 0.15, -0.06, 0.1, 0.07), CREAM, 0.035, 0.01));
  K.head.add(cut(ellipseShape(0, -0.08, 0.09, 0.065), CREAM, 0.045, 0.01));
  for (const [dx, h] of [[0, .09], [-.07, .07], [.07, .07]]) K.head.add(cut(polyShape([[dx - .018, .2], [dx + .018, .2], [dx, .2 - h]]), FUR_D, 0.035, 0.01));
  K.head.add(cut(polyShape([[-0.028, -0.045], [0.028, -0.045], [0, -0.078]]), PINK, 0.056, 0.012));   // 鼻子
  K.mouth = new THREE.Group(); K.mouth.position.set(0, -0.125, 0.056); K.head.add(K.mouth);
  K.mouth.add(cut(ellipseShape(0, -0.03, 0.04, 0.05), '#7a2f3a', 0, 0.012));
  K.mouth.add(cut(ellipseShape(0, -0.055, 0.025, 0.02), PINK, 0.012, 0.006));
  K.mouthLine = cut(polyShape([[-0.05, -0.095], [0, -0.115], [0.05, -0.095], [0.0, -0.105]]), INK, 0.056, 0.008); K.head.add(K.mouthLine);
  K.eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.105, 0.015, 0.05); K.head.add(e);
    e.add(cut(ellipseShape(0, 0, 0.056, 0.07), INK, 0, 0.012));
    const iris = cut(ellipseShape(0, 0, 0.042, 0.055), '#79d36b', 0.012, 0.01); e.add(iris);
    e.add(cut(ellipseShape(0, 0, 0.022, 0.045), INK, 0.022, 0.01));
    e.add(cut(ellipseShape(0.016, 0.026, 0.014, 0.014), '#ffffff', 0.032, 0.008));
    K.eyes.push(e);
  }
  for (const sx of [-1, 1]) for (const [dy, rot] of [[0.02, 0.12], [-0.015, -0.02], [-0.05, -0.16]]) {
    const w = box(0.2, 0.006, 0.008, '#8a6a52', sx * 0.25, -0.075 + dy, 0.052); w.rotation.z = sx * rot; K.head.add(w);
  }
  // 小爱心（彩蛋）
  const hs = new THREE.Shape(); hs.moveTo(0, -0.5); hs.bezierCurveTo(-0.95, 0.05, -0.55, 0.75, 0, 0.3); hs.bezierCurveTo(0.55, 0.75, 0.95, 0.05, 0, -0.5);
  K.heart = cut(hs, '#ff6b8b', 0, 0.03); K.heart.scale.setScalar(0.17); K.heart.visible = false; K.heartG = new THREE.Group(); K.heartG.add(K.heart); kitten.add(K.heartG);
  K.eyeShine = [];
}
// Zzz
const zzz = [];
{
  const mk = () => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.font = `bold 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff4d8'; g.strokeStyle = '#6b4a8a'; g.lineWidth = 6;
    g.strokeText('z', 32, 34); g.fillText('z', 32, 34); return new THREE.CanvasTexture(c);
  };
  const tex = mk();
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; kitten.add(s); zzz.push({ s, ph: i / 3 }); }
}
kitten.scale.setScalar(0.9);
kitten.visible = false;
// v5：伸懒腰时抬起的前爪（平时隐藏）
K.paws = new THREE.Group(); kitten.add(K.paws);
for (const sx of [-1, 1]) {
  const g = new THREE.Group(); g.position.set(sx * 0.14, 0.42, 0.06);
  g.add(cut(ellipseShape(0, 0.1, 0.055, 0.13), FUR, 0, 0.02));
  g.add(cut(ellipseShape(0, 0.2, 0.07, 0.05), CREAM, 0.02, 0.012));
  for (const dx of [-0.035, 0, 0.035]) g.add(cut(ellipseShape(dx, 0.245, 0.018, 0.028), PINK, 0.03, 0.008));
  g.userData.sx = sx; K.paws.add(g);
}
K.paws.visible = false;

/* ============================================================ 小猫的行头 + 四季窗台道具 */
const accs = [];   // 春花 / 夏草帽 / 秋枫叶 / 冬围巾
{
  const sp = new THREE.Group(); sp.position.set(-0.17, 0.2, 0.045);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; sp.add(cut(ellipseShape(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.034, 0.034), '#ff9fb8', 0, 0.012)); }
  sp.add(cut(ellipseShape(0, 0, 0.026, 0.026), '#ffe27a', 0.012, 0.012));
  const su = new THREE.Group(); su.position.set(0, 0.18, 0.045);
  su.add(cut(ellipseShape(0, 0, 0.31, 0.05), '#e9c46a', 0, 0.02));
  su.add(cut(ellipseShape(0, 0.06, 0.15, 0.09), '#f2d684', 0.02, 0.02));
  su.add(cut(rectShape(-0.147, 0.02, 0.294, 0.035), '#e5533d', 0.042, 0.008));
  const au = new THREE.Group(); au.position.set(0.1, 0.2, 0.045); au.rotation.z = -0.5;
  au.add(cut(polyShape([[0, -0.06], [0.03, -0.02], [0.07, -0.04], [0.05, 0.02], [0.09, 0.05], [0.03, 0.05], [0, 0.1], [-0.03, 0.05], [-0.09, 0.05], [-0.05, 0.02], [-0.07, -0.04], [-0.03, -0.02]]), '#e0792a', 0, 0.012));
  au.add(cut(rectShape(-0.006, -0.1, 0.012, 0.06), '#8a4a1c', 0, 0.012));
  const wi = new THREE.Group(); wi.position.set(0, 0.41, 0.05);
  wi.add(cut(ellipseShape(0, 0, 0.2, 0.055), '#d6453d', 0, 0.025));
  wi.add(cut(polyShape([[0.07, -0.035], [0.19, -0.03], [0.21, -0.27], [0.09, -0.25]]), '#d6453d', 0.02, 0.02));
  wi.add(cut(rectShape(0.085, -0.16, 0.12, 0.03), '#fff0d6', 0.042, 0.008));
  wi.add(cut(rectShape(-0.12, -0.02, 0.03, 0.05), '#fff0d6', 0.026, 0.008)); wi.add(cut(rectShape(0.0, -0.025, 0.03, 0.05), '#fff0d6', 0.026, 0.008));
  K.head.add(sp, su, au); kitten.add(wi); accs.push(sp, su, au, wi);
  // 害羞/开心的腮红
  K.blush = [];
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.055, 0.032), 14), new THREE.MeshBasicMaterial({ color: '#ff6f8f', transparent: true, opacity: 0, depthWrite: false }));
    b.position.set(sx * 0.19, -0.045, 0.058); K.head.add(b); K.blush.push(b);
  }
}
const props = [];   // 窗台上的季节小物
{
  const mk = () => { const g = new THREE.Group(); g.position.set(1.24, SILL_TOP, 0.3); g.visible = false; cabin.add(g); props.push(g); return g; };
  const pot = mk();
  pot.add(cut(polyShape([[-0.07, 0], [0.07, 0], [0.09, 0.12], [-0.09, 0.12]]), '#c4673a', 0, 0.05));
  pot.add(cut(rectShape(-0.01, 0.12, 0.02, 0.15), '#4a9a58', 0.01, 0.02));
  pot.add(cut(ellipseShape(-0.05, 0.19, 0.05, 0.022), '#5cb86a', 0.01, 0.02));
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; pot.add(cut(ellipseShape(Math.cos(a) * 0.045, 0.31 + Math.sin(a) * 0.045, 0.034, 0.034), '#ff8fb0', 0.02, 0.015)); }
  pot.add(cut(ellipseShape(0, 0.31, 0.026, 0.026), '#ffe27a', 0.035, 0.012));
  const wm = mk();
  { const arc = (r, n = 18) => { const p = []; for (let i = 0; i <= n; i++) { const a = Math.PI + i / n * Math.PI; p.push([Math.cos(a) * r, 0.17 + Math.sin(a) * r]); } return p; };
    wm.add(cut(polyShape(arc(0.17)), '#3f9a45', 0, 0.05)); wm.add(cut(polyShape(arc(0.15)), '#f4f0d0', 0.05, 0.012)); wm.add(cut(polyShape(arc(0.135)), '#ff5d73', 0.062, 0.012));
    for (const [x, y] of [[-0.07, 0.11], [0.0, 0.07], [0.07, 0.11], [-0.03, 0.13], [0.04, 0.14]]) wm.add(cut(ellipseShape(x, y, 0.012, 0.02), '#2b1b14', 0.074, 0.006)); }
  const pk = mk();
  pk.add(cut(ellipseShape(0, 0.1, 0.15, 0.105), '#f08a2a', 0, 0.06));
  for (const sx of [-1, 1]) pk.add(cut(ellipseShape(sx * 0.075, 0.1, 0.05, 0.1), '#d97020', 0.06, 0.01));
  pk.add(cut(rectShape(-0.015, 0.19, 0.03, 0.06), '#6a8a3a', 0.02, 0.03));
  pk.add(cut(polyShape([[-0.07, 0.12], [-0.03, 0.12], [-0.05, 0.16]]), '#7a3a10', 0.072, 0.006)); pk.add(cut(polyShape([[0.03, 0.12], [0.07, 0.12], [0.05, 0.16]]), '#7a3a10', 0.072, 0.006));
  pk.add(cut(polyShape([[-0.06, 0.07], [0.06, 0.07], [0.03, 0.045], [-0.03, 0.045]]), '#7a3a10', 0.072, 0.006));
  const mug = mk();
  mug.add(cut(rectShape(-0.07, 0, 0.14, 0.16), '#f4efe4', 0, 0.06));
  { const s = ellipseShape(0.1, 0.085, 0.052, 0.052); const h = new THREE.Path(); h.absellipse(0.1, 0.085, 0.028, 0.028, 0, Math.PI * 2, true); s.holes.push(h); mug.add(cut(s, '#f4efe4', 0.01, 0.03)); }
  mug.add(cut(rectShape(-0.07, 0.05, 0.14, 0.035), '#d6453d', 0.06, 0.008));
  mug.add(cut(ellipseShape(0, 0.16, 0.07, 0.014), '#6b3a22', 0.03, 0.03));
  mug.userData.steam = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })); mug.add(s); mug.userData.steam.push({ s, ph: i / 3 }); }
}
// 秋：飘落的叶子（小猫会扑）
const kleaf = cut(polyShape([[0, -0.07], [0.035, -0.02], [0.08, -0.04], [0.055, 0.02], [0.1, 0.05], [0.035, 0.05], [0, 0.11], [-0.035, 0.05], [-0.1, 0.05], [-0.055, 0.02], [-0.08, -0.04], [-0.035, -0.02]]), '#e0792a', 0, 0.012);
kleaf.visible = false; cabin.add(kleaf);
// 春：蝴蝶
const bfly = new THREE.Group(); cabin.add(bfly); bfly.visible = false;
{
  bfly.userData.wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.add(cut(ellipseShape(sx * 0.06, 0.02, 0.07, 0.05), '#ffb3d9', 0, 0.01)); w.add(cut(ellipseShape(sx * 0.04, -0.035, 0.04, 0.035), '#a58bff', 0.01, 0.01)); bfly.add(w); bfly.userData.wings.push(w);
  }
  bfly.add(cut(ellipseShape(0, 0, 0.012, 0.05), '#4a3a5a', 0.02, 0.01));
}
// 屋顶积雪（冬）：每片屋顶上叠一层白卡纸，雪量随冬天"长"出来
const roofSnow = [];
for (const r of roofBoxes) { const s = box(r.geometry.parameters.width - 0.12, 0.08, 0.74, '#fbfdff', 0, 0.085, 0); r.add(s); roofSnow.push(s); }
{ const s = box(0.46, 0.07, 0.44, '#fbfdff', 0.78, 2.62, -0.18); popG.add(s); roofSnow.push(s); }
// 冒出的小爱心池（抚摸时）
const hearts = [];
{
  const hs = new THREE.Shape(); hs.moveTo(0, -0.5); hs.bezierCurveTo(-0.95, 0.05, -0.55, 0.75, 0, 0.3); hs.bezierCurveTo(0.55, 0.75, 0.95, 0.05, 0, -0.5);
  const geo = new THREE.ShapeGeometry(hs, 12);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff6b8b', transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); hearts.push({ m, t: 9, x: 0, y: 0, z: 0, vx: 0 }); }
}
// 缝里的眼睛（合上的书在偷看你）
const seamEyes = new THREE.Group(); seamEyes.visible = false; book.add(seamEyes);
seamEyes.userData.eyes = [];
{
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.33, 0, PH + 0.06);
    e.add(new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.17, 0.2), 20), new THREE.MeshBasicMaterial({ color: '#fff6dc', depthTest: false, transparent: true })));
    const ir = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.12, 0.15), 20), new THREE.MeshBasicMaterial({ color: '#79d36b', depthTest: false, transparent: true })); ir.position.z = 0.001; e.add(ir);
    const pu = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.05, 0.12), 16), new THREE.MeshBasicMaterial({ color: '#1b120d', depthTest: false, transparent: true })); pu.position.z = 0.002; e.add(pu);
    const hl = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0.04, 0.07, 0.03, 0.03), 10), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true })); hl.position.z = 0.003; e.add(hl);
    e.children.forEach((c) => { c.renderOrder = 20; });
    seamEyes.add(e); seamEyes.userData.eyes.push({ g: e, ir, pu, hl });
  }
}

/* ============================================================ 猫头鹰（站在右侧中排的树上） */
const owl = new THREE.Group(); owl.visible = false; scene.add(owl);
const O = { body: new THREE.Group(), eyes: [], pupils: [], state: 'perched', t: 0, away: 0, hootT: 6, blink: 3, p0: new THREE.Vector3(), p1: new THREE.Vector3(), perch: new THREE.Vector3(), flap: 0 };
{
  owl.add(O.body);
  const B = '#8d6b4b', BD = '#6e5036', BELLY = '#ead8b4';
  O.body.add(cut(ellipseShape(0, 0.24, 0.2, 0.27), B, 0, 0.04));
  O.body.add(cut(ellipseShape(0, 0.19, 0.125, 0.19), BELLY, 0.04, 0.01));
  for (const [x, y] of [[-0.04, 0.26], [0.04, 0.2], [-0.03, 0.14], [0.05, 0.12]]) O.body.add(cut(polyShape([[x - 0.03, y + 0.02], [x, y - 0.015], [x + 0.03, y + 0.02], [x, y]]), '#c9ad82', 0.05, 0.006));
  for (const sx of [-1, 1]) O.body.add(cut(polyShape([[sx * 0.07, 0.46], [sx * 0.18, 0.58], [sx * 0.16, 0.42]]), BD, 0.0, 0.04));
  O.body.add(cut(ellipseShape(0, 0.37, 0.2, 0.15), B, 0.04, 0.012));
  for (const sx of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.085, 0.37, 0.055); O.body.add(e);
    e.add(cut(ellipseShape(0, 0, 0.085, 0.085), '#fff3d0', 0, 0.012));
    const p = new THREE.Group(); p.add(cut(ellipseShape(0, 0, 0.05, 0.05), '#f0b43a', 0.012, 0.008), cut(ellipseShape(0, 0, 0.03, 0.03), '#1b120d', 0.02, 0.008), cut(ellipseShape(0.01, 0.015, 0.01, 0.01), '#fff', 0.028, 0.006)); e.add(p);
    O.eyes.push(e); O.pupils.push(p);
  }
  O.body.add(cut(polyShape([[-0.03, 0.335], [0.03, 0.335], [0, 0.27]]), '#f0a040', 0.062, 0.012));
  O.wings = [];
  for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.17, 0.3, 0.04); w.add(cut(ellipseShape(sx * 0.05, -0.12, 0.07, 0.19), BD, 0.01, 0.012)); O.body.add(w); O.wings.push(w); }
  owl.add(cut(rectShape(-0.32, -0.035, 0.64, 0.06), '#5a3b24', 0.0, 0.05));
  owl.userData.branch = true;
}
const owlTree = trees.find((t) => t.row === 'mid' && Math.abs(t.g.position.x - 2.6) < 0.01) || trees.find((t) => t.row === 'mid');

/* ============================================================ 粒子（花瓣 / 柳絮 / 落叶 / 雪） */
const PCFG = [
  { colors: ['#ffb8cc', '#ffd9e4', '#fff0f4'], size: 0.075, fall: 0.3, sway: 0.5, spin: 2.0, n: 70, up: false, round: false },
  { colors: ['#fffdf0', '#fff3b0', '#e8ffd0'], size: 0.04, fall: -0.07, sway: 0.4, spin: 1.0, n: 44, up: true, round: true },
  { colors: ['#e8742a', '#d9a21e', '#b8431f', '#f0b43a'], size: 0.13, fall: 0.55, sway: 1.0, spin: 4.0, n: 70, up: false, round: false },
  { colors: ['#ffffff', '#eaf3ff', '#ffffff'], size: 0.055, fall: 0.4, sway: 0.35, spin: 0.6, n: 120, up: false, round: true },
];
const NP = 120;
const pGeo = new THREE.ShapeGeometry(ellipseShape(0, 0, 0.5, 0.5), 8);
const pMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }), NP);
pMesh.frustumCulled = false; pMesh.renderOrder = 5; scene.add(pMesh);
const PA = [];
for (let i = 0; i < NP; i++) PA.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, ph: rnd() * 10, k: 0.8 + rnd() * 0.4, c: 0 });
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _col = new THREE.Color();
const groundY = (x, z) => (z < 2.15 ? 0.47 : (z < 4.4 && Math.abs(x) > 1.65 ? 0.36 : 0.03));
let partSeason = -1;
function spawnParticle(p, cfg, initial) {
  p.x = (rnd() - 0.5) * 9.2; p.z = 0.7 + rnd() * 4.8;
  p.y = cfg.up ? groundY(p.x, p.z) + 0.05 + rnd() * (initial ? 3.5 : 0.4) : (initial ? 0.3 + rnd() * 5 : 5.0 + rnd() * 1.2);
  p.vx = (rnd() - 0.5) * 0.2; p.vy = 0; p.vz = 0;
  p.rx = rnd() * 6; p.ry = rnd() * 6; p.rz = rnd() * 6;
}
function setParticleSeason(s) {
  partSeason = s; const cfg = PCFG[s];
  for (let i = 0; i < NP; i++) { spawnParticle(PA[i], cfg, true); PA[i].c = Math.floor(rnd() * cfg.colors.length); pMesh.setColorAt(i, _col.set(cfg.colors[PA[i].c])); }
  pMesh.instanceColor.needsUpdate = true;
}

/* ============================================================ 萤火虫 */
const flies = [];
for (let i = 0; i < 28; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#d8ff7a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(0.2 + rnd() * 0.14); s.visible = false; scene.add(s);
  flies.push({ s, x: (rnd() - .5) * 9, y: 0.5 + rnd() * 2.8, z: 0.8 + rnd() * 4.8, ph: rnd() * 10, sp: 0.3 + rnd() * 0.5, t0: 100 + rnd() * 18 });
}

/* ============================================================ 声音 / 存档 / UI */
const sound = new Sound();
sound.setMuted(store.muted);
const params = new URLSearchParams(location.search);
const ui = initUI({ SECRETS, SEASONS, store, sound });
const unlockAudio = () => { sound.unlock(); };
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlockAudio, { passive: true });

/* ============================================================ 四季：把已有纸张材质按季节重新调色（HSL） */
const SKY = [
  { day: '#f7d3c2', mid: '#eab0a0', night: '#1c2a5a', sun: '#fff0e4', sunI: 2.6, hemi: '#fff1ec' },   // 春：蜜桃粉
  { day: '#a9dcef', mid: '#f3c590', night: '#17305a', sun: '#fffbe0', sunI: 3.0, hemi: '#f4fbff' },   // 夏：晴空蓝
  { day: '#f5b982', mid: '#df8764', night: '#2a2147', sun: '#ffd8a6', sunI: 2.6, hemi: '#ffe9d0' },   // 秋：琥珀
  { day: '#d3e0ee', mid: '#c4a9bb', night: '#17264f', sun: '#e8f0ff', sunI: 2.3, hemi: '#eef4ff' },   // 冬：灰蓝
].map((o) => ({ day: new THREE.Color(o.day), mid: new THREE.Color(o.mid), night: new THREE.Color(o.night), sun: new THREE.Color(o.sun), sunI: o.sunI, hemi: new THREE.Color(o.hemi) }));
const hashOf = (hex) => { let h = 0; for (let i = 1; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) % 97; return h / 97; };
const _hsl = { h: 0, s: 0, l: 0 };
function seasonColor(hex, s) {
  const c = new THREE.Color(hex); c.getHSL(_hsl);
  const { h, s: sa, l } = _hsl;
  const green = h > 0.22 && h < 0.52 && sa > 0.1;
  if (!green) return c;
  const hs = hashOf(hex);
  if (s === 0) return c.setHSL(h + 0.012, sa * 0.9, Math.min(0.9, l + 0.035));
  if (s === 1) return c.setHSL(lerp(h, 0.33, 0.5), Math.min(1, sa * 1.12), l * 0.97);
  if (s === 2) {
    if (l > 0.5) return c.setHSL(0.14, 0.5, l * 0.93);                      // 草地：干草黄
    if (l > 0.3) return c.setHSL(0.02 + hs * 0.1, 0.72, l + 0.08);          // 树：橙红/金黄
    return c.setHSL(0.03 + hs * 0.05, 0.5, l + 0.02);                       // 深色松：赭红
  }
  if (l > 0.5) return c.setHSL(0.58, 0.28, 0.93 - (0.6 - l) * 0.12);        // 雪地
  if (l > 0.3) return c.setHSL(0.5, 0.22, lerp(l, 0.9, 0.35));              // 挂霜的树
  return c.setHSL(0.47, sa * 0.8, l + 0.05);
}
const seasonMats = [];
function initSeasonMats() {
  for (const m of matCache.values()) {
    const cols = [0, 1, 2, 3].map((s) => seasonColor(m.userData.orig, s));
    if (cols.some((c) => !c.equals(cols[0]))) seasonMats.push({ m, cols });
  }
}
const SEASON = { from: 0, to: 0, t: 1 };
const _tc = new THREE.Color();
function applySeasonColors() {
  const e = SEASON.t * SEASON.t * (3 - 2 * SEASON.t);
  for (const { m, cols } of seasonMats) m.color.lerpColors(cols[SEASON.from], cols[SEASON.to], e);
}
const flowerGroups = []; floorFace.children.forEach((c) => { if (c.isGroup) flowerGroups.push(c); });
let lastCoverSeason = -1;
/** 按 SEASON.t 更新道具/行头/花/粒子/封面；换季中途交叉淡入，合着时封面仍是旧季。 */
function applySeasonVisuals() {
  applySeasonColors();
  const from = SEASON.from, to = SEASON.to;
  const e = SEASON.t * SEASON.t * (3 - 2 * SEASON.t);
  const done = from === to || SEASON.t >= 0.999;
  if (done) {
    SEASON.t = 1; SEASON.from = to;
    accs.forEach((a, k) => { a.visible = k === to; });
    props.forEach((p, k) => { p.visible = k === to; });
    flowerGroups.forEach((f, k) => { f.visible = to <= 1 || (to === 2 && k % 3 === 0); });
    if (partSeason !== to) setParticleSeason(to);
    if (lastCoverSeason !== to) { drawCover(to, store.cycles, store.foundCount()); lastCoverSeason = to; }
    return;
  }
  accs.forEach((a, k) => { a.visible = (k === from && e < 0.72) || (k === to && e > 0.28); });
  props.forEach((p, k) => { p.visible = (k === from && e < 0.72) || (k === to && e > 0.28); });
  // 花：按加权偏向当前视觉季节
  const vis = e < 0.5 ? from : to;
  flowerGroups.forEach((f, k) => { f.visible = vis <= 1 || (vis === 2 && k % 3 === 0); });
  const partTarget = e < 0.38 ? from : to;
  if (partSeason !== partTarget) setParticleSeason(partTarget);
  const coverI = e < 0.82 ? from : to;
  if (lastCoverSeason !== coverI) { drawCover(coverI, store.cycles, store.foundCount()); lastCoverSeason = coverI; }
}
/** 某季节在当前 morph 中的权重（0..1），给蝴蝶/行为用。 */
function seasonWeight(s) {
  if (SEASON.from === SEASON.to || SEASON.t >= 1) return S.season === s ? 1 : 0;
  if (SEASON.to === s) return SEASON.t;
  if (SEASON.from === s) return 1 - SEASON.t;
  return 0;
}
function setSeason(i, instant = false) {
  if (!seasonMats.length) initSeasonMats();
  i = ((i % 4) + 4) % 4;
  if (instant) {
    SEASON.from = SEASON.to = i; SEASON.t = 1; S.seasonMorphSaid = false;
  } else {
    // v6：合上推进季节，但视觉停在 t=0；下次开盖用角度驱动 morph
    SEASON.from = SEASON.to; SEASON.to = i; SEASON.t = 0; S.seasonMorphSaid = false;
  }
  S.season = i;
  applySeasonVisuals();
}

/* ============================================================ 状态 */
const S = {
  target: 0, filtered: 0,
  hinge: new Spring(140, 0.6, 0),
  lit: new Spring(18, 1, 0), night: new Spring(10, 1, 0), moonUp: new Spring(24, 0.8, 0), sunU: new Spring(60, 0.5, 0), dayU: 0, tod: '',
  door: doorSpr, cabin: cabinSpr,
  peek: new Spring(80, 0.6, 0), hop: new Spring(70, 0.75, 0),
  egg: new Spring(140, 0.55, 0), sleepy: new Spring(22, 1, 0), yawn: 0, yawnT: 99,
  lastDir: 1, vel: 0, prevFiltered: 0, time: 0, sp: 0,
  eyeOpen: 0.4, blinkT: 3,
  season: 0,
  // 速度行为
  shy: 0, duck: 0, flutT: 0, flutCool: 0, startled: 0, burstT: 0, lastShake: -99,
  napP: 0, chaseP: 0, petE: 0, petT: 0, petDown: false, purring: false, napLock: 0,
  sw: { dir: 0, ext: 0, swings: [] },
  hold: { anchor: 0, t: 0, band: '', fired: false },
  act: { seam: false, nap: false, chase: false },
  armed: false, closing: false, closeMax: 0, ending: 0, slamT: 0,
  eggT: 0, lookX: 0, lookY: 0, mouseT: -99, mouseX: 0, mouseY: 0, hover: '', nudgeT: 0,
  run: { on: false, t0: 0, max: 0, bad: '', done: false, dur: 0 }, conP: 0, watchW: 0, noonW: 0, sneezeT: 0, sneezes: 0, sneezeSaid: false, sunsetT: 0, sunsetSaid: false, dawnW: 0, dawnHeld: false, dawnSaid: false, dawnPhase: 0, seasonMorphSaid: false,
  cap: '', capUntil: 0, kx: 0, kz: 1.5, kvx: 0, leafT: 0, flyAt: 0, prevHop: 0, prevPeek: 0, soundKick: 0, shakeN: 0,
};
const caption = document.getElementById('caption');
const captions = [
  [0, 15, '合上的书 · 一道暖光从缝里漏出来'],
  [15, 40, '地面折起 · 纸松树一排排立起来'],
  [40, 70, '小木屋翻身立起 · 窗亮了，烟囱冒烟'],
  [70, 100, '小猫探出头 · 蹲到窗台上，尾巴轻摆'],
  [100, 131, '月亮升起 · 星星和萤火虫出来了'],
];
let lastCap = '';
const say = (text, sec = 3) => { S.cap = text; S.capUntil = S.time + sec; };
function discover(id) {
  if (store.addSecret(id)) { sound.chime(); ui.found(id); drawCover(S.season, store.cycles, store.foundCount()); return true; }
  return false;
}

const lightTmp = new THREE.Color(), lightTmp2 = new THREE.Color();
const glassOff = new THREE.Color('#7f8f9a'), glassOn = new THREE.Color('#ffd37a');
const hemiGndDay = new THREE.Color('#7a6a5a'), hemiGndNight = new THREE.Color('#2b2f4a');
const sunNight = new THREE.Color('#9fb4ff'), hemiSkyNight = new THREE.Color('#5b6fb5');
const tmpC = new THREE.Color();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const smooth = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

// 纸片被盖页顶住：站起来的角度 φ 不能让顶端穿过盖页（盖页平面 y = lidY + z·tanθ）。
const _b = new THREE.Vector3();
function erect(q, obj, h, th, tanTh, lidY) {
  const want = Math.max(0, q) * Math.PI / 2;
  if (th >= 1.5) return want;
  obj.getWorldPosition(_b);
  let phi = Math.min(want, Math.PI / 2);
  for (; phi > 0; phi -= 0.04) {
    const ty = _b.y + h * Math.sin(phi) + 0.1, tz = _b.z + h * Math.cos(phi);
    if (ty < lidY + tz * tanTh) break;
  }
  phi = Math.max(0, phi);
  return want > Math.PI / 2 ? phi + (want - Math.PI / 2) : Math.min(phi, want);
}

function spawnHeart(x, y, z) {
  const h = hearts.find((q) => q.t >= 1.4) || hearts[0];
  h.t = 0; h.x = x; h.y = y; h.z = z; h.vx = (Math.random() - 0.5) * 0.3; h.m.visible = true;
}
function shakeBurst() {
  S.burstT = 2.6;
  for (let i = 0; i < NP; i++) {
    const t = trees[(Math.random() * trees.length) | 0], p = PA[i];
    t.g.getWorldPosition(_v); p.x = _v.x + (Math.random() - 0.5) * 0.7; p.y = _v.y + t.h * (0.45 + Math.random() * 0.4); p.z = _v.z + 0.15 + Math.random() * 0.3;
    p.vx = (Math.random() - 0.5) * 1.6; p.vy = -Math.random() * 0.8; p.vz = Math.random() * 0.6;
  }
  for (const t of trees) t.sw.v += (Math.random() - 0.5) * 6;
}
function startleOwl(real) {
  if (O.state !== 'perched' || !owl.visible) return false;
  O.state = 'out'; O.t = 0; O.p0.copy(owl.position); O.p1.set(8.5, 7.5, 3.4); sound.flap();
  if (real) discover('owl');
  return true;
}

/* ============================================================ 每帧更新 */
function update(dt) {
  S.time += dt; const T = S.time;
  // --- 输入：低通 + 速度 ---
  const a = clamp(S.target, 0, MAX_ANGLE);
  S.filtered += (a - S.filtered) * (1 - Math.exp(-dt / 0.035));
  const v = (S.filtered - S.prevFiltered) / Math.max(dt, 1e-4); S.prevFiltered = S.filtered;
  S.vel += (v - S.vel) * (1 - Math.exp(-dt / 0.12));
  S.sp += (Math.abs(S.vel) - S.sp) * (1 - Math.exp(-dt / 0.2));
  const A = S.filtered;
  if (S.vel > 6) { if (S.lastDir < 0) S.yawnT = 99; S.lastDir = 1; }
  else if (S.vel < -6) { if (S.lastDir > 0) S.yawnT = 0; S.lastDir = -1; }
  if (S.yawnT < 99) S.yawnT += dt;
  const sp = S.sp;

  // --- 摇晃检测：幅度 > 1.6° 的往返 ≥ 4 次、1.6 秒内 ---
  {
    const w = S.sw, d = S.filtered - (S._pf ?? S.filtered); S._pf = S.filtered;
    if (Math.abs(d) > 0.02) {
      const dn = d > 0 ? 1 : -1;
      if (dn !== w.dir) { if (w.dir !== 0 && Math.abs(w.ext - (S.filtered - d)) > 1.6) w.swings.push(T); w.ext = S.filtered - d; w.dir = dn; }
    }
    while (w.swings.length && T - w.swings[0] > 1.6) w.swings.shift();
    if (w.swings.length >= 4 && T - S.lastShake > 2.6 && A > 22) {
      S.lastShake = T; w.swings.length = 0; S.shakeN++;
      shakeBurst(); sound.shake(S.season); say(['哗啦——花瓣全抖落下来了', '哗啦——叶子和柳絮漫天都是', '哗啦——一场叶子雨', '哗啦——树上的雪全抖下来了'][S.season], 3.2);
      discover('shake');
    }
  }
  S.burstT = Math.max(0, S.burstT - dt);

  // --- 开得太猛：纸张抖动 + 猫头鹰受惊 ---
  S.flutCool -= dt;
  if (S.lastDir > 0 && sp > TUNING.fastAbove && A > 14 && A < 126 && S.flutCool <= 0) {
    S.flutCool = 3; S.flutT = 1.3; S.startled = 1;
    for (const t of trees) t.sw.v += (Math.random() - 0.5) * 4;
    if (A > 46) startleOwl(true); else S.owlPend = 1.4;
    say('纸张被你翻得哗啦啦直抖', 2.2);
  }
  if (S.owlPend > 0) { S.owlPend -= dt; if (A > 46 && owl.visible && startleOwl(true)) S.owlPend = 0; }
  S.flutT = Math.max(0, S.flutT - dt); S.startled = Math.max(0, S.startled - dt * 0.7);
  const flut = clamp(S.flutT / 1.3, 0, 1);

  // --- 弹簧 ---
  const idle = 0.35 * Math.sin(T * 1.3) * sstep(5, 20, A);
  const hingeA = S.hinge.step(A, dt) + idle + flut * 0.9 * Math.sin(T * 31) + flut * 0.5 * Math.sin(T * 17.3);
  const nightP = S.night.step(sstep(100, 126, A), dt);
  const moonP = S.moonUp.step(sstep(100, 118, A), dt);
  const litP = S.lit.step(sstep(42, 55, A), dt);   // v5：提前亮窗，清晨窗后剪影才看得见
  const doorP = S.door.step(sstep(68, 77, A), dt);
  const cabinP = S.cabin.step(sstep(34, 52, A), dt);

  // 慢慢打开 -> 害羞；duck：中途加快，缩回去
  const shyTarget = (S.lastDir > 0 && A > 66 && A < 108 && sp < TUNING.shyBelow) ? 1 : 0;
  S.shy = smooth(S.shy, shyTarget, dt, shyTarget ? 0.6 : 0.35);
  S.duck = smooth(S.duck, (S.shy > 0.4 && sp > 40) ? 1 : 0, dt, 0.25);
  const peekP = S.peek.step(sstep(76, 90, A) * (1 - 0.55 * S.duck), dt);
  const hopP = S.hop.step(sstep(91 + 10 * S.shy, 100 + 12 * S.shy, A), dt);
  const eggP = S.egg.step(1 - sstep(3, 6.5, Math.abs(A - 90)), dt);
  if (eggP > 0.9 && S.lastDir !== 0) S.eggT += dt; else S.eggT = 0;
  if (S.eggT > 0.5) discover('heart');
  const kittenAwake = A > 76;
  const sleepWant = (S.lastDir < 0 && kittenAwake && eggP < 0.2 && T - S.lastShake > 3) ? 1 : 0;
  const sleepyP = S.sleepy.step(sleepWant, dt);

  // --- 停住不动：隐藏剧情 ---
  {
    const H = S.hold;
    if (Math.abs(A - H.anchor) > TUNING.holdTol) {
      H.anchor = A; H.t = 0; H.fired = false;
    } else H.t += dt;
    const dawnBand = H.anchor >= TUNING.dawnLo && H.anchor <= TUNING.dawnHi && cabinP > 0.55 && peekP < 0.12;
    H.band = (H.anchor > 4 && H.anchor < 16) ? 'seam' : dawnBand ? 'dawn' : (H.anchor > 52 && H.anchor < 72 && cabinP > 0.9) ? 'nap' : (H.anchor > 109 && H.anchor < 124) ? 'chase' : '';
    const holdNeed = H.band === 'dawn' ? TUNING.dawnHold : TUNING.holdSeconds;
    const ring = H.band && !H.fired && H.t > 0.7 ? clamp((H.t - 0.7) / Math.max(0.4, holdNeed - 0.7), 0, 1) : -1;
    ui.setRing(ring);
    if (H.band && !H.fired && H.t >= holdNeed) {
      H.fired = true;
      if (H.band === 'dawn') {
        S.dawnHeld = true;
        // v6：换季 morph 进行中时把字幕让给「春 → 夏 · 换季了」，天亮伸懒腰下一轮再说
        if (!S.dawnSaid && !(SEASON.t < 1 && SEASON.from !== SEASON.to)) {
          S.dawnSaid = true; say('清晨 · 窗边伸了个懒腰', 3.5); sound.mew();
        }
      } else {
        S.act[H.band] = true;
        if (H.band === 'seam') { discover('seam'); sound.mew(); say('缝里有一双眼睛，在偷看你…', 4); }
        if (H.band === 'nap') { discover('nap'); say('小猫趁你不动，爬上屋顶靠着烟囱睡着了 · Zzz', 5); sound.purr(true); S.purring = true; }
        if (H.band === 'chase') { discover('chase'); say('小猫跳下窗台，追着萤火虫跑！', 5); sound.meow(1.2, 0.4, 0.35); }
      }
    }
    if (S.act.seam && !(A > 2.5 && A < 18)) S.act.seam = false;
    if (S.act.nap && !(A > 47 && A < 76) ) { S.act.nap = false; if (S.purring && !S.petDown) { sound.purr(false); S.purring = false; } }
    if (S.act.chase && !(A > 96 && A < 131)) S.act.chase = false;
  }

  // --- v4：陪它过完一整天（从缝隙一路慢慢开到天黑，中途不回头、不猛开） ---
  {
    const R = S.run;
    if (A < TUNING.dayStart) { R.on = true; R.t0 = T; R.max = A; R.bad = ''; R.done = false; S.sunsetSaid = false; S.sneezeSaid = false; S.dawnSaid = false; S.dawnHeld = false; }
    else if (R.on && !R.done) {
      if (A > R.max) R.max = A;
      if (A < R.max - TUNING.dayBackTol) R.bad = 'back';
      if (S.sp > TUNING.fastAbove) R.bad = 'fast';
      if (A >= TUNING.dayEnd) {
        R.done = true; R.dur = T - R.t0;
        if (!R.bad && R.dur >= TUNING.daySeconds) {
          const first = discover('fullday');
          S.conBurst = 1;
          say(first ? '你陪小猫慢慢过完了一整天——天上多了一只猫' : '又是完整的一天 · 猫座在等你', 5);
        } else if (!R.bad && R.dur >= TUNING.daySeconds * 0.45) say('这一天…过得有点快', 2.6);
      }
    }
    if (S.conBurst > 0) S.conBurst = Math.max(0, S.conBurst - dt / 6);
    if (S.napLock > 0) { S.napLock -= dt; }
  }

  // --- 盖页 ---
  const th = hingeA * Math.PI / 180;
  const lidY = 0.85 * (1 - sstep(0, 40, A));
  hinge.position.y = lidY; hinge.rotation.x = -th;

  // --- 暖光缝 + 缝里的眼睛 ---
  const seam = 1 - sstep(10, 22, A);
  seamGlow.material.opacity = 0.95 * seam; seamLine.material.opacity = 0.9 * seam;
  const gapH = lidY + 0.14; seamGlow.scale.y = gapH * 1.5 + 0.3; seamGlow.position.y = gapH * 0.5;
  seamLine.scale.y = 0.8 + gapH * 3; seamLine.position.y = gapH * 0.5;
  seamLight.intensity = 14 * seam * (0.92 + 0.08 * Math.sin(T * 7));
  S.seamEye = smooth(S.seamEye || 0, S.act.seam ? 1 : 0, dt, 0.5);
  seamEyes.visible = S.seamEye > 0.02 && gapH > 0.3;
  if (seamEyes.visible) {
    seamEyes.position.y = gapH * 0.5; const sc = clamp((gapH - 0.1) / 0.55, 0.25, 1.1); seamEyes.scale.setScalar(sc * (0.6 + 0.4 * S.seamEye));
    const bl = (T % 3.7) < 0.12 ? 0.1 : 1, lx = Math.sin(T * 0.9) * 0.55 + Math.sin(T * 2.3) * 0.25, ly = Math.sin(T * 0.7 + 1) * 0.3;
    for (const e of seamEyes.userData.eyes) { e.g.scale.set(1, Math.max(0.08, bl), 1); e.ir.position.set(lx * 0.035, ly * 0.04, 0.001); e.pu.position.set(lx * 0.05, ly * 0.05, 0.002); e.hl.position.set(0.04 + lx * 0.03, 0.07 + ly * 0.03, 0.003); }
    for (const e of seamEyes.userData.eyes) for (const c of e.g.children) c.material.opacity = S.seamEye;
  }

  // --- 季节配色 / 灯光（日 -> 夜）；v6：合上后的换季由开盖角度驱动，合着时不跑完 ---
  if (SEASON.t < 1) {
    const lo = TUNING.seasonMorphLo, hi = TUNING.seasonMorphHi;
    if (A >= lo) {
      const p = clamp((A - lo) / Math.max(1e-3, hi - lo), 0, 1);
      if (p > SEASON.t) { SEASON.t = p; applySeasonVisuals(); }
      if (!S.seasonMorphSaid && SEASON.from !== SEASON.to) {
        S.seasonMorphSaid = true;
        say(`${SEASONS[SEASON.from].name} → ${SEASONS[SEASON.to].name} · 换季了`, 4.2);
      }
    }
  }
  const SK = SKY[SEASON.to], SF = SKY[SEASON.from], se = SEASON.t;
  const mixC = (key, out) => out.lerpColors(SF[key], SK[key], se);
  // v3：太阳沿弧线走（带一点纸片过冲），光的方向、颜色、强度都跟着它
  const dayRaw = clamp((A - SUN_ARC.a0) / (SUN_ARC.a1 - SUN_ARC.a0), -0.08, 1.08);
  const sunU = S.sunU.step(dayRaw, dt); S.dayU = sunU;
  const uc = clamp(sunU, 0, 1), elev = Math.sin(Math.PI * uc);
  sunAt(sunU, _v2); paperSun.position.copy(_v2);
  paperSun.visible = A > SUN_ARC.a0 - 4 && sunU < 1.07;
  paperSun.rotation.z = -T * 0.08 - sunU * 2.2;
  paperSun.userData.face.rotation.z = -paperSun.rotation.z;                       // 脸保持朝上
  paperSun.userData.face.scale.y = lerp(1, 0.55, sstep(0.75, 1, uc));              // 傍晚眯眼
  sunSlot.visible = A > SUN_ARC.a0 - 6; sunSlot.userData.mat.opacity = 0.1 * (1 - nightP);
  const dawnP = (1 - sstep(0.05, 0.38, uc)) * sstep(SUN_ARC.a0 - 2, SUN_ARC.a0 + 6, A);
  const goldP = sstep(0.62, 0.97, uc) * (1 - nightP);
  const lowP = Math.max(dawnP, goldP);
  // 平行光：从太阳那一侧照过来；太阳低 → 光低 → 影子长；夜里换成右上的月光
  const slx = lerp(13 * Math.cos(Math.PI * uc), 7, nightP), sly = lerp(3.5 + 13 * elev, 13, nightP);
  sun.position.set(slx, sly, 11);
  sun.intensity = lerp(lerp(SF.sunI, SK.sunI, se) * (0.62 + 0.38 * elev), 1.3, nightP);
  mixC('sun', lightTmp); lightTmp.lerp(SUN_LOW, 0.75 * lowP); sun.color.lerpColors(lightTmp, sunNight, nightP);
  hemi.intensity = lerp(1.5 - 0.25 * lowP, 1.05, nightP); mixC('hemi', lightTmp); hemi.color.lerpColors(lightTmp, hemiSkyNight, nightP); hemi.groundColor.lerpColors(hemiGndDay, hemiGndNight, nightP);
  mixC('day', lightTmp); lightTmp.lerp(DAWN_SKY, 0.7 * dawnP); mixC('mid', lightTmp2); tmpC.lerpColors(lightTmp, lightTmp2, goldP);
  mixC('night', lightTmp2); skyMat.color.lerpColors(tmpC, lightTmp2, nightP);
  horizonMat.color.lerpColors(DAWN_GLOW, DUSK_GLOW, sstep(0.3, 0.7, uc));
  horizonMat.opacity = Math.max(0.55 * dawnP, 0.85 * goldP) * (1 - nightP);
  paperSun.userData.halo.material.opacity = 0.32 + 0.3 * lowP;
  S.dayC = uc; S.goldP = goldP; S.nightP = nightP;
  S.tod = nightP > 0.5 ? '夜' : (A < SUN_ARC.a0 ? '' : TIMES.filter(([u0]) => uc >= u0).pop()[1]);
  scene.background.set('#2a211b').lerp(tmpC.set('#10162b'), nightP * 0.6);

  // --- 折叠台阶 / 树 ---
  for (const t of terraces) {
    const p = t.spr.step(sstep(t.t0, t.t1, A), dt);
    t.g.visible = p > 0.002;
    const r = -(1 - p) * Math.PI / 2;
    t.riser.rotation.x = r; t.top.rotation.x = r;
  }
  scene.updateMatrixWorld();
  const tanTh = Math.tan(Math.min(th, 1.5));
  for (const t of trees) {
    const q = t.spr.step(sstep(t.t0, t.t0 + 8, A), dt);
    const phi = erect(q, t.g, t.h, th, tanTh, lidY);
    t.phi = phi; t.q = q;
    t.g.visible = q > 0.002;
    t.g.rotation.x = Math.PI / 2 - phi;
    t.g.rotation.z = Math.sin(T * 0.9 + t.ph) * 0.012 * clamp(q, 0, 1) + t.sw.step(0, dt) * 0.05 * clamp(q, 0, 1) + flut * 0.03 * Math.sin(T * 19 + t.ph * 3);
  }

  // --- 木屋 ---
  const cabinPhi = erect(cabinP, cabin, 2.7, th, tanTh, lidY);
  const cabinE = cabinPhi / (Math.PI / 2);
  cabin.visible = cabinP > 0.002;
  cabin.rotation.x = Math.PI / 2 - cabinPhi;
  popG.scale.z = Math.max(0.001, sstep(0.55, 0.95, cabinE));           // 立体件随站起来再"鼓"出来
  glassMat.color.lerpColors(glassOff, glassOn, litP);
  // v5：清晨窗后伸懒腰时玻璃更透、窗光更暖，剪影才读得出来
  const dawnGlow = S.dawnW || 0;
  glassMat.opacity = lerp(0.82, 0.28, Math.max(litP * 0.65, dawnGlow));
  winGlow.material.opacity = (litP * (0.42 + 0.35 * nightP) + 0.38 * dawnGlow) * (0.95 + 0.05 * Math.sin(T * 9));
  windowLight.intensity = litP * (1.2 + 2.2 * nightP) + 1.4 * dawnGlow;
  cabin.localToWorld(_v.set(SILL_X, 1.1, 1.6)); windowLight.position.copy(_v);
  doorPivot.rotation.y = -doorP * 1.95;
  puffs.forEach((p, i) => {
    const ph = ((T * 0.22 + p.ph) % 1);
    p.g.visible = cabinE > 0.9 && litP > 0.05;
    p.g.position.set(0.78 + 0.18 * ph + 0.06 * Math.sin(T * 1.7 + i * 2), 2.62 + ph * 1.5, -0.12);
    const s = 0.5 + ph * 1.5; p.g.scale.set(s, s, 1);
    p.g.rotation.z = ph * 1.2 + i;
    p.m.opacity = 0.9 * Math.sin(Math.PI * ph) * clamp((litP - 0.05) * 4, 0, 1);
  });
  // 冬天屋顶积雪慢慢长出来
  const snowK = SEASON.to === 3 ? SEASON.t : (SEASON.from === 3 ? 1 - SEASON.t : 0);
  for (const s of roofSnow) { s.userData.y0 ??= s.position.y; s.visible = snowK > 0.01; s.scale.y = Math.max(0.01, snowK); s.position.y = s.userData.y0 - 0.04 * (1 - snowK); }

  // --- 鼠标：猫的视线 ---
  const mouseLook = T - S.mouseT < 4;

  // --- 活动状态 ---
  S.napP = clamp(S.napP + dt / 0.9 * ((S.act.nap && S.napLock <= 0 && cabinE > 0.9) ? 1 : -1), 0, 1);
  S.chaseP = clamp(S.chaseP + dt / 1.1 * ((S.act.chase && hopP > 0.95) ? 1 : -1), 0, 1);
  if (S.napP < 0.01 && !S.act.nap && S.purring && !S.petDown) { sound.purr(false); S.purring = false; }
  S.petE = smooth(S.petE, S.petDown ? 1 : 0, dt, S.petDown ? 0.2 : 0.8);

  // --- 小猫 ---
  const napE = S.napP * S.napP * (3 - 2 * S.napP), chE = S.chaseP * S.chaseP * (3 - 2 * S.chaseP);
  const baseVis = peekP > 0.003 && cabinE > 0.5 && S.napP < 0.004;
  const napVis = S.napP > 0.004 && cabinE > 0.8;
  // v5：清晨/上午早段、门探头之前——窗后伸懒腰（不跟正午喷嚏/黄昏看日落抢优先级）
  const dawnWant = cabinE > 0.55 && A >= TUNING.dawnLo && A <= TUNING.dawnHi && peekP < 0.1 && hopP < 0.05 && !napVis;
  S.dawnW = smooth(S.dawnW, dawnWant ? 1 : 0, dt, dawnWant ? 0.45 : 0.35);
  const dawnVis = S.dawnW > 0.04;
  const showK = baseVis || napVis || dawnVis;
  kitten.visible = showK;
  const seasonI = (SEASON.t < 0.5 ? SEASON.from : SEASON.to);
  let lx = 0, ly = 0, pounce = 0, lick = 0, shiver = 0;
  if (showK) {
    const sleepish = Math.max(sleepyP, napE);
    let px, py, pz, sxs, sys, rz = 0, ry = 0;
    if (napVis) {
      px = lerp(0.36, 0.4, napE); py = lerp(1.65, 2.5, napE); pz = lerp(-0.55, 0.12, napE);
      sxs = sys = 0.5; rz = -0.5 * napE; K.head.rotation.x = 0;
      K.paws.visible = false;
    } else if (dawnVis && peekP < 0.35) {
      // 窗后：剪影在玻璃里，循环伸懒腰（前爪上抬 / 弓背 / 眯眼打哈欠）
      const ph = (T * 0.32) % 1; S.dawnPhase = ph;
      const up = Math.sin(Math.PI * clamp((ph - 0.12) / 0.38, 0, 1));           // 抬起
      const hold = clamp((ph - 0.42) / 0.18, 0, 1) * (1 - clamp((ph - 0.68) / 0.22, 0, 1)); // 顶峰停一下
      const stretch = Math.max(up, hold);
      S.dawnStretch = stretch;
      const winCx = SILL_X, winCy = (WIN.y0 + WIN.y1) / 2;
      px = winCx; py = WIN.y0 - 0.04 + 0.08 * stretch; pz = -0.05;  // 贴着玻璃内侧，橘毛透过暖光能看清
      sxs = 0.72 * (1 - 0.1 * stretch); sys = 0.72 * (1 + 0.38 * stretch); rz = -0.12 * stretch;
      lx = 0.1 * Math.sin(T * 0.7); ly = 0.45 + 0.35 * stretch;   // 懒洋洋抬头
      K.paws.visible = true;
      K.paws.children.forEach((g, i) => {
        const sx = g.userData.sx;
        g.position.set(sx * (0.1 + 0.04 * stretch), 0.42 + 0.32 * stretch, 0.08);
        g.rotation.z = sx * (-1.15 - 0.55 * stretch);
        g.rotation.x = -0.55 * stretch;
        g.scale.setScalar(1.05 + 0.25 * stretch);
      });
    } else {
      K.paws.visible = false; S.dawnStretch = 0;
      const u = clamp(hopP, 0, 1.06), uc = clamp(u, 0, 1);
      const e = uc * uc * (3 - 2 * uc);
      px = lerp(-0.4, SILL_X, e); pz = -0.15 + 0.5 * sstep(0, 0.28, uc);
      py = lerp(-0.72, 0, clamp(peekP, 0, 1.08)) + SILL_TOP * e + 0.5 * Math.sin(Math.PI * uc) * (uc > 0 && uc < 1 ? 1 : 0);
      const air = Math.sin(Math.PI * uc);
      sxs = 0.9 * (1 - 0.1 * air); sys = 0.9 * (1 + 0.16 * air);
      rz = (uc < 1 ? 0.35 * Math.sin(Math.PI * uc) * (1 - 2 * uc) : 0);
      // 害羞：只露半张脸，缩在门后，偶尔偷瞄
      if (S.shy > 0.01) { px -= 0.14 * S.shy * (1 - uc); py -= 0.1 * S.shy * (1 - uc); }
      // 惊吓：整只弹起来
      py += S.startled * 0.2 * Math.abs(Math.sin(T * 14)) * uc; sys *= 1 + 0.06 * S.startled;
      // 季节活动（蹲在窗台上时）
      const onSill = uc > 0.98 ? 1 : 0;
      if (onSill && S.chaseP < 0.01) {
        if (seasonI === 2) {      // 秋：扑落叶
          S.leafT = (S.leafT || 0) + dt; const lu = (S.leafT % 7.5) / 7.5;
          pounce = Math.sin(Math.PI * clamp((lu - 0.6) / 0.2, 0, 1)); kleaf.visible = lu < 0.78;
          const ly0 = lerp(2.5, 0.95, clamp(lu / 0.72, 0, 1)); kleaf.position.set(0.55 + 0.28 * Math.sin(lu * 15) * (1 - lu * 0.6), ly0, 0.45);
          kleaf.rotation.set(0.3 * Math.sin(lu * 9), 0.9 * Math.sin(lu * 11), lu * 14);
          lx = clamp((kleaf.position.x - px) * 1.5, -1, 1); ly = clamp((kleaf.position.y - (py + 0.5)) * 0.9, -1, 1);
        } else kleaf.visible = false;
        if (seasonI === 0) {      // 春：目光追着蝴蝶
          lx = clamp((bfly.position.x - px) * 1.3, -1, 1); ly = clamp((bfly.position.y - (py + 0.55)) * 1.0, -1, 1);
        }
        if (seasonI === 1) {      // 夏：啃西瓜（头往西瓜那边低下去）
          const c = (T % 8) / 8; lick = c > 0.55 && c < 0.85 ? Math.sin(Math.PI * (c - 0.55) / 0.3) : 0;
          lx = 0.3 + 0.5 * lick; ly = -0.5 * lick;
        }
        if (seasonI === 3) {      // 冬：偶尔抖一抖，看向热可可
          shiver = (T % 9) > 7 ? 1 : 0; lx = 0.4; ly = -0.3 + 0.3 * Math.sin(T * 0.5);
        }
      } else kleaf.visible = false;
      py += pounce * 0.22; sys *= 1 + 0.1 * pounce; sxs *= 1 - 0.05 * pounce;
      // 追萤火虫：从窗台跳下地面
      if (chE > 0.002) {
        const f = flies[0];
        S.flyAt += dt;
        const fx = 1.9 * Math.sin(S.flyAt * 0.55) - 0.1, fz = 1.55 + 0.65 * Math.sin(S.flyAt * 0.37 + 1.0), fy = 0.55 + 0.3 * Math.sin(S.flyAt * 1.7);
        S.fx = fx; S.fz = fz; S.fy = fy;
        const prevx = S.kx; S.kx = smooth(S.kx || fx, fx, dt, 0.7); S.kz = smooth(S.kz, fz + 0.15, dt, 0.8);
        const mv = (S.kx - prevx) / Math.max(dt, 1e-4); S.kvx = smooth(S.kvx, mv, dt, 0.2);
        const hopB = Math.abs(Math.sin(T * 7.5)) * 0.12 * clamp(Math.abs(S.kvx) * 1.2, 0.2, 1) + Math.pow(Math.max(0, Math.sin(T * 1.2)), 10) * 0.45;
        const gx = S.kx, gy = 0 + hopB, gz = S.kz;
        const arc = Math.sin(Math.PI * chE) * 0.9;
        px = lerp(px, gx, chE); py = lerp(py, gy, chE) + arc; pz = lerp(pz, gz, chE);
        sxs *= lerp(1, 0.78, chE); sys *= lerp(1, 0.78, chE);
        ry = clamp(S.kvx * 0.35, -0.5, 0.5) * chE; rz += clamp(-S.kvx * 0.12, -0.25, 0.25) * chE;
        lx = lerp(lx, clamp((fx - S.kx) * 1.4, -1, 1), chE); ly = lerp(ly, clamp((fy - 0.6 - gy) * 1.2, -1, 1), chE);
      }
      // v4：小猫的一天——黄昏转头看太阳落山，夜里看月亮
      const watchT = (peekP > 0.6 && chE < 0.1 && ((goldP > 0.35 && paperSun.visible) || (nightP > 0.5 && moon.visible))) ? 1 : 0;
      S.watchW = smooth(S.watchW, watchT, dt, 0.5);
      if (S.watchW > 0.01) {
        (nightP > 0.5 ? moon : paperSun).getWorldPosition(_v2); _v2.project(camera);
        K.head.getWorldPosition(_v).project(camera);
        const wx = clamp((_v2.x - _v.x) * 2.2, -1, 1), wy = clamp((_v2.y - _v.y) * 1.6, -1, 1);
        lx = lerp(lx, wx, S.watchW); ly = lerp(ly, wy, S.watchW);
      }
      if (watchT && goldP > 0.35) { S.sunsetT += dt; if (S.sunsetT > 2 && !S.sunsetSaid) { S.sunsetSaid = true; say('黄昏 · 小猫转过头，静静看着太阳落山', 3.5); } } else S.sunsetT = 0;
    }
    // 鼠标视线（有人在晃鼠标时，猫看你）；害羞时偶尔别开脸
    if (mouseLook && !napVis && chE < 0.5) {
      K.head.getWorldPosition(_v).project(camera);
      lx = clamp((S.mouseX - _v.x) * 2.4, -1, 1); ly = clamp((S.mouseY - _v.y) * 2.4, -1, 1);
      if (S.shy > 0.5) { const away = Math.sin(T * 0.8) > 0.55; if (away) { lx = -0.8; ly = -0.2; } }
    } else if (S.shy > 0.5 && !napVis && S.watchW < 0.5) { lx = Math.sin(T * 0.8) > 0.6 ? -0.8 : 0.5; }
    kitten.position.set(px, py, pz);
    kitten.scale.set(sxs, sys, Math.min(sxs, sys)); kitten.rotation.z = rz + (shiver ? 0.012 * Math.sin(T * 48) : 0); kitten.rotation.y = ry;
    S.lookX = smooth(S.lookX, napVis ? 0 : lx, dt, 0.12); S.lookY = smooth(S.lookY, napVis ? 0 : ly, dt, 0.12);
    // 呼吸 + 探头左右歪
    const peeking = peekP * (1 - hopP);
    K.body.scale.y = 1 + 0.02 * Math.sin(T * 2.1);
    K.head.position.y = 0.6 + 0.008 * Math.sin(T * 2.1 + 0.6) - 0.06 * sleepish;
    K.head.rotation.z = 0.16 * Math.sin(T * 1.6) * peeking + sleepish * 0.3 * Math.sin(T * 0.6) * 0.3 + sleepish * 0.28 - 0.25 * lick - 0.12 * pounce + S.petE * 0.18 * Math.sin(T * 5);
    K.head.rotation.y = S.lookX * 0.35; K.head.rotation.x = napVis ? 0.1 : -S.lookY * 0.2;
    K.earL.rotation.z = 0.12 * Math.max(0, Math.sin(T * 0.9 + 1)) ** 6 * 4 + 0.05 * Math.sin(T * 3) * peeking + 0.5 * S.startled + 0.35 * S.duck;
    K.earR.rotation.z = -0.1 * Math.max(0, Math.sin(T * 0.7)) ** 6 * 4 - 0.5 * S.startled - 0.35 * S.duck;
    const amp = lerp(0.12, 0.34, hopP) * lerp(1, 0.35, sleepish);
    K.tail.rotation.z = amp * Math.sin(T * lerp(3, 2.0, sleepish)) - 0.1 * sleepish + 0.5 * S.startled + S.petE * 0.18 * Math.sin(T * 6) + 0.4 * chE * Math.sin(T * 9);
    const yawnEnv = (S.yawnT < 1.8 && sleepWant) ? Math.sin(Math.PI * clamp(S.yawnT / 1.8, 0, 1)) : 0;
    const mo = Math.max(yawnEnv, lick * (0.4 + 0.6 * Math.abs(Math.sin(T * 9))), S.startled > 0.3 ? 0.5 : 0);
    K.mouth.scale.set(1 + 0.2 * mo, Math.max(0.001, mo), 1);
    K.mouth.visible = mo > 0.03; K.mouthLine.visible = mo <= 0.03;
    K.head.position.y += 0.03 * yawnEnv; K.head.rotation.z -= 0.18 * yawnEnv;
    // 眼睛
    S.blinkT -= dt; if (S.blinkT < 0) S.blinkT = 2.5 + Math.random() * 3;
    const blink = S.blinkT < 0.13 ? 0.1 : 1;
    let open = lerp(0.45 + 0.5 * hopP, 0.05, sleepish);
    open *= blink; open = lerp(open, 1, eggP); open *= (1 - 0.92 * yawnEnv);
    open = lerp(open, 0.12, S.petE); open = lerp(open, 1.1, clamp(S.startled, 0, 1) * 0.8);
    const wide = 1 + 0.28 * eggP + 0.15 * S.startled;
    for (let i = 0; i < 2; i++) {
      const eye = K.eyes[i]; eye.scale.set(wide, Math.max(0.08, open) * wide, 1);
      eye.position.x = (i ? 1 : -1) * 0.105 + S.lookX * 0.02; eye.position.y = 0.015 + S.lookY * 0.016;
    }
    // v5：清晨伸懒腰的脸——眯眼 + 打哈欠（盖过普通眨眼，不碰正午逻辑）
    if (S.dawnW > 0.2 && peekP < 0.35) {
      const st = S.dawnStretch || 0;
      const yawn = Math.max(0.2, st * 1.05);
      K.body.scale.y *= 1 + 0.18 * st;
      K.head.position.y += 0.14 * st;
      K.head.rotation.x -= 0.7 * st;
      K.head.rotation.z += 0.12 * Math.sin(T * 1.2) * (1 - st);
      for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * lerp(0.55, 0.12, st));
      K.mouth.scale.set(1 + 0.15 * yawn, Math.max(0.001, yawn), 1);
      K.mouth.visible = yawn > 0.08; K.mouthLine.visible = yawn <= 0.08;
      K.tail.rotation.z = 0.25 + 0.2 * Math.sin(T * 1.4);
    } else if (!dawnVis) {
      K.paws.visible = false;
    }
    // v4：正午太阳太晃眼——眯眼，隔一会儿打个小喷嚏
    const noonT = (!napVis && chE < 0.1 && nightP < 0.2 && S.dayC > 0.4 && S.dayC < 0.75 && paperSun.visible && peekP > 0.6) ? 1 : 0;
    S.noonW = smooth(S.noonW, noonT, dt, 0.6);
    let sneeze = 0;
    if (S.noonW > 0.6) {
      S.sneezeT += dt; const c = S.sneezeT % TUNING.sneezeEvery;
      if (c < dt && S.sneezeT > dt) { S.sneezes++; sound.mew(); sound.log('sneeze'); if (!S.sneezeSaid) { S.sneezeSaid = true; say('正午的太阳太亮了，小猫打了个小喷嚏', 3); } }
      sneeze = S.sneezeT > TUNING.sneezeEvery ? Math.max(0, Math.sin(Math.PI * clamp(c / 0.5, 0, 1))) * (c < 0.5 ? 1 : 0) : 0;
    } else S.sneezeT = Math.min(S.sneezeT, TUNING.sneezeEvery - 1.2);
    S.sneeze = sneeze;
    if (S.noonW > 0.01) {
      for (const e of K.eyes) e.scale.y = Math.max(0.08, e.scale.y * lerp(1, 0.45, S.noonW) * (1 - 0.9 * sneeze));
      K.head.rotation.x += 0.35 * sneeze; K.head.position.y -= 0.05 * sneeze; K.body.scale.y *= 1 - 0.06 * sneeze;
      if (sneeze > 0.3) { K.mouth.visible = true; K.mouthLine.visible = false; K.mouth.scale.set(1, 0.35 * sneeze, 1); }
    }
    const blush = clamp(Math.max(S.shy * 0.9, S.petE, eggP * 0.8), 0, 1);
    for (const b of K.blush) b.material.opacity = blush * 0.75;
    K.heart.visible = eggP > 0.03;
    K.heartG.position.set(0.24, 0.98 + 0.12 * eggP + 0.03 * Math.sin(T * 5), 0.1);
    K.heartG.scale.setScalar(clamp(eggP, 0, 1.2) * (1 + 0.1 * Math.sin(T * 8)));
    zzz.forEach((z) => {
      const ph = (T * 0.35 + z.ph) % 1;
      z.s.visible = sleepish > 0.5;
      z.s.position.set(0.3 + 0.12 * ph + 0.05 * Math.sin(T + z.ph * 6), 0.95 + ph * 0.55, 0.1);
      z.s.scale.setScalar(0.12 + ph * 0.16);
      z.s.material.opacity = Math.sin(Math.PI * ph) * clamp((sleepish - 0.5) * 2, 0, 1);
    });
    // 小猫声音：探头 mew / 跳上窗台 meow / 吓到
    if (peekP > 0.5 && S.prevPeek <= 0.5 && S.shy > 0.5) sound.mew();
    if (hopP > 0.5 && S.prevHop <= 0.5) sound.meow(1, 0.55, 0.4);
    S.prevPeek = peekP; S.prevHop = hopP;
  } else { S.prevPeek = peekP; S.prevHop = hopP; kleaf.visible = false; K.paws.visible = false; S.noonW = smooth(S.noonW, 0, dt, 0.3); S.watchW = smooth(S.watchW, 0, dt, 0.3); S.sunsetT = 0; S.dawnStretch = 0; }
  // 抚摸：爱心 + 呼噜
  if (S.petDown) {
    S.petT += dt; S.heartCd = (S.heartCd || 0) - dt;
    if (S.heartCd <= 0 && kitten.visible) { S.heartCd = 0.45; K.head.getWorldPosition(_v); spawnHeart(_v.x + (Math.random() - 0.5) * 0.3, _v.y + 0.25, _v.z + 0.15); }
  } else S.petT = 0;
  for (const h of hearts) {
    if (h.t >= 1.4) { h.m.visible = false; continue; }
    h.t += dt; h.m.position.set(h.x + h.vx * h.t + 0.04 * Math.sin(h.t * 6), h.y + h.t * 0.55, h.z);
    h.m.scale.setScalar(0.1 + 0.08 * Math.sin(Math.min(1, h.t * 3) * 1.5)); h.m.material.opacity = clamp(1.4 - h.t, 0, 1) * 0.9;
    h.m.quaternion.copy(camera.quaternion);
  }
  // 蝴蝶（春）
  bfly.visible = seasonWeight(0) > 0.35 && cabinE > 0.9 && A > 62 && A < 128 && !napVis && S.chaseP < 0.5;
  if (bfly.visible) {
    const u = T * 0.7; bfly.position.set(0.15 + 0.95 * Math.sin(u) + 0.2 * Math.sin(u * 2.7), 1.45 + 0.45 * Math.sin(u * 1.3 + 1) + 0.12 * Math.sin(T * 9), 0.7 + 0.3 * Math.cos(u));
    const fl = Math.abs(Math.sin(T * 14)); bfly.userData.wings[0].rotation.y = -fl * 1.2; bfly.userData.wings[1].rotation.y = fl * 1.2; bfly.rotation.z = 0.3 * Math.cos(u);
  }
  // 热可可的蒸汽
  { const mug = props[3]; if (mug.visible && cabinE > 0.9) mug.userData.steam.forEach(({ s, ph }, i) => { const k = (T * 0.35 + ph) % 1; s.position.set(0.02 * Math.sin(T * 2 + i * 2) + 0.03 * (i - 1), 0.2 + k * 0.45, 0.05); s.scale.setScalar(0.1 + k * 0.18); s.material.opacity = Math.sin(Math.PI * k) * 0.4; }); }

  // --- 猫头鹰 ---
  {
    const perchOK = owlTree && owlTree.q > 0.97 && A > 50;
    if (O.state === 'perched') {
      owl.visible = !!perchOK;
      if (perchOK) {
        owlTree.g.getWorldPosition(_v); O.perch.set(_v.x, _v.y + owlTree.h * 0.58, _v.z + 0.1);
        owl.position.copy(O.perch); owl.rotation.set(0, 0, 0); owl.scale.setScalar(0.85);
        const awake = nightP, openO = lerp(0.18, 1, awake); O.blink -= dt; if (O.blink < 0) O.blink = 2 + Math.random() * 3;
        const bl = O.blink < 0.12 ? 0.08 : 1;
        for (let i = 0; i < 2; i++) { O.eyes[i].scale.set(1, Math.max(0.08, openO * bl), 1); O.pupils[i].position.set(S.lookX * 0.015 * awake, S.lookY * 0.012 * awake, 0); }
        O.body.rotation.z = 0.05 * Math.sin(T * 0.8) * (0.4 + awake) + (awake > 0.5 ? 0.12 * Math.sin(T * 0.45) : 0);
        for (const w of O.wings) w.rotation.z = 0;
        if (A > 104) { O.hootT -= dt; if (O.hootT < 0) { O.hootT = 8 + Math.random() * 5; sound.hoot(); } }
      }
    } else if (O.state === 'out') {
      O.t += dt / 1.7; const k = O.t; owl.visible = true;
      const c = _v2.set(O.p0.x + 1.4, O.p0.y + 2.4, O.p0.z + 2.0);
      owl.position.set((1 - k) * (1 - k) * O.p0.x + 2 * (1 - k) * k * c.x + k * k * O.p1.x, (1 - k) * (1 - k) * O.p0.y + 2 * (1 - k) * k * c.y + k * k * O.p1.y, (1 - k) * (1 - k) * O.p0.z + 2 * (1 - k) * k * c.z + k * k * O.p1.z);
      const fl = Math.sin(T * 26); O.wings[0].rotation.z = 0.9 + 0.7 * fl; O.wings[1].rotation.z = -0.9 - 0.7 * fl; owl.rotation.z = -0.5 * k; owl.scale.setScalar(0.85 * (1 - 0.3 * k));
      for (let i = 0; i < 2; i++) O.eyes[i].scale.set(1.2, 1.2, 1);
      if (k >= 1) { O.state = 'away'; O.t = 0; O.away = 9 + Math.random() * 4; owl.visible = false; }
    } else if (O.state === 'away') {
      owl.visible = false; O.away -= dt; if (A < 40) O.away = Math.min(O.away, 0.5);
      if (O.away <= 0 && perchOK && A > 50) { O.state = 'in'; O.t = 0; O.p0.set(-8.5, 7, 4.2); }
    } else if (O.state === 'in') {
      O.t += dt / 2.2; const k = Math.min(1, O.t); owl.visible = true;
      owlTree.g.getWorldPosition(_v); O.perch.set(_v.x, _v.y + owlTree.h * 0.58, _v.z + 0.1);
      const e = 1 - (1 - k) * (1 - k);
      owl.position.set(lerp(O.p0.x, O.perch.x, e), lerp(O.p0.y, O.perch.y, e) + 1.0 * Math.sin(Math.PI * e) * (1 - e), lerp(O.p0.z, O.perch.z, e));
      const fl = Math.sin(T * 22) * (1 - k); O.wings[0].rotation.z = (0.9 + 0.6 * fl) * (1 - k); O.wings[1].rotation.z = -(0.9 + 0.6 * fl) * (1 - k); owl.rotation.z = 0; owl.scale.setScalar(0.85);
      if (k >= 1) { O.state = 'perched'; O.hootT = 3; if (nightP > 0.5) sound.hoot(); }
    }
    if (O.state !== 'perched' && A < 30) { O.state = 'perched'; }
  }

  // --- 云、月、星、萤火虫 ---
  clouds.forEach((c) => {
    c.position.x = c.userData.x + Math.sin(T * c.userData.s + c.userData.ph) * 0.35;
    // v4：猫座出现时，挡在它前面的云会散开
    c.userData.sc ??= c.scale.x; c.userData.inCon ??= inConArea(c.userData.x + 0.35 * c.userData.sc, c.position.y);
    const k = c.userData.inCon ? 1 - S.conP : 1; c.scale.setScalar(Math.max(0.0001, c.userData.sc * k)); c.visible = k > 0.01;
  });
  moon.visible = moonP > 0.002; moon.position.set(2.9, lerp(0.9, 4.75, moonP), 0);
  // v4 猫座：发现过"一整天"之后，每晚都在；刚发现时一颗一颗亮起来
  const conOn = store.hasSecret('fullday') && nightP > 0.45 ? 1 : 0;
  S.conP = clamp(S.conP + dt / (S.conBurst > 0 ? 3.2 : 1.4) * (conOn ? 1 : -1), 0, 1);
  catStars.visible = S.conP > 0.003;
  if (catStars.visible) {
    const { pts, lines, lineM } = catStars.userData, n = pts.length;
    for (const m of pts) { const k = sstep(m.userData.i / n * 0.7, m.userData.i / n * 0.7 + 0.25, S.conP); m.scale.setScalar(Math.max(0.0001, m.userData.s * k * (1 + 0.15 * Math.sin(T * 2.2 + m.userData.i)))); m.rotation.z = 0.2 * Math.sin(T * 0.5 + m.userData.i); }
    lineM.opacity = 0.55 * sstep(0.75, 1, S.conP) * (0.85 + 0.15 * Math.sin(T * 1.3)) * (1 + 0.6 * S.conBurst);
    for (const l of lines) l.visible = lineM.opacity > 0.01;
  }
  stars.forEach((s) => {
    s.userData.inCon ??= inConArea(s.position.x, s.position.y);
    const p = s.userData.spr.step(sstep(s.userData.t0, s.userData.t0 + 5, A) * (s.userData.inCon ? 1 - S.conP : 1), dt);
    s.visible = p > 0.01;
    const tw = 1 + 0.18 * Math.sin(T * 2.5 + s.userData.ph);
    s.scale.setScalar(Math.max(0.0001, s.userData.s * clamp(p, 0, 1.4) * tw)); s.rotation.z = Math.sin(T * 0.4 + s.userData.ph) * 0.2;
  });
  flies.forEach((f, i) => {
    const fadeIn = sstep(f.t0, f.t0 + 6, A);
    f.s.visible = fadeIn > 0.01;
    if (i === 0 && S.chaseP > 0.01) {
      f.s.position.set(S.fx, S.fy + 0.03, S.fz + 2.65); f.s.scale.setScalar(0.38);
      f.s.material.opacity = 1; return;
    }
    if (i === 0) f.s.scale.setScalar(0.24);
    f.s.position.set(f.x + Math.sin(T * f.sp + f.ph) * 0.6, f.y + Math.sin(T * f.sp * 1.3 + f.ph * 2) * 0.35, f.z + Math.cos(T * f.sp * 0.8 + f.ph) * 0.5);
    f.s.material.opacity = fadeIn * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 2.6 * f.sp * 2 + f.ph * 5)));
  });

  // --- 粒子 ---
  {
    const cfg = PCFG[partSeason], frac = sstep(22, 52, A) * (S.burstT > 0 ? 1 : 0.75);
    const nShow = Math.floor(cfg.n * frac), burstK = clamp(S.burstT, 0, 1);
    const wind = clamp(S.vel * 0.02, -2.2, 2.2) + flut * Math.sin(T * 5) * 1.6;
    const lim = th < 1.45;
    for (let i = 0; i < NP; i++) {
      const p = PA[i];
      let sc = 0;
      if (i < nShow) {
        const sw = Math.sin(T * 0.8 * p.k + p.ph);
        p.vx += ((sw * cfg.sway * 0.6 + wind) - p.vx) * Math.min(1, dt * 2);
        const vyT = -cfg.fall * p.k * (1 + 0.3 * Math.sin(T * 1.7 + p.ph)) * (1 + 1.4 * burstK) + flut * 1.4 * Math.sin(T * 7 + p.ph * 3);
        p.vy += (vyT - p.vy) * Math.min(1, dt * 3);
        p.vz += (-p.vz) * Math.min(1, dt * 1.5);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + flut * 0.3 * dt;
        p.rx += cfg.spin * dt * p.k; p.ry += cfg.spin * 0.7 * dt; p.rz += cfg.spin * 0.5 * dt * p.k;
        const gy = groundY(p.x, p.z);
        if (cfg.up ? p.y > 4.9 : p.y < gy) spawnParticle(p, cfg, false);
        const clip = lim && (p.y > lidY + p.z * tanTh - 0.08);
        const fade = cfg.up ? clamp((4.9 - p.y) / 0.7, 0, 1) * clamp((p.y - gy) / 0.12, 0, 1) : clamp((p.y - gy) / 0.25, 0, 1);
        sc = clip ? 0 : cfg.size * p.k * fade;
      }
      _p.set(p.x, p.y, p.z); _e.set(p.rx, p.ry, p.rz); _q.setFromEuler(_e);
      _s.set(cfg.round ? sc : sc * 0.62, sc, sc);
      _m4.compose(_p, _q, _s); pMesh.setMatrixAt(i, _m4);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }

  // --- 关盖：轻轻 / 普通 / 啪 ---
  if (A > 60) S.armed = true;
  if (A < 65 && S.lastDir < 0 && A > 6 && S.armed) { if (!S.closing) { S.closing = true; S.closeMax = 0; } S.closeMax = Math.max(S.closeMax, sp); }
  if (A > 75) S.closing = false;
  if (S.armed && A < 5 && S.closing) {
    S.armed = false; S.closing = false;
    const slam = S.closeMax > TUNING.slamAbove, gentle = S.closeMax < TUNING.gentleBelow;
    const n = store.addCycle(); setSeason(n); store.markSeason(S.season);
    if (slam) { sound.thud(); S.slamT = 1; say('啪！吓了小猫一跳', 3); S.endMode = 'slam'; ui.showEnding(null); }
    else if (gentle) {
      discover('goodnight'); sound.lullaby(S.season); S.endMode = 'gentle';
      const lines = SEASONS[(n - 1) % 4].night;
      ui.showEnding({ title: '晚安', line: lines[(n - 1) % lines.length], next: `下一次翻开：${SEASONS[S.season].title}`, cycles: n });
    } else { S.endMode = 'normal'; sound.tap(); ui.showEnding(null); }
  }
  if (A > 9) ui.hideEnding();
  S.slamT = Math.max(0, S.slamT - dt * 0.8);
  // 啪：整本书抖一下
  book.position.y = S.slamT > 0 ? 0.04 * Math.sin(S.slamT * 40) * S.slamT : 0;

  // --- 相机 ---
  const cb = sstep(0, 95, A);
  const aspect = camera.aspect, fit = Math.max(1, 1.78 / aspect);
  const tgt = _v.set(0, lerp(0.2, 2.35, cb), lerp(3.2, 1.9, cb));
  const dir = _v2.set(0, lerp(12.5, 4.0, cb), lerp(8.4, 13.6, cb)).multiplyScalar(fit);
  camera.position.copy(tgt).add(dir); camera.lookAt(tgt);

  // --- 声音 ---
  sound.setEnv({ amb: sstep(10, 50, A), night: nightP, season: S.season, speed: S.vel, wind: 1 + flut }, dt);
  sound.tick(dt);

  // --- 文字 ---
  let ct = (captions.find(([a0, a1]) => A >= a0 && A < a1) || captions[captions.length - 1])[2];
  if (sleepyP > 0.5 && showK && A > 60) ct = '合上的时候，小猫打了个哈欠，睡着了 · Zzz';
  if (A > 70 && S.shy > 0.5) ct = '慢慢开 · 小猫害羞地探出半个脑袋…';
  if (A > 70 && !S.act.nap && !S.act.chase && S.shy < 0.5 && cabinE > 0.9) ct = ct + `  ·  ${SEASONS[SEASON.t < 0.5 ? SEASON.from : SEASON.to].blurb}`;
  if (S.tod && !(T < S.capUntil)) ct = `${S.tod} · ${ct}`;
  if (T < S.capUntil) ct = S.cap;
  if (ct !== lastCap) { caption.textContent = ct; lastCap = ct; }
  // 含蓄提示：停留一阵、还有没发现的秘密时，轻轻递一句
  S.nudgeT += dt;
  if (S.nudgeT > 45 && A > 3 && store.foundCount() < SECRETS.length) { S.nudgeT = 0; const left = SECRETS.filter((s) => !store.hasSecret(s.id)); ui.nudge(left[(Math.random() * left.length) | 0].hint); }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

/* ============================================================ 输入：滑块 + WebSocket 自动检测 */
const slider = document.getElementById('slider'), angleEl = document.getElementById('angle');
const dot = document.getElementById('dot'), srcText = document.getElementById('srcText'), autoBtn = document.getElementById('auto');
const WS_URL = params.get('ws') || 'ws://localhost:8765';
let wsActive = false, lastWsMsg = 0, ws = null, autoPlay = false, autoT = 0;
if (params.get('hud') === '0') document.body.classList.add('nohud');

function setAngle(a) { S.target = clamp(+a || 0, 0, MAX_ANGLE); }
slider.addEventListener('input', () => { if (!wsActive) { autoPlay = false; autoBtn.textContent = '▶ 自动演示'; setAngle(slider.value); } });
autoBtn.addEventListener('click', () => { autoPlay = !autoPlay; autoBtn.textContent = autoPlay ? '■ 停止演示' : '▶ 自动演示'; autoT = Math.asin(clamp(S.target / MAX_ANGLE * 2 - 1, -1, 1)); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  if (e.key === 'ArrowRight') { setAngle(S.target + 2); slider.value = S.target; }
  if (e.key === 'ArrowLeft') { setAngle(S.target - 2); slider.value = S.target; }
});

function connectWS() {
  try { ws = new WebSocket(WS_URL); } catch (e) { setTimeout(connectWS, 2000); return; }
  ws.onmessage = (ev) => {
    try { const d = JSON.parse(ev.data); if (typeof d.angle === 'number' && isFinite(d.angle)) { lastWsMsg = performance.now(); wsActive = true; setAngle(d.angle); } } catch (_) { /* 忽略坏数据 */ }
  };
  ws.onclose = ws.onerror = () => { ws = null; setTimeout(connectWS, 2000); };
}
connectWS();

function refreshHud() {
  if (wsActive && performance.now() - lastWsMsg > 1500) wsActive = false;   // 桥掉线 -> 回到滑块
  slider.disabled = wsActive;
  dot.classList.toggle('on', wsActive);
  srcText.textContent = wsActive ? `传感器已连接（${WS_URL}）· 滑块已禁用` : (ws && ws.readyState === 1 ? '已连上 WebSocket，等待数据…' : '模拟模式（拖动滑块）· 正在尝试连接 ' + WS_URL);
  slider.value = S.target; angleEl.textContent = S.target.toFixed(1) + '°';
}

/* ============================================================ 鼠标 / 触控（可选）：看你、摸摸、吓猫头鹰、摇树 */
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const cv = renderer.domElement; cv.style.touchAction = 'none';
function pointerNdc(e) { const r = cv.getBoundingClientRect(); S.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1; S.mouseY = -((e.clientY - r.top) / r.height) * 2 + 1; ndc.set(S.mouseX, S.mouseY); }
function pick() {
  raycaster.setFromCamera(ndc, camera);
  let best = null, bd = 1e9;
  const test = (obj, type, tree) => { const r = raycaster.intersectObject(obj, true); if (r.length && r[0].distance < bd) { bd = r[0].distance; best = { type, tree }; } };
  if (kitten.visible) test(kitten, 'kitten');
  if (owl.visible && O.state === 'perched') test(owl, 'owl');
  for (const t of trees) if (t.g.visible && t.q > 0.6) test(t.g, 'tree', t);
  return best;
}
let hoverCd = 0;
cv.addEventListener('pointermove', (e) => {
  pointerNdc(e); S.mouseT = S.time;
  const now = performance.now(); if (now - hoverCd < 60) return; hoverCd = now;
  const h = pick(); cv.style.cursor = h ? 'pointer' : 'default'; S.hover = h ? h.type : '';
});
cv.addEventListener('pointerleave', () => { S.mouseT = -99; });
cv.addEventListener('pointerdown', (e) => {
  pointerNdc(e); S.mouseT = S.time; const h = pick(); if (!h) return;
  if (h.type === 'kitten') {
    S.petDown = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    store.addPet();
    if (S.napP > 0.3) { S.act.nap = false; S.napLock = 9; say('呀！把小猫吵醒了', 2.5); sound.meow(1.25, 0.4, 0.3); }
    else { sound.meow(1.05, 0.55, 0.4); say('喵～ 按住可以摸摸它', 2.5); }
    if (!S.purring) { sound.purr(true); S.purring = true; }
  } else if (h.type === 'owl') { if (startleOwl(false)) say('呼——猫头鹰扑棱棱飞走了', 2.5); }
  else if (h.type === 'tree') {
    h.tree.sw.v += (Math.random() < 0.5 ? -1 : 1) * 9;
    h.tree.g.getWorldPosition(_v);
    for (let i = 0; i < 16; i++) { const p = PA[(Math.random() * NP) | 0]; p.x = _v.x + (Math.random() - 0.5) * 0.6; p.y = _v.y + h.tree.h * (0.4 + Math.random() * 0.5); p.z = _v.z + 0.15; p.vx = (Math.random() - 0.5) * 1.2; p.vy = -Math.random() * 0.5; }
    S.burstT = Math.max(S.burstT, 0.8);
    S.season === 3 ? sound.bellTwinkle(0.06) : sound.tap();
  }
});
const endPet = () => { if (!S.petDown) return; S.petDown = false; if (S.purring && !S.act.nap) { sound.purr(false); S.purring = false; } };
cv.addEventListener('pointerup', endPet); cv.addEventListener('pointercancel', endPet);

/* ============================================================ 主循环 + 测试钩子 */
// 自适应像素比：持续掉帧就悄悄降分辨率（只降不升，避免来回抖）
const perf = { acc: 0, n: 0, pr: renderer.getPixelRatio() };
let last = performance.now(), hudT = 0;
function frame(now) {
  const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
  if (autoPlay && !wsActive) { autoT += dt * 0.28; setAngle(MAX_ANGLE * (0.5 + 0.5 * Math.sin(autoT))); }
  update(dt); renderer.render(scene, camera);
  hudT += dt; if (hudT > 0.05) { refreshHud(); hudT = 0; }
  perf.acc += rawDt; perf.n++;
  if (perf.acc > 2) { if (perf.acc / perf.n > 0.026 && perf.pr > 1) { perf.pr = Math.max(1, perf.pr - 0.25); renderer.setPixelRatio(perf.pr); resize(); } perf.acc = 0; perf.n = 0; }
  requestAnimationFrame(frame);
}
initSeasonMats();
setSeason(params.get('season') != null ? +params.get('season') : store.cycles % 4, true);
if (store.cycles === 0 && !store.seasonSeen(S.season)) store.markSeason(S.season);
requestAnimationFrame(frame);

// 供自动化测试使用
async function audioProbe() {
  const ctx = new OfflineAudioContext(1, 44100 * 4, 44100); const snd = new Sound(); snd.attach(ctx);
  snd.setEnv({ amb: 1, night: 0, season: 0, speed: 90, wind: 1 }, 1);
  const res = {};
  const render = async (name, fn) => {
    const c = new OfflineAudioContext(1, 44100 * 3, 44100); const s = new Sound(); s.attach(c); fn(s); const buf = await c.startRendering();
    const d = buf.getChannelData(0); let pk = 0, sq = 0; for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > pk) pk = x; sq += d[i] * d[i]; }
    res[name] = { peak: +pk.toFixed(4), rms: +Math.sqrt(sq / d.length).toFixed(4) };
  };
  await render('ambience+rustle', (s) => { s.setEnv({ amb: 1, night: 0, season: 0, speed: 90, wind: 1 }, 1); });
  await render('meow', (s) => s.meow()); await render('mew', (s) => s.mew()); await render('purr', (s) => s.purr(true));
  await render('hoot', (s) => s.hoot()); await render('flap', (s) => s.flap()); await render('chime', (s) => s.chime());
  await render('shake', (s) => s.shake(0)); await render('thud', (s) => s.thud()); await render('lullaby', (s) => s.lullaby(3));
  return res;
}
const projectTo = (obj, dy = 0) => { obj.getWorldPosition(_v); _v.y += dy; _v.project(camera); const r = cv.getBoundingClientRect(); return { x: (_v.x + 1) / 2 * r.width + r.left, y: (1 - _v.y) / 2 * r.height + r.top }; };
window.__popup = {
  setAngle, S, store, sound, ui, audioProbe,
  settle(sec = 4) { for (let i = 0; i < sec * 60; i++) update(1 / 60); renderer.render(scene, camera); refreshHud(); },
  sweep(from, to, sec) { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i <= n; i++) { setAngle(lerp(from, to, i / n)); update(1 / 60); } renderer.render(scene, camera); },
  // 在 center 附近以 amp 度、freq Hz 来回晃 sec 秒（模拟快速晃动盖页）
  wiggle(center, amp, freq, sec) { const n = Math.round(sec * 60); for (let i = 0; i <= n; i++) { setAngle(center + amp * Math.sin(2 * Math.PI * freq * i / 60)); update(1 / 60); } setAngle(center); renderer.render(scene, camera); },
  forceSeason(i) { setSeason(i, true); },
  render() { renderer.render(scene, camera); },
  project(name) { const o = { kitten: [kitten, 0.35], owl: [owl, 0.3], tree: [owlTree.g, owlTree.h * 0.4] }[name]; return projectTo(o[0], o[1]); },
  dbg() {
    return {
      A: +S.filtered.toFixed(2), sp: +S.sp.toFixed(1), season: S.season, shy: +S.shy.toFixed(2), napP: +S.napP.toFixed(2), chaseP: +S.chaseP.toFixed(2), flutT: +S.flutT.toFixed(2),
      burstT: +S.burstT.toFixed(2), owl: O.state, owlVisible: owl.visible, kittenVisible: kitten.visible, act: { ...S.act }, seamEye: +(S.seamEye || 0).toFixed(2),
      holdT: +S.hold.t.toFixed(2), holdBand: S.hold.band, found: store.foundCount(), cycles: store.cycles, petE: +S.petE.toFixed(2), ending: S.endMode,
      sunU: +S.dayU.toFixed(3), sunVisible: paperSun.visible, sunPos: paperSun.position.toArray().map((x) => +x.toFixed(2)), light: sun.position.toArray().map((x) => +x.toFixed(2)), sunI: +sun.intensity.toFixed(2), tod: S.tod, sky: '#' + skyMat.color.getHexString(), horizon: +horizonMat.opacity.toFixed(2),
      run: { ...S.run, t0: undefined, dur: +S.run.dur.toFixed(2) }, conP: +S.conP.toFixed(2), conVisible: catStars.visible, watchW: +S.watchW.toFixed(2), noonW: +S.noonW.toFixed(2), sneezes: S.sneezes, sneeze: +(S.sneeze || 0).toFixed(2), lookX: +S.lookX.toFixed(2), lookY: +S.lookY.toFixed(2), caption: S.cap,
      dawnStretch: +S.dawnW.toFixed(2), dawnPose: +(S.dawnStretch || 0).toFixed(2), dawnHeld: !!S.dawnHeld, dawnSaid: !!S.dawnSaid, period: S.tod,
      seasonFrom: SEASON.from, seasonTo: SEASON.to, seasonT: +SEASON.t.toFixed(3), seasonMorphing: SEASON.t < 1 && SEASON.from !== SEASON.to, seasonMorphSaid: !!S.seasonMorphSaid,
      kittenPos: kitten.position.toArray().map((x) => +x.toFixed(2)), hover: S.hover, events: sound.events.slice(-14),
      trees: trees.map((t) => ({ row: t.row, q: +t.q.toFixed(3), phi: +(t.phi / (Math.PI / 2)).toFixed(3) })),
    };
  },
};
