
import type { CameraPatternStrategy } from '@/types';

/**
 * オービット：正面を挟んで左右斜め前（約±31度）を優雅に旋回するバストアップショット
 */
export const orbitStrategy: CameraPatternStrategy = {
  id: 'orbit',
  name: 'オービット',
  category: 'orbit',
  baseWeight: 20,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const startAngle = -params.orbitDir * 0.55;
    return {
      frame: 0,
      target: { x: target.x, y: target.y - 2.8, z: target.z },
      rotation: { x: 0.02, y: startAngle, z: 0 },
      distance: baseDistance * (30 / 45),
      fov: baseFov,
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const endAngle = params.orbitDir * 0.55;
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
