/**
 * 轻拍 / 连敲。桥或键盘只交已经分好类的事件（kind + strength），
 * 这里决定这一下算不算：冷却、换季补播、开场幕布。
 * 不读波形，不碰网格，不推进换季。
 */
import { TUNING } from './tuning.js';

/** 桥上允许的 kind。力度用 strength，轻拍和重拍是同一种 kind。 */
export const TAP_KINDS = ['slap', 'double-knock', 'triple-knock'];

const KIND_SET = new Set(TAP_KINDS);

/** @returns {{cool:number, door:number, look:number, petal:number, last:string}} */
export function createTapState() {
  return { cool: 0, door: 0, look: 0, petal: 0, last: '' };
}

/**
 * 开场首演还在演（含第一次合上时的落幕）时不算。
 * 幕布还没建起来时看存档：没看过就先拦住。
 * @param {{live?: boolean, bow?: number, bowFull?: boolean}|null|undefined} show
 * @param {boolean} stageShown
 */
export function stageBlocksTaps(show, stageShown) {
  if (show) {
    if (show.live) return true;
    if ((show.bow || 0) > 0.02 && show.bowFull) return true;
    return false;
  }
  return !stageShown;
}

/** @param {{seasonCatchup?: boolean, revealOpen?: boolean}|null|undefined} S */
export function catchupBlocksTaps(S) {
  return !!(S && (S.seasonCatchup || S.revealOpen));
}

/**
 * 门额外张开的弧度。包络两端是 0，中间最大。
 * @param {number} door 1 刚拍下，0 结束
 * @param {number} [amp]
 */
export function doorNudgeYaw(door, amp = TUNING.tapDoorYaw) {
  if (!(door > 0)) return 0;
  return Math.sin(door * Math.PI) * amp;
}

/**
 * 加在视线目标上的抬头。正值朝上。包络和门一样。
 * @param {number} look
 * @param {number} [amp]
 */
export function lookUpBias(look, amp = TUNING.tapLookUp) {
  if (!(look > 0)) return 0;
  return Math.sin(look * Math.PI) * amp;
}

/**
 * @param {unknown} raw
 * @returns {{kind: string, strength: number}|null}
 */
export function readTap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const obj = /** @type {{kind?: unknown, strength?: unknown}} */ (raw);
  const kind = obj.kind;
  const strength = obj.strength;
  if (typeof kind !== 'string' || !KIND_SET.has(kind)) return null;
  if (typeof strength !== 'number' || !Number.isFinite(strength)) return null;
  return { kind, strength: strength < 0 ? 0 : strength > 1 ? 1 : strength };
}

/**
 * @param {ReturnType<typeof createTapState>} state
 * @param {{
 *   dt?: number,
 *   taps?: object[],
 *   catchup?: boolean,
 *   staging?: boolean,
 *   near?: string[],
 * }} input
 * @param {typeof TUNING} [tuning]
 */
export function stepTap(state, input, tuning = TUNING) {
  const dt = Math.max(0, input.dt || 0);
  state.cool = Math.max(0, state.cool - dt);
  state.door = Math.max(0, state.door - dt / Math.max(0.05, tuning.tapDoorSec));
  state.look = Math.max(0, state.look - dt / Math.max(0.05, tuning.tapLookSec));
  state.petal = Math.max(0, state.petal - dt);

  /** @type {object[]} */
  const events = [];
  const blocked = input.catchup ? 'catchup' : input.staging ? 'stage' : '';
  for (const raw of input.taps || []) {
    const hinted = raw && typeof raw === 'object' && typeof raw.kind === 'string' ? raw.kind : '';
    if (blocked) {
      events.push({ type: 'tap-ignored', reason: blocked, kind: hinted });
      continue;
    }
    const tap = readTap(raw);
    if (!tap) {
      events.push({ type: 'tap-ignored', reason: 'bad', kind: hinted });
      continue;
    }
    if (state.cool > 0) {
      events.push({ type: 'tap-ignored', reason: 'cooldown', kind: tap.kind });
      continue;
    }
    state.cool = tuning.tapCooldown;
    if (tap.kind === 'slap') {
      const strong = tap.strength >= tuning.tapStrong;
      const gesture = strong ? 'strong-slap' : 'light-slap';
      state.last = gesture;
      if (!strong) {
        state.door = 1;
        state.look = 1;
      }
      events.push({ type: 'tap', gesture, strength: tap.strength });
      continue;
    }
    if (tap.kind === 'double-knock') {
      state.last = 'double-knock';
      let secret = '';
      for (const id of input.near || []) {
        if (id) {
          secret = id;
          break;
        }
      }
      events.push({ type: 'tap', gesture: 'double-knock', strength: tap.strength, secret });
      continue;
    }
    state.last = 'triple-knock';
    state.petal = tuning.tapPetalSec;
    events.push({ type: 'tap', gesture: 'triple-knock', strength: tap.strength });
  }
  return events;
}
