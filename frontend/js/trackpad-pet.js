/**
 * 触控板逗猫。光标进热点就粘住，轻压眯眼。
 * 不读网格、不发音、不发触觉。那些在 trackpad-wire.js。
 * 没有旋钮，也没有音量：轻点是固定的一下。
 */
import { clamp } from './math.js';

export const PURR_LINE = '呼噜……它眯起了眼';

/** @returns {{stuck:boolean, holdOff:boolean, squint:number, purrCd:number, held:boolean, x:number, y:number, via:string, seen:boolean}} */
export function createPetStick() {
  return {
    stuck: false,
    holdOff: false,
    squint: 0,
    purrCd: 0,
    held: false,
    x: 0,
    y: 0,
    via: 'pointer',
    /** 还没收到过手指或滚动时，屏幕中心不是一只真光标，不能把人粘住。 */
    seen: false,
  };
}

/** 这一帧的手指、滚动、按压。粘住时手指和滚动先记下，但不拿去挪开光标。 */
export function createPetInput() {
  return {
    pointer: null,
    wheel: null,
    escape: false,
    down: false,
    /** 按下或轻压在这一帧动画之前就松开了，也要留给判定看一眼。 */
    sawDown: false,
    force: null,
    forceKnown: false,
  };
}

/**
 * @param {number} n
 * @returns {number|null}
 */
function finite(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * 自由时：手指把光标放到绝对位置，触控板滚动在这上面挪。
 * 粘住时两者都丢掉，光标留在原地，等画面把它钉到小猫身上。
 * @param {{stuck:boolean, x:number, y:number, via:string, seen:boolean}} state
 * @param {{pointer?:{x:number,y:number}|null, wheel?:{dx:number,dy:number}|null}} sample
 * @returns {'pointer'|'wheel'|'stuck'|''}
 */
export function followPetCursor(state, sample) {
  if (state.stuck) return 'stuck';
  const pointer = sample && sample.pointer;
  if (pointer) {
    const x = finite(pointer.x);
    const y = finite(pointer.y);
    if (x != null && y != null) {
      state.x = clamp(x, -1, 1);
      state.y = clamp(y, -1, 1);
      state.via = 'pointer';
      state.seen = true;
      return 'pointer';
    }
  }
  const wheel = sample && sample.wheel;
  if (wheel) {
    const dx = finite(wheel.dx) || 0;
    const dy = finite(wheel.dy) || 0;
    state.x = clamp(state.x + dx, -1, 1);
    state.y = clamp(state.y + dy, -1, 1);
    state.via = 'wheel';
    state.seen = true;
    return 'wheel';
  }
  return '';
}

/**
 * @param {{stuck:boolean, x:number, y:number, via:string}} state
 * @param {number} x
 * @param {number} y
 */
export function pinCursor(state, x, y) {
  if (!state.stuck) return false;
  const px = finite(x);
  const py = finite(y);
  if (px == null || py == null) return false;
  state.x = clamp(px, -1, 1);
  state.y = clamp(py, -1, 1);
  state.via = 'stuck';
  return true;
}

/**
 * 光标离小猫投影够近，算进了热点。射线打中与否由调用方另判。
 * @param {{x:number, y:number}} cursor
 * @param {{x:number, y:number}|null} target
 * @param {number} radius NDC
 */
export function inHotspot(cursor, target, radius) {
  if (!target || !(radius > 0)) return false;
  const dx = cursor.x - target.x;
  const dy = cursor.y - target.y;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * 像素滚动换成 NDC。deltaY 向下为正，NDC 的 y 向上为正。
 * @param {number} deltaX
 * @param {number} deltaY
 * @param {number} deltaMode 0 像素，1 行，2 页
 * @param {number} scale NDC / 像素
 */
export function wheelNdc(deltaX, deltaY, deltaMode, scale) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  const s = finite(scale) || 0;
  const cap = 80;
  const dx = clamp((finite(deltaX) || 0) * unit, -cap, cap) * s;
  const dy = -clamp((finite(deltaY) || 0) * unit, -cap, cap) * s;
  return { dx, dy };
}

/**
 * 有 webkitForce，或笔/触摸的压力，才算「知道力度」。
 * 普通鼠标的 pressure 固定 0.5，不当成力度，改走按下。
 * @param {{webkitForce?:number, pressure?:number, pointerType?:string, forceBasis?:number}} e
 * @returns {{forceKnown:boolean, force:number|null}}
 */
export function sampleForce(e = {}) {
  const basis = typeof e.forceBasis === 'number' && e.forceBasis > 0 ? e.forceBasis : 1;
  if (typeof e.webkitForce === 'number' && Number.isFinite(e.webkitForce)) {
    return { forceKnown: true, force: e.webkitForce / basis };
  }
  const kind = e.pointerType;
  if ((kind === 'pen' || kind === 'touch') && typeof e.pressure === 'number' && Number.isFinite(e.pressure)) {
    return { forceKnown: true, force: Math.min(1, Math.max(0, e.pressure)) };
  }
  return { forceKnown: false, force: null };
}

/** 浏览器事件 → sampleForce。没有 MouseEvent 时基准按 1。 */
export function sampleForceEvent(e) {
  const host = typeof MouseEvent !== 'undefined' ? /** @type {any} */ (MouseEvent) : null;
  const raw = host && host.WEBKIT_FORCE_AT_MOUSE_DOWN;
  const basis = typeof raw === 'number' && raw > 0 ? raw : 1;
  return sampleForce({
    webkitForce: e && e.webkitForce,
    pressure: e && e.pressure,
    pointerType: e && e.pointerType,
    forceBasis: basis,
  });
}

/**
 * 轻压（力度够了，不必等按键）或普通按下，都算。
 * 力度不够时，按下仍然算，这样没有 Force Touch 的设备走同一条眯眼。
 * @param {{forceKnown?:boolean, force?:number|null, down?:boolean}} input
 * @param {number} lightForce
 */
export function pressNow(input, lightForce) {
  const force = input.forceKnown && typeof input.force === 'number' && Number.isFinite(input.force)
    ? input.force
    : null;
  if (force != null && force >= lightForce) return true;
  return !!input.down;
}

/**
 * @param {ReturnType<typeof createPetStick>} state
 * @param {{dt?:number, angle?:number, over?:boolean, present?:boolean, escape?:boolean, down?:boolean, force?:number|null, forceKnown?:boolean}} input
 * @param {{stickOn?:number, stickOff?:number, lightForce?:number, squintSec?:number, purrGap?:number}} [tuning]
 * @returns {{type:string, reason?:string, text?:string}[]}
 */
export function stepPetStick(state, input, tuning = {}) {
  const stickOn = finite(tuning.stickOn) ?? 90;
  const stickOff = finite(tuning.stickOff) ?? 84;
  const lightForce = finite(tuning.lightForce) ?? 0.4;
  const squintSec = Math.max(0.05, finite(tuning.squintSec) ?? 0.85);
  const purrGap = Math.max(0, finite(tuning.purrGap) ?? 1.15);
  const dt = Math.max(0, finite(input.dt) || 0);
  /** @type {{type:string, reason?:string, text?:string}[]} */
  const events = [];

  if (state.purrCd > 0) state.purrCd = Math.max(0, state.purrCd - dt);
  if (state.squint > 0) state.squint = Math.max(0, state.squint - dt / squintSec);

  const wasStuck = state.stuck;
  const angle = finite(input.angle);
  let escaped = false;
  if (state.stuck) {
    if (input.escape) {
      state.stuck = false;
      state.holdOff = true;
      escaped = true;
      events.push({ type: 'pet-unstick', reason: 'esc' });
    } else if (!input.present) {
      state.stuck = false;
      events.push({ type: 'pet-unstick', reason: 'gone' });
    } else if (!(angle != null && angle >= stickOff)) {
      state.stuck = false;
      events.push({ type: 'pet-unstick', reason: 'lid' });
    }
  } else if (!input.escape && !state.holdOff && input.present && input.over && angle != null && angle >= stickOn) {
    state.stuck = true;
    events.push({ type: 'pet-stick' });
  }
  // Esc 这一拍不因为 over 还没刷新就把「先离开再进来」清掉。
  if (!state.stuck && !input.over && !escaped) state.holdOff = false;

  const pressed = pressNow(input, lightForce);
  const edge = pressed && !state.held;
  state.held = pressed;
  // 刚粘上的那一拍不算「粘住之后的按」，避免点下去的同时喵一声又呼噜一声。
  // 按着的时候眯眼停住，松开再慢慢睁开。字幕只在按下沿说一次。
  if (wasStuck && state.stuck && pressed) {
    state.squint = 1;
    if (edge && state.purrCd <= 0) {
      state.purrCd = purrGap;
      events.push({ type: 'pet-purr', text: PURR_LINE });
    }
  }
  return events;
}
