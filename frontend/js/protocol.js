/**
 * 合页角度流，协议版本 1。纯解析，不碰 WebSocket。
 * 字段说明见 docs/PROTOCOL.md。未知字段忽略。
 * 可选 light、weight 缺着就是 null，不改角度。轻拍是单独的 tap 帧。
 * 旧的 {"angle": n} 仍接受。
 */

export const PROTOCOL_VERSION = 1;
/** 超过这么久没有新的角度帧，界面从「已连接」变成「过期」。 */
export const STALE_MS = 1500;

/**
 * @typedef {'angle'|'heartbeat'|'tap'} FrameType
 * @typedef {Object} AngleFrame
 * @property {number} v 0 表示没有版本号的旧帧
 * @property {FrameType} type
 * @property {number|null} angle 心跳和轻拍为 null
 * @property {number|null} seq
 * @property {number|null} t 桥进程内的单调毫秒
 * @property {boolean} legacy
 * @property {string} mode 桥的模式；旧帧为空串
 * @property {number|null} [light] 勒克斯。没有这个字段、或不是有限数字时为 null。0 是夜里，不是缺失。轻拍帧不带。
 * @property {number|null} [weight] 可选的归一化静置力度。缺省、非法都是 null，不是 0。轻拍帧不带。
 * @property {string} [kind] 轻拍的种类。角度帧没有这个字段
 * @property {number} [strength] 轻拍力度 0–1。不带波形
 */

/**
 * @param {string} raw
 * @returns {AngleFrame|null}
 */
export function parseAngleMessage(raw) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = /** @type {Record<string, unknown>} */ (data);
  const v = Number.isInteger(obj.v) ? /** @type {number} */ (obj.v) : 0;
  const seq = typeof obj.seq === 'number' && Number.isFinite(obj.seq) ? obj.seq : null;
  const t = typeof obj.t === 'number' && Number.isFinite(obj.t) ? obj.t : null;
  const declared = typeof obj.type === 'string' ? obj.type : '';
  const angleOk = typeof obj.angle === 'number' && Number.isFinite(obj.angle);
  const legacy = obj.v == null && obj.seq == null && obj.t == null && obj.type == null;
  const mode = typeof obj.mode === 'string' ? obj.mode : '';
  const light = readLight(obj.light);
  const weight = readWeight(obj);

  if (declared === 'heartbeat') {
    return { v, type: 'heartbeat', angle: null, seq, t, legacy: false, mode, light, weight };
  }
  if (declared === 'tap') {
    const kind = typeof obj.kind === 'string' ? obj.kind : '';
    const strength = typeof obj.strength === 'number' && Number.isFinite(obj.strength) ? obj.strength : null;
    if (!kind || strength == null) return null;
    const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
    return { v, type: 'tap', angle: null, seq, t, legacy: false, mode, kind, strength: s };
  }
  if (declared === 'angle' || (declared === '' && angleOk) || (declared !== '' && declared !== 'angle' && angleOk)) {
    if (!angleOk) return null;
    return { v, type: 'angle', angle: /** @type {number} */ (obj.angle), seq, t, legacy, mode, light, weight };
  }
  return null;
}

/** 坏掉的 light 当成没有。0 留下。负值收成 0。 */
function readLight(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value < 0 ? 0 : value;
}

/** 缺字段或不是有限数字 → null。0 是空板，要留下来。 */
function readWeight(obj) {
  if (!Object.prototype.hasOwnProperty.call(obj, 'weight')) return null;
  const w = obj.weight;
  if (typeof w !== 'number' || !Number.isFinite(w)) return null;
  return w;
}

/**
 * @param {boolean} open
 * @param {number} lastAngleAt 本机 performance.now()；0 表示还没收到角度
 * @param {number} now
 * @param {number} [staleMs]
 * @returns {'down'|'wait'|'live'|'stale'}
 */
export function linkState(open, lastAngleAt, now, staleMs = STALE_MS) {
  if (!open) return 'down';
  if (!lastAngleAt) return 'wait';
  if (now - lastAngleAt <= staleMs) return 'live';
  return 'stale';
}

/** 同一条连接上丢掉 seq 不前进的帧。没有 seq 的旧帧一律收下。重连后要 reset。 */
export function createSeqGate() {
  /** @type {number|null} */
  let last = null;
  return {
    /** @param {AngleFrame} frame */
    accept(frame) {
      if (frame.seq == null) return true;
      if (last != null && frame.seq <= last) return false;
      last = frame.seq;
      return true;
    },
    reset() {
      last = null;
    },
  };
}
