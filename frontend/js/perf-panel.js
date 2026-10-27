/**
 * 左下角小面板：帧时间、draw call、像素比。P 键或 ?perf=1 打开。
 * 数字约 4Hz 刷一次，避免自己变成卡顿来源。
 */

export function createPerfPanel() {
  const el = document.createElement('div');
  el.id = 'perf';
  el.hidden = true;
  document.body.appendChild(el);
  const params = new URLSearchParams(location.search);
  let on = params.get('perf') === '1';
  let acc = 0;
  /** @type {string} */
  let last = '';
  const paint = () => { el.hidden = !on; };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      on = !on;
      paint();
    }
  });
  paint();

  return {
    /** @param {number} dt @param {{frameMs:number, calls:number, pr:number, shadow:number}} sample */
    sample(dt, sample) {
      if (!on) return;
      acc += dt;
      if (acc < 0.25 && last) return;
      acc = 0;
      const text = `${sample.frameMs.toFixed(1)} ms · ${sample.calls} draws · pr ${sample.pr} · shadow ${sample.shadow}`;
      if (text !== last) { el.textContent = text; last = text; }
    },
    paused() {
      if (!on) return;
      if (last === 'paused') return;
      el.textContent = 'paused';
      last = 'paused';
    },
  };
}
