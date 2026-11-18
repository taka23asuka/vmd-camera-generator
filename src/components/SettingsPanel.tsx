import type React from 'react';
import {
  CAMERA_PATTERNS,
  CAMERA_TRANSITIONS,
  TRACKABLE_BONES,
  type CameraPattern,
  type CameraTransition,
  type CameraGenerationOptions,
} from '@/types';
import {
  Camera,
  Eye,
  Target,
  Gauge,
  Sliders,
  ZoomIn,
  Ruler,
  Sparkles,
  Video,
  Info,
  Zap,
  Flame,
} from 'lucide-react';

// ============================================================
// コンポーネント Props 定義
// ============================================================

/**
 * SettingsPanel コンポーネントのプロパティ
 */
interface SettingsPanelProps {
  /** 現在の設定オプション */
  options: CameraGenerationOptions;
  /** 設定変更時のコールバック関数 */
  onChange: (options: CameraGenerationOptions) => void;
  /** 入力無効化フラグ（生成処理中など） */
  disabled: boolean;
}

// ============================================================
// メインコンポーネント
// ============================================================

/**
 * カメラワーク生成の各種パラメータを調整する設定パネル
 */
export function SettingsPanel({ options, onChange, disabled }: SettingsPanelProps) {
  const isFixedFront = options.cameraMode === 'fixed_front';

  /**
   * カメラパターンの有効/無効を切り替える（最低1つは維持）
   */
  const togglePattern = (pattern: CameraPattern) => {
    if (disabled) return;
    const has = options.patterns.includes(pattern);
    const newPatterns = has
      ? options.patterns.filter((p) => p !== pattern)
      : [...options.patterns, pattern];

    // 全解除は許可しない
    if (newPatterns.length === 0) return;
    onChange({ ...options, patterns: newPatterns });
  };

  /**
   * トランジションの有効/無効を切り替える
   */
  const toggleTransition = (transition: CameraTransition) => {
    if (disabled) return;
    const current = options.transitions ?? [];
    const has = current.includes(transition);
    const newTransitions = has
      ? current.filter((t) => t !== transition)
      : [...current, transition];
    onChange({ ...options, transitions: newTransitions });
  };

  return (
    <div className={`space-y-5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* ---------------------------------------------------- */}
      {/* 1. カメラモード切り替えタブ                            */}
      {/* ---------------------------------------------------- */}
      <div>
        <label className="mb-2 block text-xs font-medium text-slate-400">カメラモード</label>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...options, cameraMode: 'auto' })}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${!isFixedFront
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sparkles size={13} />
            自動演出
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...options, cameraMode: 'fixed_front' })}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all ${isFixedFront
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Video size={13} />
            正面固定
          </button>
        </div>
      </div>

      {/* 正面固定モード時の説明バナー */}
      {isFixedFront && (
        <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3 text-[11px] text-cyan-300/90 leading-relaxed">
          <div className="flex items-center gap-1.5 font-medium text-cyan-300 mb-1">
            <Info size={13} />
            モーション配布・確認用モード
          </div>
          カット割りや演出を行わず、正面固定で「センター＋全ての親」の横移動に滑らかに追従します（高さは固定）。
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. 自動演出専用パラメータ                              */}
      {/* ---------------------------------------------------- */}
      {!isFixedFront && (
        <>
          {/* ターゲットボーン選択 */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Target size={14} className="text-cyan-400" />
              ターゲットボーン（追従対象）
            </label>
            <select
              value={options.lookAtBone}
              onChange={(e) => onChange({ ...options, lookAtBone: e.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/50 disabled:cursor-not-allowed"
            >
              {TRACKABLE_BONES.map((bone) => (
                <option key={bone} value={bone}>
                  {bone}
                </option>
              ))}
            </select>
          </div>

          {/* ビート感度 */}
          <SliderField
            label="ビート感度"
            icon={<Gauge size={14} className="text-cyan-400" />}
            value={options.beatSensitivity}
            displayValue={`${Math.round(options.beatSensitivity * 100)}%`}
            min={0.2}
            max={0.95}
            step={0.05}
            onChange={(val) => onChange({ ...options, beatSensitivity: val })}
            disabled={disabled}
            leftHint="低（少ないカット）"
            rightHint="高（頻繁なカット）"
          />

          {/* 最小カット間隔 */}
          <SliderField
            label="最小カット間隔"
            icon={<Sliders size={14} className="text-cyan-400" />}
            value={options.cutInterval}
            displayValue={`${options.cutInterval.toFixed(1)}秒`}
            min={0.3}
            max={5.0}
            step={0.1}
            onChange={(val) => onChange({ ...options, cutInterval: val })}
            disabled={disabled}
          />
        </>
      )}

      {/* カメラの激しさ（振幅）スライダー */}
      {!isFixedFront && (
        <SliderField
          label="カメラの激しさ（振幅）"
          icon={<Flame size={14} className="text-cyan-400" />}
          value={options.intensity ?? 1.0}
          displayValue={`${Math.round((options.intensity ?? 1.0) * 100)}%`}
          min={0.3}
          max={2.0}
          step={0.05}
          onChange={(val) => onChange({ ...options, intensity: val })}
          disabled={disabled}
          leftHint="控えめ (30%)"
          rightHint="激しい (200%)"
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. 共通カメラパラメータ                                */}
      {/* ---------------------------------------------------- */}

      {/* 基本距離 */}
      <SliderField
        label="基本距離"
        icon={<Camera size={14} className="text-cyan-400" />}
        value={options.baseDistance}
        displayValue={options.baseDistance.toFixed(0)}
        min={20}
        max={120}
        step={5}
        onChange={(val) => onChange({ ...options, baseDistance: val })}
        disabled={disabled}
      />

      {/* アップ時のカメラ距離（自動演出時のみ） */}
      {!isFixedFront && (
        <SliderField
          label="アップ時のカメラ距離"
          icon={<ZoomIn size={14} className="text-cyan-400" />}
          value={options.closeupDistance}
          displayValue={options.closeupDistance.toFixed(1)}
          min={10}
          max={30}
          step={0.5}
          onChange={(val) => onChange({ ...options, closeupDistance: val })}
          disabled={disabled}
          leftHint="寄り"
          rightHint="離れ"
        />
      )}

      {/* 視野角 (FOV) */}
      <SliderField
        label="画角（FOV）"
        icon={<Eye size={14} className="text-cyan-400" />}
        value={options.fov}
        displayValue={`${options.fov}°`}
        min={20}
        max={80}
        step={1}
        onChange={(val) => onChange({ ...options, fov: Math.round(val) })}
        disabled={disabled}
      />

      {/* 目線の高さ */}
      <SliderField
        label="目線の高さ"
        icon={<Ruler size={14} className="text-cyan-400" />}
        value={options.eyeHeight}
        displayValue={options.eyeHeight.toFixed(1)}
        min={5}
        max={30}
        step={0.5}
        onChange={(val) => onChange({ ...options, eyeHeight: val })}
        disabled={disabled}
        leftHint="低"
        rightHint="高"
      />

      {/* ---------------------------------------------------- */}
      {/* 4. カメラワークパターン選択（自動演出時のみ）           */}
      {/* ---------------------------------------------------- */}
      {!isFixedFront && (
        <div>
          <label className="mb-2 block text-xs font-medium text-slate-400">カメラワークパターン</label>
          <div className="grid grid-cols-2 gap-2">
            {CAMERA_PATTERNS.map((p) => {
              const active = options.patterns.includes(p.type);
              return (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => togglePattern(p.type)}
                  disabled={disabled}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${active
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700/40 bg-slate-800/30 text-slate-500 hover:border-slate-600/50'
                    } disabled:cursor-not-allowed`}
                >
                  <p className="text-xs font-medium">{p.label}</p>
                  <p className="mt-0.5 text-[10px] opacity-70">{p.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. トランジション効果選択（仕様見直し中のため一時非表示） */}
      {/* ---------------------------------------------------- */}
      {/*
      {!isFixedFront && (
        <div>
          <label className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <Zap size={14} className="text-cyan-400" />
              トランジション（切り替え効果）
            </span>
            <span className="text-[10px] text-slate-500">
              {(options.transitions ?? []).length === 0 ? 'すべてハードカット' : '有効'}
            </span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {CAMERA_TRANSITIONS.map((t) => {
              const active = (options.transitions ?? []).includes(t.type);
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => toggleTransition(t.type)}
                  disabled={disabled}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-700/40 bg-slate-800/30 text-slate-500 hover:border-slate-600/50'
                  } disabled:cursor-not-allowed`}
                >
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="mt-0.5 text-[10px] opacity-70">{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
      */}
    </div>
  );
}

// ============================================================
// 共通サブコンポーネント (Private Helper Component)
// ============================================================

interface SliderFieldProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled: boolean;
  leftHint?: string;
  rightHint?: string;
}

/**
 * ラベル、現在値、レンジ入力、ヒントを統一スタイルで描画するスライダー部品
 */
function SliderField({
  label,
  icon,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
  disabled,
  leftHint,
  rightHint,
}: SliderFieldProps) {
  return (
    <div>
      <label className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span className="text-cyan-400">{displayValue}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full accent-cyan-500"
      />
      {(leftHint || rightHint) && (
        <div className="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>{leftHint ?? ''}</span>
          <span>{rightHint ?? ''}</span>
        </div>
      )}
    </div>
  );
}
