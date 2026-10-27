// 浏览器存档适配。判定和字段在 store-core.js，这里只接 localStorage。
import { createStore } from './store-core.js';

const KEY = 'popup-book.forest-cabin.v2';
const params = new URLSearchParams(location.search);
/** @type {string|null} */
let memory = null;

const io = {
  read() {
    if (params.get('nostore') === '1') return memory ? JSON.parse(memory) : null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* 隐私模式 */ }
    return memory ? JSON.parse(memory) : null;
  },
  write(data) {
    memory = JSON.stringify(data);
    if (params.get('nostore') === '1') return;
    try { localStorage.setItem(KEY, memory); } catch { /* ignore */ }
  },
};

const initial = params.get('reset') === '1' ? null : io.read();
export const store = createStore(io, initial);
