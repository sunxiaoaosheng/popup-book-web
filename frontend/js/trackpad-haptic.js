/**
 * 请桥做一下很短的触控板轻点。
 * 消息里没有力度、音量或旋钮。桥做不到就当没这回事。
 */

export function encodeHapticTap() {
  return JSON.stringify({ v: 1, type: 'haptic', pattern: 'tap' });
}

/**
 * @param {(raw: string) => boolean|void} send 失败时返回 false 或抛错，都当成没有轻点
 * @param {number} [gap] 秒。两次成功发送至少隔这么久
 */
export function createHapticLink(send, gap = 0.12) {
  let last = -Infinity;
  return {
    /**
     * @param {number} [now]
     * @returns {boolean} 这次有没有把消息交出去
     */
    pulse(now = 0) {
      if (typeof send !== 'function') return false;
      if (now - last < gap) return false;
      try {
        if (send(encodeHapticTap()) === false) return false;
      } catch {
        return false;
      }
      last = now;
      return true;
    },
  };
}
