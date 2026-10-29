// 把天空渐变、日光和天光涂到已经存在的灯和材质上。不新建网格。
import * as THREE from '../vendor/three.module.js';
import { lerp } from './math.js';
import { SKY } from './season.js';
import { SKY_RITUAL, skyWeights, twilightPulse } from './sky-bands.js';
import { TUNING } from './tuning.js';
import { paintSky } from './sky-gradient.js';

const BANDS = ['dawn', 'day', 'dusk', 'night'];

const CACHE = SKY_RITUAL.map((season) => season.map((row) => ({
  top: new THREE.Color(row.top),
  horizon: new THREE.Color(row.horizon),
  glow: new THREE.Color(row.glow),
  sun: new THREE.Color(row.sun),
  hemi: new THREE.Color(row.hemi),
  ground: new THREE.Color(row.ground),
  sunK: row.sunK,
  hemiK: row.hemiK,
})));

const weights = { dawn: 0, day: 0, dusk: 0, night: 0 };
const acc = {
  top: new THREE.Color(),
  horizon: new THREE.Color(),
  glow: new THREE.Color(),
  sun: new THREE.Color(),
  hemi: new THREE.Color(),
  ground: new THREE.Color(),
};

/**
 * @param {any} W
 * @param {{se:number, uc:number, nightP:number, dawnP:number, goldP:number, elev:number}} sample
 */
export function applySeasonLight(W, sample) {
  const { se, uc, nightP, dawnP, goldP, elev } = sample;
  const e = se * se * (3 - 2 * se);
  const { from, to } = W.SEASON;
  skyWeights(uc, nightP, weights);
  const pulse = twilightPulse(uc, nightP);
  let sunK = 0;
  let hemiK = 0;
  const mix = (key) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 4; i++) {
      const k = weights[BANDS[i]];
      const c0 = CACHE[from][i][key];
      const c1 = CACHE[to][i][key];
      r += (c0.r + (c1.r - c0.r) * e) * k;
      g += (c0.g + (c1.g - c0.g) * e) * k;
      b += (c0.b + (c1.b - c0.b) * e) * k;
    }
    acc[key].setRGB(r, g, b);
  };
  mix('top');
  mix('horizon');
  mix('glow');
  mix('sun');
  mix('hemi');
  mix('ground');
  for (let i = 0; i < 4; i++) {
    const k = weights[BANDS[i]];
    const a = CACHE[from][i];
    const b = CACHE[to][i];
    sunK += (a.sunK + (b.sunK - a.sunK) * e) * k;
    hemiK += (a.hemiK + (b.hemiK - a.hemiK) * e) * k;
  }

  paintSky(W.skyMat, acc.top, acc.horizon, acc.glow, 0.26 + TUNING.ritualTwilight * pulse);

  const SF = SKY[from];
  const SK = SKY[to];
  const lowP = Math.max(dawnP, goldP);
  const sun = W.gfx.sun;
  sun.color.copy(acc.sun);
  sun.intensity = lerp(lerp(SF.sunI, SK.sunI, e) * (0.62 + 0.38 * elev), 1.3, nightP) * sunK;
  const hemi = W.gfx.hemi;
  hemi.color.copy(acc.hemi);
  hemi.groundColor.copy(acc.ground);
  hemi.intensity = lerp(1.5 - 0.25 * lowP, 1.05, nightP) * hemiK;

  W.horizonMat.color.copy(acc.glow);
  W.horizonMat.opacity = Math.min(0.95, Math.max(0.55 * dawnP, 0.85 * goldP, 0.7 * pulse) * (1 - nightP));

  const bg = W.gfx.scene.background;
  bg.copy(acc.top);
  const m = Math.max(bg.r, bg.g, bg.b, 1e-4);
  bg.multiplyScalar(0.22 / m);
}
