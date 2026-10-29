/**
 * 纸太阳和云贴在同一张封底上。太阳盘面大约在 z 0.08–0.11，笑脸最前面约 0.13。
 * 云必须整片站在这前面，否则重叠处会抢深度、闪烁。
 */

/** 云实例的局部 z。几何本身还有大约 0.03 的厚度，从这里往读者方向长。 */
export const CLOUD_Z = 0.2;
/** 太阳（含笑脸）最靠近读者的一面。云的起点要大于它。 */
export const SUN_FRONT_Z = 0.14;
export const CLOUD_RENDER_ORDER = 2;
export const SUN_RENDER_ORDER = 1;

/** @param {number} [cloudZ] */
export function cloudClearsSun(cloudZ = CLOUD_Z) {
  return cloudZ > SUN_FRONT_Z;
}

/**
 * 太阳沿深度往页里让一格。和云的 z 分开之后，共面时也不再闪。
 * 材质要先复制：书页的边材质是共用的，不能直接改。
 * @param {any} root
 */
export function biasSunBehind(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.renderOrder = SUN_RENDER_ORDER;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    obj.material = list.map(biasOne);
  });
}

/** @param {any} material */
function biasOne(material) {
  const copy = material.clone();
  copy.polygonOffset = true;
  copy.polygonOffsetFactor = 1;
  copy.polygonOffsetUnits = 1;
  return copy;
}
