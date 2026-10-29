import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import {
  Video,
  Clapperboard,
  Download,
  Sparkles,
  Info,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { DropZone } from '@/components/DropZone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { BeatTimeline } from '@/components/BeatTimeline';
import { ProgressBar } from '@/components/ProgressBar';
import { CameraPreview } from '@/components/CameraPreview';
import { analyzeAudio } from '@/lib/audio';
import { parseVMD, writeCameraVMD } from '@/lib/vmd';
import { generateCameraMotion, downloadVMD, type GenerationResult } from '@/lib/camera';
import type {AudioAnalysisResult, CameraGenerationOptions, CameraPattern, CutInfo, VMDParseResult} from '@/types';

// ============================================================
// アプリケーション状態の型定義
// ============================================================

/**
 * アプリケーションの処理フェーズ状態
 * - 'idle': 初期待機状態
 * - 'analyzing': 音声ファイルのWeb Audio API解析中
 * - 'generating': カメラモーション生成中
 * - 'done': 生成完了（ダウンロード可能）
 * - 'error': 処理失敗
 */
type AppPhase = 'idle' | 'analyzing' | 'generating' | 'done' | 'error';

// ============================================================
// メインコンポーネント
// ============================================================

/**
 * MMDカメラモーション自動生成 Webアプリケーションのルートコンポーネント
 */
export default function App() {
  // ------------------------------------------------------------
  // 1. ファイルおよび解析データの状態管理 (Model State)
  // ------------------------------------------------------------
  const [vmdFile, setVmdFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [vmdParseResult, setVmdParseResult] = useState<VMDParseResult | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // ------------------------------------------------------------
  // 2. UI・処理進行状態の管理 (UI State)
  // ------------------------------------------------------------
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ time: number; nonce: number } | null>(null);

  // ------------------------------------------------------------
  // 3. カメラ生成オプション設定
  // ------------------------------------------------------------
  const [options, setOptions] = useState<CameraGenerationOptions>({
    cameraMode: 'auto',
    beatSensitivity: 0.6,
    cutInterval: 1.5,
    patterns: ['wide', 'closeup', 'highangle', 'lowangle', 'orbit', 'dolly', 'dutch_angle', 'tilt_up'],
    transitions: [],
    lookAtBone: 'センター',
    baseDistance: 45,
    closeupDistance: 18,
    fov: 30,
    eyeHeight: 15,
  });

  /** 生成されたVMDバイナリバッファの参照保持 */
  const generatedBufferRef = useRef<ArrayBuffer | null>(null);

  // ------------------------------------------------------------
  // 4. イベントハンドラ群 (Controller Logic)
  // ------------------------------------------------------------

  /**
   * アプリケーションの状態を初期化する
   */
  const reset = useCallback(() => {
    setVmdFile(null);
    setAudioFile(null);
    setVmdParseResult(null);
    setAudioAnalysis(null);
    setGenerationResult(null);
    setPhase('idle');
    setErrorMsg('');
    setProgress(0);
    setProgressLabel('');
    generatedBufferRef.current = null;
    setSelectedCutIndex(null);
    setSeekRequest(null);
  }, []);

  /**
   * ダンスモーションVMDファイル選択時の処理
   * バイナリを即時パースしてボーンキーフレーム情報を抽出
   */
  const handleVmdSelect = useCallback(async (file: File) => {
    setVmdFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseVMD(buffer);
      setVmdParseResult(parsed);
    } catch (e) {
      console.error('[VMD] Unexpected error:', e);
      setVmdParseResult(null);
    }
  }, []);

  /**
   * 音声ファイル選択時の処理
   */
  const handleAudioSelect = useCallback((file: File) => {
    setAudioFile(file);
    setAudioAnalysis(null);
    setGenerationResult(null);
    setPhase('idle');
  }, []);

  /**
   * 音声解析およびカメラモーション生成を実行する非同期パイプライン
   */
  const handleGenerate = useCallback(async () => {
    // VMDおよび音声の両方が必須
    if (!audioFile || !vmdFile) return;

    setPhase('analyzing');
    setErrorMsg('');
    setProgress(0);
    setProgressLabel('音声を解析中...');

    try {
      // 1. 音声ファイルのデコード＆ビート検出 (Web Audio API)
      const analysis = await analyzeAudio(
        audioFile,
        options.beatSensitivity,
        options.cutInterval,
        (p) => setProgress(p)
      );
      setAudioAnalysis(analysis);

      // 2. カメラワーク生成
      setPhase('generating');
      setProgressLabel('カメラワークを生成中...');
      setProgress(0);

      const result = generateCameraMotion(
        analysis,
        vmdParseResult?.data ?? null,
        {
          ...options,
          existingCuts: generationResult?.cuts, // ロックされたカットを引き継ぐ
        },
        (p) => setProgress(p)
      );
      setGenerationResult(result);

      // 3. MMD規格のVMDバイナリへエンコード
      const vmdBuffer = writeCameraVMD(result.cameraFrames);
      generatedBufferRef.current = vmdBuffer;

      setProgress(1);
      setProgressLabel('完了');
      setPhase('done');
    } catch (e) {
      console.error('[Generation] Error:', e);
      setErrorMsg(
        e instanceof Error ? e.message : '生成中にエラーが発生しました。'
      );
      setPhase('error');
    }
  }, [audioFile, vmdFile, vmdParseResult, options, generationResult]);

  /**
   * 生成されたVMDファイルをローカルにダウンロード
   */
  const handleDownload = useCallback(() => {
    if (!generatedBufferRef.current) return;
    const baseName = audioFile?.name.replace(/\.[^.]+$/, '') ?? 'camera';
    downloadVMD(generatedBufferRef.current, `camera_${baseName}.vmd`);
  }, [audioFile]);

    /**
   * 指定したカットの固定（ロック）状態をトグル切り替え
   */
  const handleToggleLock = useCallback((cutIndex: number) => {
    setGenerationResult((prev) => {
      if (!prev) return null;
      const updatedCuts = prev.cuts.map((c) =>
        c.index === cutIndex ? { ...c, isLocked: !c.isLocked } : c
      );
      return { ...prev, cuts: updatedCuts };
    });
  }, []);

  /**
   * 指定したカットのカメラパターンを手動変更し、即座にVMDデータを再計算
   */
  const handleChangePattern = useCallback(
    (cutIndex: number, newPattern: CameraPattern) => {
      if (!audioAnalysis) return;

      setGenerationResult((prev) => {
        if (!prev) return null;

        // パターンを更新し、手動変更されたカットは自動でロック
        const updatedCuts = prev.cuts.map((c) =>
          c.index === cutIndex ? { ...c, pattern: newPattern, isLocked: true } : c
        );

        // 新しいカット構成で即座にカメラモーションを再計算
        const newResult = generateCameraMotion(
          audioAnalysis,
          vmdParseResult?.data ?? null,
          {
            ...options,
            existingCuts: updatedCuts,
          }
        );

        // ダウンロード用VMDバッファも最新化
        generatedBufferRef.current = writeCameraVMD(newResult.cameraFrames);

        return newResult;
      });
    },
    [audioAnalysis, vmdParseResult, options]
  );

  /**
   * タイムラインまたはカードクリック時のカット選択＆ジャンプハンドラ
   */
  const handleSelectCut = useCallback((cut: CutInfo) => {
    setSelectedCutIndex(cut.index);
    // 同じカットを連続でクリックしても確実に検知できるよう nonce（タイムスタンプ）を付与
    setSeekRequest({ time: cut.time, nonce: Date.now() });
  }, []);

  // ------------------------------------------------------------
  // 5. 算出プロパティ (Computed)
  // ------------------------------------------------------------
  const isWorking = phase === 'analyzing' || phase === 'generating';
  const canGenerate = vmdFile !== null && audioFile !== null && !isWorking;

  const audioBasedFrameCount = audioAnalysis ? Math.ceil(audioAnalysis.duration * 30) : 0;
  const audioDuration = audioAnalysis?.duration ?? 0;

  // ------------------------------------------------------------
  // 6. レンダリング (View)
  // ------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      {/* 背景装飾グリッド */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute -top-40 left-1/2 h-80 w-[600px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -right-40 top-1/2 h-60 w-[400px] rounded-full bg-blue-500/8 blur-[100px]" />
      </div>

      {/* ヘッダー */}
      <header className="relative border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
                <Clapperboard size={22} className="text-white" />
              </div>
              <div className="absolute -inset-0.5 -z-10 rounded-xl bg-cyan-500/20 blur-md" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                VMD Camera Generator
              </h1>
              <p className="text-[11px] text-slate-500">音声ビートからMMDカメラモーションを自動生成</p>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">リセット</span>
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* 左カラム: ステップ操作・結果表示 */}
          <div className="space-y-6 min-w-0">
            {/* Step 1: ファイル入力 */}
            <section>
              <SectionHeader step="1" title="ファイル入力" icon={<Video size={16} />} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <DropZone
                  label="キャラクターVMD（ダンスモーション）"
                  description=".vmdファイルをアップロード"
                  accept=".vmd"
                  icon="vmd"
                  file={vmdFile}
                  onFileSelect={handleVmdSelect}
                  onFileClear={() => {
                    setVmdFile(null);
                    setVmdParseResult(null);
                  }}
                  accentColor="#22d3ee"
                />
                <DropZone
                  label="音声ファイル（WAV / MP3）"
                  description=".wav または .mp3をアップロード"
                  accept=".wav,.mp3,audio/wav,audio/mpeg"
                  icon="audio"
                  file={audioFile}
                  onFileSelect={handleAudioSelect}
                  onFileClear={() => {
                    setAudioFile(null);
                    setAudioAnalysis(null);
                    setGenerationResult(null);
                  }}
                  accentColor="#3b82f6"
                />
              </div>

              {/* VMD検出ステータス表示 */}
              {vmdFile && vmdParseResult && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border border-cyan-800/30 bg-cyan-900/10 px-3 py-2">
                    <CheckCircle2 size={14} className="text-cyan-400" />
                    <span className="text-xs text-cyan-300/80">
                      VMDファイルを検出
                      {audioBasedFrameCount > 0
                        ? ` / 最終フレーム: ${audioBasedFrameCount}（${audioDuration.toFixed(1)}秒）`
                        : ''}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Step 2: 解析結果 */}
            <section>
              <SectionHeader step="2" title="解析結果" icon={<Sparkles size={16} />} />
              <div className="mt-4">
                <BeatTimeline
                  audio={audioAnalysis}
                  cuts={generationResult?.cuts ?? []}
                  onToggleLock={handleToggleLock}
                  onChangePattern={handleChangePattern}
                  onSelectCut={handleSelectCut}
                  selectedCutIndex={selectedCutIndex}
                />
              </div>
            </section>

            {/* Step 3: カメラ生成・ダウンロード */}
            <section>
              <SectionHeader step="3" title="生成" icon={<Clapperboard size={16} />} />
              <div className="mt-4 space-y-3 rounded-xl border border-slate-700/40 bg-slate-800/20 p-4">
                {/* 生成ボタン */}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition-all ${
                    canGenerate
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:brightness-110 active:scale-[0.98]'
                      : 'cursor-not-allowed bg-slate-800/50 text-slate-600'
                  }`}
                >
                  <Sparkles size={18} />
                  {isWorking ? '生成中...' : 'カメラモーションを生成'}
                </button>

                {/* 未選択時の案内テキスト */}
                {(!audioFile || !vmdFile) && (
                  <p className="text-center text-xs text-slate-500">
                    {!vmdFile && !audioFile
                      ? 'VMDファイルと音声ファイルを両方アップロードしてください'
                      : !vmdFile
                      ? 'ダンスモーション（VMD）をアップロードしてください'
                      : '音声ファイルをアップロードしてください'}
                  </p>
                )}

                {/* 処理進行中のプログレスバー */}
                {isWorking && (
                  <ProgressBar progress={progress} label={progressLabel} status="working" />
                )}

                {/* 生成完了時の結果・ダウンロードパネル */}
                {phase === 'done' && generationResult && (
                  <>
                    <ProgressBar progress={1} label="カメラモーション生成完了" status="done" />

                    {/* 3Dカメラプレビュー */}
                    <CameraPreview
                      audioFile={audioFile}
                      vmdData={vmdParseResult?.data ?? null}
                      cameraFrames={generationResult.cameraFrames}
                      cuts={generationResult.cuts}
                      seekRequest={seekRequest}
                    />

                    <div className="flex items-center justify-between rounded-lg border border-green-800/30 bg-green-900/10 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-green-300">
                          {generationResult?.cameraFrames.length ?? 0}キーフレーム生成
                        </p>
                        <p className="text-xs text-green-500/70">
                          {generationResult?.cuts.length ?? 0}カット / VMDファイル準備完了
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40 hover:brightness-110"
                      >
                        <Download size={18} />
                        VMDをダウンロード
                      </button>
                    </div>
                  </>
                )}

                {/* エラー発生時 */}
                {phase === 'error' && (
                  <div className="rounded-lg border border-red-800/40 bg-red-900/10 px-4 py-3">
                    <ProgressBar progress={0} label="エラーが発生しました" status="error" />
                    <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* 右カラム: 設定パネル & ヘルプ */}
          <aside>
            <div className="space-y-4 lg:sticky lg:top-6">
              <div className="rounded-xl border border-slate-700/40 bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-semibold text-slate-200">カメラワーク設定</span>
                  <ChevronDown
                    size={18}
                    className={`text-slate-500 transition-transform ${showSettings ? '' : '-rotate-90'}`}
                  />
                </button>
                {showSettings && (
                  <div className="border-t border-slate-700/40 p-4">
                    <SettingsPanel
                      options={options}
                      onChange={setOptions}
                      disabled={isWorking}
                    />
                  </div>
                )}
              </div>

              {/* 使い方ヘルプカード */}
              <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Info size={14} className="text-cyan-400" />
                  使い方
                </p>
                <ol className="space-y-1.5 text-[11px] text-slate-500">
                  <li>1. ダンスモーションのVMDをアップロード</li>
                  <li>2. 音声ファイル（WAV/MP3）をアップロード</li>
                  <li>3. カメラワークの設定を調整</li>
                  <li>4. 「生成」ボタンをクリック</li>
                  <li>5. 生成されたVMDをダウンロード</li>
                  <li>6. MMDでカメラモーションとして読み込み</li>
                </ol>
              </div>
            </div>
          </aside>
        </div>

        {/* フッター */}
        <footer className="mt-12 border-t border-slate-800/60 pt-6 text-center">
          <p className="text-xs text-slate-600">
            VMD Camera Generator
          </p>
        </footer>
      </main>
    </div>
  );
}

// ============================================================
// 共通サブコンポーネント (Private Helper Component)
// ============================================================

interface SectionHeaderProps {
  /** ステップ番号 (例: "1", "2") */
  step: string;
  /** ステクションのタイトル */
  title: string;
  /** タイトル横に表示するアイコン */
  icon: React.ReactNode;
}

/**
 * 操作ステップの見出しヘッダーを描画するコンポーネント
 */
function SectionHeader({ step, title, icon }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10 text-xs font-bold text-cyan-400">
        {step}
      </div>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        {icon}
        {title}
      </div>
    </div>
  );
}
