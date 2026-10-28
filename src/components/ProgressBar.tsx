// ============================================================
// コンポーネント Props 定義
// ============================================================

/**
 * プログレスバーの実行状態
 */
export type ProgressBarStatus = 'idle' | 'working' | 'done' | 'error';

/**
 * ProgressBar コンポーネントのプロパティ
 */
interface ProgressBarProps {
  /** 進捗度合い (0.0 〜 1.0) */
  progress: number;
  /** 表示する進捗ラベル (例: "音声を解析中...") */
  label: string;
  /** 現在のステータス */
  status: ProgressBarStatus;
}

// ============================================================
// メインコンポーネント
// ============================================================

/**
 * 処理の進捗率（パーセント）とステータスを視覚的に表示するプログレスバー
 */
export function ProgressBar({ progress, label, status }: ProgressBarProps) {
  // 0〜100% の整数値に変換（0〜100の範囲内にクランプ）
  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

  // ステータスに応じたバーの配色
  const barColor =
    status === 'error'
      ? 'bg-red-500'
      : status === 'done'
      ? 'bg-green-500'
      : 'bg-gradient-to-r from-cyan-500 to-blue-500';

  return (
    <div className="space-y-2">
      {/* ラベル & パーセント表示 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-xs text-slate-500">
          {status === 'done' ? '完了' : status === 'error' ? 'エラー' : `${pct}%`}
        </span>
      </div>

      {/* プログレスバー本体 */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
