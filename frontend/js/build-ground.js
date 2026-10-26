// 桌面、底页、小路、小花。这里的 rnd() 必须先于天空和树，布局种子才和原来一致。
import * as THREE from '../vendor/three.module.js';
import { rnd } from './math.js';
import { cut, box, rectShape, polyShape, ellipseShape } from './materials.js';
import { PW, PH } from './state.js';

export function buildGround(W) {
  const { scene, book } = W;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshLambertMaterial({ color: '#43352b' }));
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -0.125;
  desk.receiveShadow = true;
  scene.add(desk);

  const floorBox = box(PW, 0.12, PH, '#f0e2c2', 0, -0.06, PH / 2);
  book.add(floorBox);
  const floorFace = new THREE.Group();
  floorFace.rotation.x = -Math.PI / 2;
  book.add(floorFace);
  floorFace.add(cut(rectShape(-4.75, -(PH - 0.25), 9.5, PH - 0.35), '#86bb86', 0, 0.02));

  {
    const pts = [];
    const cx = (z) => -0.45 - 0.55 * Math.sin((z - 2.8) * 0.9) * 0.6 - (z - 2.8) * 0.12;
    const w = (z) => 0.32 + (z - 2.8) * 0.07;
    for (let z = 2.75; z <= 5.95; z += 0.2) pts.push([cx(z) - w(z), -z]);
    for (let z = 5.95; z >= 2.75; z -= 0.2) pts.push([cx(z) + w(z), -z]);
    floorFace.add(cut(polyShape(pts), '#f2dfb5', 0.02, 0.02));
    for (let z = 3.3; z < 5.8; z += 0.55) {
      floorFace.add(cut(ellipseShape(cx(z) + (rnd() - 0.5) * 0.3, -z, 0.1, 0.06), '#e0c797', 0.04, 0.01, false));
    }
  }

  const flowerGroups = [];
  for (let i = 0; i < 18; i++) {
    const x = (rnd() - 0.5) * 8.6, z = 2.9 + rnd() * 3.0;
    if (Math.abs(x + 0.9) < 1.0 && z > 2.6) continue;
    const col = ['#ff8fa3', '#fff6e0', '#ffd45e', '#b9a4ff'][i % 4];
    const f = new THREE.Group();
    f.position.set(x, -z, 0.04);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      f.add(cut(ellipseShape(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.045, 0.045), col, 0, 0.012, false));
    }
    f.add(cut(ellipseShape(0, 0, 0.035, 0.035), '#f4a43a', 0.012, 0.012, false));
    floorFace.add(f);
    flowerGroups.push(f);
  }

  W.desk = desk;
  W.floorFace = floorFace;
  W.flowerGroups = flowerGroups;
}
