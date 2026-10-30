import type React from 'react';
import { useMemo, useRef, useEffect, useState } from 'react';
import {
  CAMERA_PATTERNS,
  type AudioAnalysisResult,
  type CameraPattern,
  type CutInfo,
} from '@/types';
import {
  Activity,
  Music,
  Clock,
  Zap,
  Clapperboard,
  Lock,
  Unlock,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

// ============================================================
// コンポーネント Props 定義
// ============================================================

interface BeatTimelineProps {
  /** 音声解析結果（未解析時は null） */
  audio: AudioAnalysisResult | null;
  /** 生成されたカメラカット情報の一覧 */
  cuts: CutInfo[];
  /** カットのロック/アンロック切り替え時のコールバック */
  onToggleLock?: (cutIndex: number) => void;
  /** カットのカメラパターン手動変更時のコールバック */
  onChangePattern?: (cutIndex: number, newPattern: CameraPattern) => void;
  /** カットクリック（ジャンプ）時のコールバック */
  onSelectCut?: (cut: CutInfo) => void;
  /** 現在手動選択されているカットのインデックス番号 */
  selectedCutIndex?: number | null;
  /** プレビューの現在再生時間（秒） */
  currentTime?: number;
  /** 総再生時間（秒） */
  duration?: number;
  /** 再生中かどうかのフラグ */
  isPlaying?: boolean;
  /** 【新設】再生/一時停止切り替えコールバック */
  onTogglePlay?: () => void;
  /** 【新設】シークバー操作コールバック */
  onSeek?: (time: number) => void;
  /** 【新設】最初に戻るコールバック */
  onResetTime?: () => void;
}

// ============================================================
// 表示用定数（カラー＆ラベルマップ）
// ============================================================

const PATTERN_COLORS: Record<CameraPattern, string> = {
  wide: '#3b82f6',
  closeup: '#ef4444',
  highangle: '#22c55e',
  lowangle: '#f97316',
  orbit: '#a855f7',
  dolly: '#06b6d4',
  dutch_angle: '#ec4899',
  tilt_up: '#eab308',
};

const PATTERN_LABELS: Record<CameraPattern, string> = {
  wide: '引き',
  closeup: '寄り',
  highangle: '俯瞰',
  lowangle: 'ローアングル',
  orbit: 'オービット',
  dolly: 'ドリー',
  dutch_angle: 'ダッチ',
  tilt_up: 'ティルト',
};

// ============================================================
// メインコンポーネント
// ============================================================

export function BeatTimeline({
  audio,
  cuts,
  onToggleLock,
  onChangePattern,
  onSelectCut,
  selectedCutIndex,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onTogglePlay,
  onSeek,
  onResetTime,
}: BeatTimelineProps) {
  // 自動追従スクロール用：各カットカードのDOM参照を保持
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 【新設】波形表示の開閉トグル（縦幅節約のためデフォルトは非表示）
  const [showWaveform, setShowWaveform] = useState(false);

  const energyBars = useMemo(() => {
    if (!audio || audio.energyCurve.length === 0) return [];

    const targetBars = 200;
    const step = Math.max(1, Math.floor(audio.energyCurve.length / targetBars));
    const bars: number[] = [];

    for (let i = 0; i < audio.energyCurve.length; i += step) {
      let max = 0;
      for (let j = i; j < Math.min(i + step, audio.energyCurve.length); j++) {
        if (audio.energyCurve[j] > max) max = audio.energyCurve[j];
      }
      bars.push(max);
    }
    return bars;
  }, [audio]);

  /** 現在再生中のカットインデックスを算出 */
  const activePlayingIndex = useMemo(() => {
    if (cuts.length === 0) return null;
    let found = cuts[0].index;
    for (let i = 0; i < cuts.length; i++) {
      if (cuts[i].time <= currentTime + 0.05) {
        found = cuts[i].index;
      } else {
        break;
      }
    }
    return found;
  }, [cuts, currentTime]);

  /** 再生中のカットカードが自動で中央に来るように追従スクロール */
  useEffect(() => {
    if (activePlayingIndex !== null && currentTime > 0) {
      const cardEl = cardRefs.current.get(activePlayingIndex);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activePlayingIndex, currentTime]);

  // 時間表記フォーマット (例: 01:23.4)
  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const totalDuration = duration || audio?.duration || 1;
  const playheadPct = totalDuration > 0 ? Math.min(100, Math.max(0, (currentTime / totalDuration) * 100)) : 0;

  if (!audio) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800/20 p-6">
        <div className="text-center">
          <Activity size={24} className="mx-auto mb-1.5 text-slate-700" />
          <p className="text-xs text-slate-600">音声を解析するとここにタイムラインが表示されます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 min-w-0">
      {/* ---------------------------------------------------- */}
      {/* 1. 【統合】メディアコントロール ＆ シークバー ＆ 指標   */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-2">
        {/* 左側: 再生/停止ボタン ＆ 時間表示 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetTime}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title="最初に戻る"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95"
            title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
          </button>
          <div className="font-mono text-[11px] text-slate-300">
            <span className="text-cyan-400 font-semibold">{formatTime(currentTime)}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-slate-500">{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* 中央: 横に伸びるシークバースライダー */}
        <div className="flex-1 min-w-[140px] px-2">
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.01}
            value={currentTime}
            onChange={(e) => onSeek?.(parseFloat(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        {/* 右側: 波形トグルボタン ＆ ミニサマリーバッジ */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWaveform(!showWaveform)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-all ${
              showWaveform
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 border border-slate-700/50'
            }`}
            title="エネルギー波形の表示/非表示を切り替え"
          >
            <Activity size={12} />
            <span>波形</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 border-l border-slate-700/60 pl-2">
            <span className="text-slate-500">BPM:</span>
            <span className="font-bold text-slate-300">{audio.bpm}</span>
            <span className="text-slate-600 mx-0.5">•</span>
            <span className="font-bold text-green-400">{cuts.length}</span>
            <span className="text-slate-500">カット</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. エネルギー波形表示（トグル時のみ展開）            */}
      {/* ---------------------------------------------------- */}
      {showWaveform && (
        <div className="animate-fadeIn">
          <div className="flex h-10 items-end gap-px overflow-hidden rounded-lg border border-slate-700/40 bg-slate-900/50 p-1">
            {energyBars.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(4, v * 100)}%`,
                  backgroundColor: v > 0.6 ? '#22d3ee' : v > 0.3 ? '#0891b2' : '#1e3a5f',
                  minWidth: '2px',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. カットタイムライン表示                            */}
      {/* ---------------------------------------------------- */}
      {cuts.length > 0 && (
        <div className="space-y-2">
          {/* 全体時間軸バー */}
          <div className="relative h-9 overflow-hidden rounded-lg border border-slate-700/40 bg-slate-900/60 p-1">
            <div className="relative h-full">
              {[0.25, 0.5, 0.75].map((frac) => (
                <div
                  key={frac}
                  className="absolute bottom-0 top-0 border-l border-slate-700/30"
                  style={{ left: `${frac * 100}%` }}
                />
              ))}

              {/* カットマーカーバー群 */}
              <div className="relative h-full">
                {cuts.map((cut) => {
                  const pct = (cut.time / totalDuration) * 100;
                  const color = PATTERN_COLORS[cut.pattern] ?? '#22d3ee';
                  const isSelected = selectedCutIndex === cut.index;

                  return (
                    <div
                      key={cut.index}
                      onClick={() => onSelectCut?.(cut)}
                      className="group absolute bottom-0 top-0 flex cursor-pointer flex-col items-center justify-end"
                      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                      title={`#${cut.index + 1} (${cut.time.toFixed(2)}秒): ${
                        PATTERN_LABELS[cut.pattern] ?? cut.pattern
                      }${cut.isLocked ? ' [固定中]' : ''}（クリックでジャンプ）`}
                    >
                      {cut.isLocked && (
                        <div className="mb-0.5 h-1 w-1 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                      )}
                      <div
                        className={`rounded-t transition-all ${
                          isSelected
                            ? 'w-2.5 ring-2 ring-white brightness-125'
                            : 'w-1.5 group-hover:scale-y-110 group-hover:brightness-110'
                        }`}
                        style={{
                          backgroundColor: color,
                          height: '100%',
                          minHeight: '8px',
                          opacity: cut.isLocked || isSelected ? 1 : 0.85,
                        }}
                      />
                    </div>
                  );
                })}

                {/* 赤いリアルタイム再生ヘッド（針） */}
                {currentTime > 0 && (
                  <div
                    className="pointer-events-none absolute -top-1 bottom-0 z-20 flex flex-col items-center transition-[left] duration-75"
                    style={{ left: `${playheadPct}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="h-0 w-0 border-x-3 border-t-5 border-x-transparent border-t-red-500" />
                    <div className="w-0.5 flex-1 bg-red-500 shadow-sm shadow-red-500/80" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* パターン凡例 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(PATTERN_COLORS).map(([pattern, color]) => {
              const p = pattern as CameraPattern;
              if (!cuts.some((c) => c.pattern === p)) return null;
              return (
                <div key={pattern} className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-slate-500">{PATTERN_LABELS[p]}</span>
                </div>
              );
            })}
          </div>

          {/* 4. 各カットの編集・固定カードトレイ */}
          <div className="mt-2 min-w-0 max-w-full">
            <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-slate-800/40 scrollbar-thumb-slate-700/60">
              {cuts.map((cut) => {
                const color = PATTERN_COLORS[cut.pattern] ?? '#22d3ee';
                const isLocked = !!cut.isLocked;
                const isSelected = selectedCutIndex === cut.index;
                const isPlayingCut = activePlayingIndex === cut.index && isPlaying;

                return (
                  <div
                    key={cut.index}
                    ref={(el) => {
                      if (el) cardRefs.current.set(cut.index, el);
                      else cardRefs.current.delete(cut.index);
                    }}
                    onClick={() => onSelectCut?.(cut)}
                    className={`flex min-w-[125px] cursor-pointer flex-col justify-between rounded-lg border p-2 transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-400'
                        : isPlayingCut
                        ? 'border-red-500/80 bg-red-950/20 shadow-md shadow-red-500/10'
                        : isLocked
                        ? 'border-cyan-500/60 bg-cyan-950/20 shadow-sm shadow-cyan-500/10 hover:border-cyan-400'
                        : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${isSelected ? 'text-cyan-300' : isPlayingCut ? 'text-red-300' : 'text-slate-300'}`}>
                          #{cut.index + 1}
                        </span>
                        {isPlayingCut && (
                          <span className="flex items-center gap-0.5 rounded bg-red-500 px-1 py-0.2 text-[8px] font-bold text-white shadow-sm shadow-red-500 animate-pulse">
                            <Play size={6} className="fill-current" />
                            PLAY
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500">{cut.time.toFixed(1)}s</span>
                    </div>

                    <div className="my-1.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={cut.pattern}
                        onChange={(e) =>
                          onChangePattern?.(cut.index, e.target.value as CameraPattern)
                        }
                        className="w-full rounded border border-slate-700/60 bg-slate-900/80 px-1.5 py-0.5 text-xs font-medium text-slate-200 outline-none transition-colors focus:border-cyan-500/50"
                        style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                      >
                        {CAMERA_PATTERNS.map((p) => (
                          <option key={p.type} value={p.type}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock?.(cut.index);
                      }}
                      className={`flex w-full items-center justify-center gap-1 rounded py-0.5 text-[10px] font-medium transition-all ${
                        isLocked
                          ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                          : 'bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                      }`}
                    >
                      {isLocked ? (
                        <>
                          <Lock size={11} className="text-cyan-400" />
                          <span>固定中</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={11} />
                          <span>固定する</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
