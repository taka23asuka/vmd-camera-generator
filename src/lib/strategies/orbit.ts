import type { CameraPatternStrategy } from '@/types';

/**
 * オービット：正面を挟んで左右斜め前を優雅に旋回するバストアップショット
 */
export const orbitStrategy: CameraPatternStrategy = {
  id: 'orbit',
  name: 'オービット',
  category: 'orbit',
  baseWeight: 20,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 激しさに応じて旋回角度を伸縮（最大約45度までに安全制限）
    const sweepAngle = Math.min(0.80, 0.55 * Math.max(0.4, intensity));
    const startAngle = -params.orbitDir * sweepAngle;
    return {
      frame: 0,
      target: { x: target.x, y: target.y - 2.8, z: target.z },
      rotation: { x: 0.02, y: startAngle, z: 0 },
      distance: baseDistance * (30 / 45),
      fov: baseFov,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    const sweepAngle = Math.min(0.80, 0.55 * Math.max(0.4, intensity));
    const endAngle = params.orbitDir * sweepAngle;
    return {
      frame: 0,
      target: {
        x: target.x,
        y: target.y - 2.8,
        z: target.z,
      },
      rotation: { x: 0.02, y: endAngle, z: 0 },
      distance: baseDistance * (30 / 45),
      fov: baseFov,
    };
  },
};