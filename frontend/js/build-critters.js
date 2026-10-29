// 猫头鹰、飘落粒子、萤火虫、爱心池、缝里的眼睛。粒子 rnd() 必须在树之后。
import * as THREE from '../vendor/three.module.js';
import { rnd } from './math.js';
import { ellipseShape, polyShape, cut, rectShape, glowTex } from './materials.js';
import { bindEyeRead, makeEyeRim } from './eye-read.js';
import { PH } from './state.js';

export const PCFG = [
  { colors: ['#ffb8cc', '#ffd9e4', '#fff0f4'], size: 0.075, fall: 0.3, sway: 0.5, spin: 2.0, n: 70, up: false, round: false },
  { colors: ['#fffdf0', '#fff3b0', '#e8ffd0'], size: 0.04, fall: -0.07, sway: 0.4, spin: 1.0, n: 44, up: true, round: true },
  { colors: ['#e8742a', '#d9a21e', '#b8431f', '#f0b43a'], size: 0.13, fall: 0.55, sway: 1.0, spin: 4.0, n: 70, up: false, round: false },
  { colors: ['#ffffff', '#eaf3ff', '#ffffff'], size: 0.055, fall: 0.4, sway: 0.35, spin: 0.6, n: 120, up: false, round: true },
];
export const NP = 120;

export function groundY(x, z) {
  return z < 2.15 ? 0.47 : (z < 4.4 && Math.abs(x) > 1.65 ? 0.36 : 0.03);
}

export function buildCritters(W) {
  const { scene, book } = W;
  const hearts = [];
  {
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.5);
    hs.bezierCurveTo(-0.95, 0.05, -0.55, 0.75, 0, 0.3);
    hs.bezierCurveTo(0.55, 0.75, 0.95, 0.05, 0, -0.5);
    const geo = new THREE.ShapeGeometry(hs, 12);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff6b8b', transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      hearts.push({ m, t: 9, x: 0, y: 0, z: 0, vx: 0 });
    }
  }

  const seamEyes = new THREE.Group();
  seamEyes.visible = false;
  book.add(seamEyes);
  seamEyes.userData.eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.33, 0, PH + 0.06);
    e.add(new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.17, 0.2), 20), new THREE.MeshBasicMaterial({ color: '#fff6dc', depthTest: false, transparent: true })));
    const ir = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.12, 0.15), 20), new THREE.MeshBasicMaterial({ color: '#79d36b', depthTest: false, transparent: true }));
    ir.position.z = 0.001;
    e.add(ir);
    const pu = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0, 0, 0.05, 0.12), 16), new THREE.MeshBasicMaterial({ color: '#1b120d', depthTest: false, transparent: true }));
    pu.position.z = 0.002;
    e.add(pu);
    const hl = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(0.04, 0.07, 0.03, 0.03), 10), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
    hl.position.z = 0.003;
    e.add(hl);
    bindEyeRead(e, makeEyeRim(THREE, 0.22, 0.26, 21));
    e.children.forEach((c) => { if (c !== e.userData.halo) c.renderOrder = 20; });
    seamEyes.add(e);
    seamEyes.userData.eyes.push({ g: e, ir, pu, hl });
  }

  const owl = new THREE.Group();
  owl.visible = false;
  scene.add(owl);
  const O = buildOwl(owl);

  const pGeo = new THREE.ShapeGeometry(ellipseShape(0, 0, 0.5, 0.5), 8);
  const pMesh = new THREE.InstancedMesh(
    pGeo,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }),
    NP,
  );
  pMesh.frustumCulled = false;
  pMesh.count = 0;
  pMesh.renderOrder = 5;
  scene.add(pMesh);
  const PA = [];
  for (let i = 0; i < NP; i++) {
    PA.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, ph: rnd() * 10, k: 0.8 + rnd() * 0.4, c: 0, on: false });
  }

  const flies = [];
  for (let i = 0; i < 28; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: '#d8ff7a', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.2 + rnd() * 0.14);
    s.visible = false;
    scene.add(s);
    flies.push({ s, x: (rnd() - 0.5) * 9, y: 0.5 + rnd() * 2.8, z: 0.8 + rnd() * 4.8, ph: rnd() * 10, sp: 0.3 + rnd() * 0.5, t0: 100 + rnd() * 18 });
  }

  W.partSeason = -1;
  W.hearts = hearts;
  W.seamEyes = seamEyes;
  W.owl = owl;
  W.O = O;
  W.pMesh = pMesh;
  W.PA = PA;
  W.flies = flies;
  W.PCFG = PCFG;
  W.NP = NP;

  W.spawnParticle = (p, cfg, initial) => {
    p.x = (rnd() - 0.5) * 9.2;
    p.z = 0.7 + rnd() * 4.8;
    p.y = cfg.up
      ? groundY(p.x, p.z) + 0.05 + rnd() * (initial ? 3.5 : 0.4)
      : (initial ? 0.3 + rnd() * 5 : 5.0 + rnd() * 1.2);
    p.vx = (rnd() - 0.5) * 0.2;
    p.vy = 0;
    p.vz = 0;
    p.rx = rnd() * 6;
    p.ry = rnd() * 6;
    p.rz = rnd() * 6;
    p.on = true;
  };

  W.setParticleSeason = (s) => {
    W.partSeason = s;
    const cfg = PCFG[s];
    const col = W.tmp.col;
    for (let i = 0; i < NP; i++) {
      W.spawnParticle(PA[i], cfg, true);
      PA[i].c = Math.floor(rnd() * cfg.colors.length);
      pMesh.setColorAt(i, col.set(cfg.colors[PA[i].c]));
    }
    pMesh.instanceColor.needsUpdate = true;
  };
}

function buildOwl(owl) {
  const O = {
    body: new THREE.Group(), eyes: [], pupils: [], state: 'perched', t: 0, away: 0,
    hootT: 6, blink: 3, p0: new THREE.Vector3(), p1: new THREE.Vector3(), perch: new THREE.Vector3(), flap: 0,
  };
  owl.add(O.body);
  const B = '#8d6b4b', BD = '#6e5036', BELLY = '#ead8b4';
  O.body.add(cut(ellipseShape(0, 0.24, 0.2, 0.27), B, 0, 0.04));
  O.body.add(cut(ellipseShape(0, 0.19, 0.125, 0.19), BELLY, 0.04, 0.01));
  for (const [x, y] of [[-0.04, 0.26], [0.04, 0.2], [-0.03, 0.14], [0.05, 0.12]]) {
    O.body.add(cut(polyShape([[x - 0.03, y + 0.02], [x, y - 0.015], [x + 0.03, y + 0.02], [x, y]]), '#c9ad82', 0.05, 0.006));
  }
  for (const sx of [-1, 1]) O.body.add(cut(polyShape([[sx * 0.07, 0.46], [sx * 0.18, 0.58], [sx * 0.16, 0.42]]), BD, 0, 0.04));
  O.body.add(cut(ellipseShape(0, 0.37, 0.2, 0.15), B, 0.04, 0.012));
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.085, 0.37, 0.055);
    O.body.add(e);
    e.add(cut(ellipseShape(0, 0, 0.085, 0.085), '#fff3d0', 0, 0.012));
    const p = new THREE.Group();
    p.add(cut(ellipseShape(0, 0, 0.05, 0.05), '#f0b43a', 0.012, 0.008));
    p.add(cut(ellipseShape(0, 0, 0.03, 0.03), '#1b120d', 0.02, 0.008));
    p.add(cut(ellipseShape(0.01, 0.015, 0.01, 0.01), '#fff', 0.028, 0.006));
    e.add(p);
    O.eyes.push(e);
    O.pupils.push(p);
  }
  O.body.add(cut(polyShape([[-0.03, 0.335], [0.03, 0.335], [0, 0.27]]), '#f0a040', 0.062, 0.012));
  O.wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.17, 0.3, 0.04);
    w.add(cut(ellipseShape(sx * 0.05, -0.12, 0.07, 0.19), BD, 0.01, 0.012));
    O.body.add(w);
    O.wings.push(w);
  }
  owl.add(cut(rectShape(-0.32, -0.035, 0.64, 0.06), '#5a3b24', 0, 0.05));
  return O;
}
