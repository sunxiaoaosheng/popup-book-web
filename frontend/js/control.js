/**
 * 角度由谁驱动。和 WebSocket 帧解析分开，方便单测按钮状态。
 *
 * userAuto:
 *   null  还没点过「自动演示」
 *   true  用户打开了页面里的扫角
 *   false 用户关掉了自动扫角（假桥的 0→130→0 也算）
 *
 * 实机传感器（mode=sensor）在默认和「关掉演示」时都优先于滑块。
 * 只有用户明确打开演示，才暂时不跟合页。
 */

/**
 * @param {boolean|null} userAuto
 * @param {'down'|'wait'|'live'|'stale'} link
 * @param {string} bridgeMode fake / sensor / replay，或还不知道时的空串
 * @returns {'auto'|'remote'|'sensor'|'slider'}
 */
export function controlSource(userAuto, link, bridgeMode) {
  const live = link === 'live';
  if (userAuto === true) return 'auto';
  if (live && bridgeMode === 'sensor') return 'sensor';
  if (userAuto === false) return 'slider';
  if (live && (bridgeMode === 'fake' || bridgeMode === 'replay')) return 'remote';
  if (live) return 'sensor';
  return 'slider';
}

/** 按钮处于「正在自动演示」时为 true，文案用「■ 停止演示」。 */
export function autoPressed(source) {
  return source === 'auto' || source === 'remote';
}

export function autoLabel(pressed) {
  return pressed ? '■ 停止演示' : '▶ 自动演示';
}
