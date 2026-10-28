import type { BoneFrame, CameraFrame, VMDParseResult } from '@/types';

// ============================================================
// VMDバイナリフォーマット定数
// ============================================================

/** VMDヘッダーのバイトサイズ ("Vocaloid Motion Data 0002\0...") */
const VMD_HEADER_SIZE = 30;

/** モデル名領域のバイトサイズ (カメラVMD時は「カメラ・照明」が格納される) */
const VMD_MODEL_NAME_SIZE = 20;

/** 1ボーンキーフレームのバイトサイズ (名前15 + フレーム4 + 位置12 + 回転16 + 補間64 = 111) */
const BONE_RECORD_SIZE = 111;

/** 1カメラキーフレームのバイトサイズ (フレーム4 + 距離4 + 位置12 + 回転12 + 補間24 + FOV4 + パース1 = 61) */
const CAMERA_RECORD_SIZE = 61;

// ============================================================
// ユーティリティ関数群
// ============================================================

/**
 * Shift_JISバイト配列を文字列へデコード（ヌル終端文字 \0 を自動除去）
 *
 * @param buffer - デコード対象のバイト配列
 * @returns デコードされた文字列
 */
function decodeShiftJIS(buffer: Uint8Array): string {
  try {
    const decoder = new TextDecoder('shift-jis');
    return decoder.decode(buffer).replace(/\0+$/, '');
  } catch {
    // TextDecoder非対応環境向けのASCIIフォールバック
    let str = '';
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) break;
      str += String.fromCharCode(buffer[i]);
    }
    return str;
  }
}

/**
 * DataViewから指定バイト長のShift_JIS文字列を読み出す
 */
function readFixedString(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return decodeShiftJIS(bytes);
}

/**
 * 単純な線形補間 (Lerp)
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================================
// VMDパース処理 (Read)
// ============================================================

/**
 * VMDバイナリからボーンキーフレームデータを解析し、フレーム昇順でソートして取得する
 * （20万件規模の大容量ファイルでもキャッシュを用いて高速に処理）
 *
 * @param buffer - 読み込んだVMDファイルのArrayBuffer
 * @returns パース結果オブジェクト（ボーン別フレーム配列、総フレーム数など）
 */
export function parseVMD(buffer: ArrayBuffer): VMDParseResult {
  const view = new DataView(buffer);

  // 1. ヘッダーチェック (先頭30バイト)
  let headerValid = false;
  if (buffer.byteLength >= 50) {
    const headerStr = readFixedString(view, 0, Math.min(VMD_HEADER_SIZE, buffer.byteLength));
    if (headerStr.includes('Vocaloid Motion Data')) {
      headerValid = true;
    }
  }

  if (!headerValid) {
    console.warn('[VMD] Header is unrecognized or file too small.');
    return {
      data: { boneFrames: {}, cameraFrames: [], morphFrames: {} },
      warnings: ['Unrecognized VMD header'],
      headerValid: false,
      boneCount: 0,
      hasBoneData: false,
      lastFrameNumber: 0,
    };
  }

  // 2. ボーンキーフレーム数の読み取り (オフセット 50バイト目)
  let offset = 50;
  const boneCount = view.getUint32(offset, true);
  offset += 4;

  const boneFrames: Record<string, BoneFrame[]> = {};
  let lastFrameNumber = 0;

  const maxAvailableRecords = Math.floor((buffer.byteLength - offset) / BONE_RECORD_SIZE);
  const actualBoneCount = Math.min(boneCount, maxAvailableRecords);

  // ボーン名のShift_JISデコード高速化キャッシュ
  const nameCache = new Map<string, string>();

  for (let i = 0; i < actualBoneCount; i++) {
    const recordOffset = offset + i * BONE_RECORD_SIZE;

    // ボーン名 (15バイト)
    let cacheKey = '';
    for (let k = 0; k < 15; k++) {
      const b = view.getUint8(recordOffset + k);
      if (b === 0) break;
      cacheKey += String.fromCharCode(b);
    }

    let boneName = nameCache.get(cacheKey);
    if (boneName === undefined) {
      const nameBytes = new Uint8Array(buffer, recordOffset, 15);
      boneName = decodeShiftJIS(nameBytes);
      nameCache.set(cacheKey, boneName);
    }

    // フレーム番号 (Uint32)
    const frameNumber = view.getUint32(recordOffset + 15, true);

    // 平行移動位置 (Float32 x, y, z)
    const x = view.getFloat32(recordOffset + 19, true);
    const y = view.getFloat32(recordOffset + 23, true);
    const z = view.getFloat32(recordOffset + 27, true);

    // 回転クォータニオン (Float32 rx, ry, rz, rw)
    const rx = view.getFloat32(recordOffset + 31, true);
    const ry = view.getFloat32(recordOffset + 35, true);
    const rz = view.getFloat32(recordOffset + 39, true);
    const rw = view.getFloat32(recordOffset + 43, true);

    if (frameNumber > lastFrameNumber) {
      lastFrameNumber = frameNumber;
    }

    if (!boneFrames[boneName]) {
      boneFrames[boneName] = [];
    }

    boneFrames[boneName].push({
      frameNumber,
      position: { x, y, z },
      rotation: { x: rx, y: ry, z: rz, w: rw },
      interpolation: [], // カメラ追従では不要のため空配列にしてメモリ節約
    });
  }

  // getBonePositionAtFrame の二分探索を成立させるため、各ボーンをフレーム昇順にソート
  for (const name of Object.keys(boneFrames)) {
    boneFrames[name].sort((a, b) => a.frameNumber - b.frameNumber);
  }

  console.log(`[VMD] Parsed ${actualBoneCount} bone frames across ${Object.keys(boneFrames).length} bones. Last frame: ${lastFrameNumber}`);

  return {
    data: {
      boneFrames,
      cameraFrames: [],
      morphFrames: {},
    },
    warnings: [],
    headerValid: true,
    boneCount: actualBoneCount,
    hasBoneData: actualBoneCount > 0,
    lastFrameNumber,
  };
}

/**
 * 二分探索を用いて、指定フレームにおけるボーンのワールド座標を線形補間して取得
 *
 * @param boneFrames - フレーム昇順にソートされたボーンキーフレーム配列
 * @param frameNumber - 取得対象のフレーム番号
 * @returns 補間されたXYZ座標（フレームが存在しない場合は null）
 */
export function getBonePositionAtFrame(
  boneFrames: BoneFrame[],
  frameNumber: number
): { x: number; y: number; z: number } | null {
  if (boneFrames.length === 0) return null;

  // 範囲外のガード
  if (frameNumber <= boneFrames[0].frameNumber) {
    return boneFrames[0].position;
  }
  if (frameNumber >= boneFrames[boneFrames.length - 1].frameNumber) {
    return boneFrames[boneFrames.length - 1].position;
  }

  // 二分探索 (O(log N)) で挟み込む区間を特定
  let lo = 0;
  let hi = boneFrames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (boneFrames[mid].frameNumber <= frameNumber) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = boneFrames[lo];
  const b = boneFrames[hi];
  const span = b.frameNumber - a.frameNumber;
  const t = span === 0 ? 0 : (frameNumber - a.frameNumber) / span;

  return {
    x: lerp(a.position.x, b.position.x, t),
    y: lerp(a.position.y, b.position.y, t),
    z: lerp(a.position.z, b.position.z, t),
  };
}

// ============================================================
// VMD書き出し処理 (Write)
// ============================================================

/**
 * 生成されたカメラキーフレーム配列を、MMD規格準拠のバイナリArrayBufferへ変換
 *
 * @param cameraFrames - 生成されたカメラキーフレーム配列
 * @returns MMDで読み込み可能なVMDバイナリのArrayBuffer
 */
export function writeCameraVMD(cameraFrames: CameraFrame[]): ArrayBuffer {
  const totalFrames = cameraFrames.length;

  // ヘッダー(30) + モデル名(20) + ボーン数(4) + モーフ数(4) + カメラ数(4) + レコード群(61*N) + 照明等フッター(12)
  const bufferSize = VMD_HEADER_SIZE + VMD_MODEL_NAME_SIZE + 4 + 4 + 4 + (CAMERA_RECORD_SIZE * totalFrames) + 4 + 4 + 4;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // 1. ヘッダーマジック "Vocaloid Motion Data 0002" (30バイト)
  const magic = 'Vocaloid Motion Data 0002';
  for (let i = 0; i < 30; i++) {
    view.setUint8(i, i < magic.length ? magic.charCodeAt(i) : 0);
  }

  // 2. モデル名領域: 「カメラ・照明」のShift_JISバイト配列 (20バイト)
  const sjisCameraLighting = [131, 74, 131, 129, 131, 137, 129, 69, 143, 198, 150, 190];
  for (let i = 0; i < 20; i++) {
    view.setUint8(30 + i, i < sjisCameraLighting.length ? sjisCameraLighting[i] : 0);
  }

  // 3. カウント領域
  view.setUint32(50, 0, true);            // ボーンキーフレーム数 = 0
  view.setUint32(54, 0, true);            // モーフキーフレーム数 = 0
  view.setUint32(58, totalFrames, true);  // カメラキーフレーム数

  // 4. カメラキーフレームの書き込み (1件あたり61バイト)
  let offset = 62;
  const defaultInterpolation = defaultCameraInterpolation();

  for (let i = 0; i < totalFrames; i++) {
    const key = cameraFrames[i];

    view.setUint32(offset + 0, Math.round(key.frameNumber), true);
    view.setFloat32(offset + 4, -Math.abs(key.distance || 45.0), true); // MMD規格: 前方は必ず負の数
    view.setFloat32(offset + 8, key.position.x || 0, true);
    view.setFloat32(offset + 12, key.position.y || 10, true);
    view.setFloat32(offset + 16, key.position.z || 0, true);
    view.setFloat32(offset + 20, -(key.rotation.x || 0), true);          // MMD規格: X軸回転は符号反転
    view.setFloat32(offset + 24, key.rotation.y || 0, true);
    view.setFloat32(offset + 28, key.rotation.z || 0, true);

    // 補間曲線 (24バイト)
    for (let j = 0; j < 24; j++) {
      const val = (key.interpolation && key.interpolation[j] !== undefined)
        ? key.interpolation[j]
        : defaultInterpolation[j];
      view.setUint8(offset + 32 + j, val);
    }

    view.setUint32(offset + 56, Math.round(key.fov) || 30, true);
    view.setUint8(offset + 60, key.perspective === 1 ? 1 : 0);

    offset += CAMERA_RECORD_SIZE;
  }

  // 5. 末尾のフッター領域 (各4バイト、すべて0)
  view.setUint32(offset + 0, 0, true);  // 照明キーフレーム数
  view.setUint32(offset + 4, 0, true);  // セルフ影キーフレーム数
  view.setUint32(offset + 8, 0, true);  // IKキーフレーム数

  return buffer;
}

// ============================================================
// 補間曲線プリセット (Interpolation Curves)
// MMD規格: [X1, X2, Y1, Y2] (0〜127) × 6種 = 計24バイト
// ============================================================

const INTERP_POSITION = [32, 95, 0, 127];   // なだらかなS字 (位置 X/Y/Z)
const INTERP_ROTATION = [45, 82, 10, 117];  // 滑らかに追従するS字 (回転)
const INTERP_DISTANCE = [25, 102, 0, 127];  // じわっと動くS字 (距離)
const INTERP_FOV = [32, 95, 0, 127];       // 視野角

/**
 * カット内のスムーズなカメラ移動に使用するS字補間曲線（24バイト配列）
 */
export function defaultCameraInterpolation(): number[] {
  return [
    ...INTERP_POSITION,  // X
    ...INTERP_POSITION,  // Y
    ...INTERP_POSITION,  // Z
    ...INTERP_ROTATION,  // 回転
    ...INTERP_DISTANCE,  // 距離
    ...INTERP_FOV,       // 視野角
  ];
}

/**
 * 次のカットへの瞬間切り替え（ハードカット）に使用する等速・直線補間（24バイト配列）
 */
export function linearCameraInterpolation(): number[] {
  const linear = [0, 127, 0, 127];
  return [...linear, ...linear, ...linear, ...linear, ...linear, ...linear];
}
