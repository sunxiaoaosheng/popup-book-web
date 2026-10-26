// 折纸台阶与近景松树。rnd() 发生在天空星星之后、粒子之前。
import * as THREE from '../vendor/three.module.js';
import { Spring, rnd } from './math.js';
import { cut, rectShape, makePine, paper, edgeMat } from './materials.js';

export function buildForest(W) {
  const { book } = W;
  const terraces = [];

  function makeTerrace(cx, zFront, w, h, depth, cTop, cRiser) {
    const g = new THREE.Group();
    g.position.set(cx, 0.02, zFront);
    const riser = new THREE.Group();
    g.add(riser);
    riser.add(cut(rectShape(-w / 2, 0, w, h), cRiser, -0.03, 0.03));
    const top = new THREE.Group();
    top.position.y = h;
    riser.add(top);
    const geo = new THREE.ExtrudeGeometry(rectShape(-w / 2, 0, w, depth), { depth: 0.03, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.03, 0);
    const slab = new THREE.Mesh(geo, [paper(cTop), edgeMat]);
    slab.castShadow = slab.receiveShadow = true;
    top.add(slab);
    book.add(g);
    const t = { g, riser, top, w, h, depth, spr: new Spring(80, 0.45, 0), t0: 0, t1: 0 };
    terraces.push(t);
    return t;
  }

  const T_back = makeTerrace(0, 2.15, 9.5, 0.45, 2.15, '#9ccf98', '#5d9c74');
  T_back.t0 = 10; T_back.t1 = 21;
  const T_left = makeTerrace(-3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a');
  T_left.t0 = 14; T_left.t1 = 25;
  const T_right = makeTerrace(3.3, 4.4, 3.3, 0.34, 1.9, '#a6d49a', '#68a97a');
  T_right.t0 = 16; T_right.t1 = 27;

  const trees = [];
  function addTree(parent, x, z, h, tiers, cDark, cLight, t0, y = 0, row = 'back') {
    const w = h * 0.5 + 0.1;
    const tr = makePine(w, h, tiers, cDark, cLight, 0.06, h * 0.12, 0.04, true);
    tr.position.set(x, y, z);
    parent.add(tr);
    trees.push({
      g: tr, h, spr: new Spring(95, 0.34, 0), sw: new Spring(60, 0.14, 0),
      t0, ph: rnd() * 6, row, top: parent === book ? 0.02 : 0.47,
    });
  }

  {
    let i = 0;
    for (let x = -4.5; x <= 4.6; x += 0.95) {
      const h = 1.0 + rnd() * 0.45;
      addTree(T_back.top, x + (rnd() - 0.5) * 0.3, -0.3 - rnd() * 0.15, h, 4, '#1f5a49', '#2a6e58', 17 + i * 0.4, 0, 'back');
      i++;
    }
  }
  {
    const xs = [-2.55, -3.4, -4.4, 2.6, 3.5, 4.45];
    xs.forEach((x, i) => addTree(book, x, 2.55 + rnd() * 0.3, 1.5 + rnd() * 0.6, 4, '#2c7a5b', '#38906a', 20 + i * 0.6, 0.02, 'mid'));
  }
  [T_left, T_right].forEach((T, k) => {
    [-0.95, 0.15, 1.1].forEach((x, i) => {
      const xx = k === 0 ? x - 0.6 : x + 0.6;
      addTree(T.top, xx, -0.5 - i * 0.28, 1.0 + rnd() * 0.45, 3, '#3a9a68', '#4cb07a', 24 + k * 1.2 + i * 0.7, 0, 'front');
    });
  });

  W.terraces = terraces;
  W.trees = trees;
  W.owlTree = trees.find((t) => t.row === 'mid' && Math.abs(t.g.position.x - 2.6) < 0.01) || trees.find((t) => t.row === 'mid');
}
