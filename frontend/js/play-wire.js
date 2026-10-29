/**
 * 状态机事件的副作用。判定在 play-machine / season-machine，这里只碰声音、字幕和存档。
 */
import { SEASONS } from './story.js';
import { playSeasonMotif } from './season-motif.js';

/** @param {any} W */
export function wirePlay(W) {
  const { S } = W;
  const bus = W.bus;

  bus.on('shake', (e) => {
    W.shakeBurst();
    W.sound.shake(e.season);
    W.say(['哗啦——花瓣全抖落下来了', '哗啦——叶子和柳絮漫天都是', '哗啦——一场叶子雨', '哗啦——树上的雪全抖下来了'][e.season], 3.2);
    W.discover('shake');
  });

  bus.on('startle', (e) => {
    for (const t of W.trees) t.sw.v += (Math.random() - 0.5) * 4;
    if (e.angle > 46) W.startleOwl(true);
    else S.owlPend = 1.4;
    W.say('纸张被你翻得哗啦啦直抖', 2.2);
  });

  bus.on('secret', (e) => {
    if (e.id === 'heart') W.discover('heart');
    if (e.id === 'seam') {
      W.discover('seam');
      W.sound.mew();
      W.say('缝里有一双眼睛，在偷看你…', 4);
    }
    if (e.id === 'nap') {
      W.discover('nap');
      W.say('小猫趁你不动，爬上屋顶靠着烟囱睡着了 · Zzz', 5);
      W.sound.purr(true);
      S.purring = true;
    }
    if (e.id === 'chase') {
      W.discover('chase');
      W.say('小猫跳下窗台，追着萤火虫跑！', 5);
      W.sound.meow(1.2, 0.4, 0.35);
    }
  });

  bus.on('act-clear', (e) => {
    if (e.id === 'nap' && S.purring && !S.petDown) {
      W.sound.purr(false);
      S.purring = false;
    }
  });

  bus.on('dawn-line', () => {
    W.say('清晨 · 窗边伸了个懒腰', 3.5);
    W.sound.mew();
  });

  bus.on('fullday', (e) => {
    if (e.phase === 'arm') {
      S.sunsetSaid = false;
      S.sneezeSaid = false;
      S.dawnSaid = false;
      S.dawnHeld = false;
    } else if (e.phase === 'discover') {
      const first = W.discover('fullday');
      S.conBurst = 1;
      W.say(first ? '你陪小猫慢慢过完了一整天——天上多了一只猫' : '又是完整的一天 · 猫座在等你', 5);
    } else if (e.phase === 'fast') W.say('这一天…过得有点快', 2.6);
  });

  bus.on('close', (e) => {
    const n = W.store.addCycle();
    W.setSeason(n);
    W.store.markSeason(S.season);
    if (e.kind === 'slam') {
      W.sound.thud();
      S.slamT = 1;
      W.say('啪！吓了小猫一跳', 3);
      S.endMode = 'slam';
      W.ui.showEnding(null);
    } else if (e.kind === 'gentle') {
      W.discover('goodnight');
      W.sound.lullaby(S.season);
      S.endMode = 'gentle';
      const lines = SEASONS[(n - 1) % 4].night;
      W.ui.showEnding({
        title: '晚安',
        line: lines[(n - 1) % lines.length],
        next: `下一次翻开：${SEASONS[S.season].title}`,
        cycles: n,
      });
    } else {
      S.endMode = 'normal';
      W.sound.tap();
      W.ui.showEnding(null);
    }
  });

  bus.on('season', (e) => {
    if (e.phase === 'morph') W.applySeasonVisuals();
    if (e.phase === 'caption') {
      W.say(e.text, 4.2);
      playSeasonMotif(W.sound, W.SEASON.to);
    }
  });

  bus.on('season-beat', (e) => {
    W.say(e.text, 3.2);
  });
}
