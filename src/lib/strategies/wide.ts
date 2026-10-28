import type { CameraPatternStrategy } from '@/types';

/**
 * 引き（ワイド）：全身のダンスと足元エフェクトを縦画面いっぱいに収めるフルショット
 */
export const wideStrategy: CameraPatternStrategy = {
  id: 'wide',
  name: '引き',
  category: 'pull',
  baseWeight: 20,
  createStartKeyframe: ({ target, baseDistance, baseFov, params }) => {
    const config = {
      targetYOffset: -3.5,
      panOffset: 1.2,
      rotX: 0.05,
      rotYOffset: 0.03,
      distanceMul: 1.15,
      fovOffset: 2,
    };
    return {
      frame: 0,
      target: { x: target.x + params.panDir * config.panOffset, y: target.y + config.targetYOffset, z: target.z },
      rotation: { x: config.rotX, y: params.panDir * config.rotYOffset, z: 0 },
      distance: baseDistance * config.distanceMul,
      fov: baseFov + config.fovOffset,
    };
  },
  createEndKeyframe: ({ target, baseFov, params }, startKf) => {
    const config = {
      targetYOffset: -3.5,
      panOffset: 1.2,
      verticalDrift: 1.0,
      tiltDrift: 0.02,
      rotX: 0.05,
      rotYOffset: 0.03,
      dollyShift: 0.08,
      fovOffset: 2,
    };
    return {
      frame: 0,
      target: {
        x: target.x - params.panDir * config.panOffset,
        y: target.y + config.targetYOffset + params.verticalDir * config.verticalDrift * 0.3,
        z: target.z,
      },
      rotation: { x: config.rotX + params.tiltDir * config.tiltDrift, y: -params.panDir * config.rotYOffset, z: 0 },
      distance: startKf.distance * (1 + config.dollyShift),
      fov: baseFov + config.fovOffset,
    };
  },
};
