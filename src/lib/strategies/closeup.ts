import type { CameraPatternStrategy } from '@/types';

/**
 * 寄り（クローズアップ）：顔・目線に完全固定し、極小ドリーのみでブレを防ぐ表情重視ショット
 */
export const closeupStrategy: CameraPatternStrategy = {
  id: 'closeup',
  name: '寄り',
  category: 'push',
  baseWeight: 25,
  createStartKeyframe: ({ target, baseFov, closeupDistance }) => ({
    frame: 0,
    target: { x: target.x, y: target.y, z: target.z },
    rotation: { x: 0, y: 0, z: 0 },
    distance: closeupDistance,
    fov: baseFov - 10,
  }),
  createEndKeyframe: ({ target }, startKf) => ({
    frame: 0,
    target: { x: target.x, y: target.y, z: target.z },
    rotation: { x: 0, y: 0, z: 0 },
    distance: startKf.distance - 0.5,
    fov: startKf.fov,
  }),
};
