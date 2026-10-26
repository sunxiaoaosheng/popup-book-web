// 滑块、键盘、鼠标，以及合页 WebSocket。角度在每帧只解析一次。
import * as THREE from '../vendor/three.module.js';
import { MAX_ANGLE } from './state.js';

export function createInput(W) {
  const { S } = W;
  const params = new URLSearchParams(location.search);
  const slider = document.getElementById('slider');
  const angleEl = document.getElementById('angle');
  const dot = document.getElementById('dot');
  const srcText = document.getElementById('srcText');
  const autoBtn = document.getElementById('auto');
  const WS_URL = params.get('ws') || 'ws://localhost:8765';
  if (params.get('hud') === '0') document.body.classList.add('nohud');

  let wsActive = false;
  let lastWsMsg = 0;
  let ws = null;
  let autoPlay = false;
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
    sock.onmessage = (ev) => {
      if (latest !== null && seq !== seen) W.net.coalesced += 1;
      latest = ev.data;
      seq += 1;
    };
    // error 之后一定会 close。只在 close 里重连，避免两条路径把连接数翻倍。
    sock.onerror = () => { try { sock.close(); } catch { /* onclose 负责重连 */ } };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      arm();
    };
  }

  function drain() {
    if (seq === seen || latest == null) return;
    const s = seq;
    const raw = latest;
    seen = s;
    try {
      const d = JSON.parse(raw);
      if (typeof d.angle === 'number' && Number.isFinite(d.angle)) {
        lastWsMsg = performance.now();
        wsActive = true;
        setAngle(d.angle);
      }
    } catch { /* 忽略坏帧 */ }
  }

  slider.addEventListener('input', () => {
    if (wsActive) return;
    autoPlay = false;
    autoBtn.textContent = '▶ 自动演示';
    setAngle(slider.value);
  });
  autoBtn.addEventListener('click', () => {
    autoPlay = !autoPlay;
    autoBtn.textContent = autoPlay ? '■ 停止演示' : '▶ 自动演示';
    autoT = Math.asin(Math.min(1, Math.max(-1, S.target / MAX_ANGLE * 2 - 1)));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
    if (e.key === 'ArrowRight') { setAngle(S.target + 2); slider.value = S.target; }
    if (e.key === 'ArrowLeft') { setAngle(S.target - 2); slider.value = S.target; }
  });

  connect();
  bindPointer(W);

  function tick(dt) {
    drain();
    if (autoPlay && !wsActive) {
      autoT += dt * 0.28;
      setAngle(MAX_ANGLE * (0.5 + 0.5 * Math.sin(autoT)));
    }
  }

  function refreshHud() {
    if (wsActive && performance.now() - lastWsMsg > 1500) wsActive = false;
    if (slider.disabled !== wsActive) slider.disabled = wsActive;
    if (dotOn !== wsActive) {
      dot.classList.toggle('on', wsActive);
      dotOn = wsActive;
    }
    const text = wsActive
      ? `传感器已连接（${WS_URL}）· 滑块已禁用`
      : (ws && ws.readyState === 1 ? '已连上 WebSocket，等待数据…' : '模拟模式（拖动滑块）· 正在尝试连接 ' + WS_URL);
    if (text !== srcCache) { srcText.textContent = text; srcCache = text; }
    if (Math.abs(+slider.value - S.target) > 0.05) slider.value = S.target;
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
    get wsActive() { return wsActive; },
    get ws() { return ws; },
  };
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
