// 滑块、键盘、鼠标，以及合页 WebSocket。角度在每帧只解析一次。
import * as THREE from '../vendor/three.module.js';
import { MAX_ANGLE } from './state.js';
import { parseAngleMessage, createSeqGate, linkState } from './protocol.js';
import { autoLabel, autoPressed, controlSource } from './control.js';
import { noteHiddenClose } from './rules.js';
import { TUNING } from './tuning.js';

export function createInput(W) {
  const { S } = W;
  const params = new URLSearchParams(location.search);
  const slider = /** @type {HTMLInputElement} */ (document.getElementById('slider'));
  const angleEl = document.getElementById('angle');
  const dot = document.getElementById('dot');
  const srcText = document.getElementById('srcText');
  const autoBtn = /** @type {HTMLButtonElement} */ (document.getElementById('auto'));
  const WS_URL = params.get('ws') || defaultWsUrl();
  if (params.get('hud') === '0') document.body.classList.add('nohud');

  /** @type {'down'|'wait'|'live'|'stale'} */
  let link = 'down';
  let lastAngleAt = 0;
  let ws = null;
  const gate = createSeqGate();
  /** @type {boolean|null} null 表示还没点过按钮 */
  let userAuto = null;
  let bridgeMode = '';
  let autoT = 0;
  let latest = null;
  let seq = 0;
  let seen = -1;
  let timer = 0;
  let stopped = false;
  let dotOn = false;
  let srcCache = '';
  let angleCache = '';
  let hudT = 0;
  /** @type {{t:number|null, a:number|null, max:number}} */
  let hiddenTrack = { t: null, a: null, max: 0 };

  function rememberHiddenAngle(raw) {
    let frame;
    try { frame = parseAngleMessage(raw); } catch { return; }
    if (!frame || frame.type !== 'angle' || frame.angle == null) return;
    const angle = /** @type {number} */ (frame.angle);
    hiddenTrack = noteHiddenClose(S, hiddenTrack, angle, performance.now(), TUNING);
    setAngle(angle);
  }

  function setAngle(a) {
    S.target = Math.min(MAX_ANGLE, Math.max(0, +a || 0));
  }

  function arm() {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = 0; connect(); }, 2000);
  }

  function connect() {
    if (stopped) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    let sock;
    try {
      sock = new WebSocket(WS_URL);
    } catch {
      arm();
      return;
    }
    W.net.connects += 1;
    ws = sock;
    // 桥还没听，或 localhost 只打到 ::1 时，Chrome 可能把套接字停在 CONNECTING，
    // error/close 都不来。到点主动关掉，交给 onclose 重连，不用整页刷新。
    const watchdog = setTimeout(() => {
      if (sock.readyState !== WebSocket.CONNECTING) return;
      try { sock.close(); } catch { /* onclose 负责重连 */ }
      if (ws === sock) ws = null;
      arm();
    }, 1500);
    const clearWatch = () => clearTimeout(watchdog);
    sock.onopen = () => { clearWatch(); gate.reset(); };
    sock.onmessage = (ev) => {
      if (latest !== null && seq !== seen) W.net.coalesced += 1;
      latest = ev.data;
      seq += 1;
      // 合严后标签页隐藏，rAF 不再把中间角度排空。低于 closeBelow 的样本在这里记下。
      if (document.hidden) rememberHiddenAngle(ev.data);
    };
    // error 之后一定会 close。只在 close 里重连，避免两条路径把连接数翻倍。
    sock.onerror = () => { try { sock.close(); } catch { /* onclose 负责重连 */ } };
    sock.onclose = () => {
      clearWatch();
      if (ws === sock) {
        ws = null;
        bridgeMode = '';
      }
      arm();
    };
  }

  function noteMode(mode) {
    if (mode !== 'fake' && mode !== 'sensor' && mode !== 'replay') return;
    if (mode === bridgeMode) return;
    const prev = bridgeMode;
    bridgeMode = mode;
    // 实机合页接上时丢掉页面上的自动扫角，角度跟盖子走。
    if (mode === 'sensor' && prev !== 'sensor') userAuto = null;
  }

  function driver() {
    return controlSource(userAuto, link, bridgeMode);
  }

  function noteLink() {
    link = linkState(!!(ws && ws.readyState === 1), lastAngleAt, performance.now());
    W.net.link = link;
  }

  function drain() {
    if (seq === seen || latest == null) return;
    const s = seq;
    const raw = latest;
    seen = s;
    try {
      const frame = parseAngleMessage(raw);
      if (!frame || !gate.accept(frame)) {
        if (frame) W.net.dropped += 1;
      } else if (frame.type === 'heartbeat') {
        noteMode(frame.mode);
      } else if (frame.type === 'angle') {
        lastAngleAt = performance.now();
        noteMode(frame.mode);
        noteLink();
        const src = driver();
        if (src === 'sensor' || src === 'remote') setAngle(/** @type {number} */ (frame.angle));
      }
    } catch { /* 忽略坏帧 */ }
    noteLink();
  }

  let painting = false;
  function syncSlider() {
    if (Math.abs(+slider.value - S.target) <= 0.05) return;
    painting = true;
    slider.value = S.target;
    painting = false;
  }
  slider.addEventListener('input', () => {
    if (painting || driver() !== 'slider') return;
    userAuto = false;
    setAngle(slider.value);
  });
  autoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const src = driver();
    if (src === 'auto' || src === 'remote') {
      userAuto = false;
    } else {
      userAuto = true;
      autoT = Math.asin(Math.min(1, Math.max(-1, S.target / MAX_ANGLE * 2 - 1)));
    }
    refreshHud();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
    if (e.key === 'ArrowRight') { setAngle(S.target + 2); slider.value = S.target; }
    if (e.key === 'ArrowLeft') { setAngle(S.target - 2); slider.value = S.target; }
  });

  connect();
  bindPointer(W);

  function tick(dt) {
    if (!document.hidden) hiddenTrack = { t: null, a: null, max: 0 };
    drain();
    noteLink();
    if (driver() === 'auto') {
      autoT += dt * 0.28;
      setAngle(MAX_ANGLE * (0.5 + 0.5 * Math.sin(autoT)));
    }
  }

  function refreshHud() {
    noteLink();
    const source = driver();
    const pressed = autoPressed(source);
    const manual = source === 'slider';
    if (slider.disabled !== !manual) slider.disabled = !manual;
    const wantOn = link === 'live';
    const wantStale = link === 'stale';
    if (dotOn !== wantOn || dot.classList.contains('stale') !== wantStale) {
      dot.classList.toggle('on', wantOn);
      dot.classList.toggle('stale', wantStale);
      dotOn = wantOn;
    }
    const wantLabel = autoLabel(pressed);
    if (autoBtn.textContent !== wantLabel) autoBtn.textContent = wantLabel;
    const pressedAttr = pressed ? 'true' : 'false';
    if (autoBtn.getAttribute('aria-pressed') !== pressedAttr) autoBtn.setAttribute('aria-pressed', pressedAttr);
    const text = source === 'auto'
      ? '自动演示中 · 再点一次停止'
      : source === 'remote'
        ? '自动演示中（假角度）· 再点一次改用滑块'
        : source === 'sensor'
          ? `传感器已连接（${WS_URL}）· 滑块已禁用`
          : link === 'stale'
            ? `角度过期（${WS_URL}）· 可改用滑块`
            : link === 'wait'
              ? `已连上，等待角度…（${WS_URL}）`
              : source === 'slider' && link === 'live'
                ? '滑块模式 · 自动演示已停止'
                : '模拟模式（拖动滑块）· 正在尝试连接 ' + WS_URL;
    if (text !== srcCache) { srcText.textContent = text; srcCache = text; }
    syncSlider();
    const label = S.target.toFixed(1) + '°';
    if (label !== angleCache) { angleEl.textContent = label; angleCache = label; }
  }

  function maybeHud(dt) {
    hudT += dt;
    if (hudT < 0.1) return;
    hudT = 0;
    refreshHud();
  }

  return {
    tick, maybeHud, refreshHud, setAngle, WS_URL,
    get wsActive() { return link === 'live'; },
    get link() { return link; },
    get ws() { return ws; },
  };
}

/** 和页面同一个主机名。localhost 在 macOS 上会先走 ::1，WebSocket 又不像 HTTP 那样回退，所以固定走 127.0.0.1。 */
function defaultWsUrl() {
  let host = location.hostname;
  if (!host || host === 'localhost') host = '127.0.0.1';
  if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`;
  return `ws://${host}:19876`;
}

function bindPointer(W) {
  const { S } = W;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const cv = W.gfx.renderer.domElement;
  cv.style.touchAction = 'none';
  const v = W.tmp.v;

  function pointerNdc(e) {
    const r = cv.getBoundingClientRect();
    S.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
    S.mouseY = -((e.clientY - r.top) / r.height) * 2 + 1;
    ndc.set(S.mouseX, S.mouseY);
  }
  function pick() {
    raycaster.setFromCamera(ndc, W.camera);
    let best = null;
    let bd = 1e9;
    const test = (obj, type, tree) => {
      const hits = raycaster.intersectObject(obj, true);
      if (hits.length && hits[0].distance < bd) {
        bd = hits[0].distance;
        best = { type, tree };
      }
    };
    if (W.kitten.visible) test(W.kitten, 'kitten');
    if (W.owl.visible && W.O.state === 'perched') test(W.owl, 'owl');
    for (const t of W.trees) if (t.g.visible && t.q > 0.6) test(t.g, 'tree', t);
    return best;
  }
  let hoverCd = 0;
  cv.addEventListener('pointermove', (e) => {
    pointerNdc(e);
    S.mouseT = S.time;
    const now = performance.now();
    if (now - hoverCd < 80) return;
    hoverCd = now;
    const h = pick();
    cv.style.cursor = h ? 'pointer' : 'default';
    S.hover = h ? h.type : '';
  });
  cv.addEventListener('pointerleave', () => { S.mouseT = -99; });
  cv.addEventListener('pointerdown', (e) => {
    pointerNdc(e);
    S.mouseT = S.time;
    const h = pick();
    if (!h) return;
    if (h.type === 'kitten') {
      S.petDown = true;
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      W.store.addPet();
      if (S.napP > 0.3) {
        S.act.nap = false;
        S.napLock = 9;
        W.say('呀！把小猫吵醒了', 2.5);
        W.sound.meow(1.25, 0.4, 0.3);
      } else {
        W.sound.meow(1.05, 0.55, 0.4);
        W.say('喵～ 按住可以摸摸它', 2.5);
      }
      if (!S.purring) { W.sound.purr(true); S.purring = true; }
    } else if (h.type === 'owl') {
      if (W.startleOwl(false)) W.say('呼——猫头鹰扑棱棱飞走了', 2.5);
    } else if (h.type === 'tree') {
      h.tree.sw.v += (Math.random() < 0.5 ? -1 : 1) * 9;
      h.tree.g.getWorldPosition(v);
      for (let i = 0; i < 16; i++) {
        const p = W.PA[(Math.random() * W.NP) | 0];
        p.x = v.x + (Math.random() - 0.5) * 0.6;
        p.y = v.y + h.tree.h * (0.4 + Math.random() * 0.5);
        p.z = v.z + 0.15;
        p.vx = (Math.random() - 0.5) * 1.2;
        p.vy = -Math.random() * 0.5;
      }
      S.burstT = Math.max(S.burstT, 0.8);
      S.season === 3 ? W.sound.bellTwinkle(0.06) : W.sound.tap();
    }
  });
  const endPet = () => {
    if (!S.petDown) return;
    S.petDown = false;
    if (S.purring && !S.act.nap) { W.sound.purr(false); S.purring = false; }
  };
  cv.addEventListener('pointerup', endPet);
  cv.addEventListener('pointercancel', endPet);
}
