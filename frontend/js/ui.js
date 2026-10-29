// 所有 DOM 界面都在这里：音效开关、小秘密贴纸本、提示 toast、"别动"进度环、晚安结尾。
// 贴纸格在 journal-book.js。主场景只通过返回的几个函数和它说话。
import { nextFeel } from './hinge-feel.js';
import { createJournalBook } from './journal-book.js';

export function initUI({ SECRETS, SEASONS, store, sound }) {
  const $ = (tag, props = {}, parent = document.body) => { const e = document.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };

  // ---- 左上角：声音 + 手账 ----
  const tools = $('div', { id: 'tools' });
  const snd = $('button', { id: 'snd', className: 'ghost', type: 'button', title: '声音开关（M）' }, tools);
  const feelBtn = $('button', { id: 'feel', className: 'ghost', type: 'button', title: '动手感：常 / 低 / 关（K）。静音仍关掉全部声音' }, tools);
  const jbtn = $('button', { id: 'jbtn', className: 'ghost', type: 'button', title: '小秘密贴纸本（J）' }, tools);
  const paintSnd = () => { snd.textContent = sound.muted ? '🔇 静音' : '🔊 声音'; };
  const paintJ = () => { jbtn.textContent = `📖 小秘密 ${store.foundCount()}/${SECRETS.length}`; };
  const FEEL_TEXT = { off: '手感 关', low: '手感 低', normal: '手感 常' };
  const paintFeel = () => {
    const level = store.feel;
    feelBtn.textContent = FEEL_TEXT[level] || FEEL_TEXT.normal;
    feelBtn.dataset.feel = level;
  };
  const toggleMute = () => { sound.unlock(); sound.setMuted(!sound.muted); store.setMuted(sound.muted); paintSnd(); };
  const cycleFeel = () => {
    sound.unlock();
    store.setFeel(nextFeel(store.feel));
    paintFeel();
  };
  snd.addEventListener('click', toggleMute);
  feelBtn.addEventListener('click', cycleFeel);
  paintSnd(); paintFeel(); paintJ();

  let endingOn = false;
  const journal = createJournalBook({
    secrets: SECRETS,
    seasons: SEASONS,
    store,
    endingVisible: () => endingOn,
  });
  jbtn.addEventListener('click', () => journal.toggle());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') toggleMute();
    if (e.key === 'k' || e.key === 'K') cycleFeel();
    if (e.key === 'j' || e.key === 'J') journal.toggle();
    if (e.key === 'Escape') {
      if (journal.finaleOpen()) journal.dismissFinale();
      else journal.toggle(false);
    }
  });

  // ---- toast / nudge ----
  const toast = $('div', { id: 'toast' });
  let toastTimer = 0;
  const showToast = (html, ms = 4200) => { toast.innerHTML = html; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), ms); };
  const nudge = $('div', { id: 'nudge' });
  let nudgeTimer = 0;

  // ---- "别动" 进度环 ----
  const ring = $('div', { id: 'ring' });
  ring.innerHTML = '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg"/></svg><span>别动…</span>';
  const fg = ring.querySelector('.fg'); const C = 2 * Math.PI * 18; fg.style.strokeDasharray = `${C}`;
  let ringOn = false, ringOff = '';

  // ---- 晚安结尾 ----
  const ending = $('div', { id: 'ending' });

  return {
    found(id) {
      const s = SECRETS.find((x) => x.id === id);
      paintJ();
      journal.noteFound(id);
      nudge.classList.remove('show');
      showToast(`✨ 贴上一张 <b>${store.foundCount()}/${SECRETS.length}</b>\u3000${s.name}<br><small>${s.found}</small>`);
      journal.maybeFinale();
    },
    setJournalNear(ids, changed) {
      if (journal.setNear(ids) || changed) journal.refresh();
    },
    toast: showToast,
    setRing(p) {
      if (p < 0) { if (ringOn) { ring.classList.remove('show'); ringOn = false; } return; }
      if (!ringOn) { ring.classList.add('show'); ringOn = true; }
      const off = (C * (1 - p)).toFixed(1);
      if (off !== ringOff) { fg.style.strokeDashoffset = off; ringOff = off; }
    },
    showEnding(o) {
      if (!o) { this.hideEnding(); return; }
      ending.innerHTML = `<div class="box"><div class="t">${o.title}</div><div class="l">${o.line}</div><div class="n">第 ${o.cycles} 次合上\u3000·\u3000${o.next}</div></div>`;
      ending.classList.add('show'); endingOn = true; document.body.classList.add('ending');
    },
    hideEnding() {
      if (!endingOn) return;
      endingOn = false;
      ending.classList.remove('show');
      document.body.classList.remove('ending');
      journal.flushFinale();
    },
    endingVisible() { return endingOn; },
    nudge(text) { nudge.textContent = '💭 ' + text; nudge.classList.add('show'); clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => nudge.classList.remove('show'), 7000); },
    showJournal() { journal.toggle(true); },
  };
}
