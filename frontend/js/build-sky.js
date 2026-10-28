// 封面、盖页内侧的天空、远山、日月星、猫座、书脊暖光。
import * as THREE from '../vendor/three.module.js';
import { rnd } from './math.js';
import { cut, box, polyShape, ellipseShape, paperGlow, addMat, makePine } from './materials.js';
import { PW, PH, FONT } from './state.js';
import { SEASONS, SECRETS } from './story.js';
import { buildMoon, buildStars, buildPaperSun, buildSunSlot, buildHorizon, buildConstellation } from './build-sky-bodies.js';
import { CLOUD_RENDER_ORDER, CLOUD_Z } from './sky-order.js';

export { SUN_ARC, sunAt, TIMES, DAWN_SKY, DAWN_GLOW, DUSK_GLOW, SUN_LOW } from './sky-data.js';

const COVER_W = 1280;
const COVER_H = Math.round(1280 * PH / PW);
const COVER_SKY = [['#244e4a', '#173a37'], ['#1f5560', '#14383f'], ['#4a3a3a', '#2e2326'], ['#2d4560', '#1b2b42']];

export function buildSky(W) {
  const { book } = W;
  const hinge = new THREE.Group();
  book.add(hinge);
  const backBox = box(PW, 0.12, PH, '#f0e2c2', 0, 0.06, PH / 2);
  hinge.add(backBox);
  const backFace = new THREE.Group();
  backFace.rotation.x = Math.PI / 2;
  hinge.add(backFace);

  const coverCanvas = document.createElement('canvas');
  coverCanvas.width = COVER_W;
  coverCanvas.height = COVER_H;
  const coverTex = new THREE.CanvasTexture(coverCanvas);
  coverTex.colorSpace = THREE.SRGBColorSpace;
  coverTex.anisotropy = 8;

  function drawCover(season = 0, cycles = 0, found = 0) {
    const c = coverCanvas;
    const g = c.getContext('2d');
    const width = COVER_W, height = COVER_H;
    g.clearRect(0, 0, width, height);
    g.fillStyle = '#efe0bd';
    g.fillRect(0, 0, width, height);
    g.strokeStyle = '#b4854f';
    g.lineWidth = 8;
    g.strokeRect(34, 34, width - 68, height - 68);
    g.strokeStyle = '#d4ae7a';
    g.lineWidth = 3;
    g.strokeRect(54, 54, width - 108, height - 108);
    const grd = g.createLinearGradient(0, 80, 0, height - 80);
    grd.addColorStop(0, COVER_SKY[season][0]);
    grd.addColorStop(1, COVER_SKY[season][1]);
    g.fillStyle = grd;
    g.fillRect(80, 80, width - 160, height - 160);
    g.save();
    g.beginPath();
    g.rect(80, 80, width - 160, height - 160);
    g.clip();
    g.fillStyle = '#ffeaa8';
    g.beginPath();
    g.arc(width - 200, 175, 46, 0, 7);
    g.fill();
    g.fillStyle = COVER_SKY[season][0];
    g.beginPath();
    g.arc(width - 180, 162, 40, 0, 7);
    g.fill();
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(255,238,180,.8)';
      g.fillRect(120 + ((i * 7919) % 1000) / 1000 * (width - 240), 110 + ((i * 104729) % 1000) / 1000 * 230, 3, 3);
    }
    const pine = (x, y, s, col) => {
      g.fillStyle = col;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const w = (110 - i * 22) * s, yy = y - i * 55 * s;
        g.moveTo(x - w, yy);
        g.lineTo(x, yy - 90 * s);
        g.lineTo(x + w, yy);
        g.fill();
      }
      g.fillRect(x - 8 * s, y, 16 * s, 40 * s);
    };
    for (let i = 0; i < 9; i++) pine(120 + i * 135 + (i % 2) * 30, height - 140, 0.8 + (i % 3) * 0.15, i % 2 ? '#102a28' : '#0d2321');
    g.fillStyle = '#0b1c1b';
    g.fillRect(width / 2 - 120, height - 300, 240, 150);
    g.beginPath();
    g.moveTo(width / 2 - 150, height - 300);
    g.lineTo(width / 2, height - 390);
    g.lineTo(width / 2 + 150, height - 300);
    g.fill();
    g.shadowColor = '#ffb04a';
    g.shadowBlur = 40;
    g.fillStyle = '#ffc766';
    g.fillRect(width / 2 + 30, height - 270, 60, 55);
    g.shadowBlur = 0;
    g.restore();
    g.textAlign = 'center';
    g.fillStyle = '#fff1d2';
    g.shadowColor = 'rgba(0,0,0,.4)';
    g.shadowBlur = 10;
    g.font = `bold 200px ${FONT}`;
    g.fillText('林间小屋', width / 2, 330);
    g.shadowBlur = 0;
    g.font = `600 46px ${FONT}`;
    g.fillStyle = '#ffd48a';
    g.fillText('一 只 小 猫 的 立 体 故 事', width / 2, 410);
    g.font = `600 40px ${FONT}`;
    g.fillStyle = '#ffe9b8';
    g.fillText(`第 ${cycles + 1} 次翻开  ·  ${SEASONS[season].title}`, width / 2, height - 150);
    g.font = `30px ${FONT}`;
    g.fillStyle = 'rgba(255,241,210,.75)';
    g.fillText(`小秘密 ${found} / ${SECRETS.length}   ·   慢慢打开这本书`, width / 2, height - 100);
    coverTex.needsUpdate = true;
  }

  const cover = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshLambertMaterial({ map: coverTex }));
  cover.rotation.x = -Math.PI / 2;
  cover.position.set(0, 0.122, PH / 2);
  cover.receiveShadow = true;
  hinge.add(cover);

  const skyMat = new THREE.MeshBasicMaterial({ color: '#f6c99b' });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.4, PH - 0.35), skyMat);
  sky.position.set(0, PH / 2, 0.01);
  sky.receiveShadow = false;
  backFace.add(sky);

  function hillShape(base, amp, f, ph, x0 = -PW / 2 + 0.2, x1 = PW / 2 - 0.2) {
    const pts = [[x0, 0]];
    for (let x = x0; x <= x1 + 1e-6; x += 0.25) {
      pts.push([x, base + amp * Math.sin(f * x + ph) + amp * 0.4 * Math.sin(2.3 * f * x + ph * 2)]);
    }
    pts.push([x1, 0]);
    return pts;
  }
  const hillDefs = [
    { base: 2.35, amp: 0.38, f: 0.55, ph: 0.5, col: '#a5c8a0', z: 0.12 },
    { base: 1.85, amp: 0.32, f: 0.7, ph: 2.2, col: '#69a885', z: 0.34 },
    { base: 1.25, amp: 0.26, f: 0.9, ph: 4.0, col: '#3f7f69', z: 0.56 },
  ];
  for (const h of hillDefs) backFace.add(cut(polyShape(hillShape(h.base, h.amp, h.f, h.ph)), h.col, h.z, 0.05));

  const mapY = (h, x) => h.base + h.amp * Math.sin(h.f * x + h.ph) + h.amp * 0.4 * Math.sin(2.3 * h.f * x + h.ph * 2);
  /** @type {Array<[number, number, string, string]>} */
  const pineBands = [[1, 0.55, '#2f6a55', '#3b7b63'], [2, 0.7, '#245a49', '#2e6b57']];
  for (const [hi, step, dark, light] of pineBands) {
    const h = hillDefs[hi];
    /** @type {{x:number, y:number, z:number, sz:number}[]} */
    const spots = [];
    for (let x = -4.6; x < 4.7; x += step * (0.8 + rnd() * 0.5)) {
      const sz = 0.55 + rnd() * 0.45;
      spots.push({ x, y: mapY(h, x) - 0.05, z: h.z + 0.05, sz });
    }
    // 远山小松不参与铰链弹簧，也不投阴影。同一套几何用实例矩阵缩放，少几十次 draw。
    const base = makePine(0.5, 0.9, 3, dark, light, 0.04, 0.12, 0.04, false);
    const dummy = new THREE.Object3D();
    for (const child of base.children) {
      const mesh = new THREE.InstancedMesh(child.geometry, child.material, spots.length);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      spots.forEach((sp, i) => {
        dummy.position.set(sp.x, sp.y, sp.z);
        dummy.scale.setScalar(sp.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      backFace.add(mesh);
    }
  }

  const clouds = [];
  const cloudMat = paperGlow('#fff3e2');
  const unitCloud = cut(ellipseShape(0, 0, 1, 1), '#fff3e2', 0, 0.03, false);
  unitCloud.material[0] = cloudMat;
  const puffLayout = [[0, 0, 0.32], [0.35, 0.08, 0.4], [0.75, 0, 0.3], [0.35, -0.1, 0.5]];
  for (const [x, y, s] of [[-2.8, 4.6, 1], [1.6, 5.3, 0.8], [3.6, 3.9, 0.7]]) {
    const puffs = puffLayout.map(([dx, dy, r]) => ({ dx, dy: dy - 0.05, rx: r * 1.2, ry: r * 0.7 }));
    clouds.push({
      x, y, base: s, drift: 0.3 + rnd() * 0.3, ph: rnd() * 6,
      k: s, xNow: x, visible: true, inCon: undefined, puffs,
    });
  }
  const cloudMesh = new THREE.InstancedMesh(unitCloud.geometry, unitCloud.material, clouds.length * puffLayout.length);
  cloudMesh.castShadow = false;
  cloudMesh.receiveShadow = true;
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = CLOUD_RENDER_ORDER;
  backFace.add(cloudMesh);
  const cloudM = new THREE.Matrix4();
  const cloudP = new THREE.Vector3();
  const cloudQ = new THREE.Quaternion();
  const cloudS = new THREE.Vector3();
  W.syncClouds = () => {
    let i = 0;
    for (const c of clouds) {
      const ck = c.visible ? c.k : 0;
      for (const puff of c.puffs) {
        cloudP.set(c.xNow + puff.dx * ck, c.y + puff.dy * ck, CLOUD_Z);
        cloudS.set(puff.rx * ck, puff.ry * ck, ck || 0.0001);
        cloudM.compose(cloudP, cloudQ, cloudS);
        cloudMesh.setMatrixAt(i, cloudM);
        i += 1;
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  };
  W.syncClouds();

  const moon = buildMoon(backFace);
  const stars = buildStars(backFace);
  const paperSun = buildPaperSun(backFace);
  const sunSlot = buildSunSlot(backFace);
  const { horizon, horizonMat } = buildHorizon(backFace);
  const { catStars, inConArea } = buildConstellation(backFace);

  const seamGlow = new THREE.Mesh(new THREE.PlaneGeometry(PW, 1), addMat('#ffb050', 0));
  seamGlow.position.set(0, 0.5, PH + 0.02);
  book.add(seamGlow);
  const seamLine = new THREE.Mesh(
    new THREE.PlaneGeometry(PW - 0.2, 0.06),
    new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  seamLine.position.set(0, 0.5, PH + 0.03);
  book.add(seamLine);

  Object.assign(W, {
    hinge, backFace, cover, drawCover, skyMat, sky, clouds, moon, stars, paperSun, sunSlot,
    horizon, horizonMat, catStars, inConArea, seamGlow, seamLine, hillDefs,
  });
}
