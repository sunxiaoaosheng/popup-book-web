/**
 * 把 stage-show 的一帧画出来：幕布、折痕、扫光、纸片的站立高度。
 * 不决定「这一拍发生了什么」。弹簧仍由 sim-stage 先算完，这里只在它后面改姿态。
 */
import * as THREE from '../vendor/three.module.js';
import { lerp } from './math.js';
import { appliedGain } from './stage-show.js';

/**
 * @param {any} W
 */
export function createStageView(W) {
  const dom = mountDom();
  const light = new THREE.PointLight('#fff3cf', 0, 28, 1.15);
  light.position.set(0, 6.2, 7.5);
  W.gfx.scene.add(light);
  const cache = { vig: -1, slit: -1, crease: -1, glow: -1, sweep: -1, flash: -1, warm: -1, edge: -1 };

  return {
    /** @param {any} snap */
    apply(snap) {
      paintDom(dom, snap, cache);
      const glow = snap.sweepGlow || 0;
      light.intensity = glow * (snap.mode === 'full' ? 14 : 3.2);
      if (glow > 0.001) light.position.x = lerp(7.2, -7.2, snap.sweep || 0);
      if (snap.dim < 0.999) {
        W.gfx.sun.intensity *= snap.dim;
        W.gfx.hemi.intensity *= snap.dim;
      }
      poseLayers(W, snap.layers);
    },
  };
}

function mountDom() {
  const vignette = document.getElementById('vignette');
  const curtain = ensure('stage-curtain');
  const crease = ensure('stage-crease');
  const sweep = ensure('stage-sweep');
  const warm = ensure('stage-warm');
  const flash = ensure('stage-flash');
  if (vignette) vignette.after(curtain, crease, sweep, warm, flash);
  return { vignette, curtain, crease, sweep, warm, flash };
}

/** @param {string} id */
function ensure(id) {
  const found = document.getElementById(id);
  if (found) return found;
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * @param {ReturnType<typeof mountDom>} dom
 * @param {any} snap
 * @param {Record<string, number>} cache
 */
function paintDom(dom, snap, cache) {
  const slit = snap.slit;
  if (Math.abs(cache.slit - slit) > 0.004) {
    cache.slit = slit;
    const a = lerp(46, 0, slit);
    const b = lerp(54, 100, slit);
    dom.curtain.style.setProperty('--slit-a', a.toFixed(2) + '%');
    dom.curtain.style.setProperty('--slit-b', b.toFixed(2) + '%');
  }
  setOp(dom.curtain, snap.vignette, cache, 'vig');
  const crease = (1 - snap.unfold) * (snap.mode === 'full' ? 0.5 : 0.12);
  setOp(dom.crease, crease, cache, 'crease');
  setOp(dom.sweep, snap.sweepGlow, cache, 'glow');
  if (snap.sweepGlow > 0.001 && Math.abs(cache.sweep - snap.sweep) > 0.004) {
    cache.sweep = snap.sweep;
    dom.sweep.style.transform = `translateX(${lerp(-36, 108, snap.sweep).toFixed(1)}vw)`;
  }
  const warm = snap.closeStyle === 'gentle' && (snap.bow > 0 || snap.beat === 'curtain-gentle')
    ? Math.max(snap.bow, 0.4) * (snap.mode === 'full' ? 0.72 : 0.32)
    : 0;
  setOp(dom.warm, warm, cache, 'warm');
  setOp(dom.flash, snap.flash, cache, 'flash');
  if (dom.vignette) {
    const edge = snap.mode === 'full' ? lerp(1.15, 0.5, slit) : 1;
    if (Math.abs(cache.edge - edge) > 0.01) {
      cache.edge = edge;
      dom.vignette.style.opacity = edge.toFixed(3);
    }
  }
}

/**
 * @param {HTMLElement} el
 * @param {number} value
 * @param {Record<string, number>} cache
 * @param {string} key
 */
function setOp(el, value, cache, key) {
  if (Math.abs(cache[key] - value) <= 0.004) return;
  cache[key] = value;
  el.style.opacity = value.toFixed(3);
}

/** @param {any} W @param {Record<string, number>} g */
function poseLayers(W, g) {
  if (!g) return;
  // 小屋、窗台、小猫的姿态留给弹簧和 kitten-place。这里再乘倍率会把脚抬离窗台。
  const ground = appliedGain('ground', g.ground);
  const trees = appliedGain('trees', g.trees);
  for (const t of W.terraces) {
    const p = Math.min(1.08, Math.max(0, t.spr.x * ground));
    const r = -(1 - p) * Math.PI / 2;
    t.riser.rotation.x = r;
    t.top.rotation.x = r;
  }
  const treeK = Math.min(1.08, trees);
  for (const t of W.trees) {
    if (t.phi == null) continue;
    t.g.rotation.x = Math.PI / 2 - t.phi * treeK;
  }
  const sky = appliedGain('sky', g.sky);
  if (W.moon && sky < 0.999) W.moon.position.y *= lerp(0.88, 1, Math.min(1, sky));
}
