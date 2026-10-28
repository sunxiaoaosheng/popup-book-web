/**
 * 分享按钮和 C 键。文案在 share-layout，画面在 share-draw，读像素在 share-capture。
 * api.sink 平时是 null。主循环只在录短片的那几秒把它叫上。
 */
import { SECRETS, SEASONS } from './story.js';
import { SHARE } from './tuning.js';
import { S } from './state.js';
import { clipArmedFromQuery, clipEnabled, clipPlan, composeShare } from './share-layout.js';
import { paintPhoto, paintShareCard } from './share-draw.js';
import {
  canvasBlob, copyPng, downloadBlob, mediaRecorderMime, readGlCanvas, startRecorder, summarizeBlob,
} from './share-capture.js';

/** @param {any} W */
export function attachShare(W) {
  const btn = document.createElement('button');
  btn.id = 'share';
  btn.type = 'button';
  btn.className = 'ghost';
  btn.title = '分享今天的小屋（C），保存一张图片';
  btn.textContent = '分享';
  const tools = document.getElementById('tools');
  if (tools) tools.appendChild(btn);

  let clipOn = clipArmedFromQuery(new URLSearchParams(location.search).get('shareclip'));
  const clipBtn = document.createElement('button');
  clipBtn.id = 'shareclip';
  clipBtn.type = 'button';
  clipBtn.className = 'ghost';
  clipBtn.title = '打开后，分享会多录约 4 秒短片';
  const paintClip = () => {
    clipBtn.textContent = clipOn ? '短片开' : '短片';
    clipBtn.setAttribute('aria-pressed', clipOn ? 'true' : 'false');
  };
  paintClip();
  clipBtn.addEventListener('click', () => {
    clipOn = !clipOn;
    paintClip();
  });
  if (tools) tools.appendChild(clipBtn);
  const api = {
    /** @type {null | ((dt: number) => void)} */
    sink: null,
  };
  let busy = false;

  function view(date) {
    const morphing = W.SEASON.t < 1 && W.SEASON.from !== W.SEASON.to;
    return {
      season: S.season,
      tod: S.tod || '',
      angle: S.filtered,
      kittenMode: S.kittenMode || 'hidden',
      sceneCaption: S.cap || '',
      found: W.store.foundCount(),
      total: SECRETS.length,
      date,
      seed: 7 + S.season * 13,
      morphFromName: morphing ? SEASONS[W.SEASON.from].name : '',
      morphToName: morphing ? SEASONS[W.SEASON.to].name : '',
    };
  }

  function readScene() {
    const renderer = W.gfx.renderer;
    return readGlCanvas(renderer.getContext(), renderer.domElement);
  }

  function captureScene() {
    W.gfx.forceShadow();
    W.gfx.renderer.render(W.gfx.scene, W.gfx.camera);
    return readScene();
  }

  /**
   * @param {HTMLCanvasElement} card
   * @param {CanvasRenderingContext2D} ctx
   * @param {ReturnType<typeof composeShare>} spec
   * @param {{seconds:number, fps:number}} plan
   * @param {string} mime
   * @param {{download:boolean, toast:boolean}} flags
   */
  function recordClip(card, ctx, spec, plan, mime, flags) {
    card.setAttribute('aria-hidden', 'true');
    card.style.cssText = 'position:fixed;left:-8000px;top:0;width:8px;height:8px;pointer-events:none';
    document.body.appendChild(card);
    let rec;
    try {
      rec = startRecorder(card, mime);
    } catch {
      card.remove();
      if (flags.toast) W.ui.toast('短片没录成，图片还在', 2400);
      return Promise.resolve(null);
    }
    const t0 = performance.now();
    let acc = 0;
    let stopping = false;
    /** @type {ReturnType<typeof setTimeout>} */
    let timer = 0;
    /** @type {(blob: Blob|null) => void} */
    let resolveClip = () => {};
    const result = new Promise((resolve) => { resolveClip = resolve; });
    const finish = () => {
      if (stopping) return;
      stopping = true;
      api.sink = null;
      clearTimeout(timer);
      const giveUp = new Promise((resolve) => { setTimeout(() => resolve(null), 2500); });
      Promise.race([rec.stop(), giveUp]).then((blob) => {
        card.remove();
        if (blob && blob.size) {
          if (flags.download) downloadBlob(blob, `${spec.fileBase}.webm`);
          if (flags.toast) W.ui.toast('短片已保存', 2400);
          resolveClip(blob);
          return;
        }
        if (flags.toast) W.ui.toast('短片没录成，图片还在', 2400);
        resolveClip(null);
      }, () => {
        card.remove();
        if (flags.toast) W.ui.toast('短片没录成，图片还在', 2400);
        resolveClip(null);
      });
    };
    rec.requestFrame();
    api.sink = (dt) => {
      if (stopping) return;
      acc += dt;
      if ((performance.now() - t0) / 1000 >= plan.seconds) { finish(); return; }
      if (acc < 1 / plan.fps) return;
      acc = 0;
      const src = readScene();
      if (!src) return;
      paintPhoto(ctx, spec, src);
      rec.requestFrame();
    };
    timer = setTimeout(finish, (plan.seconds + 2) * 1000);
    return result;
  }

  /**
   * @param {{
   *   download?: boolean, copy?: boolean, clip?: boolean, toast?: boolean,
   *   embed?: boolean, seconds?: number, date?: string|number|Date,
   * }} [opts]
   */
  async function run(opts = {}) {
    if (busy) {
      if (opts.toast !== false) W.ui.toast('正在做分享卡', 1600);
      return { ok: false, reason: 'busy' };
    }
    busy = true;
    btn.textContent = '…';
    const download = opts.download !== false;
    const toast = opts.toast !== false;
    try {
      const date = opts.date ? new Date(opts.date) : new Date();
      const spec = composeShare(view(date), SHARE);
      const card = document.createElement('canvas');
      card.width = spec.layout.w;
      card.height = spec.layout.h;
      const ctx = card.getContext('2d');
      const src = ctx ? captureScene() : null;
      if (!ctx || !src) {
        if (toast) W.ui.toast('这一帧没抓住', 2400);
        return { ok: false, reason: 'gl' };
      }
      paintShareCard(ctx, spec, src);
      const blob = await canvasBlob(card, 'image/png');
      if (!blob) {
        if (toast) W.ui.toast('这一帧没抓住', 2400);
        return { ok: false, reason: 'png' };
      }
      if (download) downloadBlob(blob, `${spec.fileBase}.png`);
      const copied = opts.copy === false ? false : await copyPng(blob);
      const png = await summarizeBlob(blob, opts.embed === true);
      const mime = clipEnabled(opts.clip, clipOn) ? mediaRecorderMime() : '';
      const plan = clipPlan(!!mime, SHARE, opts.seconds);
      /** @type {any} */
      const payload = {
        ok: true,
        copied,
        label: spec.label,
        caption: spec.caption,
        secrets: spec.secrets,
        mark: spec.mark,
        fileBase: spec.fileBase,
        width: spec.layout.w,
        height: spec.layout.h,
        photo: spec.layout.photo,
        labelPos: spec.layout.label,
        captionPos: spec.layout.caption,
        png,
        clip: 'png',
        webm: null,
      };
      if (plan.kind !== 'webm') {
        if (toast) W.ui.toast(copied ? '分享卡已复制' : '分享卡已保存', 2800);
        return payload;
      }
      if (toast) {
        W.ui.toast(`${copied ? '分享卡已复制' : '分享卡已保存'} · 正在录 ${plan.seconds} 秒短片`, 2800);
      }
      btn.textContent = '录着';
      const clipBlob = await recordClip(card, ctx, spec, plan, mime, { download, toast });
      if (clipBlob && clipBlob.size) {
        payload.clip = 'webm';
        payload.webm = await summarizeBlob(clipBlob, false);
        payload.seconds = plan.seconds;
      }
      return payload;
    } catch {
      if (toast) W.ui.toast('分享没完成', 2400);
      return { ok: false, reason: 'error' };
    } finally {
      busy = false;
      api.sink = null;
      btn.textContent = '分享';
    }
  }

  btn.addEventListener('click', () => { run(); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'c' && e.key !== 'C') return;
    const target = /** @type {HTMLElement|null} */ (e.target);
    const tag = target && target.tagName;
    if (tag === 'TEXTAREA') return;
    if (tag === 'INPUT' && /** @type {HTMLInputElement} */ (target).type !== 'range') return;
    run();
  });

  const popup = /** @type {any} */ (window).__popup || {};
  /** @type {any} */ (window).__popup = popup;
  popup.shareCard = (opts) => run(opts || {});
  popup.shareBusy = () => busy || !!api.sink;
  return api;
}
