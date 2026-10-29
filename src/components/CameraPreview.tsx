import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Play, Pause, RotateCcw, Eye, Video } from 'lucide-react';
import type { CameraFrame, VMDData, CutInfo } from '@/types';

const FPS = 30;

// ============================================================
// コンポーネント Props 定義
// ============================================================

interface CameraPreviewProps {
  /** 音声ファイル */
  audioFile: File | null;
  /** パース済みVMDデータ */
  vmdData: VMDData | null;
  /** 生成されたカメラフレーム配列 */
  cameraFrames: CameraFrame[];
  /** カット一覧 */
  cuts: CutInfo[];
  /** 外部からのシーク（ジャンプ）要求 */
  seekRequest?: { time: number; nonce: number } | null;
}

// ============================================================
// 標準MMD骨格の初期ボーンツリー定義
// ============================================================

interface BoneNodeDef {
  name: string;
  matchPatterns: RegExp[];
  offset: [number, number, number];
  children?: BoneNodeDef[];
}

const SKELETON_DEF: BoneNodeDef = {
  name: '全ての親',
  matchPatterns: [/^全ての親$/i, /^すべての親$/i, /^parent$/i, /^root$/i],
  offset: [0, 0, 0],
  children: [
    {
      name: 'センター',
      matchPatterns: [/^センター$/i, /^center$/i],
      offset: [0, 8.5, 0],
      children: [
        {
          name: '下半身',
          matchPatterns: [/^下半身$/i, /^lowerbody$/i],
          offset: [0, 0, 0],
          children: [
            {
              name: '左足',
              matchPatterns: [/^左足$/i, /^leftleg$/i],
              offset: [1.1, -1.0, 0],
              children: [
                {
                  name: '左ひざ',
                  matchPatterns: [/^左ひざ$/i, /^左膝$/i, /^leftknee$/i],
                  offset: [0, -3.8, 0],
                  children: [
                    {
                      name: '左足首',
                      matchPatterns: [/^左足首$/i, /^leftankle$/i],
                      offset: [0, -3.6, 0.4],
                    },
                  ],
                },
              ],
            },
            {
              name: '右足',
              matchPatterns: [/^右足$/i, /^rightleg$/i],
              offset: [-1.1, -1.0, 0],
              children: [
                {
                  name: '右ひざ',
                  matchPatterns: [/^右ひざ$/i, /^右膝$/i, /^rightknee$/i],
                  offset: [0, -3.8, 0],
                  children: [
                    {
                      name: '右足首',
                      matchPatterns: [/^右足首$/i, /^rightankle$/i],
                      offset: [0, -3.6, 0.4],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: '上半身',
          matchPatterns: [/^上半身$/i, /^upperbody$/i],
          offset: [0, 1.8, 0],
          children: [
            {
              name: '上半身2',
              matchPatterns: [/^上半身2$/i, /^upperbody2$/i],
              offset: [0, 1.8, 0],
              children: [
                {
                  name: '首',
                  matchPatterns: [/^首$/i, /^neck$/i],
                  offset: [0, 1.4, 0],
                  children: [
                    {
                      name: '頭',
                      matchPatterns: [/^頭$/i, /^head$/i],
                      offset: [0, 1.2, 0],
                    },
                  ],
                },
                {
                  name: '左肩',
                  matchPatterns: [/^左肩$/i, /^leftshoulder$/i],
                  offset: [0.9, 1.2, 0],
                  children: [
                    {
                      name: '左腕',
                      matchPatterns: [/^左腕$/i, /^leftarm$/i],
                      offset: [1.3, 0, 0],
                      children: [
                        {
                          name: '左ひざ',
                          matchPatterns: [/^左ひじ$/i, /^左肘$/i, /^leftelbow$/i],
                          offset: [2.6, 0, 0],
                          children: [
                            {
                              name: '左手首',
                              matchPatterns: [/^左手首$/i, /^leftwrist$/i],
                              offset: [2.2, 0, 0],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  name: '右肩',
                  matchPatterns: [/^右肩$/i, /^rightshoulder$/i],
                  offset: [-0.9, 1.2, 0],
                  children: [
                    {
                      name: '右腕',
                      matchPatterns: [/^右腕$/i, /^rightarm$/i],
                      offset: [-1.3, 0, 0],
                      children: [
                        {
                          name: '右ひじ',
                          matchPatterns: [/^右ひじ$/i, /^右肘$/i, /^rightelbow$/i],
                          offset: [-2.6, 0, 0],
                          children: [
                            {
                              name: '右手首',
                              matchPatterns: [/^右手首$/i, /^rightwrist$/i],
                              offset: [-2.2, 0, 0],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ============================================================
// メインプレビューコンポーネント
// ============================================================

export function CameraPreview({ audioFile, vmdData, cameraFrames, cuts, seekRequest }: CameraPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState<'camera' | 'free'>('camera');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mainCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const freeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetGroupRef = useRef<THREE.Group | null>(null);
  const cameraHelperRef = useRef<THREE.CameraHelper | null>(null);
  const targetMarkerRef = useRef<THREE.Mesh | null>(null);
  const boneMapRef = useRef<Map<string, { bone: THREE.Bone; keyframes: any[] }>>(new Map());

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // 外部からのジャンプ要求（タイムラインクリック時など）を処理
  useEffect(() => {
    if (!seekRequest) return;
    const targetTime = Math.max(0, Math.min(seekRequest.time, duration || 9999));
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  }, [seekRequest, duration]);

  // ============================================================
  // 1. Three.js シーンの初期化
  // ============================================================
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070a11');
    sceneRef.current = scene;

    // グリッド床
    const gridHelper = new THREE.GridHelper(70, 50, 0x22d3ee, 0x1e293b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x22d3ee, 1.2);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    // --------------------------------------------------------
    // 生成カメラ機構（Target-Camera）
    // --------------------------------------------------------
    const targetGroup = new THREE.Group();
    scene.add(targetGroup);
    targetGroupRef.current = targetGroup;

    // 注視点マーカー（ピンク球体：ディレクターズ視点時のみ表示）
    const markerGeom = new THREE.SphereGeometry(0.5, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xec4899, wireframe: true });
    const targetMarker = new THREE.Mesh(markerGeom, markerMat);
    targetGroup.add(targetMarker);
    targetMarkerRef.current = targetMarker;

    const mainCam = new THREE.PerspectiveCamera(30, width / height, 0.5, 300);
    targetGroup.add(mainCam);
    mainCameraRef.current = mainCam;

    // 【新設】カメラ視錐台ヘルパー（ディレクターズ視点時にカメラの四角錐枠を描画）
    const camHelper = new THREE.CameraHelper(mainCam);
    scene.add(camHelper);
    cameraHelperRef.current = camHelper;

    // 自由視点（ディレクターズカメラ：引きの鳥瞰）
    const freeCam = new THREE.PerspectiveCamera(45, width / height, 0.5, 300);
    freeCam.position.set(0, 22, 65);
    freeCam.lookAt(0, 9, 0);
    freeCameraRef.current = freeCam;

    // レンダラー
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // --------------------------------------------------------
    // ボーン階層（サイバー骨格）の構築
    // --------------------------------------------------------
    const boneMap = new Map<string, { bone: THREE.Bone; keyframes: any[] }>();
    const allBones: THREE.Bone[] = [];

    const buildBone = (nodeDef: BoneNodeDef, parent: THREE.Object3D | null): THREE.Bone => {
      const bone = new THREE.Bone();
      bone.name = nodeDef.name;
      bone.position.set(...nodeDef.offset);

      if (parent) parent.add(bone);
      else scene.add(bone);

      allBones.push(bone);

      let matchedFrames: any[] = [];
      if (vmdData?.boneFrames) {
        for (const rawName of Object.keys(vmdData.boneFrames)) {
          const clean = rawName.replace(/\0/g, '').trim();
          if (nodeDef.matchPatterns.some((p) => p.test(clean))) {
            matchedFrames = vmdData.boneFrames[rawName];
            break;
          }
        }
      }
      boneMap.set(nodeDef.name, { bone, keyframes: matchedFrames });

      if (nodeDef.children) {
        for (const childDef of nodeDef.children) {
          buildBone(childDef, bone);
        }
      }
      return bone;
    };

    const rootBone = buildBone(SKELETON_DEF, null);

    // 頭部スフィア
    const headObj = boneMap.get('頭')?.bone;
    if (headObj) {
      const headGeom = new THREE.SphereGeometry(0.85, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        wireframe: true,
        emissive: 0x0891b2,
      });
      const headMesh = new THREE.Mesh(headGeom, headMat);
      headMesh.position.set(0, 0.45, 0);
      headObj.add(headMesh);
    }

    // 骨格ライン
    const skeletonHelper = new THREE.SkeletonHelper(rootBone);
    (skeletonHelper.material as THREE.LineBasicMaterial).color.set(0x38bdf8);
    (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2;
    scene.add(skeletonHelper);

    boneMapRef.current = boneMap;

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      mainCam.aspect = w / h;
      mainCam.updateProjectionMatrix();
      freeCam.aspect = w / h;
      freeCam.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [vmdData]);

  // ============================================================
  // 2. フレームごとのアニメーション同期ループ
  // ============================================================
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);

      const audio = audioRef.current;
      const time = audio ? audio.currentTime : 0;
      setCurrentTime(time);

      const frameNumber = Math.floor(time * FPS);

      // --- A. ボーンアニメーションの適用 ---
      const boneMap = boneMapRef.current;
      boneMap.forEach(({ bone, keyframes }, name) => {
        if (!keyframes || keyframes.length === 0) return;

        let lo = 0,
          hi = keyframes.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (keyframes[mid].frameNumber <= frameNumber) lo = mid;
          else hi = mid;
        }
        const kfA = keyframes[lo];
        const kfB = keyframes[hi];

        const span = kfB.frameNumber - kfA.frameNumber;
        const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (frameNumber - kfA.frameNumber) / span));

        const qA = new THREE.Quaternion(kfA.rotation.x, kfA.rotation.y, kfA.rotation.z, kfA.rotation.w);
        const qB = new THREE.Quaternion(kfB.rotation.x, kfB.rotation.y, kfB.rotation.z, kfB.rotation.w);
        bone.quaternion.copy(qA.slerp(qB, t));

        if (name === 'センター' || name === '全ての親') {
          const defaultPos = name === 'センター' ? new THREE.Vector3(0, 8.5, 0) : new THREE.Vector3(0, 0, 0);
          const px = THREE.MathUtils.lerp(kfA.position.x, kfB.position.x, t);
          const py = THREE.MathUtils.lerp(kfA.position.y, kfB.position.y, t);
          const pz = THREE.MathUtils.lerp(kfA.position.z, kfB.position.z, t);
          bone.position.set(defaultPos.x + px, defaultPos.y + py, defaultPos.z + pz);
        }
      });

      // --- B. カメラアニメーションの適用 ---
      if (mainCameraRef.current && targetGroupRef.current && cameraFrames.length > 0) {
        let lo = 0,
          hi = cameraFrames.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (cameraFrames[mid].frameNumber <= frameNumber) lo = mid;
          else hi = mid;
        }
        const cA = cameraFrames[lo];
        const cB = cameraFrames[hi];
        const span = cB.frameNumber - cA.frameNumber;
        const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (frameNumber - cA.frameNumber) / span));

        // 注視点 (Target)
        const tx = THREE.MathUtils.lerp(cA.position.x, cB.position.x, t);
        const ty = THREE.MathUtils.lerp(cA.position.y, cB.position.y, t);
        const tz = THREE.MathUtils.lerp(cA.position.z, cB.position.z, t);
        targetGroupRef.current.position.set(tx, ty, tz);

        // オイラー角 (MMD規格: MMDのRxは符号反転)
        const rx = THREE.MathUtils.lerp(cA.rotation.x, cB.rotation.x, t);
        const ry = THREE.MathUtils.lerp(cA.rotation.y, cB.rotation.y, t);
        const rz = THREE.MathUtils.lerp(cA.rotation.z, cB.rotation.z, t);
        targetGroupRef.current.rotation.set(-rx, ry, rz, 'YXZ');

        // 距離 (Distance)
        const dist = THREE.MathUtils.lerp(cA.distance, cB.distance, t);
        mainCameraRef.current.position.set(0, 0, Math.abs(dist));

        // 視野角 (FOV)
        const fov = THREE.MathUtils.lerp(cA.fov, cB.fov, t);
        if (Math.abs(mainCameraRef.current.fov - fov) > 0.1) {
          mainCameraRef.current.fov = fov;
          mainCameraRef.current.updateProjectionMatrix();
        }

        // カメラヘルパーの更新
        if (cameraHelperRef.current) {
          cameraHelperRef.current.update();
        }
      }

      // --- C. 表示モードに応じたヘルパーの表示/非表示 ---
      const isFreeView = viewMode === 'free';
      if (cameraHelperRef.current) cameraHelperRef.current.visible = isFreeView;
      if (targetMarkerRef.current) targetMarkerRef.current.visible = isFreeView;

      // レンダリング実行
      if (rendererRef.current && sceneRef.current) {
        const activeCam = isFreeView ? freeCameraRef.current : mainCameraRef.current;
        if (activeCam) {
          rendererRef.current.render(sceneRef.current, activeCam);
        }
      }
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [cameraFrames, viewMode]);

  // ============================================================
  // 再生操作ハンドラ
  // ============================================================

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  // 【新設】グローバルなスペースキーリスナー（どこをクリックしていてもスペースキーで再生/停止）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input 要素や select 要素にフォーカスがある時は誤爆防止のため除外
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault(); // 画面スクロールを防止
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const handleReset = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      {/* 隠し audio 要素 */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* プレビューヘッダー */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/20 text-cyan-400">
            <Video size={14} />
          </div>
          <span className="text-xs font-bold text-slate-200">3Dカメラプレビュー</span>
          <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 border border-cyan-800/40">
            サイバーボーン
          </span>
        </div>

        {/* 視点切り替えボタン */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'camera' ? 'free' : 'camera')}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            viewMode === 'camera'
              ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
              : 'border border-cyan-500/80 bg-cyan-950/60 text-cyan-300 shadow-sm'
          }`}
        >
          <Eye size={13} />
          {viewMode === 'camera' ? '生成カメラ視点' : 'ディレクターズ視点（カメラを可視化）'}
        </button>
      </div>

      {/* 3Dキャンバス領域 (縦画面 9:16 比率) */}
      <div className="relative mx-auto flex h-[480px] w-full max-w-[270px] items-center justify-center overflow-hidden rounded-xl border border-slate-700/60 bg-black shadow-2xl">
        <div ref={containerRef} className="h-full w-full" />

        {/* 画面内オーバーレイ */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-mono text-cyan-400 backdrop-blur-sm border border-slate-700/40">
          FRAME: {Math.floor(currentTime * FPS)}
          {/* 【新設】現在のカット名表示 */}
          {(() => {
            const curCut = [...cuts].reverse().find((c) => c.time <= currentTime + 0.05);
            return curCut ? (
              <div className="text-[11px] font-bold text-white">
                #{curCut.index + 1} {curCut.pattern.toUpperCase()}
              </div>
            ) : null;
          })()}
        </div>

        {viewMode === 'free' && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded bg-slate-900/85 px-2 py-1 text-center text-[10px] text-cyan-300/90 border border-cyan-800/40">
            四角錐のワイヤー枠＝生成されたカメラ
          </div>
        )}
      </div>

      {/* タイムバー・コントローラー */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-12 text-right font-mono text-[10px] text-slate-400">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 accent-cyan-500"
          />
          <span className="w-12 font-mono text-[10px] text-slate-500">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-slate-700/50 p-2 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
            title="最初に戻る"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 transition-all hover:brightness-110 active:scale-95"
            title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
