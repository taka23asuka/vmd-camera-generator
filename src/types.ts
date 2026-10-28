// ============================================================
// 1. VMDモーションデータ構造 (VMD Data Structures)
// ============================================================

/**
 * 1件のボーンキーフレームデータ (1レコード 111バイト相当)
 */
export interface BoneFrame {
  /** フレーム番号 */
  frameNumber: number;
  /** 平行移動位置 (X, Y, Z) */
  position: { x: number; y: number; z: number };
  /** 回転クォータニオン (X, Y, Z, W) */
  rotation: { x: number; y: number; z: number; w: number };
  /** 補間曲線データ (4本のベジェ曲線 × 4制御点 = 16バイト) */
  interpolation: number[];
}

/**
 * 1件のカメラキーフレームデータ (1レコード 61バイト相当)
 */
export interface CameraFrame {
  /** フレーム番号 */
  frameNumber: number;
  /** カメラと目標点の距離 (MMD規格上は負の数値) */
  distance: number;
  /** 注視点の位置座標 (X, Y, Z) */
  position: { x: number; y: number; z: number };
  /** カメラのオイラー回転角 (ラジアン単位) */
  rotation: { x: number; y: number; z: number };
  /** パラメータ別補間曲線データ (6種 × 4バイト = 24バイト) */
  interpolation: number[];
  /** 視野角 (FOV) */
  fov: number;
  /** パースペクティブ設定 (0: ON / 1: OFF) */
  perspective: number;
}

/**
 * VMDファイル全体のパース済みデータ
 */
export interface VMDData {
  /** ボーン名をキーとするボーンキーフレームの辞書 */
  boneFrames: Record<string, BoneFrame[]>;
  /** カメラキーフレームの配列 */
  cameraFrames: CameraFrame[];
  /** モーフ（表情）キーフレームの辞書 */
  morphFrames: Record<string, { frameNumber: number; weight: number }[]>;
}

/**
 * VMD読み込み結果
 */
export interface VMDParseResult {
  /** パースされたデータ本体 */
  data: VMDData;
  /** パース時の警告メッセージ一覧 */
  warnings: string[];
  /** 有効なVMDヘッダーかどうかのフラグ */
  headerValid: boolean;
  /** 読み込まれたボーンキーフレーム総数 */
  boneCount: number;
  /** 有効なボーンデータが存在するかどうか */
  hasBoneData: boolean;
  /** ダンスモーションの最終フレーム番号 */
  lastFrameNumber: number;
}

// ============================================================
// 2. 音声解析データ構造 (Audio Analysis Structures)
// ============================================================

/**
 * 音声ファイル（WAV/MP3）の解析結果
 */
export interface AudioAnalysisResult {
  /** 推定テンポ (BPM) */
  bpm: number;
  /** 楽曲の総再生時間（秒） */
  duration: number;
  /** ビート・アタックが検出された時刻配列（秒単位） */
  peakTimes: number[];
  /** 20msごとの正規化された音量エネルギー曲線 (0.0〜1.0) */
  energyCurve: number[];
  /** 音声サンプリングレート (Hz) */
  sampleRate: number;
}

// ============================================================
// 3. カメラ生成オプション & UI定義 (Camera Generation & UI)
// ============================================================

/** カメラワークパターンの識別子 */
export type CameraPattern = 'wide' | 'closeup' | 'highangle' | 'lowangle' | 'orbit' | 'dolly' | 'dutch_angle' | 'tilt_up';

/** カメラトランジションの識別子 */
export type CameraTransition = 'whip' | 'spin';

/** カメラモード ('auto': 楽曲連動の自動演出 / 'fixed_front': モーション配布・確認用の正面固定) */
export type CameraMode = 'auto' | 'fixed_front';

/**
 * UIのパターン選択ボタン用メタデータ
 */
export interface CameraPatternInfo {
  type: CameraPattern;
  label: string;
  description: string;
  icon: string;
}

/** UIのトランジション選択ボタン用メタデータ */
export interface CameraTransitionInfo {
  type: CameraTransition;
  label: string;
  description: string;
}

/**
 * 1カットのメタデータ情報（タイムライン描画および個別編集・ロック状態の保持に使用）
 */
export interface CutInfo {
  /** カット番号 (0から始まる連番) */
  index: number;
  /** 開始時刻 (秒) */
  time: number;
  /** 開始フレーム番号 */
  frame: number;
  /** 割り振られたカメラワークパターン */
  pattern: CameraPattern;
  /** 再生成時にパターンを変更せず固定するかどうかのフラグ */
  isLocked?: boolean;
}

/**
 * カメラモーション自動生成の設定オプション
 */
export interface CameraGenerationOptions {
  /** カメラモード ('auto' または 'fixed_front') */
  cameraMode?: CameraMode;
  /** ビート検出の感度しきい値 (0.0〜1.0) */
  beatSensitivity: number;
  /** カット間の最小秒数 */
  cutInterval: number;
  /** 自動演出で使用を許可するカメラワークパターン一覧 */
  patterns: CameraPattern[];
  /** 自動演出で使用を許可すカメラトランジション一覧 */
  transitions?: CameraTransition[]; 
  /** 既存のカット設定リスト */
  existingCuts?: CutInfo[];
  /** 追従対象とする基準ボーン名 */
  lookAtBone: string;
  /** カメラの基本距離 */
  baseDistance: number;
  /** 寄り（closeup）ショット時の絶対カメラ距離 */
  closeupDistance: number;
  /** 基準視野角 (FOV) */
  fov: number;
  /** 目線の高さ（注視点の基準Y座標、デフォルト: 15） */
  eyeHeight: number;
}

/**
 * UI選択用カメラワークパターン定義一覧
 */
export const CAMERA_PATTERNS: CameraPatternInfo[] = [
  { type: 'wide', label: '引き（ロング）', description: '全体を映すフルショット', icon: 'Wide' },
  { type: 'closeup', label: '寄り（アップ）', description: '顔に寄ったクローズアップ', icon: 'Closeup' },
  { type: 'highangle', label: '斜め俯瞰', description: '上から見下ろすハイアングル', icon: 'HighAngle' },
  { type: 'lowangle', label: 'ローアングル', description: '足元から見上げる煽りショット', icon: 'LowAngle' },
  { type: 'orbit', label: 'オービット', description: '斜め前を回り込む旋回ショット', icon: 'Orbit' },
  { type: 'dolly', label: 'ドリー', description: '真っ直ぐ迫る・引くムービングショット', icon: 'Dolly' },
  { type: 'dutch_angle', label: 'ダッチアングル', description: '斜めに傾けたエモいショット', icon: 'RotateCw' },
  { type: 'tilt_up', label: 'ティルトアップ', description: '足元から顔へ見上げるショット', icon: 'ArrowUp' },
];

/**
 * UI選択用トランジション定義一覧
 */
export const CAMERA_TRANSITIONS: CameraTransitionInfo[] = [
  { type: 'whip', label: 'ウィップ・パン', description: '画面を高速で横スワイプ' },
  { type: 'spin', label: 'スピン（180度回転）', description: '画面を一瞬で天地逆転・回転切替' },
];

/**
 * UIで選択可能な基準追従ボーン一覧
 */
export const TRACKABLE_BONES = [
  'センター',
  '全ての親',
  '上半身',
  '頭',
];

// ============================================================
// 4. カメラワーク・ストラテジー型定義 (Camera Strategy Types)
// ============================================================

/**
 * カメラ生成処理の中間キーフレーム表現
 */
export interface CameraKeyframe {
  frame: number;
  target: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  distance: number;
  fov: number;
  /** false: S字補間 (カット内を滑らかに移動) / true: リニア補間 (次カットへ瞬間切替) */
  hardCut?: boolean;
  /** トランジション等の専用カスタム補間曲線 (指定時は優先適用) */
  customInterp?: number[];
}

/**
 * カットごとにランダム抽選される移動方向パラメータ (各 +1 または -1)
 */
export interface CutMotionParams {
  orbitDir: number;      // +1: 時計回り / -1: 反時計回り
  verticalDir: number;   // +1: 上昇 / -1: 下降
  dollyDir: number;      // +1: 接近 / -1: 後退
  panDir: number;        // +1: 右パン / -1: 左パン
  tiltDir: number;       // +1: 上チルト / -1: 下チルト
}

/**
 * 同系パターンの連続選定を防ぐための動作カテゴリ
 */
export type MovementCategory = 'pull' | 'push' | 'orbit' | 'angle';

/**
 * 各カメラワークストラテジーに渡される生成コンテキスト (DTO)
 */
export interface PatternContext {
  target: { x: number; y: number; z: number };
  baseDistance: number;
  baseFov: number;
  params: CutMotionParams;
  closeupDistance: number;
}

/**
 * 各カメラワークパターンが実装すべきストラテジー・インターフェース
 */
export interface CameraPatternStrategy {
  id: CameraPattern | 'fixed_front';
  name: string;
  category: MovementCategory;
  baseWeight: number;
  createStartKeyframe: (ctx: PatternContext) => CameraKeyframe;
  createEndKeyframe: (ctx: PatternContext, startKf: CameraKeyframe) => CameraKeyframe;
}
