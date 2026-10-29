// 换季时一道粒子锋面扫过场面。几何在开场分配一次，平时 count 为 0。
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp } from './math.js';
import { ellipseShape, glowTex } from './materials.js';
import { ritualIntensity, ritualKind, sweepParticle } from './season-ritual.js';
import { TUNING } from './tuning.js';

export const RITUAL_MAX = 96;

const SIZE = { petals: 0.16, fireflies: 0.075, leaves: 0.2, snow: 0.062 };
const FLAT = { petals: 0.7, fireflies: 1, leaves: 0.48, snow: 1 };
const PALETTE = {
  petals: ['#ffb7c8', '#fff4f7', '#ff8fab', '#ffd6e0'],
  fireflies: ['#e8ff6a', '#fff4a0', '#c6ff4a'],
  leaves: ['#e07020', '#d9a21e', '#b8431f', '#f0b43a'],
  snow: ['#ffffff', '#e7f0ff', '#f7fbff'],
};

const slot = { u: 0, v: 0, lift: 0, spin: 0, scale: 1, alpha: 0, front: 0 };

export function buildSeasonSweep(W) {
  const geo = new THREE.ShapeGeometry(ellipseShape(0, 0, 0.5, 0.5), 7);
  const mat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, RITUAL_MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 6;
  W.scene.add(mesh);

  const haze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: '#e4f59a',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  haze.scale.set(5.4, 2.15, 1);
  haze.frustumCulled = false;
  haze.renderOrder = 4;
  haze.visible = false;
  W.scene.add(haze);

  W.ritualMesh = mesh;
  W.ritualHaze = haze;
  W.ritualKind = '';
}

function applyKind(W, kind) {
  if (W.ritualKind === kind) return;
  W.ritualKind = kind;
  const cols = PALETTE[kind] || PALETTE.petals;
  const col = W.tmp.col;
  const mesh = W.ritualMesh;
  for (let i = 0; i < RITUAL_MAX; i++) mesh.setColorAt(i, col.set(cols[i % cols.length]));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const additive = kind === 'fireflies';
  const blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  if (mesh.material.blending !== blending) {
    mesh.material.blending = blending;
    mesh.material.needsUpdate = true;
  }
}

function underLid(F, z) {
  if (F.th >= 1.45) return 4.8;
  return F.lidY + z * F.tanTh - 0.12;
}

/** @param {any} W */
export function stepSeasonSweep(W) {
  const mesh = W.ritualMesh;
  const haze = W.ritualHaze;
  if (!mesh) return;
  const SEASON = W.SEASON;
  const t = SEASON.t;
  const active = SEASON.from !== SEASON.to && t > 0 && t < 1;
  const inten = active ? ritualIntensity(t) : 0;
  if (inten < 0.04) {
    mesh.count = 0;
    haze.visible = false;
    return;
  }
  const kind = ritualKind(SEASON.to);
  applyKind(W, kind);
  const n = Math.min(RITUAL_MAX, TUNING.ritualParticles);
  const { S, frame: F } = W;
  const time = S.time;
  const { p: pos, e, q, sv, m4 } = W.tmp;
  mesh.count = n;
  for (let i = 0; i < n; i++) {
    sweepParticle(i, n, t, time, kind, TUNING, slot);
    const z = lerp(0.85, 5.05, slot.v);
    const yMax = clamp(underLid(F, z), 0.55, 4.8);
    const y = lerp(0.28, yMax, slot.lift);
    const x = lerp(-4.7, 4.7, slot.u);
    const sc = SIZE[kind] * slot.scale * (0.45 + 0.55 * Math.min(1, slot.alpha));
    pos.set(x, y, z);
    e.set(slot.spin, slot.spin * 0.55, 0);
    q.setFromEuler(e);
    sv.set(FLAT[kind] * sc, sc, sc);
    m4.compose(pos, q, sv);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const showHaze = kind === 'fireflies';
  const zH = 1.7;
  const yH = clamp(underLid(F, zH) * 0.82, 1.2, 2.8);
  haze.visible = showHaze;
  haze.position.set(lerp(-4.7, 4.7, slot.front), yH, zH);
  haze.material.opacity = showHaze ? inten * TUNING.ritualHaze : 0;
}
