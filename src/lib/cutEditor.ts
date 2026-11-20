import type { CameraPattern, CutInfo } from '@/types';

const FPS = 30;
/** 分割時に許容する最小カットフレーム数 (これより短い分割は防止) */
const MIN_SPLIT_FRAMES = 8;

// ============================================================
// カット手動編集ロジック (Cut Editor Business Logic)
// ============================================================

/**
 * 指定したフレーム番号の位置で、該当するカットを2つに分割（スプリット）する
 *
 * @param cuts - 現在のカットリスト
 * @param splitFrame - 分割するフレーム番号
 * @param totalFrames - 動画の総フレーム数
 * @param availablePatterns - 使用可能なカメラパターン一覧
 * @returns 分割後の新しいカットリスト（分割不可の場合は null）
 */
export function splitCutAtFrame(
    cuts: CutInfo[],
    splitFrame: number,
    totalFrames: number,
    availablePatterns: CameraPattern[]
): CutInfo[] | null {
    if (cuts.length === 0) return null;

    // 分割対象となるカットを探索
    let targetIndex = -1;
    for (let i = 0; i < cuts.length; i++) {
        const startF = cuts[i].frame;
        const endF = i + 1 < cuts.length ? cuts[i + 1].frame : totalFrames;

        // 前後に最低フレーム以上の余裕があるか検証
        if (splitFrame >= startF + MIN_SPLIT_FRAMES && splitFrame <= endF - MIN_SPLIT_FRAMES) {
            targetIndex = i;
            break;
        }
    }

    // 適切な分割ポイントが見つからない場合は処理を中断
    if (targetIndex === -1) {
        return null;
    }

    const prevCut = cuts[targetIndex];

    // 直前のパターンと重複しない新しいパターンを候補から選定
    const candidatePatterns = availablePatterns.filter((p) => p !== prevCut.pattern);
    const newPattern: CameraPattern =
        candidatePatterns.length > 0
            ? candidatePatterns[Math.floor(Math.random() * candidatePatterns.length)]
            : prevCut.pattern === 'wide'
                ? 'closeup'
                : 'wide';

    const newCut: CutInfo = {
        index: targetIndex + 1,
        time: parseFloat((splitFrame / FPS).toFixed(3)),
        frame: splitFrame,
        pattern: newPattern,
        isLocked: false,
    };

    // 配列の該当位置に新しいカットを挿入
    const nextCuts = [...cuts];
    nextCuts.splice(targetIndex + 1, 0, newCut);

    return reindexCuts(nextCuts);
}

/**
 * 指定したインデックスのカットを削除し、前のカットと結合（マージ）する
 *
 * @param cuts - 現在のカットリスト
 * @param targetIndex - 削除・結合するカットのインデックス
 * @returns 結合後の新しいカットリスト（削除不可の場合は null）
 */
export function removeCutAndMerge(cuts: CutInfo[], targetIndex: number): CutInfo[] | null {
    // 第1カット(0フレーム)の削除や、カット総数が1以下の場合は結合不可
    if (targetIndex <= 0 || targetIndex >= cuts.length || cuts.length <= 1) {
        return null;
    }

    const nextCuts = cuts.filter((_, idx) => idx !== targetIndex);
    return reindexCuts(nextCuts);
}

/**
 * カットの開始時刻をフレーム単位で前後に微調整（スリップ）する
 *
 * @param cuts - 現在のカットリスト
 * @param targetIndex - 微調整するカットのインデックス
 * @param deltaFrames - 移動フレーム数 (+1, -1 など)
 * @param totalFrames - 動画の総フレーム数
 * @returns 調整後の新しいカットリスト
 */
export function adjustCutTiming(
    cuts: CutInfo[],
    targetIndex: number,
    deltaFrames: number,
    totalFrames: number
): CutInfo[] | null {
    // 第1カットは0フレーム固定のため移動不可
    if (targetIndex <= 0 || targetIndex >= cuts.length) return null;

    const currentCut = cuts[targetIndex];
    const prevCut = cuts[targetIndex - 1];
    const nextCut = targetIndex + 1 < cuts.length ? cuts[targetIndex + 1] : null;

    const newFrame = currentCut.frame + deltaFrames;

    // 前後のカットとの最小間隔を保証
    const minAllowed = prevCut.frame + MIN_SPLIT_FRAMES;
    const maxAllowed = nextCut ? nextCut.frame - MIN_SPLIT_FRAMES : totalFrames - MIN_SPLIT_FRAMES;

    if (newFrame < minAllowed || newFrame > maxAllowed) {
        return null; // 限界を超えている場合は移動不可
    }

    const nextCuts = cuts.map((c, idx) =>
        idx === targetIndex
            ? { ...c, frame: newFrame, time: parseFloat((newFrame / FPS).toFixed(3)), isLocked: true }
            : c
    );

    return nextCuts;
}

/**
 * カット配列の index を 0 からの連番に綺麗に再採番する
 */
export function reindexCuts(cuts: CutInfo[]): CutInfo[] {
    return cuts.map((cut, idx) => ({
        ...cut,
        index: idx,
    }));
}