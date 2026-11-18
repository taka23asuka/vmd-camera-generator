import type { CameraPatternStrategy } from '@/types';

/**
 * スライド：
 * 画面外からスライドインし、中央でキャラのダンスを捉えた後、
 * 再び画面外へスーッと流れて通り抜けるスタイリッシュなトラッキングショット
 */
export const slideStrategy: CameraPatternStrategy = {
  id: 'slide',
  name: 'スライド',
  category: 'pull',
  baseWeight: 18,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 画面外にキャラが完全に隠れる横オフセット量 (約 10.5 単位)
    const slideOffset = 10.5 * Math.min(1.4, Math.max(0.6, intensity));
    const startX = target.x - params.panDir * slideOffset;

    return {
      frame: 0,
      // 開始：画面外からスタート
      target: { x: startX, y: target.y - 2.5, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 }, // 水平を維持
      distance: baseDistance * 0.95,     // ダンスがしっかり見える距離 (約42.7)
      fov: baseFov,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    const slideOffset = 10.5 * Math.min(1.4, Math.max(0.6, intensity));
    const endX = target.x + params.panDir * slideOffset;

    return {
      frame: 0,
      // 終了：反対側の画面外へ抜けて流れる
      target: { x: endX, y: target.y - 2.5, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: baseDistance * 0.95,
      fov: baseFov,
    };
  },
};