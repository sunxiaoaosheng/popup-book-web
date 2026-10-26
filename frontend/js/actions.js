// 跨模块的一次性动作：发现秘密、字幕、抖树、惊飞猫头鹰、爱心。
export function bindActions(W) {
  const { S } = W;
  W.say = (text, sec = 3) => {
    S.cap = text;
    S.capUntil = S.time + sec;
  };
  W.discover = (id) => {
    if (!W.store.addSecret(id)) return false;
    W.sound.chime();
    W.ui.found(id);
    W.drawCover(S.season, W.store.cycles, W.store.foundCount());
    return true;
  };
  W.shakeBurst = () => {
    S.burstT = 2.6;
    const v = W.tmp.v;
    const trees = W.trees;
    const PA = W.PA;
    for (let i = 0; i < W.NP; i++) {
      const t = trees[(Math.random() * trees.length) | 0];
      const p = PA[i];
      t.g.getWorldPosition(v);
      p.x = v.x + (Math.random() - 0.5) * 0.7;
      p.y = v.y + t.h * (0.45 + Math.random() * 0.4);
      p.z = v.z + 0.15 + Math.random() * 0.3;
      p.vx = (Math.random() - 0.5) * 1.6;
      p.vy = -Math.random() * 0.8;
      p.vz = Math.random() * 0.6;
    }
    for (const t of trees) t.sw.v += (Math.random() - 0.5) * 6;
  };
  W.startleOwl = (real) => {
    const { O, owl } = W;
    if (O.state !== 'perched' || !owl.visible) return false;
    O.state = 'out';
    O.t = 0;
    O.p0.copy(owl.position);
    O.p1.set(8.5, 7.5, 3.4);
    W.sound.flap();
    if (real) W.discover('owl');
    return true;
  };
  W.spawnHeart = (x, y, z) => {
    const h = W.hearts.find((q) => q.t >= 1.4) || W.hearts[0];
    h.t = 0;
    h.x = x;
    h.y = y;
    h.z = z;
    h.vx = (Math.random() - 0.5) * 0.3;
    h.m.visible = true;
  };
}
