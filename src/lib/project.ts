import type { CameraGenerationOptions, CutInfo } from '@/types';

// ============================================================
// プロジェクトファイルのデータ構造 (Project DTO)
// ============================================================

/**
 * プロジェクト保存ファイル (.json) のデータ構造
 */
export interface ProjectData {
  /** プロジェクトファイル形式のバージョン (将来の互換性維持用) */
  formatVersion: string;
  /** 保存日時 (ISO 8601 形式) */
  createdAt: string;
  /** 元の音声ファイル名（参照用メモ） */
  audioFileName?: string;
  /** 元のVMDモーションファイル名（参照用メモ） */
  vmdFileName?: string;
  /** カメラ生成設定オプション */
  options: CameraGenerationOptions;
  /** タイムラインのカット構成（各カットのパターン・ロック状態を含む） */
  cuts?: CutInfo[];
}

// ============================================================
// ファイル保存・読み込み関数群 (I/O Operations)
// ============================================================

/**
 * 現在のプロジェクト設定・カット構成を整形されたJSONファイルとしてダウンロード（エクスポート）
 *
 * @param data - 保存するプロジェクトデータ
 * @param baseName - 出力ファイル名のベース（音声ファイル名など）
 */
export function exportProject(data: ProjectData, baseName?: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // ファイル名のサニタイズ（拡張子を除去して接尾辞を付与）
  const cleanName = baseName ? baseName.replace(/\.[^.]+$/, '') : 'camera';
  const fileName = `${cleanName}_project.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * ユーザーが選択したJSONファイルを読み込み、プロジェクトデータとして復元（インポート）
 *
 * @param file - アップロードされたJSONファイル
 * @returns 復元・検証済みの ProjectData
 * @throws ファイル形式が不正な場合は Error をスロー
 */
export async function importProject(file: File): Promise<ProjectData> {
  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('選択されたファイルは有効なJSON形式ではありません。');
  }

  // 基本構造のバリデーション
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プロジェクトデータが正しくありません。');
  }

  const data = parsed as Partial<ProjectData>;

  if (!data.options || typeof data.options !== 'object') {
    throw new Error('プロジェクトファイル内にカメラ設定オプションが見つかりません。');
  }

  return {
    formatVersion: data.formatVersion ?? '1.0',
    createdAt: data.createdAt ?? new Date().toISOString(),
    audioFileName: data.audioFileName,
    vmdFileName: data.vmdFileName,
    options: data.options as CameraGenerationOptions,
    cuts: Array.isArray(data.cuts) ? data.cuts : undefined,
  };
}
