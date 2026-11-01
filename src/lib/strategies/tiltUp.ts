import type { CameraPatternStrategy } from '@/types';

/**
 * ティルトアップ：太もも・膝のステップから顔の表情へグッと迫るアップショット
 */
export const tiltUpStrategy: CameraPatternStrategy = {
  id: 'tilt_up',
  name: 'ティルトアップ',
  category: 'angle',
  baseWeight: 18,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 激しい時は少し低めからスタート、控えめな時は腰近くから
    const startYOffset = -7.0 - 3.0 * Math.min(1.5, intensity);
    return {
      frame: 0,
      target: { x: target.x, y: target.y + startYOffset, z: target.z },
      rotation: { x: 0.04, y: params.panDir * 0.06, z: 0 },
      distance: baseDistance * 0.58,
      fov: baseFov,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    return {
      frame: 0,
      target: {
        x: target.x,
        y: target.y - 0.5,
        z: target.z,
      },
      rotation: { x: -0.06 * intensity, y: -params.panDir * 0.04, z: 0 },
      distance: baseDistance * 0.56,
      fov: baseFov,
    };
  },
};