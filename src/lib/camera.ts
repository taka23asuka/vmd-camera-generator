import type {
  AudioAnalysisResult,
  BoneFrame,
  CameraFrame,
  CameraKeyframe,
  CameraPattern,
  CameraTransition,
  CameraGenerationOptions,
  CutInfo,
  CutMotionParams,
  MovementCategory,
  PatternContext,
  VMDData,
} from '@/types';
import {
  defaultCameraInterpolation,
  linearCameraInterpolation,
  getBonePositionAtFrame,
} from '@/lib/vmd';
import { CAMERA_STRATEGIES } from '@/lib/strategies';

const FPS = 30;

// ============================================================
// ユーティリティ & ランダム関数
// ============================================================

function randomCutParams(): CutMotionParams {
  const rand = () => (Math.random() < 0.5 ? 1 : -1);
  return {
    orbitDir: rand(),
    verticalDir: rand(),
    dollyDir: rand(),
    panDir: rand(),
    tiltDir: rand(),
  };
}

function easeInCameraInterpolation(): number[] {
  const easeIn = [80, 127, 0, 60];
  return [...easeIn, ...easeIn, ...easeIn, ...easeIn, ...easeIn, ...easeIn];
}

function easeOutCameraInterpolation(): number[] {
  const easeOut = [0, 47, 60, 127];
  return [...easeOut, ...easeOut, ...easeOut, ...easeOut, ...easeOut, ...easeOut];
}

function getBoneHeightOffset(boneName: string, eyeHeight: number): number {
  const lower = boneName.toLowerCase();
  if (boneName.includes('頭') || boneName.includes('目') || lower.includes('head') || lower.includes('eye')) return 0;
  if (boneName.includes('首') || lower.includes('neck')) return 1.0;
  if (boneName.includes('上半身2') || lower.includes('upperbody2')) return 1.5;
  if (boneName.includes('上半身') || lower.includes('upperbody') || lower.includes('spine')) return 2.5;
  return eyeHeight;
}

function getSegmentEnergy(energyCurve: number[] | undefined, startTime: number, endTime: number): number {
  if (!energyCurve || energyCurve.length === 0) return 0.5;
  const startIndex = Math.max(0, Math.floor(startTime / 0.02));
  const endIndex = Math.min(energyCurve.length - 1, Math.floor(endTime / 0.02));
  if (startIndex >= endIndex) return energyCurve[startIndex] ?? 0.5;

  let sum = 0;
  for (let i = startIndex; i <= endIndex; i++) sum += energyCurve[i];
  return sum / (endIndex - startIndex + 1);
}

function selectPatternWithEnergy(
  cutIdx: number,
  startTime: number,
  endTime: number,
  energy: number,
  availablePatterns: CameraPattern[],
  lastPattern: CameraPattern | null,
  lastCategory: MovementCategory | null,
  usageMap: Map<CameraPattern, number>
): CameraPattern {
  if (cutIdx === 0 && availablePatterns.includes('closeup')) return 'closeup';
  if (availablePatterns.length === 1) return availablePatterns[0];

  const weights: Record<CameraPattern, number> = {} as Record<CameraPattern, number>;
  for (const p of availablePatterns) {
    const strategy = CAMERA_STRATEGIES[p];
    weights[p] = strategy ? strategy.baseWeight : 20;
  }

  const cutDuration = Math.max(0.1, endTime - startTime);

  // 音量エネルギーに応じた動的重み変調
  if (energy > 0.6) {
    if (weights.snap_dolly) weights.snap_dolly *= 2.6;
    if (weights.dolly) weights.dolly *= 2.4;
    if (weights.lowangle) weights.lowangle *= 2.0;
    if (weights.dutch_angle) weights.dutch_angle *= 1.8;
    if (weights.slide) weights.slide *= 1.6;
    if (weights.orbit) weights.orbit *= 1.6;
    if (weights.highangle) weights.highangle *= 1.3;
    if (weights.wide) weights.wide *= 0.5;
    if (weights.closeup) weights.closeup *= 0.8;
  } else if (energy < 0.35) {
    if (weights.closeup) weights.closeup *= 2.2;
    if (weights.tilt_up) weights.tilt_up *= 2.0;
    if (weights.wide) weights.wide *= 1.8;
    if (weights.slide) weights.slide *= 1.4;
    if (weights.orbit) weights.orbit *= 1.2;
    if (weights.dolly) weights.dolly *= 0.4;
    if (weights.snap_dolly) weights.snap_dolly *= 0.2;
    if (weights.lowangle) weights.lowangle *= 0.5;
  }

  if (cutDuration < 1.8) {
    if (weights.snap_dolly) weights.snap_dolly *= 2.0;
    if (weights.closeup) weights.closeup *= 1.5;
    if (weights.dolly) weights.dolly *= 1.5;
    if (weights.lowangle) weights.lowangle *= 1.3;
    if (weights.wide) weights.wide *= 0.6;
  } else if (cutDuration > 3.0) {
    if (weights.orbit) weights.orbit *= 2.0;
    if (weights.slide) weights.slide *= 1.8;
    if (weights.wide) weights.wide *= 1.6;
    if (weights.closeup) weights.closeup *= 0.7;
    if (weights.snap_dolly) weights.snap_dolly *= 0.5;
  }

  if (lastPattern) weights[lastPattern] = 0;
  for (const p of availablePatterns) {
    const strategy = CAMERA_STRATEGIES[p];
    const usage = usageMap.get(p) ?? 0;
    if (usage > 0) weights[p] *= Math.pow(0.75, usage);
    if (lastCategory && strategy && strategy.category === lastCategory) weights[p] *= 0.25;
  }

  const candidateList = availablePatterns.filter((p) => (weights[p] ?? 0) > 0);
  if (candidateList.length === 0) {
    const fallback = availablePatterns.filter((p) => p !== lastPattern);
    return fallback.length > 0 ? fallback[Math.floor(Math.random() * fallback.length)] : availablePatterns[0];
  }

  const totalWeight = candidateList.reduce((sum, p) => sum + (weights[p] ?? 0), 0);
  let randomValue = Math.random() * totalWeight;

  for (const p of candidateList) {
    const w = weights[p] ?? 0;
    if (randomValue <= w) return p;
    randomValue -= w;
  }

  return candidateList[candidateList.length - 1];
}

// ============================================================
// 正面固定モード
// ============================================================

function generateFixedFrontMotion(
  totalFrames: number,
  vmdData: VMDData | null,
  options: CameraGenerationOptions,
  onProgress?: (progress: number) => void
): GenerationResult {
  const smoothInterp = defaultCameraInterpolation();

  const findBoneFrames = (patterns: RegExp[]): BoneFrame[] | null => {
    if (!vmdData || !vmdData.boneFrames) return null;
    for (const rawName of Object.keys(vmdData.boneFrames)) {
      const cleanName = rawName.replace(/\0/g, '').trim();
      for (const p of patterns) {
        if (p.test(cleanName)) return vmdData.boneFrames[rawName];
      }
    }
    return null;
  };

  const centerFrames = findBoneFrames([/^センター$/i, /^center$/i]);
  const parentFrames = findBoneFrames([/^全ての親$/i, /^すべての親$/i, /^parent$/i, /^root$/i]);
  const grooveFrames = findBoneFrames([/^グルーブ$/i, /^groove$/i]);

  const getCombinedPosition = (frame: number): { x: number; z: number } => {
    let x = 0, z = 0;
    if (centerFrames && centerFrames.length > 0) {
      const p = getBonePositionAtFrame(centerFrames, frame);
      if (p) { x += p.x; z += p.z; }
    }
    if (parentFrames && parentFrames.length > 0) {
      const p = getBonePositionAtFrame(parentFrames, frame);
      if (p) { x += p.x; z += p.z; }
    }
    if (grooveFrames && grooveFrames.length > 0) {
      const p = getBonePositionAtFrame(grooveFrames, frame);
      if (p) { x += p.x; z += p.z; }
    }
    return { x, z };
  };

  const fixedTargetY = Math.max(options.eyeHeight * 0.7, 8.0);
  const fixedRotation = { x: 0, y: 0, z: 0 };
  const fixedDistance = options.baseDistance;
  const fixedFov = options.fov;

  const cameraFrames: CameraFrame[] = [];
  const FRAME_STEP = 15;
  const sampleFrames: number[] = [];

  for (let f = 0; f <= totalFrames; f += FRAME_STEP) sampleFrames.push(f);
  if (sampleFrames[sampleFrames.length - 1] !== totalFrames) sampleFrames.push(totalFrames);

  for (let i = 0; i < sampleFrames.length; i++) {
    const frame = sampleFrames[i];
    const pos = getCombinedPosition(frame);

    cameraFrames.push({
      frameNumber: frame,
      distance: fixedDistance,
      position: { x: pos.x, y: fixedTargetY, z: pos.z },
      rotation: fixedRotation,
      interpolation: smoothInterp,
      fov: fixedFov,
      perspective: 0,
    });

    onProgress?.((i + 1) / sampleFrames.length);
  }

  if (cameraFrames.length === 1) {
    cameraFrames.push({ ...cameraFrames[0], frameNumber: cameraFrames[0].frameNumber + 1 });
  }

  const cuts: CutInfo[] = [{ index: 0, time: 0, frame: 0, pattern: 'wide', isLocked: true }];
  return { cameraFrames, cuts };
}

// ============================================================
// メイン生成エントリーポイント
// ============================================================

export interface GenerationResult {
  cameraFrames: CameraFrame[];
  cuts: CutInfo[];
}

export function generateCameraMotion(
  audio: AudioAnalysisResult,
  vmdData: VMDData | null,
  options: CameraGenerationOptions,
  onProgress?: (progress: number) => void
): GenerationResult {
  const totalFrames = Math.ceil(audio.duration * FPS);

  if (options.cameraMode === 'fixed_front') {
    return generateFixedFrontMotion(totalFrames, vmdData, options, onProgress);
  }

  const smoothInterp = defaultCameraInterpolation();
  const cutInterp = linearCameraInterpolation();
  const easeInInterp = easeInCameraInterpolation();
  const easeOutInterp = easeOutCameraInterpolation();

  let boneFrames: BoneFrame[] | null = null;
  let matchedBoneName = '';

  if (vmdData) {
    const bonePriority = [options.lookAtBone, 'センター', '全ての親', '上半身', '頭'].filter(Boolean);
    for (const boneName of bonePriority) {
      if (vmdData.boneFrames[boneName] && vmdData.boneFrames[boneName].length > 0) {
        boneFrames = vmdData.boneFrames[boneName];
        matchedBoneName = boneName;
        break;
      }
    }
  }

  const heightOffset = matchedBoneName
    ? getBoneHeightOffset(matchedBoneName, options.eyeHeight)
    : options.eyeHeight;

  const parentFrames = vmdData?.boneFrames['全ての親'] || null;
  const grooveFrames = vmdData?.boneFrames['グルーブ'] || null;
  const defaultLookAt = { x: 0, y: options.eyeHeight, z: 0 };

  const getLookAt = (frame: number): { x: number; y: number; z: number } => {
    if (boneFrames) {
      const pos = getBonePositionAtFrame(boneFrames, frame);
      if (pos) {
        let x = pos.x;
        let y = pos.y + heightOffset;
        let z = pos.z;

        if (matchedBoneName !== '全ての親' && parentFrames) {
          const p = getBonePositionAtFrame(parentFrames, frame);
          if (p) { x += p.x; z += p.z; }
        }
        if (matchedBoneName !== 'グルーブ' && grooveFrames) {
          const g = getBonePositionAtFrame(grooveFrames, frame);
          if (g) { x += g.x; z += g.z; }
        }

        return { x, y, z };
      }
    }
    return defaultLookAt;
  };

  const patterns =
    options.patterns.length > 0
      ? options.patterns.filter((p) => p !== ('fixed_front' as CameraPattern))
      : (Object.keys(CAMERA_STRATEGIES) as CameraPattern[]);

  // ========================================================
  // カット境界の決定
  // 手動分割・結合などで options.existingCuts がある場合はそれを最優先で使用！
  // 初回生成時のみ、音声ビート解析 (audio.peakTimes) からカット境界を算出する。
  // ========================================================
  let cutStartFrames: number[];
  let cutStartTimes: number[];

  if (options.existingCuts && options.existingCuts.length > 0) {
    cutStartFrames = options.existingCuts.map((c) => c.frame);
    cutStartTimes = options.existingCuts.map((c) => c.time);
  } else {
    const cutTimes = audio.peakTimes;
    const minCutDuration = options.cutInterval ?? 1.5;
    const minCutFrames = Math.max(Math.round(minCutDuration * FPS), 15);

    const validCutFrames: { frame: number; time: number }[] = [];
    let lastCutBoundary = 0;

    for (let i = 0; i < cutTimes.length; i++) {
      const t = cutTimes[i];
      const frame = Math.round(t * FPS);
      if (frame - lastCutBoundary >= minCutFrames && totalFrames - frame >= Math.round(minCutFrames * 0.4)) {
        validCutFrames.push({ frame, time: t });
        lastCutBoundary = frame;
      }
    }

    cutStartFrames = [0, ...validCutFrames.map((v) => v.frame)];
    cutStartTimes = [0, ...validCutFrames.map((v) => v.time)];
  }

  // カット定義の構造
  interface CutDef {
    startFrame: number;
    endFrame: number;
    pattern: CameraPattern;
    params: CutMotionParams;
    energy: number;
    transitionType?: CameraTransition;
    transitionDir?: number;
  }
  const cutDefs: CutDef[] = [];
  const cuts: CutInfo[] = [];

  const usageMap = new Map<CameraPattern, number>();
  for (const p of patterns) usageMap.set(p, 0);

  let lastPattern: CameraPattern | null = null;
  let lastCategory: MovementCategory | null = null;

  for (let i = 0; i < cutStartFrames.length; i++) {
    const startFrame = cutStartFrames[i];
    const startTime = cutStartTimes[i];
    const endFrame = i + 1 < cutStartFrames.length ? cutStartFrames[i + 1] - 1 : totalFrames;
    const endTime = endFrame / FPS;

    const segmentEnergy = getSegmentEnergy(audio.energyCurve, startTime, endTime);

    const existing = options.existingCuts?.[i];
    const isLocked = existing?.isLocked ?? false;

    let pattern: CameraPattern;
    // 既存カットがある場合（手動分割・結合・ロック含む）はそのパターンを保持
    if (existing) {
      pattern = existing.pattern;
    } else {
      pattern = selectPatternWithEnergy(
        i,
        startTime,
        endTime,
        segmentEnergy,
        patterns,
        lastPattern,
        lastCategory,
        usageMap
      );
    }

    const params = randomCutParams();

    cutDefs.push({
      startFrame,
      endFrame,
      pattern,
      params,
      energy: segmentEnergy,
    });

    const strategy = CAMERA_STRATEGIES[pattern];

    cuts.push({
      index: i,
      time: startTime,
      frame: startFrame,
      pattern,
      isLocked,
    });

    lastPattern = pattern;
    lastCategory = strategy ? strategy.category : null;
    usageMap.set(pattern, (usageMap.get(pattern) ?? 0) + 1);
  }

  // トランジション判定 (オプションが空配列の場合はスキップ)
  const activeTransitions = options.transitions ?? [];
  let lastTransitionCutIndex = -999;

  if (activeTransitions.length > 0) {
    for (let i = 0; i < cutDefs.length - 1; i++) {
      const curCut = cutDefs[i];
      const nextCut = cutDefs[i + 1];

      if (curCut.pattern === 'closeup' || nextCut.pattern === 'closeup') continue;

      const curLen = curCut.endFrame - curCut.startFrame;
      const nextLen = nextCut.endFrame - nextCut.startFrame;
      if (curLen < 35 || nextLen < 35) continue;

      const isCooldownSatisfied = i - lastTransitionCutIndex >= 3;
      if (!isCooldownSatisfied) continue;

      const isDropEntrance = nextCut.energy >= 0.55 && (nextCut.energy - curCut.energy >= 0.15);
      const isRandomTrigger = Math.random() < 0.20;

      if (isDropEntrance || isRandomTrigger) {
        const chosenType = activeTransitions[Math.floor(Math.random() * activeTransitions.length)];
        const dir = Math.random() < 0.5 ? 1 : -1;

        curCut.transitionType = chosenType;
        curCut.transitionDir = dir;
        lastTransitionCutIndex = i;
      }
    }
  }

  // ============================================================
  // キーフレーム生成 (スナップドリー ＆ スライドの中間キーフレーム対応)
  // ============================================================
  const keyframePoints: CameraKeyframe[] = [];

  for (let c = 0; c < cutDefs.length; c++) {
    const cut = cutDefs[c];
    const strategy = CAMERA_STRATEGIES[cut.pattern] ?? CAMERA_STRATEGIES.wide;

    const startLookAt = getLookAt(cut.startFrame);
    const endLookAt = getLookAt(cut.endFrame);

    const intensity = options.intensity ?? 1.0;

    const startCtx: PatternContext = {
      target: startLookAt,
      baseDistance: options.baseDistance,
      baseFov: options.fov,
      params: cut.params,
      closeupDistance: options.closeupDistance,
      intensity,
    };

    const startState = strategy.createStartKeyframe(startCtx);
    const endState = strategy.createEndKeyframe({ ...startCtx, target: endLookAt }, startState);

    const prevTransition = c > 0 && cutDefs[c - 1].transitionType ? {
      type: cutDefs[c - 1].transitionType!,
      dir: cutDefs[c - 1].transitionDir!,
    } : undefined;

    const nextTransition = cut.transitionType ? {
      type: cut.transitionType,
      dir: cut.transitionDir!,
    } : undefined;

    const TRANSITION_FRAMES = 2;
    const SWIPE_OFFSET_X = 14.0;
    const SPIN_ANGLE_Z = Math.PI * 0.5;

    // 1. カット開始キーフレーム
    if (prevTransition) {
      const isWhip = prevTransition.type === 'whip';
      keyframePoints.push({
        ...startState,
        frame: cut.startFrame,
        target: {
          ...startState.target,
          x: isWhip ? startState.target.x - prevTransition.dir * SWIPE_OFFSET_X : startState.target.x,
        },
        rotation: {
          ...startState.rotation,
          z: isWhip ? startState.rotation.z : startState.rotation.z - prevTransition.dir * SPIN_ANGLE_Z,
        },
        hardCut: false,
        customInterp: easeOutInterp,
      });

      keyframePoints.push({
        ...startState,
        frame: cut.startFrame + TRANSITION_FRAMES,
        hardCut: false,
      });
    } else {
      keyframePoints.push({
        ...startState,
        frame: cut.startFrame,
        hardCut: false,
      });
    }

    // ========================================================
    // 【スナップドリー専用】約0.25秒（7〜8フレーム）で急突入し着地！
    // ========================================================
    if (cut.pattern === 'snap_dolly') {
      const cutLength = cut.endFrame - cut.startFrame;
      const SNAP_FRAMES = Math.min(8, Math.max(6, Math.floor(cutLength * 0.25)));
      const snapArrivalFrame = cut.startFrame + SNAP_FRAMES;
      const snapLookAt = getLookAt(snapArrivalFrame);

      const distDiff = endState.distance - startState.distance;
      const snapDistance = startState.distance + distDiff * 0.92;

      keyframePoints.push({
        ...endState,
        target: snapLookAt,
        distance: snapDistance,
        frame: snapArrivalFrame,
        hardCut: false,
      });
    }

    // ========================================================
    // 【スライド専用】4点キーフレーム補間
    // (画面外からスライドイン -> 中央ホールド -> 画面外へスライドアウト)
    // ========================================================
    if (cut.pattern === 'slide') {
      const cutLength = cut.endFrame - cut.startFrame;
      const slideInFrames = Math.min(12, Math.max(6, Math.floor(cutLength * 0.20)));
      const slideOutFrames = Math.min(12, Math.max(6, Math.floor(cutLength * 0.20)));

      const frameIn = cut.startFrame + slideInFrames;
      const frameOut = Math.max(frameIn + 2, cut.endFrame - slideOutFrames);

      const lookAtIn = getLookAt(frameIn);
      const lookAtOut = getLookAt(frameOut);

      keyframePoints[keyframePoints.length - 1].customInterp = easeOutInterp;

      keyframePoints.push({
        ...startState,
        target: { x: lookAtIn.x, y: lookAtIn.y - 2.5, z: lookAtIn.z },
        frame: frameIn,
        hardCut: false,
      });

      keyframePoints.push({
        ...endState,
        target: { x: lookAtOut.x, y: lookAtOut.y - 2.5, z: lookAtOut.z },
        frame: frameOut,
        hardCut: false,
        customInterp: easeInInterp,
      });
    }

    // 2. カット終了キーフレーム
    if (nextTransition) {
      const isWhip = nextTransition.type === 'whip';

      keyframePoints.push({
        ...endState,
        frame: cut.endFrame - TRANSITION_FRAMES,
        hardCut: false,
        customInterp: easeInInterp,
      });

      keyframePoints.push({
        ...endState,
        frame: cut.endFrame,
        target: {
          ...endState.target,
          x: isWhip ? endState.target.x + nextTransition.dir * SWIPE_OFFSET_X : endState.target.x,
        },
        rotation: {
          ...endState.rotation,
          z: isWhip ? endState.rotation.z : endState.rotation.z + nextTransition.dir * SPIN_ANGLE_Z,
        },
        hardCut: true,
      });
    } else {
      keyframePoints.push({
        ...endState,
        frame: cut.endFrame,
        hardCut: true,
      });
    }

    onProgress?.((c + 1) / cutDefs.length);
  }

  // 重複フレームの安全な排除・整列
  const allowedFrames = new Set<number>();
  for (const cut of cutDefs) {
    allowedFrames.add(cut.startFrame);
    allowedFrames.add(cut.endFrame);

    if (cut.pattern === 'snap_dolly') {
      const cutLength = cut.endFrame - cut.startFrame;
      const snapFrames = Math.min(8, Math.max(6, Math.floor(cutLength * 0.25)));
      allowedFrames.add(cut.startFrame + snapFrames);
    }

    if (cut.pattern === 'slide') {
      const cutLength = cut.endFrame - cut.startFrame;
      const slideInFrames = Math.min(12, Math.max(6, Math.floor(cutLength * 0.20)));
      const slideOutFrames = Math.min(12, Math.max(6, Math.floor(cutLength * 0.20)));
      const frameIn = cut.startFrame + slideInFrames;
      const frameOut = Math.max(frameIn + 2, cut.endFrame - slideOutFrames);
      allowedFrames.add(frameIn);
      allowedFrames.add(frameOut);
    }

    if (cut.transitionType) {
      allowedFrames.add(cut.endFrame - 2);
    }
  }
  for (let c = 1; c < cutDefs.length; c++) {
    if (cutDefs[c - 1].transitionType) {
      allowedFrames.add(cutDefs[c].startFrame + 2);
    }
  }

  const uniqueKeysMap = new Map<number, CameraKeyframe>();
  for (const key of keyframePoints) uniqueKeysMap.set(key.frame, key);

  const finalKeyframes = Array.from(uniqueKeysMap.values())
    .filter((k) => allowedFrames.has(k.frame))
    .sort((a, b) => a.frame - b.frame);

  // VMD CameraFrame への変換
  const cameraFrames: CameraFrame[] = [];

  for (let i = 0; i < finalKeyframes.length; i++) {
    const kp = finalKeyframes[i];
    const interp = kp.customInterp ?? (kp.hardCut ? cutInterp : smoothInterp);

    cameraFrames.push({
      frameNumber: kp.frame,
      distance: kp.distance,
      position: { x: kp.target.x, y: kp.target.y, z: kp.target.z },
      rotation: { x: kp.rotation.x, y: kp.rotation.y, z: kp.rotation.z },
      interpolation: interp,
      fov: kp.fov,
      perspective: 0,
    });
  }

  if (cameraFrames.length === 1) {
    cameraFrames.push({ ...cameraFrames[0], frameNumber: cameraFrames[0].frameNumber + 1 });
  }

  onProgress?.(1.0);

  return { cameraFrames, cuts };
}

export function downloadVMD(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}