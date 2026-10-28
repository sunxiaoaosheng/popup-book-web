// 所有 DOM 界面都在这里：音效开关、小秘密手账、提示 toast、"别动"进度环、晚安结尾。
// 主场景只通过返回的几个函数和它说话，两边互不依赖。
import { nextFeel } from './hinge-feel.js';

export function initUI({ SECRETS, SEASONS, store, sound }) {
  const $ = (tag, props = {}, parent = document.body) => { const e = document.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };

  // ---- 左上角：声音 + 手账 ----
  const tools = $('div', { id: 'tools' });
  const snd = $('button', { id: 'snd', className: 'ghost', type: 'button', title: '声音开关（M）' }, tools);
  const feelBtn = $('button', { id: 'feel', className: 'ghost', type: 'button', title: '动手感：常 / 低 / 关（K）。静音仍关掉全部声音' }, tools);
  const jbtn = $('button', { id: 'jbtn', className: 'ghost', title: '小秘密手账（J）' }, tools);
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

  // ---- 手账面板 ----
  const panel = $('div', { id: 'journal' });
  panel.hidden = true;
  const render = () => {
    const seen = SEASONS.map((s, i) => `<span class="${store.seasonSeen(i) ? 'on' : ''}">${s.name}</span>`).join('');
    panel.innerHTML = `
      <h3>小秘密手账 <small>已发现 ${store.foundCount()} / ${SECRETS.length}</small></h3>
      <ul>${SECRETS.map((s) => store.hasSecret(s.id)
        ? `<li class="got"><b>${s.name}</b><br><span>${s.found}</span></li>`
        : `<li><b>？？？</b><br><span>${s.hint}</span></li>`).join('')}</ul>
      <div class="foot">四季 ${seen}\u3000·\u3000已翻开合上 ${store.cycles} 次
        <button id="jreset" class="ghost">清空记录</button></div>`;
    const r = panel.querySelector('#jreset');
    r.addEventListener('click', () => { if (r.dataset.sure) { store.reset(); location.reload(); } else { r.dataset.sure = '1'; r.textContent = '再点一次确认'; } });
  };
  const toggleJournal = (force) => { const show = force ?? panel.hidden; if (show) render(); panel.hidden = !show; };
  jbtn.addEventListener('click', () => toggleJournal());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') toggleMute();
    if (e.key === 'k' || e.key === 'K') cycleFeel();
    if (e.key === 'j' || e.key === 'J') toggleJournal();
    if (e.key === 'Escape') toggleJournal(false);
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
  let endingOn = false;

  return {
    found(id) {
      const s = SECRETS.find((x) => x.id === id); paintJ(); if (!panel.hidden) render();
      showToast(`✨ 发现小秘密 <b>${store.foundCount()}/${SECRETS.length}</b>\u3000${s.name}<br><small>${s.found}</small>`);
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
    hideEnding() { if (!endingOn) return; endingOn = false; ending.classList.remove('show'); document.body.classList.remove('ending'); },
    endingVisible() { return endingOn; },
    nudge(text) { nudge.textContent = '💭 ' + text; nudge.classList.add('show'); clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => nudge.classList.remove('show'), 7000); },
  };
}
