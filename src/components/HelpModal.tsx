import type React from 'react';
import { useEffect } from 'react';
import { X, HelpCircle, Scissors, Lock, Undo2, Play, Sparkles, Shield, Code } from 'lucide-react';
import packageJson from '../../package.json';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * アプリの使い方、カメラワーク一覧、キーボードショートカット、バージョン＆ライセンス情報を案内するモーダル
 */
export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fadeIn">
      {/* モーダル本体ボックス */}
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
              <HelpCircle size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                使い方 ＆ ガイド
                <span className="rounded bg-cyan-950 px-1.5 py-0.2 text-[10px] font-mono text-cyan-400 border border-cyan-800/50">
                  v{packageJson.version}
                </span>
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        {/* モーダルコンテンツ（スクロール可能） */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {/* セクション1: 基本のワークフロー */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
              <Sparkles size={15} />
              基本のワークフロー
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
              <li><strong className="text-slate-200">ファイル入力:</strong> ダンスモーション（.vmd）と音楽ファイル（.wav / .mp3）をアップロードします。（※必要に応じてお好みでPMXモデルも指定可能）</li>
              <li><strong className="text-slate-200">生成:</strong> 「カメラモーションを生成」ボタンを押すと、ビートに合わせて自動でカット割りとカメラワークが構築されます。</li>
              <li><strong className="text-slate-200">プレビュー確認:</strong> 画面左上の3Dモニターで、音楽と3D棒人間の動きをリアルタイムに確認できます。</li>
              <li><strong className="text-slate-200">微調整・編集:</strong> 気に入らないカットのパターンを変更したり、「✂ 分割」や「🔒 固定」、「Undo/Redo (Ctrl+Z)」で自分好みに追い込みます。</li>
              <li><strong className="text-slate-200">保存・ダウンロード:</strong> 完成したらVMDをダウンロードしてMMDへ読み込ませます。作業状態をJSONで「保存」することも可能です。</li>
            </ol>
          </section>

          {/* セクション2: 便利なキーボードショートカット */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
              <Play size={15} />
              キーボードショートカット
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                <span className="text-slate-400">再生 / 一時停止</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 border border-slate-700">Space</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                <span className="text-slate-400">1フレームコマ戻し</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 border border-slate-700">← 矢印キー</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                <span className="text-slate-400">1フレームコマ送り</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 border border-slate-700">→ 矢印キー</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                <span className="text-slate-400">直前の操作に戻す (Undo)</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 border border-slate-700">Ctrl + Z</kbd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                <span className="text-slate-400">やり直す (Redo)</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 border border-slate-700">Ctrl + Y / Ctrl+Shift+Z</kbd>
              </div>
            </div>
          </section>

          {/* セクション3: タイムライン編集のコツ */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5">
              <Scissors size={15} />
              タイムライン編集のコツ
            </h3>
            <ul className="space-y-1.5 text-slate-400 pl-1">
              <li>• <strong className="text-slate-200">ワンクリックジャンプ:</strong> タイムライン上のカードや時間軸のバーをクリックすると、プレビューが一瞬でそのシーンへワープします。</li>
              <li>• <strong className="text-slate-200"><Lock size={11} className="inline text-cyan-400 mx-0.5" /> 固定（ロック）:</strong> 「固定する」を押すと、再生成（リロール）ボタンを押してもそのカットのアングルが維持されます。</li>
              <li>• <strong className="text-slate-200"><Scissors size={11} className="inline text-cyan-400 mx-0.5" /> 分割と結合:</strong> 再生位置を合わせて「ここで分割」を押すとカットを増やせます。カードのゴミ箱アイコンで前のカットと結合できます。</li>
            </ul>
          </section>

          {/* セクション4: カメラワークパターン解説 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-cyan-400">カメラワークパターン全10種</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">引き（wide）:</strong><br /> 縦画面いっぱいに全身のダンスを収めるフルショット
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">寄り（closeup）:</strong><br /> 表情に完全ロックオンするアイキャッチ（冒頭確定）
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">斜め俯瞰（highangle）:</strong><br /> 上空から見下ろす立体的なショット
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">ローアングル（lowangle）:</strong><br /> 床スレスレから全身を捉えるダイナミック煽り
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">オービット（orbit）:</strong><br /> 斜め前を優雅に回り込むバストアップ旋回
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">ドリー（dolly）:</strong><br /> 全身から顔元へ真っ直ぐ迫る・引くムービング
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">ダッチアングル（dutch）:</strong><br /> 斜めに傾きながら迫る疾走感エモショット
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">ティルトアップ（tilt）:</strong><br /> 脚部から顔の表情へ駆け上がる見上げ
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">スナップドリー（snap）:</strong><br /> 0.1秒で顔面へ急接近するアタックショット
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                <strong className="text-slate-200">スライド（slide）:</strong><br /> 画面外から流れて通り抜けるトラッキング
              </div>
            </div>
          </section>

          {/* セクション5: バージョン ＆ ライセンス情報 【新設】 */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Shield size={14} className="text-cyan-400" />
              バージョン ＆ ライセンス
            </h3>
            <div className="space-y-1 text-[11px] text-slate-400 leading-relaxed">
              <p>
                <strong className="text-slate-300">VMD Camera Generator</strong> (v{packageJson.version})<br />
                Developed by <span className="text-cyan-300 font-medium">taka23</span>
              </p>
              <p className="pt-1">
                本ソフトウェアのソースコードは <strong className="text-slate-300">MIT License</strong> のもとでオープンソースとして公開されています。<br />
                生成されたカメラモーション（.vmd）の商用・非商用利用、改変、再配布は自由に行っていただけます。<br />
                公開・再配布時は `VMD Camera Generator (taka23)` のクレジット表記をお願いします。
              </p>
            </div>
          </section>
        </div>

        {/* モーダルフッター */}
        <div className="flex items-center justify-end border-t border-slate-800 px-6 py-3 bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}