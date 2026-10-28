import type { AudioAnalysisResult } from '@/types';

// ============================================================
// 定数定義
// ============================================================

/** RMSエネルギー解析のサンプリング間隔 (20ミリ秒 = 50Hz) */
const WINDOW_DURATION_SEC = 0.02;

// ============================================================
// 内部アルゴリズム関数群
// ============================================================

/**
 * 適応型しきい値（Adaptive Threshold）を用いて、エネルギー曲線からビートのピーク時刻を検出
 *
 * @param energy - 20msごとの正規化された音量エネルギー配列 (0.0〜1.0)
 * @param hopSize - ウィンドウ移動サンプル数
 * @param sensitivity - 感度 (0.0〜1.0、高いほど微小なピークも検出)
 * @param minIntervalSec - 検出するピーク間の最小間隔（秒）
 * @param sampleRate - 音声サンプリングレート (Hz)
 * @returns 検出されたビートの発生時刻配列（秒単位）
 */
function detectPeaks(
  energy: number[],
  hopSize: number,
  sensitivity: number,
  minIntervalSec: number,
  sampleRate: number
): number[] {
  if (energy.length === 0) return [];

  // 周辺の平均音量を計算するためのウィンドウサイズ（全体の約5%）
  const windowSize = Math.max(10, Math.floor(energy.length * 0.05));
  const thresholdMul = 1.0 - sensitivity * 0.6; // 感度が高いほどしきい値を下げる
  const peaks: number[] = [];

  for (let i = 1; i < energy.length - 1; i++) {
    // 極大値（前後の値より大きい点）かどうかの判定
    if (energy[i] <= energy[i - 1] || energy[i] <= energy[i + 1]) continue;

    // 前後ウィンドウの局所平均音量を算出
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - windowSize);
    const end = Math.min(energy.length - 1, i + windowSize);
    for (let j = start; j <= end; j++) {
      sum += energy[j];
      count++;
    }
    const avg = sum / count;

    // 局所平均 × 感度しきい値を超えており、かつ絶対音量が一定以上ある場合にピーク判定
    if (energy[i] > avg * thresholdMul && energy[i] > 0.01) {
      const timeSec = (i * hopSize) / sampleRate;

      // 最小間隔の制約を遵守（直前のピークから一定時間空いているか）
      if (peaks.length === 0 || timeSec - peaks[peaks.length - 1] >= minIntervalSec) {
        peaks.push(timeSec);
      }
    }
  }

  return peaks;
}

/**
 * 検出されたビート間隔の中央値から、楽曲の全体BPMを推定
 *
 * @param peaks - ビートのピーク時刻配列（秒）
 * @returns 推定BPM (60〜180の標準的なレンジに正規化)
 */
function estimateBPM(peaks: number[]): number {
  if (peaks.length < 2) return 120;

  // ビート間の時間間隔（秒）を収集
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  // 外れ値に強い中央値（Median）を採用
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];

  if (median <= 0) return 120;

  let bpm = 60 / median;

  // 一般的な音楽レンジ (60〜180) に倍数/約数で正規化
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return Math.round(bpm);
}

// ============================================================
// メイン解析エントリーポイント
// ============================================================

/**
 * 音声ファイル (WAV/MP3) をWeb Audio APIでデコード・解析し、
 * ビート時刻、BPM、20msごとのRMSエネルギー曲線を算出する
 *
 * @param file - ユーザーがアップロードした音声ファイル
 * @param sensitivity - ビート検出感度 (0.0〜1.0)
 * @param minIntervalSec - カット間の最小間隔（秒）
 * @param onProgress - 進捗コールバック (0.0〜1.0)
 * @returns 解析結果オブジェクト (AudioAnalysisResult)
 */
export async function analyzeAudio(
  file: File,
  sensitivity: number,
  minIntervalSec: number,
  onProgress?: (progress: number) => void
): Promise<AudioAnalysisResult> {
  const arrayBuffer = await file.arrayBuffer();

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  try {
    // 1. Web Audio API によるデコード
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    const channelData = audioBuffer.getChannelData(0);

    // 2. ステレオの場合はモノラルへダウンミックス
    let monoData: Float32Array;
    if (audioBuffer.numberOfChannels > 1) {
      monoData = new Float32Array(channelData.length);
      const ch2 = audioBuffer.getChannelData(1);
      for (let i = 0; i < channelData.length; i++) {
        monoData[i] = (channelData[i] + ch2[i]) * 0.5;
      }
    } else {
      monoData = channelData;
    }

    // 3. 20msごとのウィンドウに区切ってRMS（二乗平均平方根）エネルギーを計算
    const windowSize = Math.floor(sampleRate * WINDOW_DURATION_SEC);
    const hopSize = windowSize;
    const numWindows = Math.floor(monoData.length / hopSize);

    const energy: number[] = [];
    let maxEnergy = 0;

    for (let w = 0; w < numWindows; w++) {
      const start = w * hopSize;
      const end = Math.min(start + windowSize, monoData.length);
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += monoData[i] * monoData[i];
      }
      const rms = Math.sqrt(sum / (end - start));
      energy.push(rms);
      if (rms > maxEnergy) maxEnergy = rms;

      if (onProgress && w % 100 === 0) {
        onProgress((w / numWindows) * 0.5);
      }
    }

    // 4. 最大音量を 1.0 として正規化 (0.0〜1.0)
    if (maxEnergy > 0) {
      for (let i = 0; i < energy.length; i++) {
        energy[i] = energy[i] / maxEnergy;
      }
    }

    onProgress?.(0.6);

    // 5. ピーク（ビート）の検出
    const peaks = detectPeaks(energy, hopSize, sensitivity, minIntervalSec, sampleRate);
    onProgress?.(0.8);

    // 6. BPMの推定
    const bpm = estimateBPM(peaks);
    onProgress?.(1.0);

    return {
      bpm,
      duration,
      peakTimes: peaks,
      energyCurve: energy,
      sampleRate,
    };
  } finally {
    // 処理完了時、またはエラー発生時に確実にオーディオコンテキストを解放
    await audioCtx.close();
  }
}
