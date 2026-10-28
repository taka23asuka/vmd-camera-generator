import type { CameraPatternStrategy } from '@/types';

/**
 * ドリー：画面中央をロックオンしたまま、引き（全身）から寄り（バストアップ）へ真っ直ぐ迫るショット
 */
export const dollyStrategy: CameraPatternStrategy = {
  id: 'dolly',
  name: 'ドリー',
  category: 'push',
  baseWeight: 22,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const isApproach = params.dollyDir > 0;
    return {
      frame: 0,
      target: { x: target.x, y: isApproach ? target.y - 3.0 : target.y, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: isApproach ? baseDistance * 1.3 : baseDistance * 0.45,
      fov: isApproach ? baseFov + 4 : baseFov - 4,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const isApproach = params.dollyDir > 0;
    return {
      frame: 0,
      target: { x: target.x, y: isApproach ? target.y : target.y - 3.0, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: isApproach ? baseDistance * 0.45 : baseDistance * 1.3,
      fov: isApproach ? baseFov - 4 : baseFov + 4,
    };
  },
};
