/**
 * 把 composeShare 的结果画到一张 2D 画布上。不读 WebGL。
 */
import { FONT } from './state.js';
import { coverCrop } from './share-layout.js';

const CARD_FONT = FONT.includes('sans-serif')
  ? FONT.replace('sans-serif', '"WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif')
  : `${FONT},"WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif`;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}[]} pts
 */
function trace(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}[]} pts
 * @param {string} color
 * @param {number} width
 */
function strokeBorder(ctx, pts, color, width) {
  ctx.beginPath();
  trace(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./share-layout.js').composeShare>} spec
 * @param {CanvasImageSource} source
 */
export function paintPhoto(ctx, spec, source) {
  const { photo } = spec.layout;
  const sw = /** @type {HTMLCanvasElement} */ (source).width;
  const sh = /** @type {HTMLCanvasElement} */ (source).height;
  const crop = coverCrop(sw, sh, photo.w, photo.h);
  ctx.save();
  ctx.beginPath();
  trace(ctx, spec.photoBorder);
  ctx.clip();
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, photo.x, photo.y, photo.w, photo.h);
  ctx.restore();
  strokeBorder(ctx, spec.photoBorder, spec.ink, 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./share-layout.js').composeShare>} spec
 */
function paintChrome(ctx, spec) {
  const { layout: L } = spec;
  ctx.fillStyle = spec.paper;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.fillStyle = spec.ink;
  for (const speck of spec.specks) {
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  strokeBorder(ctx, spec.border, spec.inkSoft, 7);
  strokeBorder(ctx, spec.border, spec.ink, 2.2);
  const { fonts } = spec;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = spec.accent;
  ctx.font = `600 ${fonts.label}px ${CARD_FONT}`;
  ctx.fillText(spec.label, L.label.x, L.label.y);
  ctx.fillStyle = spec.ink;
  ctx.textAlign = 'center';
  ctx.font = `500 ${fonts.caption}px ${CARD_FONT}`;
  ctx.fillText(spec.caption, L.caption.x, L.caption.y);
  const seal = L.seal;
  ctx.beginPath();
  ctx.arc(seal.x + seal.w / 2, seal.y + seal.h / 2, seal.w / 2, 0, Math.PI * 2);
  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = spec.inkSoft;
  ctx.textAlign = 'left';
  ctx.font = `500 ${fonts.foot}px ${CARD_FONT}`;
  ctx.fillText(spec.mark, L.mark.x, L.mark.y);
  ctx.textAlign = 'right';
  ctx.fillText(spec.secrets, L.secrets.x, L.secrets.y);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./share-layout.js').composeShare>} spec
 * @param {CanvasImageSource|null} source
 */
export function paintShareCard(ctx, spec, source) {
  paintChrome(ctx, spec);
  if (source) paintPhoto(ctx, spec, source);
}
