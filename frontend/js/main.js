// 林间小屋 · 入口。拼场景、输入和帧循环，本身不写玩法。
import { Sound } from './audio.js';
import { store } from './store.js';
import { SECRETS, SEASONS } from './story.js';
import { initUI } from './ui.js';
import { S } from './state.js';
import { createWorld } from './world.js';
import { bindActions } from './actions.js';
import { wirePlay } from './play-wire.js';
import { wireKitten } from './kitten-wire.js';
import { wireTap } from './tap-wire.js';
import { createPerfPanel } from './perf-panel.js';
import { nextPixelRatio, nextShadowSize, shouldRender, QUALITY_WINDOW_S } from './quality.js';
import { createInput } from './input.js';
import { wireTrackpad } from './trackpad-wire.js';
import { step } from './sim.js';
import { noteSeasonReveal } from './season-machine.js';
import { attachDebug } from './debug.js';
import { attachShare } from './share-wire.js';
import { attachJournalWatch } from './journal-watch.js';
import { createAmbientClock } from './ambient-light.js';

const params = new URLSearchParams(location.search);
const stageEl = document.getElementById('stage');
const W = createWorld(stageEl);

const sound = new Sound();
sound.setMuted(store.muted);
const ui = initUI({ SECRETS, SEASONS, store, sound });
W.sound = sound;
W.store = store;
W.ui = ui;
W.watchJournal = attachJournalWatch(W);
bindActions(W);
wirePlay(W);
wireKitten(W);
wireTap(W);
const perfPanel = createPerfPanel();

W.ambient = createAmbientClock();
const input = createInput(W);
W.input = input;
wireTrackpad(W);

const unlockAudio = () => { sound.unlock(); };
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, unlockAudio, { passive: true });
}

W.initSeasonMats();
W.setSeason(params.get('season') != null ? +params.get('season') : store.cycles % 4, true);
if (store.cycles === 0 && !store.seasonSeen(S.season)) store.markSeason(S.season);

attachDebug(W, input);
const share = attachShare(W);

function isMoving() {
  const show = W.stageSnap;
  const curtain = show && (show.sweepGlow > 0.03 || show.flash > 0.03 || show.bow > 0.04);
  const tap = S.tap;
  const tapped = tap && (tap.petal > 0 || tap.door > 0 || tap.look > 0);
  return curtain || tapped || S.sp > 1.2 || Math.abs(S.hinge.v) > 0.5 || Math.abs(S.sunU.v) > 0.02 || S.flutT > 0 || S.burstT > 0 || S.slamT > 0;
}

const perf = W.gfx.perf;
let last = performance.now();

function markHidden() {
  // 只记住「曾经藏起来」。不在这里读 S.target，也不决定补播。
  if (document.hidden) S.pageHidden = true;
}
document.addEventListener('visibilitychange', markHidden);
window.addEventListener('focus', markHidden);

function runFrame(dt) {
  input.tick(document.hidden ? 0 : dt);
  if (document.hidden) S.pageHidden = true;
  else noteSeasonReveal(W.SEASON, S, S.target, true);
  if (!shouldRender(document.hidden)) {
    // 屏幕被盖住时通常不再画。若这一拍仍然被调用，把已经记下的合严结算掉。
    if (S.lidShut) step(W, dt);
    return false;
  }
  step(W, dt);
  return true;
}

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, raw));
  if (!runFrame(dt)) {
    perfPanel.paused();
    requestAnimationFrame(frame);
    return;
  }
  W.gfx.requestShadow(dt, isMoving());
  W.gfx.renderer.render(W.gfx.scene, W.gfx.camera);
  // 没在录短片时 sink 是 null，这里不读像素。
  if (share.sink) share.sink(dt);
  input.maybeHud(dt);
  perf.acc += raw;
  perf.n += 1;
  if (perf.acc > QUALITY_WINDOW_S) {
    const avg = perf.n > 20 ? perf.acc / perf.n : 0;
    const pr = nextPixelRatio(perf.pr, avg);
    if (pr !== perf.pr) {
      perf.pr = pr;
      W.gfx.renderer.setPixelRatio(perf.pr);
      W.gfx.resize();
    }
    const shadow = nextShadowSize(perf.shadowSize, perf.pr, avg);
    if (shadow !== perf.shadowSize) W.gfx.setShadowSize(shadow);
    perf.acc = 0;
    perf.n = 0;
  }
  perfPanel.sample(dt, {
    frameMs: raw * 1000,
    calls: W.gfx.renderer.info.render.calls,
    pr: perf.pr,
    shadow: perf.shadowSize,
  });
  requestAnimationFrame(frame);
}

const popup = /** @type {any} */ (window).__popup;
popup.frame = (sec = 1 / 60) => {
  const dt = Math.min(0.05, Math.max(0, +sec || 0));
  if (runFrame(dt)) {
    W.gfx.requestShadow(dt, isMoving());
    W.gfx.renderer.render(W.gfx.scene, W.gfx.camera);
  }
};
popup.pushRaw = (raw) => input.pushRaw(raw);
popup.holdSensor = (on) => input.holdSensor(on);

requestAnimationFrame(frame);
