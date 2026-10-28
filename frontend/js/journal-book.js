/**
 * 小秘密贴纸本的 DOM：八格、揭开动画、集齐之后可以再看一次。
 */
import { describeSlot } from './journal-hints.js';
import { stickerMarkup } from './sticker-art.js';

/**
 * @param {string} tag
 * @param {Record<string, string>} [props]
 * @param {Node} [parent]
 */
function el(tag, props = {}, parent) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * @param {{
 *   secrets: { id: string, name: string, hint: string, found: string }[],
 *   seasons: { name: string }[],
 *   store: any,
 *   endingVisible?: () => boolean,
 * }} opts
 */
export function createJournalBook({ secrets, seasons, store, endingVisible = () => false }) {
  const panel = el('div', { id: 'journal' });
  panel.hidden = true;
  const head = el('h3', {}, panel);
  head.append('小秘密贴纸本 ');
  const count = el('small', {}, head);
  const banner = el('div', { className: 'done-banner' }, panel);
  banner.hidden = true;
  el('span', { textContent: '八张都贴上了' }, banner);
  const replay = el('button', { type: 'button', className: 'ghost', id: 'jreplay', textContent: '再看一次' }, banner);

  const grid = el('div', { className: 'grid' }, panel);
  const slots = secrets.map((secret, index) => {
    const slot = el('div', { className: 'slot empty' }, grid);
    const paper = el('div', { className: 'paper' }, slot);
    const art = el('div', { className: 'art' }, paper);
    const peel = el('div', { className: 'peel' }, paper);
    peel.setAttribute('aria-hidden', 'true');
    const num = el('span', { className: 'num', textContent: String(index + 1) }, paper);
    const title = el('b', {}, slot);
    const line = el('span', { className: 'line' }, slot);
    return { id: secret.id, slot, art, num, title, line };
  });

  const foot = el('div', { className: 'foot' }, panel);
  foot.append('四季 ');
  const seasonNodes = seasons.map((s) => el('span', { textContent: s.name }, foot));
  foot.append(' · ');
  const cycles = el('span', { className: 'plain' }, foot);
  const reset = el('button', { type: 'button', className: 'ghost', id: 'jreset', textContent: '清空记录' }, foot);

  const finale = el('div', { id: 'stk-finale' });
  finale.hidden = true;
  const card = el('div', { className: 'card' }, finale);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', '贴纸集齐了');
  el('div', { className: 't', textContent: '贴纸集齐了' }, card);
  const row = el('div', { className: 'row' }, card);
  el('p', { textContent: '八张都贴上了。这本书记得。' }, card);
  const ok = el('button', { type: 'button', className: 'ghost', id: 'stk-ok', textContent: '收好' }, card);
  document.body.append(panel, finale);

  /** @type {Set<string>} */
  const nearSet = new Set();
  /** @type {Set<string>} */
  const pending = new Set();
  /** @type {Set<string>} */
  const stamping = new Set();
  /** @type {Map<string, number>} */
  const stampTimers = new Map();
  let nearKey = '';
  let finaleTimer = 0;
  let finaleWaiting = false;

  reset.addEventListener('click', () => {
    if (reset.dataset.sure) {
      store.reset();
      location.reload();
    } else {
      reset.dataset.sure = '1';
      reset.textContent = '再点一次确认';
    }
  });
  replay.addEventListener('click', () => playFinale());
  ok.addEventListener('click', (e) => { e.stopPropagation(); dismissFinale(); });
  finale.addEventListener('click', (e) => { if (e.target === finale) dismissFinale(); });

  function sync() {
    const foundN = store.foundCount();
    count.textContent = `已贴 ${foundN} / ${secrets.length}`;
    banner.hidden = foundN !== secrets.length;
    cycles.textContent = `已翻开合上 ${store.cycles} 次`;
    seasonNodes.forEach((node, i) => { node.className = store.seasonSeen(i) ? 'on' : ''; });
    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      const view = describeSlot(secret, {
        found: store.hasSecret(secret.id),
        tier: store.hintTier(secret.id),
        near: nearSet.has(secret.id),
      });
      const node = slots[i];
      const classes = ['slot', view.state];
      if (view.near) classes.push('warm');
      if (stamping.has(secret.id)) classes.push('stamping');
      const nextClass = classes.join(' ');
      if (node.slot.className !== nextClass) node.slot.className = nextClass;
      node.title.textContent = view.title;
      node.line.textContent = view.line;
      node.num.hidden = view.state === 'got';
      if (view.state === 'got' && node.art.dataset.on !== secret.id) {
        node.art.dataset.on = secret.id;
        node.art.innerHTML = stickerMarkup(secret.id);
      }
    }
  }

  /** @param {string} id */
  function playStamp(id) {
    const node = slots.find((s) => s.id === id);
    if (!node) return;
    stamping.add(id);
    node.slot.classList.remove('stamping');
    void node.slot.offsetWidth;
    node.slot.classList.add('stamping');
    const prev = stampTimers.get(id);
    if (prev) clearTimeout(prev);
    stampTimers.set(id, window.setTimeout(() => {
      stamping.delete(id);
      node.slot.classList.remove('stamping');
    }, 900));
  }

  function playPending() {
    for (const id of pending) playStamp(id);
    pending.clear();
  }

  function dismissFinale() {
    clearTimeout(finaleTimer);
    finale.classList.remove('show');
    finale.hidden = true;
  }

  function playFinale() {
    row.textContent = '';
    for (const secret of secrets) {
      const mini = el('div', { className: 'mini' }, row);
      mini.innerHTML = stickerMarkup(secret.id);
    }
    finale.hidden = false;
    finale.classList.remove('show');
    void finale.offsetWidth;
    finale.classList.add('show');
    clearTimeout(finaleTimer);
    finaleTimer = window.setTimeout(dismissFinale, 5600);
  }

  function maybeFinale() {
    if (store.foundCount() < secrets.length || store.finalePlayed()) return;
    if (endingVisible()) {
      finaleWaiting = true;
      return;
    }
    finaleWaiting = false;
    if (store.markFinalePlayed()) playFinale();
  }

  function flushFinale() {
    if (!finaleWaiting) return;
    finaleWaiting = false;
    if (store.foundCount() < secrets.length) return;
    if (store.markFinalePlayed()) playFinale();
  }

  /** @param {boolean} [force] */
  function toggle(force) {
    const show = force ?? panel.hidden;
    panel.hidden = !show;
    if (!show) return;
    sync();
    playPending();
    maybeFinale();
  }

  return {
    toggle,
    isOpen: () => !panel.hidden,
    finaleOpen: () => !finale.hidden,
    dismissFinale,
    /** @param {string} id */
    noteFound(id) {
      sync();
      if (panel.hidden) pending.add(id);
      else playStamp(id);
    },
    /** @param {string[]} ids @returns {boolean} 附近的集合变了 */
    setNear(ids) {
      const key = ids.join(',');
      if (key === nearKey) return false;
      nearKey = key;
      nearSet.clear();
      for (const id of ids) nearSet.add(id);
      return true;
    },
    refresh() { if (!panel.hidden) sync(); },
    maybeFinale,
    flushFinale,
  };
}
