// 渲染器、相机、灯光。阴影默认不每帧重绘，由主循环按运动状态申请。
import * as THREE from '../vendor/three.module.js';
import { initialPixelRatio } from './quality.js';

export function createGfx(stageEl) {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    // 保留绘图缓冲会在每帧末尾强制拷贝，Mac 上容易把合成线程卡住。截图脚本需要时加 ?pdb=1。
    preserveDrawingBuffer: params.get('pdb') === '1',
    powerPreference: 'high-performance',
  });
  const dprCap = initialPixelRatio(window.devicePixelRatio || 1);
  renderer.setPixelRatio(dprCap);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 关掉自动更新：合页静止时不要把整张阴影贴图以 60fps 重画。
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stageEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a211b');
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  const hemi = new THREE.HemisphereLight('#fff3e0', '#7a6a5a', 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0dc', 2.6);
  sun.position.set(-6, 15, 12);
  sun.target.position.set(0, 1, 2);
  sun.castShadow = true;
  // 4096² 软阴影 × 上百个投影体是卡顿的主因。2048 仍能看出纸片影子扫过地面。
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const seamLight = new THREE.PointLight('#ffb25a', 0, 14, 1.2);
  seamLight.position.set(0, 0.45, 3.2);
  scene.add(seamLight);
  const windowLight = new THREE.PointLight('#ffc36b', 0, 6, 1.5);
  scene.add(windowLight);

  const perf = { acc: 0, n: 0, pr: renderer.getPixelRatio(), shadowSize: 2048, shadowAcc: 0, shadowReady: false };

  function setShadowSize(size) {
    perf.shadowSize = size;
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    forceShadow();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /** moving 时每帧更新影子（日晷要跟手）；静止时约 6Hz，只跟上呼吸。 */
  function requestShadow(dt, moving) {
    perf.shadowAcc += dt;
    const due = !perf.shadowReady || moving || perf.shadowAcc >= 0.16;
    if (due) {
      renderer.shadowMap.needsUpdate = true;
      perf.shadowAcc = 0;
      perf.shadowReady = true;
    }
  }

  function forceShadow() {
    renderer.shadowMap.needsUpdate = true;
    perf.shadowReady = true;
  }

  return {
    renderer, scene, camera, hemi, sun, seamLight, windowLight, perf, resize, requestShadow, forceShadow, setShadowSize,
  };
}
