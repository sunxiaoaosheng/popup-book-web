/**
 * 把触控板逗猫接到光标、字幕、呼噜和桥。
 * 粘住与否在 trackpad-pet.js。这里只投影小猫、收滚动，并在贴纸揭开 / 换季落地时请桥轻点一下。
 */
import * as THREE from '../vendor/three.module.js';
import { TUNING } from './tuning.js';
import { emitAll } from './bus.js';
import { createHapticLink } from './trackpad-haptic.js';
import {
  followPetCursor, inHotspot, pinCursor, sampleForceEvent, stepPetStick, wheelNdc,
} from './trackpad-pet.js';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
/** @type {HTMLElement|null} */
let cursorEl = null;

/** @param {any} W */
function projectKitten(W) {
  const kitten = W.kitten;
  if (!kitten || !kitten.visible) return null;
  const v = W.tmp && W.tmp.p;
  if (!v || !W.camera) return null;
  kitten.getWorldPosition(v);
  v.y += 0.22;
  v.project(W.camera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z < -1 || v.z > 1) return null;
  return { x: v.x, y: v.y };
}

/** @param {any} W @param {number} x @param {number} y */
function hitKitten(W, x, y) {
  if (!W.kitten || !W.kitten.visible || !W.camera) return false;
  ndc.set(x, y);
  raycaster.setFromCamera(ndc, W.camera);
  return raycaster.intersectObject(W.kitten, true).length > 0;
}

/** @param {any} W @param {{x:number,y:number}|null} target */
function overKitten(W, target) {
  const pet = W.S.pet;
  const radius = TUNING.trackpad.hotspot;
  if (hitKitten(W, pet.x, pet.y)) return true;
  return inHotspot(pet, target, radius);
}

function cursorNode() {
  if (cursorEl && cursorEl.isConnected) return cursorEl;
  if (typeof document === 'undefined') return null;
  cursorEl = document.getElementById('pet-cursor');
  if (!cursorEl) {
    cursorEl = document.createElement('div');
    cursorEl.id = 'pet-cursor';
    cursorEl.hidden = true;
    document.body.appendChild(cursorEl);
  }
  return cursorEl;
}

/** @param {any} W @param {boolean} show */
function paintCursor(W, show) {
  const pet = W.S.pet;
  const el = cursorNode();
  const cv = W.gfx && W.gfx.renderer && W.gfx.renderer.domElement;
  if (el) {
    el.hidden = !show;
    el.classList.toggle('stuck', !!pet.stuck);
    if (show && cv) {
      const r = cv.getBoundingClientRect();
      const x = r.left + (pet.x * 0.5 + 0.5) * r.width;
      const y = r.top + (-pet.y * 0.5 + 0.5) * r.height;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }
  if (cv && !(pet.stuck)) {
    if (pet.via === 'wheel') cv.style.cursor = 'none';
    else cv.style.cursor = W.S.hover ? 'pointer' : 'default';
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('pet-stuck', !!pet.stuck);
  }
}

/**
 * 每帧。放在小猫摆姿势之前，眯眼和字幕才能同一拍画上。
 * 钉住的位置用上一帧的小猫，差一帧看不出来。
 * @param {any} W
 * @param {number} dt
 */
export function stepTrackpad(W, dt) {
  const S = W && W.S;
  if (!S || !S.pet || !S.petIn) return;
  const pet = S.pet;
  const sample = S.petIn;
  const wasStuck = pet.stuck;
  let moved = wasStuck ? '' : followPetCursor(pet, sample);
  const present = !!(W.kitten && W.kitten.visible);
  const target = present ? projectKitten(W) : null;
  const over = present && pet.seen && overKitten(W, target);
  const events = stepPetStick(pet, {
    dt,
    angle: S.filtered,
    over,
    present,
    escape: sample.escape,
    down: sample.down || sample.sawDown,
    force: sample.force,
    forceKnown: sample.forceKnown,
  }, TUNING.trackpad);
  sample.sawDown = false;
  if (pet.stuck && target) {
    pinCursor(pet, target.x, target.y);
    moved = 'stuck';
  } else if (wasStuck && !pet.stuck) {
    const again = followPetCursor(pet, sample);
    if (again) moved = again;
    if (!overKitten(W, projectKitten(W))) pet.holdOff = false;
  }
  sample.pointer = null;
  sample.wheel = null;
  sample.escape = false;

  if (moved || pet.stuck) {
    S.mouseX = pet.x;
    S.mouseY = pet.y;
    S.mouseT = S.time;
  }
  if (pet.stuck) S.hover = 'kitten';
  else if (events.some((e) => e.type === 'pet-unstick')) S.hover = '';
  S.petSquint = pet.squint;
  emitAll(W.bus, events);
  paintCursor(W, !!(pet.stuck || pet.via === 'wheel'));
}

/** @param {any} W */
function noteForce(W, e, down) {
  const sample = W.S.petIn;
  const f = sampleForceEvent(e);
  if (f.forceKnown) {
    sample.forceKnown = true;
    sample.force = f.force;
    if (f.force >= TUNING.trackpad.lightForce) sample.sawDown = true;
  }
  if (down) {
    sample.down = true;
    sample.sawDown = true;
  }
}

/** @param {any} W */
function clearPress(W) {
  const sample = W.S.petIn;
  sample.down = false;
  sample.force = null;
  sample.forceKnown = false;
}

/** @param {any} W */
export function wireTrackpad(W) {
  const { S } = W;
  const cv = W.gfx.renderer.domElement;
  const link = createHapticLink((raw) => {
    const send = W.input && W.input.send;
    if (typeof send !== 'function') return false;
    return send(raw);
  }, TUNING.trackpad.hapticGap);

  const tap = () => { link.pulse(S.time); };

  W.bus.on('pet-purr', (e) => {
    const pet = TUNING.trackpad;
    S.moodCap = e.text;
    S.moodUntil = S.time + pet.purrCapSec;
    S.moodKind = 'purr';
    if (!S.purring) {
      W.sound.purr(true);
      S.purring = true;
    }
    S.purrHold = Math.max(S.purrHold || 0, pet.purrSound);
  });
  W.bus.on('sticker', (e) => {
    if (e.phase === 'reveal') tap();
  });
  W.bus.on('season', (e) => {
    if (e.phase === 'land') tap();
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (S.pet.stuck) return;
    const w = wheelNdc(e.deltaX, e.deltaY, e.deltaMode, TUNING.trackpad.scrollNdc);
    const prev = S.petIn.wheel;
    S.petIn.wheel = prev ? { dx: prev.dx + w.dx, dy: prev.dy + w.dy } : w;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S.pet.stuck) return;
    S.petIn.escape = true;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  window.addEventListener('pointerup', () => clearPress(W));
  window.addEventListener('pointercancel', () => clearPress(W));
  window.addEventListener('webkitmouseforcechanged', (e) => noteForce(W, e, false));
  window.addEventListener('webkitmouseforcedown', (e) => noteForce(W, e, true));
  window.addEventListener('webkitmouseforceup', () => {
    S.petIn.forceKnown = true;
    S.petIn.force = 0;
    S.petIn.down = false;
  });
}
