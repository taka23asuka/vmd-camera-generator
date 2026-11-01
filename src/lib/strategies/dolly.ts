import type { CameraPatternStrategy } from '@/types';

/**
 * ドリー：画面中央をロックオンしたまま、引き（全身）から寄り（バストアップ）へ真っ直ぐ迫るショット
 */
export const dollyStrategy: CameraPatternStrategy = {
  id: 'dolly',
  name: 'ドリー',
  category: 'push',
  baseWeight: 22,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    const isApproach = params.dollyDir > 0;
    // 激しさによって前後の押し引き幅をスケーリング
    const approachMul = 1.0 + 0.30 * intensity; // 1.3相当
    const retreatMul = Math.max(0.30, 1.0 - 0.55 * Math.min(1.2, intensity)); // 0.45相当

    return {
      frame: 0,
      target: { x: target.x, y: isApproach ? target.y - 3.0 : target.y, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: isApproach ? baseDistance * approachMul : baseDistance * retreatMul,
      fov: isApproach ? baseFov + 4 : baseFov - 4,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    const isApproach = params.dollyDir > 0;
    const approachEndMul = Math.max(0.30, 1.0 - 0.55 * Math.min(1.2, intensity));
    const retreatEndMul = 1.0 + 0.30 * intensity;

    return {
      frame: 0,
      target: { x: target.x, y: isApproach ? target.y : target.y - 3.0, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: isApproach ? baseDistance * approachEndMul : baseDistance * retreatEndMul,
      fov: isApproach ? baseFov - 4 : baseFov + 4,
    };
  },
};