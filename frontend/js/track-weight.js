/**
 * 触控板力度是窗台上的一件低频礼物。
 * 稳定一会儿才把礼物放上来，小猫闻一下就收回姿态；拿开后礼物离开。
 * 不读合页角度，也不把力度画成秤。weight 为 null 表示这一拍没有力度通道。
 */

/** @typedef {ReturnType<typeof createTrackWeight>} TrackWeight */

export function createTrackWeight() {
  return {
    /** @type {'idle'|'arming'|'ready'|'sniff'|'held'|'recover'} */
    phase: 'idle',
    present: false,
    /** @type {number|null} */
    anchor: null,
    stable: 0,
    cool: 0,
    left: 0,
    /** 礼物可见程度，0..1。跟力度大小无关，只跟「已经稳定」有关。 */
    gift: 0,
    /** 闻的那一下，0..1，结束时回到 0。 */
    sniff: 0,
    /** 拿开后的复原，0..1。 */
    recover: 0,
  };
}

/**
 * @param {TrackWeight} st
 * @param {{weight?: number|null, dt?: number, onSill?: boolean}} input
 * @param {typeof import('./tuning.js').TUNING.trackWeight} t
 * @returns {{type: string}[]}
 */
export function stepTrackWeight(st, input, t) {
  /** @type {{type: string}[]} */
  const events = [];
  const dt = Math.min(0.1, Math.max(0, Number(input.dt) || 0));
  const raw = input.weight;
  const weight = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : null;
  const onSill = !!input.onSill;
  st.cool = Math.max(0, st.cool - dt);

  if (st.phase === 'recover') {
    advance(st, dt, t);
    return events;
  }

  if (weight == null) {
    release(st, t, events);
    advance(st, dt, t);
    return events;
  }

  const present = st.present ? weight >= t.off : weight >= t.on;
  st.present = present;
  if (!present) {
    st.anchor = null;
    st.stable = 0;
    release(st, t, events);
    advance(st, dt, t);
    return events;
  }

  if (st.phase === 'sniff' || st.phase === 'held') {
    advance(st, dt, t);
    return events;
  }

  if (st.phase === 'ready') {
    if (onSill && st.cool <= 0) beginSniff(st, t, events);
    advance(st, dt, t);
    return events;
  }

  if (st.anchor == null || Math.abs(weight - st.anchor) > t.jitter) {
    st.anchor = weight;
    st.stable = 0;
  } else {
    st.stable += dt;
  }
  if (st.phase === 'idle') st.phase = 'arming';
  if (st.stable >= t.stableSec) st.phase = 'ready';
  if (st.phase === 'ready' && onSill && st.cool <= 0) beginSniff(st, t, events);
  advance(st, dt, t);
  return events;
}

/**
 * @param {TrackWeight} st
 * @param {typeof import('./tuning.js').TUNING.trackWeight} t
 * @param {{type: string}[]} events
 */
function beginSniff(st, t, events) {
  st.phase = 'sniff';
  st.left = t.sniffSec;
  st.cool = t.cooldownSec;
  st.sniff = 0;
  events.push({ type: 'track-sniff' });
}

/**
 * 礼物已经在台上时，拿开或通道消失都走复原。还在等稳定时直接回到空闲。
 * @param {TrackWeight} st
 * @param {typeof import('./tuning.js').TUNING.trackWeight} t
 * @param {{type: string}[]} events
 */
function release(st, t, events) {
  if (st.phase === 'sniff' || st.phase === 'held' || st.phase === 'ready') {
    st.phase = 'recover';
    st.left = t.recoverSec;
    st.sniff = 0;
    events.push({ type: 'track-recover' });
  } else if (st.phase === 'arming') {
    st.phase = 'idle';
  }
  st.present = false;
  st.anchor = null;
  st.stable = 0;
}

/**
 * @param {TrackWeight} st
 * @param {number} dt
 * @param {typeof import('./tuning.js').TUNING.trackWeight} t
 */
function advance(st, dt, t) {
  if (st.phase === 'sniff') {
    st.left -= dt;
    const u = 1 - st.left / Math.max(t.sniffSec, 1e-3);
    st.sniff = u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, u));
    if (st.left <= 0) {
      st.phase = 'held';
      st.sniff = 0;
      st.left = 0;
    }
  } else if (st.phase === 'recover') {
    st.left -= dt;
    const u = 1 - st.left / Math.max(t.recoverSec, 1e-3);
    st.recover = u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, u));
    if (st.left <= 0) {
      st.phase = 'idle';
      st.recover = 0;
      st.left = 0;
    }
  } else {
    st.sniff = approach(st.sniff, 0, dt, 0.12);
    st.recover = approach(st.recover, 0, dt, 0.15);
  }
  const show = st.phase === 'ready' || st.phase === 'sniff' || st.phase === 'held';
  st.gift = approach(st.gift, show ? 1 : 0, dt, show ? 0.16 : 0.2);
  if (st.phase === 'idle' && st.gift < 0.012) st.gift = 0;
}

/** @param {number} cur @param {number} goal @param {number} dt @param {number} tau */
function approach(cur, goal, dt, tau) {
  if (!(tau > 0)) return goal;
  return cur + (goal - cur) * (1 - Math.exp(-dt / tau));
}
