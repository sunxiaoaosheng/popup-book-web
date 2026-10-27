/**
 * 进程内事件总线。玩法状态机只发事件，声音、字幕、网格在订阅端做。
 * 同一个 type 的订阅者按注册顺序同步调用。
 */

export function createBus() {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const subs = new Map();
  return {
    /**
     * @param {string} type
     * @param {(event: any) => void} fn
     */
    on(type, fn) {
      let set = subs.get(type);
      if (!set) {
        set = new Set();
        subs.set(type, set);
      }
      set.add(fn);
      return () => set.delete(fn);
    },
    /**
     * @param {string} type
     * @param {any} event
     */
    emit(type, event) {
      const set = subs.get(type);
      if (!set) return;
      for (const fn of set) fn(event);
    },
  };
}

/** @param {{emit: (type: string, event: any) => void}} bus @param {any[]} events */
export function emitAll(bus, events) {
  for (const event of events) bus.emit(event.type, event);
}
