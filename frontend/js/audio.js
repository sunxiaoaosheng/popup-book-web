// 全部声音都由 WebAudio 现场合成，没有任何外部音频文件。
// 合页嘎吱、纸声层和落点轻撞在 hinge-audio.js，这里只把它们接到主音量上。
import { HingeFoley } from './hinge-audio.js';
// 浏览器要求用户手势后才能出声：这里的 AudioContext 只在 unlock() 被调用时才创建。
// 也可以 attach(OfflineAudioContext) 做离线渲染，用来在无头环境里验证"确实有声音"。
export class Sound {
  constructor() {
    this.ctx = null; this.ready = false; this.muted = false;
    this.hinge = new HingeFoley();
    this._hingeHeld = false;
    this._hingeIdle = false;
    this.events = [];            // 最近触发过的音效名（测试用）
    this._t = 0; this._chirpT = 2; this._env = { amb: 0, night: 0, season: 0, speed: 0, wind: 1 };
    this._last = { amb: -1, rustle: -1, purr: -1 };
  }
  log(name) { this.events.push(name); if (this.events.length > 120) this.events.shift(); }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  /** 必须在用户手势（点击/按键/触摸）里调用 */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || /** @type {typeof AudioContext | undefined} */ (/** @type {any} */ (window).webkitAudioContext);
    if (!AC) return;
    try { this.attach(new AC()); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { console.warn('audio unavailable', e); }
  }
  setMuted(m) {
    this.muted = !!m; this.log(m ? 'mute' : 'unmute');
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  attach(ctx) {
    this.ctx = ctx; const sr = ctx.sampleRate;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    // 噪声缓冲（2 秒，循环）
    const nb = ctx.createBuffer(1, sr * 2, sr), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    // 风声 / 森林底噪
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    loopNoise().connect(wbp); wbp.connect(this.windGain); this.windGain.connect(this.master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; const lfoG = ctx.createGain(); lfoG.gain.value = 240;
    lfo.connect(lfoG); lfoG.connect(wbp.frequency); lfo.start();
    // 纸张沙沙声
    const rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1400;
    this.rustleBp = ctx.createBiquadFilter(); this.rustleBp.type = 'bandpass'; this.rustleBp.frequency.value = 3200; this.rustleBp.Q.value = 0.8;
    this.rustleGain = ctx.createGain(); this.rustleGain.gain.value = 0;
    loopNoise().connect(rhp); rhp.connect(this.rustleBp); this.rustleBp.connect(this.rustleGain); this.rustleGain.connect(this.master);
    // 呼噜（低通噪声 × 25Hz 调制）
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 160; plp.Q.value = 2.5;
    const pmod = ctx.createGain(); pmod.gain.value = 0.5;
    this.purrAmp = ctx.createGain(); this.purrAmp.gain.value = 0;
    const plfo = ctx.createOscillator(); plfo.frequency.value = 25; const plg = ctx.createGain(); plg.gain.value = 0.5;
    plfo.connect(plg); plg.connect(pmod.gain); plfo.start();
    loopNoise().connect(plp); plp.connect(pmod); pmod.connect(this.purrAmp); this.purrAmp.connect(this.master);
    this.hinge.attach(ctx, this.master);
    this.ready = true;
  }

  /**
   * 合页这一帧的拟音。静音时不发一次性声音，持续层也收掉。
   * @param {object} frame hinge-feel 的输出
   * @param {number} dt
   */
  stepHinge(frame, dt) {
    if (this.muted) {
      if (!this._hingeHeld) { this._hingeHeld = true; this.hinge.quiet(); }
      return;
    }
    this._hingeHeld = false;
    let live = frame.creakGain > 0.0008 || frame.clickGain > 0.001 || frame.thunkCount > 0;
    if (!live) {
      for (let i = 0; i < frame.rustle.length; i++) if (frame.rustle[i].gain > 0.0008) live = true;
    }
    if (!live) {
      if (!this._hingeIdle) { this._hingeIdle = true; this.hinge.quiet(); }
      return;
    }
    this._hingeIdle = false;
    if (frame.clickGain > 0.001) this.log('hinge-click');
    for (let i = 0; i < frame.thunkCount; i++) this.log('thunk-' + frame.thunks[i].id);
    this.hinge.apply(frame, dt);
  }

  /* ------------ 小工具 ------------ */
  _now() { return this.ctx.currentTime; }
  _tone(type, f0, f1, t0, dur, vol, dest, attack = 0.01) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.05); return o;
  }
  _noise(t0, dur, vol, f, q, type = 'bandpass', attack = 0.005) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  /* ------------ 连续声音：每帧由 main.js 喂环境 ------------ */
  /** env: amb 0..1（翻开程度）、night 0..1、season 0..3、speed 角速度(°/s) */
  setEnv(env, dt) {
    Object.assign(this._env, env); this._t += dt;
    if (!this.ready) return;
    const c = this.ctx, now = c.currentTime;
    if (this._t > 0.1) {                        // 10Hz 更新，避免自动化事件把音频线程堆满
      this._t = 0;
      const e = this._env, winter = e.season === 3 ? 1.6 : 1;
      const wind = e.amb * (0.05 + 0.05 * (1 - e.night)) * winter * (e.wind || 1);
      if (Math.abs(wind - this._last.amb) > 0.002) { this.windGain.gain.setTargetAtTime(wind, now, 0.25); this._last.amb = wind; }
      const sp = Math.min(1, Math.abs(e.speed) / 110);
      const rus = Math.pow(sp, 1.1) * 0.5;
      if (Math.abs(rus - this._last.rustle) > 0.004) {
        this.rustleGain.gain.setTargetAtTime(rus * (0.75 + 0.25 * Math.random()), now, 0.04);
        this.rustleBp.frequency.setTargetAtTime(2200 + sp * 3800, now, 0.05); this._last.rustle = rus;
      }
    }
  }
  /** 随机的鸟叫 / 虫鸣，按季节和昼夜选择 */
  tick(dt) {
    if (!this.ready) return;
    const e = this._env; if (e.amb < 0.25) return;
    this._chirpT -= dt; if (this._chirpT > 0) return;
    this._chirpT = 2.2 + Math.random() * 4.5;
    const t = this._now() + 0.02, day = 1 - e.night;
    if (e.season === 3) { if (Math.random() < 0.3) this.bellTwinkle(0.05); return; }       // 冬：偶尔一点冰铃
    if (day > 0.5 && e.season !== 2) this._bird(t);
    else if (e.night > 0.35 || e.season === 1) this._cricket(t, e.season === 1 ? 1.2 : 1);
    else if (Math.random() < 0.4) this._bird(t);
  }
  _bird(t) {
    this.log('bird'); const n = 2 + Math.floor(Math.random() * 3), base = 2300 + Math.random() * 1400;
    for (let i = 0; i < n; i++) this._tone('sine', base, base * (1.15 + Math.random() * .25), t + i * 0.12, 0.09, 0.025, null, 0.015);
  }
  _cricket(t, k = 1) {
    this.log('cricket'); const f = 4200 + Math.random() * 400;
    for (let i = 0; i < 4; i++) this._tone('sine', f, f, t + i * 0.055, 0.035, 0.012 * k, null, 0.006);
  }

  /* ------------ 一次性音效 ------------ */
  meow(pitch = 1, len = 0.62, vol = 0.5) {
    this.log('meow'); if (!this.ready) return;
    const c = this.ctx, t = this._now() + 0.01, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 * pitch, t); o.frequency.linearRampToValueAtTime(900 * pitch, t + len * 0.35); o.frequency.linearRampToValueAtTime(560 * pitch, t + len);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 6.5; vg.gain.value = 14; vib.connect(vg); vg.connect(o.frequency);
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.Q.value = 4; f2.Q.value = 5;
    f1.frequency.setValueAtTime(550, t); f1.frequency.linearRampToValueAtTime(1050, t + len * 0.4); f1.frequency.linearRampToValueAtTime(650, t + len);
    f2.frequency.setValueAtTime(1700, t); f2.frequency.linearRampToValueAtTime(2500, t + len * 0.4); f2.frequency.linearRampToValueAtTime(1500, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol * 0.9, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.master);
    o.start(t); vib.start(t); o.stop(t + len + 0.05); vib.stop(t + len + 0.05);
  }
  mew() { this.meow(1.45, 0.3, 0.28); this.log('mew'); }       // 小声的、害羞的
  purr(on) {
    this.log(on ? 'purr-on' : 'purr-off'); if (!this.ready) return;
    this.purrAmp.gain.setTargetAtTime(on ? 0.9 : 0, this._now(), on ? 0.25 : 0.4);
  }
  hoot() {
    this.log('hoot'); if (!this.ready) return; const t = this._now() + 0.02;
    this._tone('sine', 420, 360, t, 0.38, 0.12, null, 0.06); this._tone('sine', 400, 330, t + 0.5, 0.5, 0.12, null, 0.06);
  }
  flap() {
    this.log('flap'); if (!this.ready) return; const t = this._now();
    for (let i = 0; i < 5; i++) this._noise(t + i * 0.09, 0.07, 0.22, 900, 0.9, 'bandpass', 0.01);
    this._tone('square', 1500, 900, t, 0.12, 0.04, null, 0.005);              // 受惊的小尖叫
  }
  chime() {
    this.log('chime'); if (!this.ready) return; const t = this._now() + 0.02;
    [784, 988, 1175, 1568].forEach((f, i) => { this._tone('triangle', f, f, t + i * 0.1, 1.3, 0.11, null, 0.01); this._tone('sine', f * 2, f * 2, t + i * 0.1, 0.8, 0.03, null, 0.01); });
  }
  bellTwinkle(vol = 0.08) {
    this.log('bell'); if (!this.ready) return; const t = this._now() + 0.02;
    for (let i = 0; i < 3; i++) { const f = 2000 + Math.random() * 1800; this._tone('sine', f, f, t + i * 0.07, 0.9, vol, null, 0.004); }
  }
  shake(season) {
    this.log('shake-' + season); if (!this.ready) return; const t = this._now();
    this._noise(t, 0.9, 0.35, season === 3 ? 3200 : 1800, 0.5, 'bandpass', 0.02);
    if (season === 3) for (let i = 0; i < 5; i++) { const f = 2200 + Math.random() * 1500; this._tone('sine', f, f, t + i * 0.06, 0.8, 0.07, null, 0.004); }
  }
  thud() {
    this.log('thud'); if (!this.ready) return; const t = this._now();
    this._tone('sine', 130, 42, t, 0.3, 0.7, null, 0.003); this._noise(t, 0.25, 0.4, 380, 0.6, 'lowpass', 0.002);
  }
  tap() { this.log('tap'); if (!this.ready) return; const t = this._now(); this._noise(t, 0.05, 0.25, 700, 3, 'bandpass', 0.002); this._tone('sine', 300, 120, t, 0.08, 0.2, null, 0.002); }
  /** 发条音乐盒：晚安曲（五声音阶，几个音） */
  lullaby(season = 0) {
    this.log('lullaby'); if (!this.ready) return; const t = this._now() + 0.3;
    const notes = [659, 784, 880, 784, 659, 587, 523, [523, 392, 659, 587][season]];
    notes.forEach((f, i) => {
      const tt = t + i * 0.46, last = i === notes.length - 1;
      this._tone('sine', f, f, tt, last ? 2.6 : 1.5, 0.1, null, 0.006); this._tone('sine', f * 2.01, f * 2.01, tt, 0.7, 0.025, null, 0.006);
    });
  }
}
