import type { CameraPatternStrategy } from '@/types';

/**
 * ローアングル：靴先から頭まで全身を捉える床スレスレからのダイナミック煽りショット
 */
export const lowangleStrategy: CameraPatternStrategy = {
  id: 'lowangle',
  name: 'ローアングル',
  category: 'angle',
  baseWeight: 18,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const config = {
      targetYOffset: -5.5,
      sideAngle: 0.30,
      rotX: -0.22,
      distanceMul: 0.78,
      fovOffset: 4,
    };
    return {
      frame: 0,
      target: { x: target.x, y: target.y + config.targetYOffset, z: target.z },
      rotation: { x: config.rotX, y: params.panDir * config.sideAngle, z: 0 },
      distance: baseDistance * config.distanceMul,
      fov: baseFov + config.fovOffset,
    };
  },
  createEndKeyframe: ({ target, baseFov, params }, startKf) => {
    const config = {
      targetYOffset: -5.5,
      verticalDrift: 1.0,
      sideAngle: 0.30,
      rotX: -0.18,
      tiltDrift: 0.02,
      dollyShift: 0.08,
      fovOffset: 4,
    };
    return {
      frame: 0,
      target: {
        x: target.x,
        y: target.y + config.targetYOffset + params.verticalDir * config.verticalDrift * 0.3,
        z: target.z,
      },
      rotation: { x: config.rotX + params.tiltDir * config.tiltDrift, y: -params.panDir * config.sideAngle, z: 0 },
      distance: startKf.distance * (1 + config.dollyShift),
      fov: baseFov + config.fovOffset,
    };
  },
};
