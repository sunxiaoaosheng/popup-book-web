/**
 * 读当前 WebGL 画面、导出 blob、下载、剪贴板、短片。
 * 不决定卡片上写什么。缓冲只在第一次分享时分配。
 */
import { pickWebmMime } from './share-layout.js';

/** @type {HTMLCanvasElement|null} */
let scratch = null;
/** @type {Uint8Array|null} */
let pixelBuf = null;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function isBlank(ctx, w, h) {
  const n = 16;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.min(w - 1, Math.floor(((i * 2 + 1) / (n * 2)) * w));
    const y = Math.min(h - 1, Math.floor(((i * 3 + 1) / (n * 2)) * h));
    const p = ctx.getImageData(x, y, 1, 1).data;
    acc += p[0] + p[1] + p[2];
  }
  return acc < 24;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {number} w
 * @param {number} h
 */
function readPixels(gl, w, h) {
  const need = w * h * 4;
  if (!pixelBuf || pixelBuf.length !== need) pixelBuf = new Uint8Array(need);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
  return pixelBuf;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Uint8Array} pixels
 * @param {number} w
 * @param {number} h
 */
function blitFlipped(ctx, pixels, w, h) {
  const image = ctx.createImageData(w, h);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    image.data.set(pixels.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * 先试一次 drawImage（合成还没清缓冲时很快）。
 * 缓冲已经空了就 readPixels，不需要 preserveDrawingBuffer。
 * @param {WebGLRenderingContext} gl
 * @param {HTMLCanvasElement} sourceCanvas
 */
export function readGlCanvas(gl, sourceCanvas) {
  const w = gl.drawingBufferWidth || sourceCanvas.width;
  const h = gl.drawingBufferHeight || sourceCanvas.height;
  if (!w || !h) return null;
  if (!scratch || scratch.width !== w || scratch.height !== h) {
    scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  try {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
  } catch { /* 跨域或上下文丢失时改走 readPixels */ }
  if (!isBlank(ctx, w, h)) return scratch;
  try {
    blitFlipped(ctx, readPixels(gl, w, h), w, h);
  } catch {
    return null;
  }
  return scratch;
}

/** @param {HTMLCanvasElement} canvas @param {string} type */
export function canvasBlob(canvas, type) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}

/** @param {Blob} blob @param {string} filename */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

/** @param {Blob} blob */
export async function copyPng(blob) {
  const clip = navigator.clipboard;
  if (!clip || typeof ClipboardItem === 'undefined' || !clip.write) return false;
  try {
    const write = clip.write([new ClipboardItem({ 'image/png': blob })]);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800));
    await Promise.race([write, timeout]);
    return true;
  } catch {
    return false;
  }
}

export function mediaRecorderMime() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return pickWebmMime((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} mime
 */
export function startRecorder(canvas, mime) {
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  /** @type {MediaRecorder} */
  let rec;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
  } catch {
    rec = new MediaRecorder(stream, { mimeType: mime });
  }
  /** @type {Blob[]} */
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  /** @type {Promise<Blob>} */
  const done = new Promise((resolve, reject) => {
    rec.onerror = () => reject(new Error('recorder'));
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  rec.start(200);
  const endTracks = () => { stream.getTracks().forEach((t) => t.stop()); };
  return {
    requestFrame() {
      const live = /** @type {any} */ (track);
      if (live && typeof live.requestFrame === 'function') live.requestFrame();
    },
    stop() {
      if (rec.state === 'recording') rec.stop();
      return done.then((blob) => {
        endTracks();
        return blob;
      }, (err) => {
        endTracks();
        throw err;
      });
    },
  };
}

/** @param {Blob} blob */
function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {Blob} blob
 * @param {boolean} embed
 */
export async function summarizeBlob(blob, embed) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  /** @type {number[]} */
  const head = [];
  for (let i = 0; i < 16 && i < buf.length; i++) head.push(buf[i]);
  /** @type {{size:number, head:number[], b64?:string}} */
  const out = { size: buf.length, head };
  if (embed) {
    const url = await blobDataUrl(blob);
    const comma = url.indexOf(',');
    out.b64 = comma >= 0 ? url.slice(comma + 1) : '';
  }
  return out;
}
