import type { CameraPattern, CameraPatternStrategy } from '@/types';
import { wideStrategy } from './wide';
import { closeupStrategy } from './closeup';
import { highangleStrategy } from './highangle';
import { lowangleStrategy } from './lowangle';
import { orbitStrategy } from './orbit';
import { dollyStrategy } from './dolly';
import { dutchAngleStrategy } from './dutchAngle';
import { tiltUpStrategy } from './tiltUp';
import { snapDollyStrategy } from './snapDolly';

/**
 * すべてのカメラワーク・ストラテジーを集約した辞書マップ (Registry)
 */
export const CAMERA_STRATEGIES: Record<CameraPattern, CameraPatternStrategy> = {
  wide: wideStrategy,
  closeup: closeupStrategy,
  highangle: highangleStrategy,
  lowangle: lowangleStrategy,
  orbit: orbitStrategy,
  dolly: dollyStrategy,
  dutch_angle: dutchAngleStrategy,
  tilt_up: tiltUpStrategy,
  snap_dolly: snapDollyStrategy,
};

// 各ストラテジーも個別エクスポート
export {
  wideStrategy,
  closeupStrategy,
  highangleStrategy,
  lowangleStrategy,
  orbitStrategy,
  dollyStrategy,
  dutchAngleStrategy,
  tiltUpStrategy,
  snapDollyStrategy,
};
