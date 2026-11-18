// ============================================================
// MMDモデル (PMX / PMD) 目線パーサー
// ============================================================

export interface ModelEyeInfo {
    /** 検出された目線の高さ (Y座標) */
    eyeHeight: number;
    /** 目線の根拠となったボーン名 */
    matchedBone: string;
    /** モデル名 */
    modelName: string;
}

/**
 * ArrayBuffer から PMX / PMD モデルの目線高さを高速抽出する
 */
export function extractModelEyeHeight(buffer: ArrayBuffer): ModelEyeInfo | null {
    const view = new DataView(buffer);
    if (buffer.byteLength < 128) return null;

    // 1. PMXフォーマットの判定 ("PMX ")
    const magic4 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic4 === 'PMX ') {
        return parsePmxDirect(view, buffer);
    }

    // 2. PMDフォーマットの判定 ("Pmd")
    const magic3 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
    if (magic3 === 'Pmd') {
        return parsePmdDirect(view, buffer);
    }

    console.warn('[Model] Unrecognized 3D model format (not PMX or PMD).');
    return null;
}

// ============================================================
// PMX パーサー (テキストエンコーディング対応 & ダイレクトスキャン)
// ============================================================

function parsePmxDirect(view: DataView, buffer: ArrayBuffer): ModelEyeInfo | null {
    const globalsCount = view.getUint8(8);
    if (globalsCount < 8) return null;

    const textEncoding = view.getUint8(9); // 0: UTF-16LE, 1: UTF-8
    const boneIndexSize = view.getUint8(9 + 5); // 1, 2, or 4

    // モデル名を取得
    let offset = 9 + globalsCount;
    const modelNameLen = view.getInt32(offset, true);
    offset += 4;
    let modelName = 'PMX Model';
    if (modelNameLen > 0 && offset + modelNameLen <= buffer.byteLength) {
        try {
            const decoder = new TextDecoder(textEncoding === 0 ? 'utf-16le' : 'utf-8');
            modelName = decoder.decode(new Uint8Array(buffer, offset, modelNameLen)).replace(/\0+$/, '').trim() || 'PMX Model';
        } catch {
            // ignore
        }
    }

    // ターゲットボーンの名称候補
    const targetNames = ['両目', '目', '左目', '右目', '頭', '首'];
    const encoder = (str: string): Uint8Array => {
        if (textEncoding === 0) {
            // UTF-16LE
            const buf = new Uint8Array(str.length * 2);
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                buf[i * 2] = code & 0xff;
                buf[i * 2 + 1] = (code >> 8) & 0xff;
            }
            return buf;
        } else {
            return new TextEncoder().encode(str);
        }
    };

    const uint8 = new Uint8Array(buffer);
    const foundBones: { name: string; y: number }[] = [];

    // PMXバイナリ全体から対象ボーンの文字列パターンを高速探索
    for (const name of targetNames) {
        const pattern = encoder(name);
        const patLen = pattern.length;
        let searchStart = 30; // ヘッダー以降

        while (searchStart < uint8.length - patLen - 20) {
            let match = true;
            for (let k = 0; k < patLen; k++) {
                if (uint8[searchStart + k] !== pattern[k]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                // パターンの手前4バイトが文字列長 (int32) と一致するか検証
                const prefixLen = view.getInt32(searchStart - 4, true);
                if (prefixLen === patLen) {
                    // ボーン名 (name) + 英語名長 (int32) + 英語名 + 位置 (vec3: float32 x, y, z)
                    const enLenOffset = searchStart + patLen;
                    if (enLenOffset + 4 < buffer.byteLength) {
                        const enLen = view.getInt32(enLenOffset, true);
                        if (enLen >= 0 && enLen < 128) {
                            const posOffset = enLenOffset + 4 + enLen;
                            if (posOffset + 12 < buffer.byteLength) {
                                const posX = view.getFloat32(posOffset, true);
                                const posY = view.getFloat32(posOffset + 4, true);
                                const posZ = view.getFloat32(posOffset + 8, true);

                                // Y座標が 3.0〜30.0 の妥当な身長範囲にあるか検証
                                if (Number.isFinite(posY) && posY > 3.0 && posY < 35.0 && Math.abs(posX) < 10.0) {
                                    foundBones.push({ name, y: posY });
                                    break; // このボーンは検出完了
                                }
                            }
                        }
                    }
                }
            }
            searchStart++;
        }
    }

    console.log('[Model] PMX scanned candidate bones:', foundBones);
    return evaluateEyeHeight(foundBones, modelName);
}

// ============================================================
// PMD パーサー
// ============================================================

function parsePmdDirect(view: DataView, buffer: ArrayBuffer): ModelEyeInfo | null {
    const decodeShiftJIS = (offset: number, length: number): string => {
        const bytes = new Uint8Array(buffer, offset, length);
        try {
            const decoder = new TextDecoder('shift-jis');
            return decoder.decode(bytes).replace(/\0+$/, '').trim();
        } catch {
            return '';
        }
    };

    const modelName = decodeShiftJIS(7, 20) || 'PMD Model';
    let offset = 7 + 20 + 256;

    try {
        const vertexCount = view.getUint32(offset, true);
        offset += 4 + vertexCount * 38;

        const surfaceCount = view.getUint32(offset, true);
        offset += 4 + surfaceCount * 2;

        const materialCount = view.getUint32(offset, true);
        offset += 4 + materialCount * 70;

        const boneCount = view.getUint16(offset, true);
        offset += 2;

        const bones: { name: string; y: number }[] = [];
        for (let i = 0; i < boneCount; i++) {
            const name = decodeShiftJIS(offset, 20);
            const posY = view.getFloat32(offset + 20 + 2 + 2 + 1 + 2 + 4, true);
            bones.push({ name, y: posY });
            offset += 39;
        }

        return evaluateEyeHeight(bones, modelName);
    } catch (e) {
        console.error('[Model] PMD parse error:', e);
        return null;
    }
}

// ============================================================
// 優先度評価
// ============================================================

function evaluateEyeHeight(bones: { name: string; y: number }[], modelName: string): ModelEyeInfo | null {
    // 1. 両目・目 (最優先)
    const eye = bones.find((b) => b.name === '両目' || b.name === '目');
    if (eye) {
        return { eyeHeight: parseFloat(eye.y.toFixed(2)), matchedBone: eye.name, modelName };
    }

    // 2. 左目・右目
    const singleEye = bones.find((b) => b.name === '左目' || b.name === '右目');
    if (singleEye) {
        return { eyeHeight: parseFloat(singleEye.y.toFixed(2)), matchedBone: singleEye.name, modelName };
    }

    // 3. 頭 (+0.8 で推定)
    const head = bones.find((b) => b.name === '頭');
    if (head) {
        return { eyeHeight: parseFloat((head.y + 0.8).toFixed(2)), matchedBone: '頭 (+0.8推定)', modelName };
    }

    // 4. 首 (+1.8 で推定)
    const neck = bones.find((b) => b.name === '首');
    if (neck) {
        return { eyeHeight: parseFloat((neck.y + 1.8).toFixed(2)), matchedBone: '首 (+1.8推定)', modelName };
    }

    return null;
}