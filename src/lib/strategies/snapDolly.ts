import type { CameraPatternStrategy } from '@/types';

/**
 * スナップ用補間曲線：最初の2〜3フレームで90%以上急突入し、目標地点でピタッと静止する急激なベジェ曲線
 * MMD規格: [X1, X2, Y1, Y2] = [0, 20, 115, 127]
 */
function snapCameraInterpolation(): number[] {
  const snapCurve = [0, 20, 115, 127];
  return [
    ...snapCurve, // X
    ...snapCurve, // Y
    ...snapCurve, // Z
    ...snapCurve, // 回転
    ...snapCurve, // 距離
    ...snapCurve, // 視野角
  ];
}

/**
 * スナップドリー（クラッシュズーム）：
 * ビートの瞬間に0.1秒で顔面スレスレまで急接近し、残りの時間をキメ顔でキープするアタックショット
 */
export const snapDollyStrategy: CameraPatternStrategy = {
  id: 'snap_dolly',
  name: 'スナップドリー',
  category: 'push',
  baseWeight: 15,
  createStartKeyframe: ({ target, baseDistance, baseFov, params, intensity }) => {
    // 基本は急接近（約80%でアプローチ、20%で急後退）
    const isApproach = params.dollyDir >= -0.6;
    const snapInterp = snapCameraInterpolation();

    // 激しさによって前後の落差をブースト
    const startDist = isApproach
      ? baseDistance * (1.15 + 0.15 * (intensity - 1.0))
      : target.y;

    return {
      frame: 0,
      // 接近開始時は体幹（腰付近）、後退開始時は顔
      target: { x: target.x, y: isApproach ? target.y - 3.0 : target.y, z: target.z },
      rotation: { x: 0.02, y: params.panDir * 0.04, z: 0 },
      distance: isApproach ? startDist : 14.0,
      fov: isApproach ? baseFov + 4 : baseFov - 6,
      customInterp: snapInterp, // 急突入・急減速カーブを適用
    };
  },
  createEndKeyframe: ({ target, baseDistance, baseFov, closeupDistance, params, intensity }) => {
    const isApproach = params.dollyDir >= -0.6;

    // 終了時は顔面スレスレの超至近距離（激しいほどより深く踏み込む）
    const targetCloseDist = Math.max(10.0, closeupDistance * (0.85 - 0.12 * (intensity - 1.0)));

    return {
      frame: 0,
      target: { x: target.x, y: isApproach ? target.y : target.y - 3.0, z: target.z },
      rotation: { x: 0.02, y: 0, z: 0 },
      distance: isApproach ? targetCloseDist : baseDistance * 1.25,
      fov: isApproach ? baseFov - 4 : baseFov + 4,
    };
  },
};