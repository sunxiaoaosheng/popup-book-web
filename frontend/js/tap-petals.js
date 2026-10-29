/**
 * 三连敲时在舱门前扬起一小团花瓣，大约 0.6 秒。
 * 几何在开场分配一次。这不是换季扫场：不读 SEASON.t，不改 ritualMesh。
 */
import * as THREE from '../vendor/three.module.js';
import { ellipseShape } from './materials.js';
import { TUNING } from './tuning.js';
import { petalAccent } from './tap-accent.js';

const COLORS = ['#ffb7c8', '#fff4f7', '#ff8fab', '#ffd6e0'];

/** @param {any} W */
export function buildTapPetals(W) {
  const n = TUNING.tapPetals;
  const geo = new THREE.ShapeGeometry(ellipseShape(0, 0, 0.5, 0.32), 6);
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 7;
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) mesh.setColorAt(i, col.set(COLORS[i % COLORS.length]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  W.scene.add(mesh);
  W.tapPetals = mesh;
}

/** @param {any} W */
export function stepTapPetals(W) {
  const mesh = W.tapPetals;
  const tap = W.S && W.S.tap;
  if (!mesh || !tap) return;
  const dur = TUNING.tapPetalSec;
  const left = tap.petal;
  if (!(left > 0) || !(dur > 0)) {
    if (mesh.count) mesh.count = 0;
    return;
  }
  const u = 1 - left / dur;
  const n = TUNING.tapPetals;
  const time = W.S.time || 0;
  const lead = petalAccent(0, n, u, time);
  mesh.material.opacity = 0.92 * lead.alpha;
  if (lead.alpha < 0.02) {
    mesh.count = 0;
    return;
  }
  const origin = W.tmp.v;
  if (W.doorPivot) W.doorPivot.getWorldPosition(origin);
  else origin.set(0, 1.1, 2.4);
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const { p: pos, e, q, sv, m4 } = W.tmp;
  mesh.count = n;
  for (let i = 0; i < n; i++) {
    const petal = petalAccent(i, n, u, time);
    pos.set(ox + petal.x, oy + petal.y, oz + petal.z + 0.16);
    e.set(petal.spin * 0.35, petal.spin, 0);
    q.setFromEuler(e);
    const sc = 0.16 * petal.scale;
    sv.set(sc * 0.72, sc, sc);
    m4.compose(pos, q, sv);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
