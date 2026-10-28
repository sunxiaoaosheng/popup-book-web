import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captionFontPx, cardLayout, clipPlan, composeShare, coverCrop, handBorder,
  kittenCaption, paperSpecks, pickWebmMime, seasonStamp, secretsLine, shareFileBase,
} from '../../frontend/js/share-layout.js';
import { SHARE } from '../../frontend/js/tuning.js';

const day = new Date(2026, 9, 28);

test('season stamp, secrets, filename', () => {
  assert.equal(seasonStamp('春', '清晨'), '春 · 清晨');
  assert.equal(seasonStamp('春', ''), '春');
  assert.equal(seasonStamp('春', '夜', '春', '夏'), '春 → 夏 · 夜');
  assert.equal(seasonStamp('夏', '', '夏', '夏'), '夏');
  assert.equal(secretsLine(3, 8), '小秘密 3/8');
  assert.equal(secretsLine(0, 8), '小秘密 0/8');
  assert.equal(secretsLine(-2, 0), '小秘密 0/1');
  assert.equal(shareFileBase(day, 'autumn', '黄昏'), 'cabin-20261028-autumn-dusk');
  assert.equal(shareFileBase(day, 'winter', ''), 'cabin-20261028-winter-book');
});

test('kitten caption follows pose, then time of day', () => {
  assert.equal(kittenCaption({ kittenMode: 'dawn', angle: 90, tod: '夜' }), '清晨 · 窗后伸了个懒腰');
  assert.equal(kittenCaption({ kittenMode: 'nap', tod: '正午' }), '它靠着烟囱打了个盹');
  assert.equal(kittenCaption({ kittenMode: 'play', angle: 90, tod: '黄昏' }), '直角那里，眼睛亮了一下');
  assert.equal(kittenCaption({ kittenMode: 'play', angle: 100, tod: '夜' }), '夜里抬头看月亮');
  assert.equal(kittenCaption({ kittenMode: 'play', angle: 100, tod: '黄昏' }), '它转过头去看落日');
  assert.equal(kittenCaption({ kittenMode: 'play', angle: 70, tod: '正午' }), '正午太亮，它眯起了眼');
  assert.equal(kittenCaption({ kittenMode: 'play', angle: 80, tod: '上午' }), '蹲在窗台上，尾巴轻轻摆');
  assert.equal(kittenCaption({ kittenMode: 'hidden', angle: 4, sceneCaption: '合上的书' }), '还躲在合上的书里');
  assert.equal(kittenCaption({ kittenMode: 'hidden', angle: 40, sceneCaption: '树站起来了' }), '树站起来了');
  assert.equal(kittenCaption({ kittenMode: 'hidden', angle: 40 }), '今天的林间小屋');
});

test('long caption shrinks, short caption keeps the base size', () => {
  assert.equal(captionFontPx('短', 400, 34, 18), 34);
  const long = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸';
  assert.equal(captionFontPx(long, 120, 34, 18), 18);
  assert.equal(captionFontPx(long, 400, 34, 18), 20);
});

test('cover crop keeps the target aspect inside the source', () => {
  const wide = coverCrop(1600, 800, 800, 800);
  assert.equal(wide.sy, 0);
  assert.equal(wide.sh, 800);
  assert.ok(Math.abs(wide.sw - 800) < 1e-9);
  assert.ok(Math.abs(wide.sx - 400) < 1e-9);
  const tall = coverCrop(800, 1600, 800, 800);
  assert.equal(tall.sx, 0);
  assert.equal(tall.sw, 800);
  assert.ok(Math.abs(tall.sh - 800) < 1e-9);
  assert.ok(Math.abs(tall.sy - 400) < 1e-9);
});

test('hand-drawn border is seeded, closed at the corners, and not a rectangle', () => {
  const rect = { x: 10, y: 20, w: 100, h: 40 };
  const pts = handBorder(rect, 6, 3, 8);
  assert.equal(pts.length, 32);
  assert.deepEqual(pts[0], { x: 10, y: 20 });
  assert.deepEqual(pts[8], { x: 110, y: 20 });
  assert.deepEqual(pts[16], { x: 110, y: 60 });
  assert.deepEqual(pts[24], { x: 10, y: 60 });
  assert.deepEqual(pts, handBorder(rect, 6, 3, 8));
  assert.notDeepEqual(pts, handBorder(rect, 6, 4, 8));
  let wobble = 0;
  for (let k = 1; k < 8; k++) wobble = Math.max(wobble, Math.abs(pts[k].y - 20));
  assert.ok(wobble > 1);
  for (const p of pts) {
    assert.ok(p.x >= 10 - 6.02 && p.x <= 110 + 6.02);
    assert.ok(p.y >= 20 - 6.02 && p.y <= 60 + 6.02);
  }
});

test('card layout keeps the photo inside the border and the words below it', () => {
  const L = cardLayout();
  const amp = SHARE.borderAmp;
  assert.ok(L.photo.x >= L.frame.x + amp);
  assert.ok(L.photo.y >= L.frame.y + amp);
  assert.ok(L.photo.x + L.photo.w <= L.frame.x + L.frame.w - amp);
  assert.ok(L.photo.y + L.photo.h <= L.frame.y + L.frame.h - amp);
  assert.ok(L.label.y > L.photo.y + L.photo.h);
  assert.ok(L.caption.y > L.label.y);
  assert.ok(L.mark.y > L.caption.y);
  assert.ok(L.secrets.x > L.mark.x);
  assert.ok(L.seal.x + L.seal.w <= L.mark.x);
  assert.ok(L.seal.y + L.seal.h < L.h);
  assert.ok(L.secrets.x <= L.w - SHARE.margin + 0.1);
});

test('specks stay on the paper margin', () => {
  const L = cardLayout();
  const specks = paperSpecks(L, 5, SHARE.speckCount);
  assert.equal(specks.length, SHARE.speckCount);
  assert.deepEqual(specks, paperSpecks(L, 5, SHARE.speckCount));
  for (const speck of specks) {
    const inside = speck.x > L.photo.x && speck.x < L.photo.x + L.photo.w
      && speck.y > L.photo.y && speck.y < L.photo.y + L.photo.h;
    assert.equal(inside, false);
    assert.ok(speck.x >= 0 && speck.x <= L.w);
    assert.ok(speck.y >= 0 && speck.y <= L.h);
  }
});

test('composeShare packs an autumn dusk card', () => {
  const card = composeShare({
    season: 2,
    tod: '黄昏',
    angle: 80,
    kittenMode: 'play',
    sceneCaption: '',
    found: 3,
    total: 8,
    date: day,
    seed: 4,
  });
  assert.equal(card.label, '秋 · 黄昏');
  assert.equal(card.caption, '它转过头去看落日');
  assert.equal(card.secrets, '小秘密 3/8');
  assert.equal(card.mark, '林间小屋');
  assert.equal(card.fileBase, 'cabin-20261028-autumn-dusk');
  assert.equal(card.paper, '#f8ecdf');
  assert.equal(card.accent, '#c46a2f');
  assert.equal(card.layout.w, SHARE.cardW);
  assert.equal(card.border.length, SHARE.borderSteps * 4);
  assert.equal(card.specks.length, SHARE.speckCount);
  assert.equal(card.fonts.label, SHARE.labelPx);
});

test('clip plan falls back to png, and the button length stays inside 3–5s', () => {
  assert.ok(SHARE.clipSec >= 3 && SHARE.clipSec <= 5);
  assert.equal(clipPlan(true).kind, 'webm');
  assert.equal(clipPlan(true).seconds, SHARE.clipSec);
  assert.deepEqual(clipPlan(false), { kind: 'png', seconds: 0, fps: 0 });
  assert.equal(clipPlan(true, SHARE, 1).seconds, 1);
  assert.equal(clipPlan(true, { ...SHARE, clipSec: 9 }).seconds, 5);
  assert.equal(clipPlan(true, { ...SHARE, clipSec: 1 }).seconds, 3);
  assert.equal(pickWebmMime((type) => type.includes('vp8')), 'video/webm;codecs=vp8');
  assert.equal(pickWebmMime(() => false), '');
});
