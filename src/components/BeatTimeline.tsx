import type React from 'react';
import { useMemo } from 'react';
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
} from 'lucide-react';

// ============================================================
// コンポーネント Props 定義
// ============================================================

/**
 * BeatTimeline コンポーネントのプロパティ
 */
interface BeatTimelineProps {
  /** 音声解析結果（未解析時は null） */
  audio: AudioAnalysisResult | null;
  /** 生成されたカメラカット情報の一覧 */
  cuts: CutInfo[];
  /** カットのロック/アンロック切り替え時のコールバック 【新設】 */
  onToggleLock?: (cutIndex: number) => void;
  /** カットのカメラパターン手動変更時のコールバック 【新設】 */
  onChangePattern?: (cutIndex: number, newPattern: CameraPattern) => void;
}

// ============================================================
// 表示用定数（カラー＆ラベルマップ）
// ============================================================

/** 各カメラパターンのタイムライン表示色 */
const PATTERN_COLORS: Record<CameraPattern, string> = {
  wide: '#3b82f6',        // 青: 引き
  closeup: '#ef4444',     // 赤: 寄り
  highangle: '#22c55e',   // 緑: 俯瞰
  lowangle: '#f97316',    // オレンジ: ローアングル
  orbit: '#a855f7',       // 紫: オービット
  dolly: '#06b6d4',       // シアン: ドリー
  dutch_angle: '#ec4899', // ピンク: ダッチアングル
  tilt_up: '#eab308',     // イエローゴールド: ティルトアップ
};

/** 各カメラパターンの短縮ラベル */
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

/**
 * 楽曲解析結果およびカットタイムライン、カット編集カードトレイを描画するコンポーネント
 */
export function BeatTimeline({
  audio,
  cuts,
  onToggleLock,
  onChangePattern,
}: BeatTimelineProps) {
  /**
   * 画面描画用にエネルギー波形を約200本のバーにダウンサンプリングする
   */
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

  // 音声未解析時のプレースホルダー表示
  if (!audio) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800/20 p-12">
        <div className="text-center">
          <Activity size={32} className="mx-auto mb-3 text-slate-700" />
          <p className="text-sm text-slate-600">音声を解析するとここに結果が表示されます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* ---------------------------------------------------- */}
      {/* 1. 楽曲＆解析サマリーカード                          */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Music size={16} />}
          label="推定BPM"
          value={audio.bpm.toString()}
          color="text-cyan-400"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="再生時間"
          value={`${audio.duration.toFixed(1)}秒`}
          color="text-blue-400"
        />
        <StatCard
          icon={<Zap size={16} />}
          label="検出ビート数"
          value={audio.peakTimes.length.toString()}
          color="text-amber-400"
        />
        <StatCard
          icon={<Clapperboard size={16} />}
          label="生成カット数"
          value={cuts.length > 0 ? `${cuts.length}カット` : '-'}
          color="text-green-400"
        />
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. エネルギー波形表示                                */}
      {/* ---------------------------------------------------- */}
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">エネルギー波形</p>
        <div className="flex h-20 items-end gap-px overflow-hidden rounded-lg border border-slate-700/40 bg-slate-900/40 p-2">
          {energyBars.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${Math.max(2, v * 100)}%`,
                backgroundColor: v > 0.6 ? '#22d3ee' : v > 0.3 ? '#0891b2' : '#1e3a5f',
                minWidth: '2px',
              }}
            />
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. カットタイムライン表示                            */}
      {/* ---------------------------------------------------- */}
      {cuts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">
              カットタイムライン（{cuts.length}カット）
            </p>
            <span className="text-[10px] text-slate-500">
              ※ロック（🔒）したカットは再生成時も維持されます
            </span>
          </div>

          {/* 全体時間軸バー */}
          <div className="relative h-14 overflow-hidden rounded-lg border border-slate-700/40 bg-slate-900/40 p-2">
            <div className="relative h-full">
              {/* 時間グリッド線 (25%, 50%, 75%) */}
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
                  const pct = (cut.time / audio.duration) * 100;
                  const color = PATTERN_COLORS[cut.pattern] ?? '#22d3ee';
                  return (
                    <div
                      key={cut.index}
                      className="absolute bottom-0 top-0 flex flex-col items-center justify-end"
                      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                      title={`#${cut.index + 1} (${cut.time.toFixed(2)}秒): ${
                        PATTERN_LABELS[cut.pattern] ?? cut.pattern
                      }${cut.isLocked ? ' [固定中]' : ''}`}
                    >
                      {/* ロック中の場合は上部に小さな鍵ドットを表示 */}
                      {cut.isLocked && (
                        <div className="mb-0.5 h-1 w-1 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                      )}
                      <div
                        className="w-1.5 rounded-t transition-all"
                        style={{
                          backgroundColor: color,
                          height: '100%',
                          minHeight: '8px',
                          opacity: cut.isLocked ? 1 : 0.85,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* パターン凡例 (Legend) */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(PATTERN_COLORS).map(([pattern, color]) => {
              const p = pattern as CameraPattern;
              if (!cuts.some((c) => c.pattern === p)) return null;
              return (
                <div key={pattern} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-slate-500">{PATTERN_LABELS[p]}</span>
                </div>
              );
            })}
          </div>

          {/* ---------------------------------------------------- */}
          {/* 4. 各カットの編集・固定カードトレイ（横スクロール）   */}
          {/* ---------------------------------------------------- */}
          <div className="mt-3 min-w-0 max-w-full">
            <p className="mb-2 text-xs font-medium text-slate-400">
              カット一覧・個別設定（横スクロール）
            </p>

            <div className="flex w-full max-w-full gap-2 overflow-x-auto pb-2">
              {cuts.map((cut) => {
                const color = PATTERN_COLORS[cut.pattern] ?? '#22d3ee';
                const isLocked = !!cut.isLocked;

                return (
                  <div
                    key={cut.index}
                    className={`flex min-w-[130px] flex-col justify-between rounded-lg border p-2.5 transition-all ${
                      isLocked
                        ? 'border-cyan-500/60 bg-cyan-950/20 shadow-sm shadow-cyan-500/10'
                        : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600'
                    }`}
                  >
                    {/* カード上部: カット番号 & 開始秒数 */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">#{cut.index + 1}</span>
                      <span className="text-slate-500">{cut.time.toFixed(1)}s</span>
                    </div>

                    {/* カード中央: パターン選択セレクトボックス */}
                    <div className="my-2">
                      <select
                        value={cut.pattern}
                        onChange={(e) =>
                          onChangePattern?.(cut.index, e.target.value as CameraPattern)
                        }
                        className="w-full rounded border border-slate-700/60 bg-slate-900/80 px-2 py-1 text-xs font-medium text-slate-200 outline-none transition-colors focus:border-cyan-500/50"
                        style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                      >
                        {CAMERA_PATTERNS.map((p) => (
                          <option key={p.type} value={p.type}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* カード下部: ロック/解除ボタントグル */}
                    <button
                      type="button"
                      onClick={() => onToggleLock?.(cut.index)}
                      className={`flex w-full items-center justify-center gap-1 rounded py-1 text-[11px] font-medium transition-all ${
                        isLocked
                          ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                          : 'bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                      }`}
                    >
                      {isLocked ? (
                        <>
                          <Lock size={12} className="text-cyan-400" />
                          <span>固定中</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={12} />
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

// ============================================================
// サブコンポーネント (Private Helper Component)
// ============================================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
      <div className={`mb-1 flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-[10px] font-medium text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
