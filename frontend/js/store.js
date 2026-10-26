// 本地存档（localStorage）：翻开次数、已发现的小秘密、已见过的季节、静音偏好。
// 没有 localStorage（隐私模式等）时退化为内存，不会报错。
const KEY = 'popup-book.forest-cabin.v2';
const params = new URLSearchParams(location.search);
const blank = () => ({ cycles: 0, secrets: {}, seasons: { 0: 1 }, muted: false, pets: 0, opens: 0 });
let mem = null;
function read() {
  if (params.get('nostore') === '1') return mem || (mem = blank());
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); } catch (_) { /* ignore */ }
  return mem || (mem = blank());
}
let data = read();
if (params.get('reset') === '1') { data = blank(); }
function save() {
  mem = data;
  if (params.get('nostore') === '1') return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* ignore */ }
}
save();

export const store = {
  get data() { return data; },
  get cycles() { return data.cycles; },
  get muted() { return data.muted; },
  setMuted(m) { data.muted = !!m; save(); },
  hasSecret(id) { return !!data.secrets[id]; },
  foundCount() { return Object.keys(data.secrets).length; },
  /** 记录新发现的秘密；返回 true 表示这是第一次发现 */
  addSecret(id) { if (data.secrets[id]) return false; data.secrets[id] = Date.now(); save(); return true; },
  addCycle() { data.cycles += 1; save(); return data.cycles; },
  markSeason(i) { data.seasons[i] = (data.seasons[i] || 0) + 1; save(); },
  seasonSeen(i) { return !!data.seasons[i]; },
  addPet() { data.pets += 1; save(); return data.pets; },
  addOpen() { data.opens += 1; save(); },
  reset() { data = blank(); save(); },
};
