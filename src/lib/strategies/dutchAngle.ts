import type { CameraPatternStrategy } from '@/types';

/**
 * ダッチアングル：カメラをZ軸（ロール）で斜めに約16〜25度傾け、胸元へグッと迫るダイナミックショット
 */
export const dutchAngleStrategy: CameraPatternStrategy = {
  id: 'dutch_angle',
  name: 'ダッチアングル',
  category: 'angle',
  baseWeight: 18,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const rollAngle = params.panDir * 0.24;
    return {
      frame: 0,
      target: { x: target.x, y: target.y - 2.2, z: target.z },
      rotation: { x: 0.03, y: params.panDir * 0.10, z: rollAngle },
      distance: baseDistance * 0.92,
      fov: baseFov + 2,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const rollAngleEnd = params.panDir * 0.44;
    return {
      frame: 0,
      target: {
        x: target.x + params.panDir * 0.6,
        y: target.y - 1.0,
        z: target.z,
      },
      rotation: { x: 0.03, y: -params.panDir * 0.06, z: rollAngleEnd },
      distance: baseDistance * 0.68,
      fov: baseFov + 2,
    };
  },
};
