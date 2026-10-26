// 林间小屋 · 立体翻翻书 —— 由笔记本盖角 angle(0~130°) 驱动
// 纯前端、无构建：Three.js 已放在 ./vendor/three.module.js
import * as THREE from './vendor/three.module.js';

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
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color, map: noiseTex }));
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
function makeCoverTexture() {
  const W = 1280, H = Math.round(1280 * PH / PW);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#efe0bd'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#b4854f'; g.lineWidth = 8; g.strokeRect(34, 34, W - 68, H - 68);
  g.strokeStyle = '#d4ae7a'; g.lineWidth = 3; g.strokeRect(54, 54, W - 108, H - 108);
  const grd = g.createLinearGradient(0, 80, 0, H - 80); grd.addColorStop(0, '#244e4a'); grd.addColorStop(1, '#173a37');
  g.fillStyle = grd; g.fillRect(80, 80, W - 160, H - 160);
  g.save(); g.beginPath(); g.rect(80, 80, W - 160, H - 160); g.clip();
  // 月亮与星
  g.fillStyle = '#ffeaa8'; g.beginPath(); g.arc(W - 200, 175, 46, 0, 7); g.fill();
  g.fillStyle = '#244e4a'; g.beginPath(); g.arc(W - 180, 162, 40, 0, 7); g.fill();
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,238,180,.8)'; g.fillRect(120 + Math.random() * (W - 240), 110 + Math.random() * 230, 3, 3); }
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
  g.font = `30px ${FONT}`; g.fillStyle = 'rgba(255,241,210,.75)'; g.fillText('THE FOREST CABIN  ·  慢慢打开这本书', W / 2, H - 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const cover = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshLambertMaterial({ map: makeCoverTexture() }));
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
const T_back = makeTerrace(0, 1.45, 9.5, 0.5, 1.45, '#9ccf98', '#5d9c74'); T_back.t0 = 15; T_back.t1 = 26;
const T_left = makeTerrace(-3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a'); T_left.t0 = 20; T_left.t1 = 31;
const T_right = makeTerrace(3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a'); T_right.t0 = 22; T_right.t1 = 33;

/* ============================================================ 纸松树（左半深色/右半浅色，像折过的纸） */
const trees = [];
function addTree(parent, x, z, h, tiers, cDark, cLight, t0, y = 0) {
  const w = h * 0.5 + 0.1;
  const tr = makePine(w, h, tiers, cDark, cLight, 0.06, h * 0.12, 0.04);
  tr.position.set(x, y, z);
  parent.add(tr);
  trees.push({ g: tr, h, spr: new Spring(95, 0.34, 0), t0, ph: rnd() * 6 });
}
// 后排（站在后面的高坡上）
{
  let i = 0;
  for (let x = -4.5; x <= 4.6; x += 0.95) {
    const h = 1.5 + rnd() * 0.8;
    addTree(T_back.top, x + (rnd() - .5) * 0.3, -0.55 - rnd() * 0.3, h, 4, '#1f5a49', '#2a6e58', 24 + i * 0.7); i++;
  }
}
// 中排（直接站在地上，小屋两侧）
{
  const xs = [-2.55, -3.4, -4.4, 2.6, 3.5, 4.45];
  xs.forEach((x, i) => addTree(book, x, 2.3 + rnd() * 0.3, 1.5 + rnd() * 0.6, 4, '#2c7a5b', '#38906a', 27 + i * 0.8, 0.02));
}
// 前排（左右两侧小坡上，矮一些）
[T_left, T_right].forEach((T, k) => {
  [-0.95, 0.15, 1.1].forEach((x, i) => {
    const xx = k === 0 ? x - 0.6 : x + 0.6;
    addTree(T.top, xx, -0.5 - i * 0.28, 1.0 + rnd() * 0.45, 3, '#3a9a68', '#4cb07a', 31 + k * 1.2 + i * 0.9);
  });
});

/* ============================================================ 小木屋 */
const cabin = new THREE.Group();   // 绕底边向上翻起
cabin.position.set(0, 0.03, 2.65); book.add(cabin);
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
  inner.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, -0.38); cabin.add(inner);
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), addMat('#ff9a40', 0.5)); innerGlow.position.set(-0.4, 0.55, -0.36); cabin.add(innerGlow);
  for (const x of [DOOR.x0 - 0.005, DOOR.x1 + 0.005]) { const side = box(0.01, DOOR.h, 0.34, '#4d2c1a', x + (x < -0.4 ? 0.005 : -0.005), DOOR.h / 2, -0.2); cabin.add(side); }
}
// 窗：灯光玻璃 + 窗框 + 十字
const glassMat = new THREE.MeshBasicMaterial({ color: '#7f8f9a' });
const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), glassMat);
glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, -0.03); cabin.add(glass);
{
  const cxw = (WIN.x0 + WIN.x1) / 2, cyw = (WIN.y0 + WIN.y1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, fc = '#fff2d8';
  cabin.add(box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y1 + 0.04, 0.0), box(ww + 0.16, 0.08, 0.06, fc, cxw, WIN.y0 - 0.04, 0.0),
    box(0.08, wh, 0.06, fc, WIN.x0 - 0.04, cyw, 0.0), box(0.08, wh, 0.06, fc, WIN.x1 + 0.04, cyw, 0.0),
    box(0.04, wh, 0.04, fc, cxw, cyw, 0.0), box(ww, 0.04, 0.04, fc, cxw, cyw, 0.0));
}
const sill = box(1.0, 0.07, 0.46, '#c98f55', (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.08 + 0.035 - 0.0, 0.23);
sill.position.y = 0.72; cabin.add(sill);
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
{
  const ang = Math.atan2(0.8, 1.4), L = Math.hypot(1.4, 0.8) + 0.35, depthZ = 0.8;
  for (const sgn of [-1, 1]) {
    const r = box(L, 0.09, depthZ, sgn < 0 ? '#b0483a' : '#9a3b30', sgn * 0.7 - sgn * 0.12, 1.9 + 0.09 + 0.02, -0.22);
    const nx = Math.sin(ang), ny = Math.cos(ang);     // 斜面外法线（略抬高避免穿模）
    r.position.set(sgn * 0.66 + sgn * nx * 0.06, 1.9 + ny * 0.06 + 0.02, -0.2);
    r.rotation.z = -sgn * ang; cabin.add(r);
    // 屋檐前缘浅色条（像叠了一层卡纸）
    const e = box(L, 0.05, 0.05, '#e4a05b', 0, 0, 0); e.position.set(r.position.x, r.position.y + 0.0, 0.2 + 0.0); e.rotation.z = r.rotation.z; e.position.x += sgn * nx * 0.02; e.position.y += ny * 0.02; cabin.add(e);
  }
  cabin.add(box(0.34, 0.8, 0.32, '#8a8a92', 0.78, 2.1, -0.18));
  cabin.add(box(0.44, 0.08, 0.42, '#5d5d66', 0.78, 2.54, -0.18));
  for (const y of [1.9, 2.1, 2.3]) cabin.add(box(0.345, 0.025, 0.325, '#6d6d76', 0.78, y, -0.18));
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

/* ============================================================ 萤火虫 */
const flies = [];
for (let i = 0; i < 28; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#d8ff7a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(0.2 + rnd() * 0.14); s.visible = false; scene.add(s);
  flies.push({ s, x: (rnd() - .5) * 9, y: 0.5 + rnd() * 2.8, z: 0.8 + rnd() * 4.8, ph: rnd() * 10, sp: 0.3 + rnd() * 0.5, t0: 100 + rnd() * 18 });
}

/* ============================================================ 状态与动画 */
const S = {
  target: 0,         // 输入角度（来自滑块 / WebSocket）
  filtered: 0,       // 轻度滤波后的输入
  hinge: new Spring(140, 0.6, 0),
  lit: new Spring(18, 1, 0), night: new Spring(10, 1, 0), moonUp: new Spring(24, 0.8, 0),
  door: doorSpr, cabin: cabinSpr,
  peek: new Spring(80, 0.6, 0), hop: new Spring(70, 0.75, 0),
  egg: new Spring(140, 0.55, 0), sleepy: new Spring(22, 1, 0), yawn: 0, yawnT: 99,
  lastDir: 1, vel: 0, prevFiltered: 0, time: 0,
  eyeOpen: 0.4, blinkT: 3, camBlend: 0,
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

const sunDay = new THREE.Color('#fff0dc'), sunNight = new THREE.Color('#9fb4ff');
const hemiSkyDay = new THREE.Color('#fff3e0'), hemiSkyNight = new THREE.Color('#5b6fb5');
const hemiGndDay = new THREE.Color('#7a6a5a'), hemiGndNight = new THREE.Color('#2b2f4a');
const skyDay = new THREE.Color('#f6c99b'), skyMid = new THREE.Color('#e9a98a'), skyNight = new THREE.Color('#1c2a5a');
const glassOff = new THREE.Color('#7f8f9a'), glassOn = new THREE.Color('#ffd37a');
const tmpC = new THREE.Color();
const _v = new THREE.Vector3();

// 纸片被盖页顶住：站起来的角度 φ 不能让顶端穿过盖页（盖页平面 y = lidY + z·tanθ）。
// 立起来超过 90°（弹簧过冲）的部分不受限。
const _b = new THREE.Vector3();
function erect(q, obj, h, th, tanTh, lidY) {
  const want = Math.max(0, q) * Math.PI / 2;
  if (th >= 1.5) return want;                // 盖页已到 ~86° 以上，不会再挡
  obj.getWorldPosition(_b);
  let phi = Math.min(want, Math.PI / 2);
  for (; phi > 0; phi -= 0.04) {
    const ty = _b.y + h * Math.sin(phi) + 0.1, tz = _b.z + h * Math.cos(phi);
    if (ty < lidY + tz * tanTh) break;
  }
  phi = Math.max(0, phi);
  return want > Math.PI / 2 ? phi + (want - Math.PI / 2) : Math.min(phi, want);
}

function update(dt) {
  S.time += dt; const T = S.time;
  // --- 输入：轻微低通去抖（τ≈35ms），并求速度，判断开/合方向 ---
  const a = clamp(S.target, 0, MAX_ANGLE);
  S.filtered += (a - S.filtered) * (1 - Math.exp(-dt / 0.035));
  const v = (S.filtered - S.prevFiltered) / Math.max(dt, 1e-4); S.prevFiltered = S.filtered;
  S.vel += (v - S.vel) * (1 - Math.exp(-dt / 0.12));
  const A = S.filtered;
  if (S.vel > 6) { if (S.lastDir < 0) S.yawnT = 99; S.lastDir = 1; }
  else if (S.vel < -6) { if (S.lastDir > 0) S.yawnT = 0; S.lastDir = -1; }
  if (S.yawnT < 99) S.yawnT += dt;

  // --- 弹簧 ---
  const idle = 0.35 * Math.sin(T * 1.3) * sstep(5, 20, A);          // 书页轻轻"呼吸"
  const hingeA = S.hinge.step(A, dt) + idle;
  const nightP = S.night.step(sstep(100, 126, A), dt);
  const moonP = S.moonUp.step(sstep(100, 118, A), dt);
  const litP = S.lit.step(sstep(55, 66, A), dt);
  const doorP = S.door.step(sstep(68, 77, A), dt);
  const cabinP = S.cabin.step(sstep(40, 62, A), dt);
  const peekP = S.peek.step(sstep(76, 90, A), dt);
  const hopP = S.hop.step(sstep(91, 100, A), dt);
  const eggP = S.egg.step(1 - sstep(3, 6.5, Math.abs(A - 90)), dt);
  const kittenAwake = A > 76;
  const sleepWant = (S.lastDir < 0 && kittenAwake && eggP < 0.2) ? 1 : 0;
  const sleepyP = S.sleepy.step(sleepWant, dt);

  // --- 盖页角度 / 抬升 ---
  const th = hingeA * Math.PI / 180;
  const lidY = 0.85 * (1 - sstep(0, 40, A));
  hinge.position.y = lidY; hinge.rotation.x = -th;

  // --- 暖光缝 ---
  const seam = 1 - sstep(10, 22, A);
  seamGlow.material.opacity = 0.95 * seam; seamLine.material.opacity = 0.9 * seam;
  const gapH = lidY + 0.14; seamGlow.scale.y = gapH * 1.5 + 0.3; seamGlow.position.y = gapH * 0.5;
  seamLine.scale.y = 0.8 + gapH * 3; seamLine.position.y = gapH * 0.5;
  seamLight.intensity = 14 * seam * (0.92 + 0.08 * Math.sin(T * 7));

  // --- 灯光（日 -> 夜） ---
  sun.intensity = lerp(2.6, 1.3, nightP); sun.color.lerpColors(sunDay, sunNight, nightP);
  hemi.intensity = lerp(1.5, 1.05, nightP); hemi.color.lerpColors(hemiSkyDay, hemiSkyNight, nightP); hemi.groundColor.lerpColors(hemiGndDay, hemiGndNight, nightP);
  // 天空：暖黄昏 -> 深蓝夜
  const dusk = sstep(70, 105, A);
  tmpC.lerpColors(skyDay, skyMid, dusk); skyMat.color.lerpColors(tmpC, skyNight, nightP);
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
    t.g.visible = q > 0.002;
    t.g.rotation.x = Math.PI / 2 - phi;
    t.g.rotation.z = Math.sin(T * 0.9 + t.ph) * 0.012 * clamp(q, 0, 1);
  }

  // --- 木屋 ---
  const cabinPhi = erect(cabinP, cabin, 2.7, th, tanTh, lidY);
  const cabinE = cabinPhi / (Math.PI / 2);          // 实际站起来的程度（被盖页顶住时 <cabinP）
  cabin.visible = cabinP > 0.002;
  cabin.rotation.x = Math.PI / 2 - cabinPhi;
  glassMat.color.lerpColors(glassOff, glassOn, litP);
  winGlow.material.opacity = litP * (0.42 + 0.35 * nightP) * (0.95 + 0.05 * Math.sin(T * 9));
  windowLight.intensity = litP * (1.2 + 2.2 * nightP);
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

  // --- 小猫 ---
  const showK = peekP > 0.003 && cabinE > 0.5;
  kitten.visible = showK;
  if (showK) {
    const u = clamp(hopP, 0, 1.06), uc = clamp(u, 0, 1);
    const e = uc * uc * (3 - 2 * uc);
    const hx = lerp(-0.4, SILL_X, e), hz = -0.15 + 0.5 * sstep(0, 0.28, uc);
    const hy = lerp(-0.72, 0, clamp(peekP, 0, 1.08)) + SILL_TOP * e + 0.5 * Math.sin(Math.PI * uc) * (uc > 0 && uc < 1 ? 1 : 0);
    kitten.position.set(hx, hy, hz);
    const air = Math.sin(Math.PI * uc);
    kitten.scale.set(0.9 * (1 - 0.1 * air), 0.9 * (1 + 0.16 * air), 0.9);
    kitten.rotation.z = (uc < 1 ? 0.35 * Math.sin(Math.PI * uc) * (1 - 2 * uc) : 0);
    // 呼吸 + 探头左右歪
    const peeking = peekP * (1 - hopP);
    K.body.scale.y = 1 + 0.02 * Math.sin(T * 2.1);
    K.head.position.y = 0.6 + 0.008 * Math.sin(T * 2.1 + 0.6) - 0.06 * sleepyP;
    K.head.rotation.z = 0.16 * Math.sin(T * 1.6) * peeking + sleepyP * 0.3 * Math.sin(T * 0.6) * 0.3 + sleepyP * 0.28;
    K.earL.rotation.z = 0.12 * Math.max(0, Math.sin(T * 0.9 + 1)) ** 6 * 4 + 0.05 * Math.sin(T * 3) * peeking;
    K.earR.rotation.z = -0.1 * Math.max(0, Math.sin(T * 0.7)) ** 6 * 4;
    // 尾巴：坐下后轻摆，睡着变慢
    const sitting = hopP;
    const amp = lerp(0.12, 0.34, sitting) * lerp(1, 0.35, sleepyP);
    K.tail.rotation.z = amp * Math.sin(T * lerp(3, 2.0, sleepyP)) - 0.1 * sleepyP;
    // 哈欠：关盖时先打哈欠，再睡
    const yawnEnv = (S.yawnT < 1.8 && sleepWant) ? Math.sin(Math.PI * clamp(S.yawnT / 1.8, 0, 1)) : 0;
    K.mouth.scale.set(1 + 0.2 * yawnEnv, Math.max(0.001, yawnEnv), 1);
    K.mouth.visible = yawnEnv > 0.03; K.mouthLine.visible = yawnEnv <= 0.03;
    K.head.position.y += 0.03 * yawnEnv; K.head.rotation.z -= 0.18 * yawnEnv;
    // 眼睛：睡 -> 眯 -> 睁；90° 彩蛋 -> 睁大 + 爱心
    S.blinkT -= dt; if (S.blinkT < 0) S.blinkT = 2.5 + Math.random() * 3;
    const blink = S.blinkT < 0.13 ? 0.1 : 1;
    let open = lerp(0.45 + 0.5 * hopP, 0.05, sleepyP);
    open *= blink; open = lerp(open, 1, eggP); open *= (1 - 0.92 * yawnEnv);
    const wide = 1 + 0.28 * eggP;
    for (const eye of K.eyes) { eye.scale.set(wide, Math.max(0.08, open) * wide, 1); }
    K.heart.visible = eggP > 0.03;
    K.heartG.position.set(0.24, 0.98 + 0.12 * eggP + 0.03 * Math.sin(T * 5), 0.1);
    K.heartG.scale.setScalar(clamp(eggP, 0, 1.2) * (1 + 0.1 * Math.sin(T * 8)));
    // Zzz
    zzz.forEach((z) => {
      const ph = (T * 0.35 + z.ph) % 1;
      z.s.visible = sleepyP > 0.5;
      z.s.position.set(0.3 + 0.12 * ph + 0.05 * Math.sin(T + z.ph * 6), 0.95 + ph * 0.55, 0.1);
      z.s.scale.setScalar(0.12 + ph * 0.16);
      z.s.material.opacity = Math.sin(Math.PI * ph) * clamp((sleepyP - 0.5) * 2, 0, 1);
    });
  }

  // --- 云、月、星 ---
  clouds.forEach((c) => { c.position.x = c.userData.x + Math.sin(T * c.userData.s + c.userData.ph) * 0.35; });
  moon.visible = moonP > 0.002; moon.position.set(2.9, lerp(0.9, 4.75, moonP), 0);
  stars.forEach((s) => {
    const p = s.userData.spr.step(sstep(s.userData.t0, s.userData.t0 + 5, A), dt);
    s.visible = p > 0.01;
    const tw = 1 + 0.18 * Math.sin(T * 2.5 + s.userData.ph);
    s.scale.setScalar(Math.max(0.0001, s.userData.s * clamp(p, 0, 1.4) * tw)); s.rotation.z = Math.sin(T * 0.4 + s.userData.ph) * 0.2;
  });
  flies.forEach((f) => {
    const fadeIn = sstep(f.t0, f.t0 + 6, A);
    f.s.visible = fadeIn > 0.01;
    f.s.position.set(f.x + Math.sin(T * f.sp + f.ph) * 0.6, f.y + Math.sin(T * f.sp * 1.3 + f.ph * 2) * 0.35, f.z + Math.cos(T * f.sp * 0.8 + f.ph) * 0.5);
    f.s.material.opacity = fadeIn * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 2.6 * f.sp * 2 + f.ph * 5)));
  });

  // --- 相机：合上时俯视封面，翻开后平视 ---
  const cb = sstep(0, 95, A);
  const aspect = camera.aspect, fit = Math.max(1, 1.78 / aspect);
  const tgt = new THREE.Vector3(0, lerp(0.2, 2.35, cb), lerp(3.2, 1.9, cb));
  const dir = new THREE.Vector3(0, lerp(12.5, 4.0, cb), lerp(8.4, 13.6, cb)).multiplyScalar(fit);
  camera.position.copy(tgt).add(dir); camera.lookAt(tgt);

  // 说明文字
  let ct = (captions.find(([a0, a1]) => A >= a0 && A < a1) || captions[captions.length - 1])[2];
  if (sleepyP > 0.5 && showK && A > 60) ct = '合上的时候，小猫打了个哈欠，睡着了 · Zzz';
  if (ct !== lastCap) { caption.textContent = ct; lastCap = ct; }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

/* ============================================================ 输入：滑块 + WebSocket 自动检测 */
const slider = document.getElementById('slider'), angleEl = document.getElementById('angle');
const dot = document.getElementById('dot'), srcText = document.getElementById('srcText'), autoBtn = document.getElementById('auto');
const params = new URLSearchParams(location.search);
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

/* ============================================================ 主循环 + 测试钩子 */
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (autoPlay && !wsActive) { autoT += dt * 0.28; setAngle(MAX_ANGLE * (0.5 + 0.5 * Math.sin(autoT))); }
  update(dt); renderer.render(scene, camera);
  hudT += dt; if (hudT > 0.05) { refreshHud(); hudT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 供自动化截图使用：setAngle 后调用 settle(秒) 让弹簧稳定再渲染
window.__popup = {
  setAngle, S,
  settle(sec = 4) { for (let i = 0; i < sec * 60; i++) update(1 / 60); renderer.render(scene, camera); refreshHud(); },
  sweep(from, to, sec) { const n = Math.round(sec * 60); for (let i = 0; i <= n; i++) { setAngle(lerp(from, to, i / n)); update(1 / 60); } renderer.render(scene, camera); },
};
