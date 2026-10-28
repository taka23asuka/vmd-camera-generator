import type { CameraPatternStrategy } from '@/types';

/**
 * 俯瞰（ハイアングル）：胸元を中心に見下ろし、ステージの広がりと立体感を出すショット
 */
export const highangleStrategy: CameraPatternStrategy = {
  id: 'highangle',
  name: '俯瞰',
  category: 'angle',
  baseWeight: 15,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const config = {
      targetYOffset: -1.0,
      sideAngle: 0.55,
      rotX: 0.40,
      distanceMul: 1.25,
      fovOffset: 2,
    };
    return {
      frame: 0,
      target: { x: target.x, y: target.y + config.targetYOffset, z: target.z },
      rotation: { x: config.rotX, y: params.panDir * config.sideAngle, z: 0 },
      distance: baseDistance * config.distanceMul,
      fov: baseFov + config.fovOffset,
    };
  },
  createEndKeyframe: ({ target, params }, startKf) => {
    const config = {
      targetYOffset: -1.0,
      verticalDrift: 2.0,
      sideAngle: 0.55,
      rotX: 0.40,
      tiltDrift: 0.08,
      dollyShift: 0.12,
    };
    return {
      frame: 0,
      target: { x: target.x, y: target.y + config.targetYOffset + params.verticalDir * config.verticalDrift, z: target.z },
      rotation: { x: config.rotX + params.tiltDir * config.tiltDrift, y: -params.panDir * config.sideAngle, z: 0 },
      distance: startKf.distance * (1 - params.dollyDir * config.dollyShift),
      fov: startKf.fov,
    };
  },
};
