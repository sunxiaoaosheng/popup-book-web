// 纸张材质与裁切。颜色按字符串缓存，换季只改已有材质，不新建几何体。
import * as THREE from '../vendor/three.module.js';

function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 215 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = 'rgba(190,190,190,0.25)';
    g.lineWidth = 0.6;
    g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const noiseTex = makeNoise();
export const matCache = new Map();

export const paper = (color) => {
  if (!matCache.has(color)) {
    const m = new THREE.MeshLambertMaterial({ color, map: noiseTex });
    m.userData.orig = color;
    matCache.set(color, m);
  }
  return matCache.get(color);
};

export const paperGlow = (color) => new THREE.MeshLambertMaterial({
  color, map: noiseTex, emissive: color, emissiveIntensity: 0.55,
});

export const edgeMat = new THREE.MeshLambertMaterial({ color: '#d9bd8f' });

export const polyShape = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};
export const rectShape = (x, y, w, h) => polyShape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
export const ellipseShape = (cx, cy, rx, ry) => {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
};

/** shadow=false 用于花、石子、远景小松：它们几乎不贡献可读的影子，但会撑爆阴影贴图。 */
export function cut(shape, color, z0 = 0, depth = 0.03, shadow = true) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 });
  geo.translate(0, 0, z0);
  const m = new THREE.Mesh(geo, [paper(color), edgeMat]);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, color, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paper(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

export const addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, map: glowTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

const pineShapes = (w, h, tiers, tw, th) => {
  const s = (h - th) / (0.62 * (tiers - 1) + 1);
  const L = [[0, 0], [-tw, 0], [-tw, th]];
  for (let i = 0; i < tiers; i++) {
    const yb = th + i * 0.62 * s;
    const wi = (w / 2) * (1 - 0.5 * (tiers > 1 ? i / (tiers - 1) : 0));
    L.push([-wi, yb]);
    if (i < tiers - 1) L.push([-wi * 0.32, yb + 0.88 * s]);
  }
  L.push([0, h]);
  const R = L.map(([x, y]) => [-x, y]).reverse();
  return [polyShape(L), polyShape(R)];
};

export function makePine(w, h, tiers, cDark, cLight, tw = 0.05, th = 0.18, depth = 0.04, shadow = true) {
  const g = new THREE.Group();
  const [l, r] = pineShapes(w, h, tiers, tw, th);
  g.add(cut(l, cDark, 0, depth, shadow), cut(r, cLight, 0, depth, shadow));
  return g;
}
