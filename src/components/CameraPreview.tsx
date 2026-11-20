import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Eye, Video } from 'lucide-react';
import type { CameraFrame, VMDData, CutInfo } from '@/types';
import { EYE_HEIGHT_RATIO_CORRECTION } from '@/types';

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
  /** 再生時間の更新を親へ通知するコールバック */
  onTimeUpdate?: (time: number) => void;
  /** 総再生時間（秒）を親へ通知するコールバック */
  onDurationChange?: (duration: number) => void;
  /** 再生/一時停止状態の変化を親へ通知するコールバック */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** 外部からの再生/一時停止トリガー */
  playTrigger?: number;
  /** 目線の高さ（棒人間の等身スケーリングに使用） */
  eyeHeight?: number;
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
                          name: '左ひじ',
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
// メインプレビューコンポーネント (純粋な大画面3D映像モニター)
// ============================================================

export function CameraPreview({
  audioFile,
  vmdData,
  cameraFrames,
  cuts,
  seekRequest,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  playTrigger,
  eyeHeight = 15,
}: CameraPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // 再生操作ハンドラ
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => {
        onPlayStateChange?.(true);
      }).catch((e) => console.error('[Preview] Play error:', e));
    } else {
      audio.pause();
      onPlayStateChange?.(false);
    }
  }, [onPlayStateChange]);

  useEffect(() => {
    if (playTrigger !== undefined && playTrigger > 0) {
      togglePlay();
    }
  }, [playTrigger, togglePlay]);

  // グローバルなスペースキーリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  // 1. Three.js シーンの初期化
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x22d3ee, 1.2);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    // 生成カメラ機構
    const targetGroup = new THREE.Group();
    scene.add(targetGroup);
    targetGroupRef.current = targetGroup;

    const markerGeom = new THREE.SphereGeometry(0.5, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xec4899, wireframe: true });
    const targetMarker = new THREE.Mesh(markerGeom, markerMat);
    targetGroup.add(targetMarker);
    targetMarkerRef.current = targetMarker;

    const mainCam = new THREE.PerspectiveCamera(30, width / height, 0.5, 300);
    targetGroup.add(mainCam);
    mainCameraRef.current = mainCam;

    const camHelper = new THREE.CameraHelper(mainCam);
    scene.add(camHelper);
    cameraHelperRef.current = camHelper;

    const freeCam = new THREE.PerspectiveCamera(45, width / height, 0.5, 300);
    freeCam.position.set(0, 22, 65);
    freeCam.lookAt(0, 9, 0);
    freeCameraRef.current = freeCam;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // ボーン階層の構築
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

    // 目線の高さに合わせて棒人間の等身を自動スケーリング！
    const scaleRatio = eyeHeight / 15.0;
    rootBone.scale.set(scaleRatio, scaleRatio, scaleRatio);

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
  }, [vmdData, eyeHeight]);

  // 2. フレームごとのアニメーション同期ループ
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);

      const audio = audioRef.current;
      const time = audio ? audio.currentTime : 0;
      setCurrentTime(time);
      onTimeUpdate?.(time);

      const frameNumber = Math.floor(time * FPS);

      // ボーンアニメーション
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

      // カメラアニメーション
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

        const RATIO_CORRECTION = EYE_HEIGHT_RATIO_CORRECTION;
        const tx = THREE.MathUtils.lerp(cA.position.x, cB.position.x, t);
        const ty = THREE.MathUtils.lerp(cA.position.y, cB.position.y, t) / RATIO_CORRECTION;;
        const tz = THREE.MathUtils.lerp(cA.position.z, cB.position.z, t);
        targetGroupRef.current.position.set(tx, ty, tz);

        const rx = THREE.MathUtils.lerp(cA.rotation.x, cB.rotation.x, t);
        const ry = THREE.MathUtils.lerp(cA.rotation.y, cB.rotation.y, t);
        const rz = THREE.MathUtils.lerp(cA.rotation.z, cB.rotation.z, t);
        targetGroupRef.current.rotation.set(-rx, ry, rz, 'YXZ');

        const dist = THREE.MathUtils.lerp(cA.distance, cB.distance, t);
        mainCameraRef.current.position.set(0, 0, Math.abs(dist));

        const fov = THREE.MathUtils.lerp(cA.fov, cB.fov, t);
        if (Math.abs(mainCameraRef.current.fov - fov) > 0.1) {
          mainCameraRef.current.fov = fov;
          mainCameraRef.current.updateProjectionMatrix();
        }

        if (cameraHelperRef.current) {
          cameraHelperRef.current.update();
        }
      }

      const isFreeView = viewMode === 'free';
      if (cameraHelperRef.current) cameraHelperRef.current.visible = isFreeView;
      if (targetMarkerRef.current) targetMarkerRef.current.visible = isFreeView;

      if (rendererRef.current && sceneRef.current) {
        const activeCam = isFreeView ? freeCameraRef.current : mainCameraRef.current;
        if (activeCam) {
          rendererRef.current.render(sceneRef.current, activeCam);
        }
      }
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [cameraFrames, viewMode, onTimeUpdate]);

  {/* src/components/CameraPreview.tsx の return 部分 */ }

  return (
    <div className="relative w-full flex justify-center">
      {/* 隠し audio 要素 */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            setDuration(dur);
            onDurationChange?.(dur);
          }}
          onPlay={() => onPlayStateChange?.(true)}
          onPause={() => onPlayStateChange?.(false)}
          onEnded={() => onPlayStateChange?.(false)}
        />
      )}

      <div className="relative flex h-[430px] w-[242px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/60 bg-black shadow-2xl">
        <div ref={containerRef} className="h-full w-full" />

        {/* 画面内オーバーレイ左上：FRAME ＆ 現在のカット名 */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col gap-0.5 rounded-lg bg-slate-900/85 px-2.5 py-1.5 text-[9px] font-mono text-cyan-400 backdrop-blur-md border border-slate-700/40">
          <div>FRAME: {Math.floor(currentTime * FPS)}</div>
          {(() => {
            const curCut = [...cuts].reverse().find((c) => c.time <= currentTime + 0.05);
            return curCut ? (
              <div className="text-[10px] font-bold text-white">
                #{curCut.index + 1} {curCut.pattern.toUpperCase()}
              </div>
            ) : null;
          })()}
        </div>

        {/* 画面内オーバーレイ右上：視点切り替えボタン */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'camera' ? 'free' : 'camera')}
          className={`absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur-md transition-all shadow-md ${viewMode === 'camera'
            ? 'bg-slate-900/80 text-cyan-300 border border-cyan-500/40 hover:bg-slate-800'
            : 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/80 shadow-cyan-500/20'
            }`}
          title="カメラ視点を切り替え"
        >
          <Eye size={12} />
          <span>{viewMode === 'camera' ? '生成カメラ' : '全体視点'}</span>
        </button>

        {viewMode === 'free' && (
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 rounded-md bg-slate-900/90 px-2 py-1 text-center text-[9px] text-cyan-300/90 border border-cyan-800/40 backdrop-blur-sm">
            四角錐枠＝カメラ位置
          </div>
        )}
      </div>
    </div>
  );
}
