import type { CameraPatternStrategy } from '@/types';

/**
 * ダッチアングル：カメラをZ軸（ロール）で斜めに傾け、胸元へ迫るダイナミックショット
 */
export const dutchAngleStrategy: CameraPatternStrategy = {
  id: 'dutch_angle',
  name: 'ダッチアングル',
  category: 'angle',
  baseWeight: 18,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 激しさに応じて傾きをスケーリング (開始: 10度〜20度程度)
    const rollAngle = params.panDir * Math.min(0.35, 0.24 * intensity);
    return {
      frame: 0,
      target: { x: target.x, y: target.y - 2.2, z: target.z },
      rotation: { x: 0.03, y: params.panDir * 0.10, z: rollAngle },
      distance: baseDistance * 0.92,
      fov: baseFov + 2,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 終了: 15度〜30度程度までダイナミックに傾斜深化
    const rollAngleEnd = params.panDir * Math.min(0.52, 0.44 * intensity);
    const approachMul = Math.max(0.50, 0.68 - 0.10 * (intensity - 1.0)); // 激しい時はより深く寄る

    return {
      frame: 0,
      target: {
        x: target.x + params.panDir * (0.6 * intensity),
        y: target.y - 1.0,
        z: target.z,
      },
      rotation: { x: 0.03, y: -params.panDir * 0.06, z: rollAngleEnd },
      distance: baseDistance * approachMul,
      fov: baseFov + 2,
    };
  },
};