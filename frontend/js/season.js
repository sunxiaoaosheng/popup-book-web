// 四季配色。只 lerp 已有材质，换季不重建几何体。
import * as THREE from '../vendor/three.module.js';
import { matCache } from './materials.js';

const RAW = [
  { day: '#f7d3c2', mid: '#eab0a0', night: '#1c2a5a', sun: '#fff0e4', sunI: 2.6, hemi: '#fff1ec' },
  { day: '#a9dcef', mid: '#f3c590', night: '#17305a', sun: '#fffbe0', sunI: 3.0, hemi: '#f4fbff' },
  { day: '#f5b982', mid: '#df8764', night: '#2a2147', sun: '#ffd8a6', sunI: 2.6, hemi: '#ffe9d0' },
  { day: '#d3e0ee', mid: '#c4a9bb', night: '#17264f', sun: '#e8f0ff', sunI: 2.3, hemi: '#eef4ff' },
];

export const SKY = RAW.map((o) => ({
  day: new THREE.Color(o.day), mid: new THREE.Color(o.mid), night: new THREE.Color(o.night),
  sun: new THREE.Color(o.sun), sunI: o.sunI, hemi: new THREE.Color(o.hemi),
}));

const hashOf = (hex) => {
  let h = 0;
  for (let i = 1; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) % 97;
  return h / 97;
};
const _hsl = { h: 0, s: 0, l: 0 };

function seasonColor(hex, s) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl);
  const { h, s: sa, l } = _hsl;
  const green = h > 0.22 && h < 0.52 && sa > 0.1;
  if (!green) return c;
  const hs = hashOf(hex);
  if (s === 0) return c.setHSL(h + 0.012, sa * 0.9, Math.min(0.9, l + 0.035));
  if (s === 1) return c.setHSL(h + (0.33 - h) * 0.5, Math.min(1, sa * 1.12), l * 0.97);
  if (s === 2) {
    if (l > 0.5) return c.setHSL(0.14, 0.5, l * 0.93);
    if (l > 0.3) return c.setHSL(0.02 + hs * 0.1, 0.72, l + 0.08);
    return c.setHSL(0.03 + hs * 0.05, 0.5, l + 0.02);
  }
  if (l > 0.5) return c.setHSL(0.58, 0.28, 0.93 - (0.6 - l) * 0.12);
  if (l > 0.3) return c.setHSL(0.5, 0.22, l + (0.9 - l) * 0.35);
  return c.setHSL(0.47, sa * 0.8, l + 0.05);
}

export function createSeason(W) {
  const seasonMats = [];
  const SEASON = { from: 0, to: 0, t: 1 };
  let lastCoverSeason = -1;

  function initSeasonMats() {
    seasonMats.length = 0;
    for (const m of matCache.values()) {
      const cols = [0, 1, 2, 3].map((s) => seasonColor(m.userData.orig, s));
      if (cols.some((c) => !c.equals(cols[0]))) seasonMats.push({ m, cols });
    }
  }

  function applySeasonColors() {
    const e = SEASON.t * SEASON.t * (3 - 2 * SEASON.t);
    for (const { m, cols } of seasonMats) m.color.lerpColors(cols[SEASON.from], cols[SEASON.to], e);
  }

  function applySeasonVisuals() {
    applySeasonColors();
    const { from, to } = SEASON;
    const e = SEASON.t * SEASON.t * (3 - 2 * SEASON.t);
    const done = from === to || SEASON.t >= 0.999;
    const { accs, props, flowerGroups, store } = W;
    if (done) {
      SEASON.t = 1;
      SEASON.from = to;
      accs.forEach((a, k) => { a.visible = k === to; });
      props.forEach((p, k) => { p.visible = k === to; });
      flowerGroups.forEach((f, k) => { f.visible = to <= 1 || (to === 2 && k % 3 === 0); });
      if (W.partSeason !== to) W.setParticleSeason(to);
      if (lastCoverSeason !== to) {
        W.drawCover(to, store.cycles, store.foundCount());
        lastCoverSeason = to;
      }
      return;
    }
    accs.forEach((a, k) => { a.visible = (k === from && e < 0.72) || (k === to && e > 0.28); });
    props.forEach((p, k) => { p.visible = (k === from && e < 0.72) || (k === to && e > 0.28); });
    const vis = e < 0.5 ? from : to;
    flowerGroups.forEach((f, k) => { f.visible = vis <= 1 || (vis === 2 && k % 3 === 0); });
    const partTarget = e < 0.38 ? from : to;
    if (W.partSeason !== partTarget) W.setParticleSeason(partTarget);
    const coverI = e < 0.82 ? from : to;
    if (lastCoverSeason !== coverI) {
      W.drawCover(coverI, store.cycles, store.foundCount());
      lastCoverSeason = coverI;
    }
  }

  function seasonWeight(s) {
    const { S } = W;
    if (SEASON.from === SEASON.to || SEASON.t >= 1) return S.season === s ? 1 : 0;
    if (SEASON.to === s) return SEASON.t;
    if (SEASON.from === s) return 1 - SEASON.t;
    return 0;
  }

  function setSeason(i, instant = false) {
    if (!seasonMats.length) initSeasonMats();
    i = ((i % 4) + 4) % 4;
    const { S } = W;
    if (instant) {
      SEASON.from = SEASON.to = i;
      SEASON.t = 1;
      S.seasonMorphSaid = false;
    } else {
      SEASON.from = SEASON.to;
      SEASON.to = i;
      SEASON.t = 0;
      S.seasonMorphSaid = false;
    }
    S.season = i;
    applySeasonVisuals();
  }

  W.SEASON = SEASON;
  W.seasonWeight = seasonWeight;
  W.setSeason = setSeason;
  W.applySeasonVisuals = applySeasonVisuals;
  W.initSeasonMats = initSeasonMats;
}
