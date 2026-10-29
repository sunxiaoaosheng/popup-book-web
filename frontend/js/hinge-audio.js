/**
 * 合页拟音：嘎吱、纸声层、转向咔哒、落点轻撞。
 * 只负责把 hinge-feel 给出的数字放进 WebAudio，曲线不在这里。
 * 接到 Sound 的主音量上，静音按钮把整条总线关死。
 */
export class HingeFoley {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this._acc = 0;
    /** @type {AudioBuffer|null} */
    this.noiseBuf = null;
    /** @type {GainNode|null} */
    this.bus = null;
    /** @type {BiquadFilterNode|null} */
    this.creakF = null;
    /** @type {GainNode|null} */
    this.creakG = null;
    /** @type {OscillatorNode|null} */
    this.body = null;
    /** @type {GainNode|null} */
    this.bodyG = null;
    /** @type {Array<{f:BiquadFilterNode, g:GainNode}>} */
    this.layers = [];
  }

  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} dest 通常是 Sound 的 master
   */
  attach(ctx, dest) {
    this.ctx = ctx;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(dest);
    this.bus = bus;

    const sr = ctx.sampleRate;
    const nb = ctx.createBuffer(1, sr * 2, sr);
    const data = nb.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    noise.loop = true;
    noise.start();

    const creakF = ctx.createBiquadFilter();
    creakF.type = 'bandpass';
    creakF.frequency.value = 240;
    creakF.Q.value = 7;
    const creakG = ctx.createGain();
    creakG.gain.value = 0;
    noise.connect(creakF);
    creakF.connect(creakG);
    creakG.connect(bus);
    this.creakF = creakF;
    this.creakG = creakG;

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 120;
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0;
    body.connect(bodyG);
    bodyG.connect(bus);
    body.start();
    this.body = body;
    this.bodyG = bodyG;

    this.layers = [0, 1, 2].map(() => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2000;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      noise.connect(f);
      f.connect(g);
      g.connect(bus);
      return { f, g };
    });
    this.ready = true;
  }

  /** 静音时把持续声收掉。一次性声音由调用方直接不播。 */
  quiet() {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.creakG.gain.setTargetAtTime(0, now, 0.03);
    this.bodyG.gain.setTargetAtTime(0, now, 0.03);
    for (let i = 0; i < this.layers.length; i++) this.layers[i].g.gain.setTargetAtTime(0, now, 0.03);
    this._acc = 1;
  }

  /**
   * @param {{creakGain:number, creakHz:number, creakQ:number, clickGain:number, clickHz:number,
   *   rustle:Array<{gain:number, hz:number, q:number}>, thunks:Array<{gain:number, hz0:number, hz1:number, dur:number}>, thunkCount:number}} frame
   * @param {number} dt
   */
  apply(frame, dt) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (frame.clickGain > 0.001) this._click(now, frame.clickHz, frame.clickGain);
    for (let i = 0; i < frame.thunkCount; i++) this._thunk(now, frame.thunks[i]);
    this._acc += dt;
    if (this._acc < 0.05) return;
    this._acc = 0;
    const hz = Math.max(40, frame.creakHz || 220);
    this.creakF.frequency.setTargetAtTime(hz, now, 0.04);
    this.creakF.Q.value = frame.creakQ || 7;
    this.creakG.gain.setTargetAtTime(Math.max(0, frame.creakGain), now, 0.04);
    this.body.frequency.setTargetAtTime(hz * 0.5, now, 0.05);
    this.bodyG.gain.setTargetAtTime(Math.max(0, frame.creakGain) * 0.28, now, 0.05);
    for (let i = 0; i < this.layers.length; i++) {
      const spec = frame.rustle[i];
      if (!spec) continue;
      this.layers[i].f.frequency.setTargetAtTime(Math.max(80, spec.hz), now, 0.05);
      this.layers[i].f.Q.value = spec.q || 0.8;
      this.layers[i].g.gain.setTargetAtTime(Math.max(0, spec.gain), now, 0.04);
    }
  }

  _tone(t0, f0, f1, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(Math.max(30, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _burst(t0, dur, vol, freq, q) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = Math.max(80, freq);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + Math.min(0.01, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(this.bus);
    const span = this.noiseBuf.length / c.sampleRate;
    s.start(t0, Math.random() * Math.max(0, span - dur - 0.05));
    s.stop(t0 + dur + 0.02);
  }

  _thunk(now, t) {
    if (!t || t.gain < 0.001) return;
    this._tone(now, t.hz0, t.hz1, t.dur, t.gain);
    this._burst(now, Math.max(0.05, t.dur * 0.7), t.gain * 0.55, Math.max(180, t.hz0 * 3.2), 0.7);
  }

  _click(now, hz, gain) {
    this._tone(now, hz, hz * 0.55, 0.04, gain * 0.45);
    this._burst(now, 0.045, gain, Math.min(4200, hz * 1.4), 1.6);
  }
}
