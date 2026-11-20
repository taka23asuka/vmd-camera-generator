import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video,
  Clapperboard,
  Download,
  Sparkles,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  Save,
  FolderOpen,
  Info,
  Box,
  Undo2,
  Redo2,
} from 'lucide-react';
import packageJson from '../package.json';
import { DropZone } from '@/components/DropZone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { BeatTimeline } from '@/components/BeatTimeline';
import { ProgressBar } from '@/components/ProgressBar';
import { CameraPreview } from '@/components/CameraPreview';
import { HelpModal } from '@/components/HelpModal';
import { analyzeAudio } from '@/lib/audio';
import { parseVMD, writeCameraVMD } from '@/lib/vmd';
import { generateCameraMotion, downloadVMD, type GenerationResult } from '@/lib/camera';
import { exportProject, importProject, type ProjectData } from '@/lib/project';
import { extractModelEyeHeight, type ModelEyeInfo } from '@/lib/model';
import { splitCutAtFrame, removeCutAndMerge } from '@/lib/cutEditor';
import type {
  AudioAnalysisResult,
  CameraGenerationOptions,
  CameraPattern,
  CutInfo,
  VMDParseResult,
} from '@/types';

type AppPhase = 'idle' | 'analyzing' | 'generating' | 'done' | 'error';

/** アンドゥ/リドゥで保存する履歴スナップショット */
interface HistoryState {
  options: CameraGenerationOptions;
  generationResult: GenerationResult | null;
}

export default function App() {
  // ------------------------------------------------------------
  // 1. ファイルおよび解析データの状態管理 (Model State)
  // ------------------------------------------------------------
  const [vmdFile, setVmdFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelEyeInfo, setModelEyeInfo] = useState<ModelEyeInfo | null>(null);

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
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // ------------------------------------------------------------
  // 3. タイムライン・プレビュー連携状態 (Playback State)
  // ------------------------------------------------------------
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ time: number; nonce: number } | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTrigger, setPlayTrigger] = useState(0);

  // ------------------------------------------------------------
  // 4. カメラ生成オプション設定 ＆ アンドゥ/リドゥ履歴スタック
  // ------------------------------------------------------------
  const [options, setOptions] = useState<CameraGenerationOptions>({
    cameraMode: 'auto',
    beatSensitivity: 0.6,
    cutInterval: 1.5,
    patterns: ['wide', 'closeup', 'highangle', 'lowangle', 'orbit', 'dolly', 'dutch_angle', 'tilt_up', 'snap_dolly', 'slide'],
    transitions: [],
    lookAtBone: 'センター',
    baseDistance: 45,
    closeupDistance: 18,
    fov: 30,
    eyeHeight: 15,
    intensity: 1.0,
  });

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const setOptionsAndRecord = useCallback(
    (newOptions: CameraGenerationOptions | ((prev: CameraGenerationOptions) => CameraGenerationOptions),
      newResult?: GenerationResult | null) => {
      setOptions((currentOptions) => {
        const resolvedOptions = typeof newOptions === 'function' ? newOptions(currentOptions) : newOptions;
        setPast((currPast) => [...currPast, { options: currentOptions, generationResult }]);
        setFuture([]);
        return resolvedOptions;
      });

      if (newResult !== undefined) {
        setGenerationResult(newResult);
        if (newResult) {
          generatedBufferRef.current = writeCameraVMD(newResult.cameraFrames);
          setPhase('done');
        } else {
          generatedBufferRef.current = null;
          setPhase('idle');
          setSelectedCutIndex(null);
          setSeekRequest(null);
          setPreviewTime(0);
          setIsPlaying(false);
        }
      }
    },
    [generationResult]
  );

  const generatedBufferRef = useRef<ArrayBuffer | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  /**
   * 意味のある編集操作が行われたときだけ、履歴（past）にスナップショットを記録する
   */
  const recordHistory = useCallback(
    (newOptions: CameraGenerationOptions, newResult: GenerationResult | null) => {
      setPast((currPast) => [...currPast, { options, generationResult }]);
      setFuture([]); // 新しい操作を行ったら未来スタックはクリア
      setOptions(newOptions);
      setGenerationResult(newResult);

      if (newResult) {
        generatedBufferRef.current = writeCameraVMD(newResult.cameraFrames);
        setPhase('done');
      } else {
        generatedBufferRef.current = null;
        setPhase('idle');
        setSelectedCutIndex(null);
        setSeekRequest(null);
        setPreviewTime(0);
        setIsPlaying(false);
      }
    },
    [options, generationResult]
  );

  /**
   * アンドゥ（元に戻す）実行
   */
  const handleUndo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setFuture((currFuture) => [{ options, generationResult }, ...currFuture]);
    setPast(newPast);
    setOptions(previous.options);
    setGenerationResult(previous.generationResult);

    if (previous.generationResult) {
      generatedBufferRef.current = writeCameraVMD(previous.generationResult.cameraFrames);
      setPhase('done');
    } else {
      generatedBufferRef.current = null;
      setPhase('idle');
      setSelectedCutIndex(null);
      setSeekRequest(null);
      setPreviewTime(0);
      setIsPlaying(false);
    }
  }, [past, options, generationResult]);

  /**
   * リドゥ（やり直す）実行
   */
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast((currPast) => [...currPast, { options, generationResult }]);
    setFuture(newFuture);
    setOptions(next.options);
    setGenerationResult(next.generationResult);

    if (next.generationResult) {
      generatedBufferRef.current = writeCameraVMD(next.generationResult.cameraFrames);
      setPhase('done');
    } else {
      generatedBufferRef.current = null;
      setPhase('idle');
      setSelectedCutIndex(null);
      setSeekRequest(null);
      setPreviewTime(0);
      setIsPlaying(false);
    }
  }, [future, options, generationResult]);

  // キーボードショートカット (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ------------------------------------------------------------
  // 5. 算出プロパティ
  // ------------------------------------------------------------
  const isWorking = phase === 'analyzing' || phase === 'generating';
  const canGenerate = vmdFile !== null && audioFile !== null && !isWorking;
  const canExport = phase === 'done' && generationResult !== null && !isWorking;
  const canImport = vmdFile !== null && audioFile !== null && !isWorking;
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // ------------------------------------------------------------
  // 6. イベントハンドラ群 (Controller Logic)
  // ------------------------------------------------------------

  const reset = useCallback(() => {
    setVmdFile(null);
    setAudioFile(null);
    setModelFile(null);
    setModelEyeInfo(null);
    setVmdParseResult(null);
    setAudioAnalysis(null);
    setGenerationResult(null);
    setPhase('idle');
    setErrorMsg('');
    setProgress(0);
    setProgressLabel('');
    setSelectedCutIndex(null);
    setSeekRequest(null);
    setPreviewTime(0);
    setPreviewDuration(0);
    setIsPlaying(false);
    setPast([]);
    setFuture([]);
    generatedBufferRef.current = null;
  }, []);

  const handleVmdSelect = useCallback(async (file: File) => {
    setErrorMsg('');
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

  const handleAudioSelect = useCallback((file: File) => {
    setErrorMsg('');
    setAudioFile(file);
    setAudioAnalysis(null);
    setGenerationResult(null);
    setPhase('idle');
  }, []);

  const handleModelSelect = useCallback(async (file: File) => {
    setErrorMsg('');
    setModelFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const eyeInfo = extractModelEyeHeight(buffer);

      if (eyeInfo) {
        setModelEyeInfo(eyeInfo);
        const newOpts = { ...options, eyeHeight: eyeInfo.eyeHeight };
        if (generationResult) {
          recordHistory(newOpts, generationResult);
        } else {
          setOptions(newOpts);
        }
      } else {
        setModelEyeInfo(null);
      }
    } catch (e) {
      console.error('[Model] Unexpected error:', e);
      setModelEyeInfo(null);
    }
  }, [options, generationResult, recordHistory]);

  const handleGenerate = useCallback(async () => {
    if (!audioFile || !vmdFile) return;

    setErrorMsg('');
    setPhase('analyzing');
    setProgress(0);
    setProgressLabel('音声を解析中...');

    try {
      const analysis = await analyzeAudio(
        audioFile,
        options.beatSensitivity,
        options.cutInterval,
        (p) => setProgress(p)
      );
      setAudioAnalysis(analysis);

      setPhase('generating');
      setProgressLabel('カメラワークを生成中...');
      setProgress(0);

      const result = generateCameraMotion(
        analysis,
        vmdParseResult?.data ?? null,
        {
          ...options,
          existingCuts: generationResult?.cuts,
        },
        (p) => setProgress(p)
      );

      recordHistory(options, result);

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
  }, [audioFile, vmdFile, vmdParseResult, options, generationResult, recordHistory]);

  const handleDownload = useCallback(() => {
    if (!generatedBufferRef.current) return;
    const baseName = audioFile?.name.replace(/\.[^.]+$/, '') ?? 'camera';
    downloadVMD(generatedBufferRef.current, `camera_${baseName}.vmd`);
  }, [audioFile]);

  const handleToggleLock = useCallback((cutIndex: number) => {
    if (!generationResult) return;
    const updatedCuts = generationResult.cuts.map((c) =>
      c.index === cutIndex ? { ...c, isLocked: !c.isLocked } : c
    );
    const newResult = { ...generationResult, cuts: updatedCuts };
    recordHistory(options, newResult);
  }, [generationResult, options, recordHistory]);

  const handleChangePattern = useCallback(
    (cutIndex: number, newPattern: CameraPattern) => {
      if (!audioAnalysis || !generationResult) return;

      const updatedCuts = generationResult.cuts.map((c) =>
        c.index === cutIndex ? { ...c, pattern: newPattern, isLocked: c.isLocked } : c
      );

      const newResult = generateCameraMotion(
        audioAnalysis,
        vmdParseResult?.data ?? null,
        {
          ...options,
          existingCuts: updatedCuts,
        }
      );

      recordHistory(options, newResult);
    },
    [audioAnalysis, generationResult, vmdParseResult, options, recordHistory]
  );

  const handleSelectCut = useCallback((cut: CutInfo) => {
    setSelectedCutIndex(cut.index);
    setSeekRequest({ time: cut.time, nonce: Date.now() });
  }, []);

  const handleTogglePlay = useCallback(() => {
    setPlayTrigger((prev) => prev + 1);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setPreviewTime(time);
    setSeekRequest({ time, nonce: Date.now() });
  }, []);

  const handleResetTime = useCallback(() => {
    setPreviewTime(0);
    setSeekRequest({ time: 0, nonce: Date.now() });
  }, []);

  const handleSplitCut = useCallback(
    (splitFrame: number) => {
      if (!generationResult || !audioAnalysis) return;

      const totalFrames = Math.ceil(audioAnalysis.duration * 30);
      const newCuts = splitCutAtFrame(
        generationResult.cuts,
        splitFrame,
        totalFrames,
        options.patterns
      );

      if (!newCuts) return;

      const newResult = generateCameraMotion(
        audioAnalysis,
        vmdParseResult?.data ?? null,
        {
          ...options,
          existingCuts: newCuts,
        }
      );

      recordHistory(options, newResult);
    },
    [generationResult, audioAnalysis, vmdParseResult, options, recordHistory]
  );

  const handleDeleteCut = useCallback(
    (cutIndex: number) => {
      if (!generationResult || !audioAnalysis) return;

      const newCuts = removeCutAndMerge(generationResult.cuts, cutIndex);
      if (!newCuts) return;

      const newResult = generateCameraMotion(
        audioAnalysis,
        vmdParseResult?.data ?? null,
        {
          ...options,
          existingCuts: newCuts,
        }
      );

      recordHistory(options, newResult);

      if (selectedCutIndex === cutIndex) {
        setSelectedCutIndex(Math.max(0, cutIndex - 1));
      } else if (selectedCutIndex !== null && selectedCutIndex > cutIndex) {
        setSelectedCutIndex(selectedCutIndex - 1);
      }
    },
    [generationResult, audioAnalysis, vmdParseResult, options, selectedCutIndex, recordHistory]
  );

  const handleExportProject = useCallback(() => {
    if (!canExport || !generationResult) return;

    const projectData: ProjectData = {
      formatVersion: '1.0',
      createdAt: new Date().toISOString(),
      audioFileName: audioFile?.name,
      vmdFileName: vmdFile?.name,
      options,
      cuts: generationResult.cuts,
    };
    exportProject(projectData, audioFile?.name ?? 'camera');
  }, [canExport, audioFile, vmdFile, options, generationResult]);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !audioFile || !vmdFile) return;

      try {
        setErrorMsg('');
        const projectData = await importProject(file);

        const isAudioMismatch = projectData.audioFileName && audioFile.name !== projectData.audioFileName;
        const isVmdMismatch = projectData.vmdFileName && vmdFile.name !== projectData.vmdFileName;

        if (isAudioMismatch || isVmdMismatch) {
          const warningMsg =
            `現在のファイルと、プロジェクト保存時のファイルが異なります。\n\n` +
            `【保存時のファイル】\n` +
            `・音声: ${projectData.audioFileName ?? '未記録'}\n` +
            `・VMD: ${projectData.vmdFileName ?? '未記録'}\n\n` +
            `このまま読み込むと、カメラワークのタイミングがズレる可能性があります。続行しますか？`;

          if (!window.confirm(warningMsg)) return;
        }

        const newOptions: CameraGenerationOptions = {
          ...projectData.options,
          existingCuts: projectData.cuts,
        };

        setPhase('generating');
        setProgressLabel('設定ファイルの内容でタイムラインを再構築中...');
        setProgress(0.5);

        let currentAnalysis = audioAnalysis;
        if (!currentAnalysis) {
          currentAnalysis = await analyzeAudio(audioFile, newOptions.beatSensitivity, newOptions.cutInterval);
          setAudioAnalysis(currentAnalysis);
        }

        const newResult = generateCameraMotion(
          currentAnalysis,
          vmdParseResult?.data ?? null,
          newOptions
        );

        recordHistory(newOptions, newResult);
        setProgress(1);
        setProgressLabel('完了');
        setPhase('done');
      } catch (err) {
        console.error('[Project] Import error:', err);
        setErrorMsg(err instanceof Error ? err.message : 'プロジェクトの読み込みに失敗しました。');
        setPhase('error');
      } finally {
        e.target.value = '';
      }
    },
    [audioFile, vmdFile, audioAnalysis, vmdParseResult, recordHistory]
  );

  // ------------------------------------------------------------
  // 7. レンダリング (View)
  // ------------------------------------------------------------
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0e17] text-slate-200">
      <input
        ref={projectInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* 背景装飾 */}
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

      {/* ======================================================== */}
      {/* 1. ヘッダー領域（固定）                                    */}
      {/* ======================================================== */}
      <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/20">
            <Clapperboard size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              VMD Camera Generator
              <span className="rounded bg-cyan-950/80 px-1.5 py-0.2 text-[9px] font-mono text-cyan-400 border border-cyan-800/50">
                v{packageJson.version}
              </span>
            </h1>
          </div>
        </div>

        {/* ヘッダー右側アクション（アンドゥ・リドゥ ＆ 保存・読込・リセット ＆ ヘルプ） */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            title="直前の操作に戻す (Ctrl+Z)"
          >
            <Undo2 size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">戻す</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
            title="やり直す (Ctrl+Y)"
          >
            <Redo2 size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">進む</span>
          </button>

          <div className="mx-1 h-4 w-px bg-slate-700/60" />

          <button
            type="button"
            onClick={handleExportProject}
            disabled={!canExport}
            className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            title={canExport ? 'プロジェクトを保存' : '生成後に保存できます'}
          >
            <Save size={13} className="text-cyan-400" />
            <span>保存</span>
          </button>

          <button
            type="button"
            onClick={() => projectInputRef.current?.click()}
            disabled={!canImport}
            className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            title={canImport ? 'プロジェクトを読込' : 'VMDと音声をセットすると読込可能になります'}
          >
            <FolderOpen size={13} className="text-cyan-400" />
            <span>読込</span>
          </button>

          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/40 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
            title="リセット"
          >
            <RotateCcw size={13} />
            <span>リセット</span>
          </button>

          <div className="mx-0.5 h-4 w-px bg-slate-700/60" />

          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="flex items-center justify-center h-7 w-7 rounded-md border border-slate-700/60 bg-slate-800/70 text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 shadow-sm"
            title="使い方・ショートカットガイド"
            aria-label="ヘルプ"
          >
            <Info size={14} className="text-cyan-400" />
          </button>

        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. 中央メイン作業エリア                                    */}
      {/* ======================================================== */}
      <main className="relative z-10 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-[260px_1fr]">
          {/* 左カラム：大画面3Dプレビューモニター */}
          <div className="flex flex-col items-center justify-start w-[260px] shrink-0">
            {generationResult ? (
              <CameraPreview
                audioFile={audioFile}
                vmdData={vmdParseResult?.data ?? null}
                cameraFrames={generationResult.cameraFrames}
                cuts={generationResult.cuts}
                seekRequest={seekRequest}
                onTimeUpdate={setPreviewTime}
                onDurationChange={setPreviewDuration}
                onPlayStateChange={setIsPlaying}
                playTrigger={playTrigger}
                eyeHeight={options.eyeHeight}
              />
            ) : (
              <div className="flex h-[430px] w-[242px] shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/50 bg-slate-900/30 p-4 text-center">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Video size={20} />
                </div>
                <h3 className="text-xs font-semibold text-slate-300">3Dカメラプレビュー</h3>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  VMDと音声を読み込んで生成すると、ここにリアルタイム3D映像が表示されます
                </p>
              </div>
            )}
          </div>

          {/* 右カラム：ファイル入力・設定・生成パネル */}
          <div className="space-y-3 min-w-0">
            {/* 1. ファイル入力セクション */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3 space-y-2">
              <SectionHeader step="1" title="ファイル入力" icon={<Video size={14} />} />
              <div className="grid gap-2.5 sm:grid-cols-3">
                <DropZone
                  label="キャラクターVMD"
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
                  label="音声ファイル"
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
                <DropZone
                  label="モデル（任意）"
                  description=".pmx または .pmd で目線を自動設定"
                  accept=".pmx,.pmd"
                  icon="model"
                  file={modelFile}
                  onFileSelect={handleModelSelect}
                  onFileClear={() => {
                    setModelFile(null);
                    setModelEyeInfo(null);
                    setOptionsAndRecord((prev) => ({
                      ...prev,
                      eyeHeight: 15,
                    }), generationResult);
                  }}
                  accentColor="#a855f7"
                />
              </div>

              {/* ステータスバッジ群 */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {vmdFile && vmdParseResult && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-cyan-800/30 bg-cyan-900/10 px-2.5 py-1 text-xs text-cyan-300/80">
                    <CheckCircle2 size={13} className="text-cyan-400" />
                    <span>VMD検出済み（{vmdParseResult.boneCount}フレーム）</span>
                  </div>
                )}

                {modelFile && modelEyeInfo && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-purple-800/40 bg-purple-900/15 px-2.5 py-1 text-xs text-purple-300/90">
                    <Box size={13} className="text-purple-400" />
                    <span>
                      {modelEyeInfo.modelName}: 目線高さを自動適用（{modelEyeInfo.matchedBone} Y: {modelEyeInfo.eyeHeight}）
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. カメラワーク設定 (アコーディオン) */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/30">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="flex w-full items-center justify-between px-3.5 py-2.5"
              >
                <span className="text-xs font-semibold text-slate-200">カメラワーク設定</span>
                <ChevronDown
                  size={16}
                  className={`text-slate-500 transition-transform ${showSettings ? '' : '-rotate-90'}`}
                />
              </button>
              {showSettings && (
                <div className="border-t border-slate-700/40 p-3 max-h-[260px] overflow-y-auto">
                  <SettingsPanel
                    options={options}
                    onChange={(newOpts) => setOptionsAndRecord(newOpts, generationResult)}
                    disabled={isWorking}
                  />
                </div>
              )}
            </div>

            {/* 3. 生成 ＆ ダウンロードカード */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3 space-y-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${canGenerate
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 hover:brightness-110 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-slate-800/50 text-slate-600'
                  }`}
              >
                <Sparkles size={15} />
                {isWorking ? '生成中...' : 'カメラモーションを生成'}
              </button>

              {(!audioFile || !vmdFile) && (
                <p className="text-center text-[11px] text-slate-500">
                  {!vmdFile && !audioFile
                    ? 'VMDファイルと音声ファイルを両方アップロードしてください'
                    : !vmdFile
                      ? 'ダンスモーション（VMD）をアップロードしてください'
                      : '音声ファイルをアップロードしてください'}
                </p>
              )}

              {isWorking && (
                <ProgressBar progress={progress} label={progressLabel} status="working" />
              )}

              {phase === 'done' && generationResult && (
                <div className="flex items-center justify-between rounded-lg border border-green-800/30 bg-green-900/10 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-green-300">
                      {generationResult.cameraFrames.length}キーフレーム生成完了
                    </p>
                    <p className="text-[10px] text-green-500/70">
                      {generationResult.cuts.length}カット / VMD準備完了
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex items-center gap-1 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:brightness-110"
                  >
                    <Download size={13} />
                    VMDダウンロード
                  </button>
                </div>
              )}

              {phase === 'error' && (
                <div className="rounded-lg border border-red-800/40 bg-red-900/10 px-3 py-1.5 text-xs text-red-400">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ======================================================== */}
      {/* 3. フッター領域（生成完了時のみ固定表示）                  */}
      {/* ======================================================== */}
      {generationResult && (
        <footer className="relative z-30 shrink-0 border-t border-slate-800/80 bg-slate-900/95 px-4 py-2.5 backdrop-blur-md shadow-2xl">
          <div className="mx-auto max-w-7xl">
            <BeatTimeline
              audio={audioAnalysis}
              cuts={generationResult.cuts}
              onToggleLock={handleToggleLock}
              onChangePattern={handleChangePattern}
              onSelectCut={handleSelectCut}
              selectedCutIndex={selectedCutIndex}
              currentTime={previewTime}
              duration={previewDuration}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onSeek={handleSeek}
              onResetTime={handleResetTime}
              onSplitCut={handleSplitCut}
              onDeleteCut={handleDeleteCut}
            />
          </div>
        </footer>
      )}

      {/* ======================================================== */}
      {/* ヘルプモーダルポップアップ                                 */}
      {/* ======================================================== */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}

function SectionHeader({
  step,
  title,
  icon,
}: {
  step: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-4 w-4 items-center justify-center rounded bg-cyan-500/10 text-[10px] font-bold text-cyan-400">
        {step}
      </div>
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-200">
        {icon}
        {title}
      </div>
    </div>
  );
}