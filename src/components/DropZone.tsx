import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileAudio, FileText, X } from 'lucide-react';

// ============================================================
// コンポーネント Props 定義
// ============================================================

/**
 * DropZone コンポーネントのプロパティ
 */
interface DropZoneProps {
  /** フィールドの表示ラベル */
  label: string;
  /** 補助説明テキスト */
  description: string;
  /** 受け入れる拡張子・MIMEタイプ (例: ".vmd", ".wav,.mp3") */
  accept: string;
  /** 表示アイコンの種別 ('audio' または 'vmd') */
  icon: 'audio' | 'vmd';
  /** 現在選択されているファイル（未選択時は null） */
  file: File | null;
  /** ファイル選択時のコールバック関数 */
  onFileSelect: (file: File) => void;
  /** ファイルクリア時のコールバック関数 */
  onFileClear: () => void;
  /** テーマアクセントカラー (HEX値) */
  accentColor: string;
}

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * バイト数を人間が読みやすい形式 (B / KB / MB) にフォーマット
 *
 * @param bytes - バイト数
 * @returns 整形された文字列 (例: "12.4 MB")
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================
// メインコンポーネント
// ============================================================

/**
 * ドラッグ＆ドロップおよびファイルピッカーによるアップロード領域コンポーネント
 */
export function DropZone({
  label,
  accept,
  icon,
  file,
  onFileSelect,
  onFileClear,
  description,
  accentColor,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ドラッグ＆ドロップのイベントハンドラ
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileSelect(droppedFile);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // ------------------------------------------------------------
  // 1. ファイル選択済み時の表示 (File Info Card)
  // ------------------------------------------------------------
  if (file) {
    return (
      <div className="group relative rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition-all hover:border-slate-600/60">
        <div className="flex items-center gap-3">
          {/* アイコンバッジ */}
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            {icon === 'audio' ? <FileAudio size={22} /> : <FileText size={22} />}
          </div>

          {/* ファイル名・サイズ */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
          </div>

          {/* 削除ボタン */}
          <button
            type="button"
            onClick={onFileClear}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-700/40 hover:text-slate-300"
            aria-label="ファイルを削除"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // 2. ファイル未選択時のドロップ領域 (Drop Area)
  // ------------------------------------------------------------
  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
        isDragging
          ? 'border-cyan-400 bg-cyan-400/10'
          : 'border-slate-700/50 bg-slate-800/20 hover:border-slate-600 hover:bg-slate-800/40'
      }`}
    >
      {/* 非表示のネイティブ file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onFileSelect(selected);
          e.target.value = '';
        }}
      />

      {/* アイコン */}
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
      >
        {icon === 'audio' ? <FileAudio size={24} /> : <FileText size={24} />}
      </div>

      {/* ラベル & 説明 */}
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>

      {/* 補助テキスト */}
      <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-600">
        <UploadCloud size={14} />
        <span>ドロップまたはクリック</span>
      </div>
    </div>
  );
}
