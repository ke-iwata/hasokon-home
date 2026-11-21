'use client';

/**
 * 福笑いの画面。
 *
 * 仕様: docs/features/game-fukuwarai.md
 *
 * 採点・難易度ごとの見え方・置き場の並び・日替わり・画像の中身は `lib/fukuwarai.ts`（純関数）が持つ。
 * ここは**入力（ドラッグ・タップ・キーボード）と描画だけ**。
 *
 * - 何を描くかは `VISIBILITY[difficulty]` だけを見て決める（表と画面がずれないように）。
 *   ふつう・むずかしいでは、置き場を出たパーツはドラッグ中も置いたあとも**描かない**。
 *   置いた場所にも何も出さない（点を出すと答えが分かる）
 * - 座標は `toSvgPoint` で SVG の座標に直してから置く（端末の大きさで点が変わらない）
 * - 名前（家族モード）は state だけに持つ。`localStorage` にも残さない
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  aimHome,
  DAILY_DIFFICULTY,
  DAILY_VARIANT,
  dailySetup,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  FACE_IDS,
  FACES,
  insideView,
  makeTray,
  MAX_PLAYERS,
  MIN_PLAYERS,
  moveAim,
  PART_KINDS,
  PART_LABEL,
  partTransform,
  placedSpeech,
  playerNames,
  PREVIEW_MS,
  ranking,
  recordVariant,
  resultSvgMarkup,
  rotate,
  scoreFace,
  toSvgPoint,
  verdict,
  VIEW_H,
  VIEW_W,
  VISIBILITY,
  type Difficulty,
  type FaceDef,
  type FaceId,
  type FaceScore,
  type FamilyEntry,
  type PartKind,
  type Placement,
  type Placements,
  type SvgEl,
  type TrayPart,
} from '@/lib/fukuwarai';
import { currentStreak, localDateKey } from '@/lib/daily';
import { bestScoreOf, type Improved } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';

type Mode = 'daily' | 'free' | 'family';
type Phase = 'ready' | 'setup' | 'handoff' | 'preview' | 'placing' | 'result' | 'family-done';

const MODE_LABEL: Record<Mode, string> = { daily: '今日のお題', free: 'えらんで遊ぶ', family: '家族で順番に' };
const MODES: Mode[] = ['daily', 'free', 'family'];

/** これだけ動いたらタップではなくドラッグとみなす（px） */
const DRAG_THRESHOLD = 8;

function Els({ els }: { els: readonly SvgEl[] }) {
  return (
    <>
      {els.map((el, i) => (
        <path
          key={i}
          d={el.d}
          fill={el.fill ?? 'none'}
          stroke={el.stroke}
          strokeWidth={el.stroke ? (el.sw ?? 2) : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={el.opacity}
        />
      ))}
    </>
  );
}

function PartG({ face, kind, at, opacity }: { face: FaceDef; kind: PartKind; at: Placement; opacity?: number }) {
  const art = face.parts[kind];
  return (
    <g transform={partTransform(at, art.mirror)} opacity={opacity}>
      <Els els={art.els} />
    </g>
  );
}

function correctOf(face: FaceDef, kind: PartKind): Placement {
  return { x: face.parts[kind].x, y: face.parts[kind].y, rotation: 0 };
}

/** 小さな顔（家族モードの結果の一覧） */
function MiniFace({ face, placements }: { face: FaceDef; placements: Placements }) {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="fw-mini" aria-hidden="true" focusable="false">
      <rect width={VIEW_W} height={VIEW_H} className="fw-paper-bg" />
      <Els els={face.outline} />
      {PART_KINDS.map((k) => {
        const p = placements[k];
        return p ? <PartG key={k} face={face} kind={k} at={p} /> : null;
      })}
    </svg>
  );
}

/** 「ぽん」と1回だけ鳴らす（Web Audio で合成。既定はオフ） */
function playPon() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    // 音が鳴らなくても遊べる
  }
}

/** 画像（PNG）にして端末に保存する。送信はしない */
async function savePng(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width || VIEW_W * 2;
    canvas.height = img.height || VIEW_H * 2;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Drag {
  kind: PartKind;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface Result {
  score: FaceScore;
  improved: Improved | null;
  streak?: number;
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [faceId, setFaceId] = useState<FaceId>('okame');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [phase, setPhase] = useState<Phase>('ready');
  const [tray, setTray] = useState<TrayPart[]>([]);
  const [placements, setPlacements] = useState<Placements>({});
  const [selected, setSelected] = useState<PartKind | null>(null);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [sound, setSound] = useState(false);
  const [live, setLive] = useState('');
  const [today, setToday] = useState<string | null>(null);
  // 家族モード（名前は端末内の state だけ。保存しない）
  const [playerCount, setPlayerCount] = useState(3);
  const [nameInputs, setNameInputs] = useState<string[]>(Array(MAX_PLAYERS).fill(''));
  const [players, setPlayers] = useState<string[]>([]);
  const [turn, setTurn] = useState(0);
  const [entries, setEntries] = useState<FamilyEntry[]>([]);
  const [award, setAward] = useState<number | null>(null);
  const [includeName, setIncludeName] = useState(false);

  const paperRef = useRef<SVGSVGElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  /** ドラッグを離した直後の click（同じボタンに届く）を、タップとして数えない */
  const suppressClick = useRef(false);
  const previewTimer = useRef<number | null>(null);
  const records = useRecords('fukuwarai');

  useEffect(() => setToday(localDateKey()), []);
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
  }, []);

  const daily = useMemo(() => (today ? dailySetup(today) : null), [today]);
  const playFace: FaceId = mode === 'daily' && daily ? daily.faceId : faceId;
  const playDifficulty: Difficulty = mode === 'daily' ? DAILY_DIFFICULTY : difficulty;
  const face = FACES[playFace];
  const vis = VISIBILITY[playDifficulty];
  const variant = mode === 'daily' ? DAILY_VARIANT : recordVariant(playFace, playDifficulty);
  const placedCount = PART_KINDS.filter((k) => placements[k]).length;
  const selectedTray = tray.find((t) => t.kind === selected) ?? null;

  const clearTimer = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
  };

  /** 最初の画面に戻す（モード・顔・難易度を変えたとき） */
  const reset = useCallback((next: Phase = 'ready') => {
    clearTimer();
    setPhase(next);
    setTray([]);
    setPlacements({});
    setSelected(null);
    setAim(null);
    setGhost(null);
    setDragging(false);
    setResult(null);
    setOverlay(false);
    setLive('');
    dragRef.current = null;
  }, []);

  const start = useCallback(() => {
    clearTimer();
    setTray(mode === 'daily' && daily ? daily.tray : makeTray(Math.random));
    setPlacements({});
    setSelected(null);
    setAim(null);
    setResult(null);
    setOverlay(false);
    setPhase('preview');
    setLive(`正解の顔を${PREVIEW_MS / 1000}秒見せます。場所をおぼえてください`);
    if (mode !== 'family') records.start(variant);
    trackToolUse('fukuwarai', mode === 'daily' ? 'start_daily' : `start_${playDifficulty}`);
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      setPhase('placing');
      setLive('顔が消えました。下のパーツを顔の上に置いてください');
    }, PREVIEW_MS);
  }, [mode, daily, records, variant, playDifficulty]);

  const place = useCallback(
    (kind: PartKind, at: { x: number; y: number }) => {
      const part = tray.find((t) => t.kind === kind);
      if (!part || placements[kind]) return;
      const next = { ...placements, [kind]: { x: at.x, y: at.y, rotation: part.rotation } };
      const count = PART_KINDS.filter((k) => next[k]).length;
      setPlacements(next);
      setSelected(null);
      setGhost(null);
      setLive(placedSpeech(playDifficulty, face, kind, at, count));
      // フォーカスを次のパーツへ（キーボードで続けて置けるように）
      window.setTimeout(() => {
        const btn = trayRef.current?.querySelector<HTMLButtonElement>('button.fw-part');
        btn?.focus();
      }, 0);
    },
    [tray, placements, playDifficulty, face],
  );

  const reveal = useCallback(() => {
    const score = scoreFace(face, placements);
    let improved: Improved | null = null;
    let streak: number | undefined;
    if (mode === 'daily' && today) {
      const r = records.finish({ outcome: 'win', score: score.total, scoredOn: today, clearedOn: today }, variant);
      improved = r.improved;
      const e = r.records[variant];
      streak = e ? currentStreak(e.lastClearedOn, today, e.streak) : undefined;
    } else if (mode !== 'family') {
      improved = records.finish({ outcome: 'win', score: score.total }, variant).improved;
    }
    if (mode === 'family') {
      setEntries((prev) => [...prev, { name: players[turn] ?? '', placements, total: score.total }]);
    }
    setResult({ score, improved, streak });
    setPhase('result');
    setLive(`${score.total}点。${verdict(score.total)}`);
    if (sound) playPon();
    trackToolUse('fukuwarai', 'reveal');
  }, [face, placements, mode, today, records, variant, players, turn, sound]);

  // ---------------------------------------------------------------- 入力（ドラッグ・タップ）

  const svgPointOf = (clientX: number, clientY: number) => {
    const el = paperRef.current;
    if (!el) return null;
    return toSvgPoint(clientX, clientY, el.getBoundingClientRect());
  };

  const onPartPointerDown = (e: PointerEvent<HTMLButtonElement>, kind: PartKind) => {
    if (phase !== 'placing') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onPartPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setSelected(d.kind);
      setDragging(true);
    }
    // ドラッグ中のパーツを描くのは、かんたんだけ（ふつう・むずかしいでは位置も持たない）
    if (vis.dragging) {
      const pt = svgPointOf(e.clientX, e.clientY);
      setGhost(pt && insideView(pt) ? pt : null);
    }
  };

  const onPartPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setGhost(null);
    if (!d.moved) return; // タップは click で扱う
    suppressClick.current = true;
    const pt = svgPointOf(e.clientX, e.clientY);
    if (pt && insideView(pt)) place(d.kind, pt);
    else setSelected(null); // 紙の外で離したら置き場に戻す
  };

  const onPartClick = (kind: PartKind) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (phase !== 'placing') return;
    setSelected((cur) => (cur === kind ? null : kind));
  };

  const onPartKeyDown = (e: KeyboardEvent<HTMLButtonElement>, kind: PartKind) => {
    if (phase !== 'placing') return;
    const key = e.key;
    if (key === 'q' || key === 'Q' || key === 'e' || key === 'E') {
      e.preventDefault();
      setSelected(kind);
      setTray((t) => t.map((p) => (p.kind === kind ? { ...p, rotation: rotate(p.rotation, key.toLowerCase() === 'e' ? 1 : -1) } : p)));
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      setSelected(kind);
      setAim((a) => moveAim(a ?? aimHome(face), key, e.shiftKey));
      return;
    }
    if (key === 'c' || key === 'C') {
      e.preventDefault();
      setAim(aimHome(face));
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      place(kind, aim ?? aimHome(face));
      return;
    }
  };

  const onPaperClick = (e: MouseEvent<SVGSVGElement>) => {
    if (phase !== 'placing' || !selected) return;
    const pt = svgPointOf(e.clientX, e.clientY);
    if (pt && insideView(pt)) place(selected, pt);
  };

  const rotateSelected = (dir: 1 | -1) => {
    if (!selected) return;
    setTray((t) => t.map((p) => (p.kind === selected ? { ...p, rotation: rotate(p.rotation, dir) } : p)));
  };

  // ホイールで回す（React の onWheel は passive なので、スクロールを止めるには自前で付ける）
  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>('button.fw-part');
      const kind = target?.dataset.kind as PartKind | undefined;
      if (!kind || phase !== 'placing') return;
      e.preventDefault();
      setSelected(kind);
      setTray((t) => t.map((p) => (p.kind === kind ? { ...p, rotation: rotate(p.rotation, e.deltaY > 0 ? 1 : -1) } : p)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [phase]);

  // ---------------------------------------------------------------- 家族モード

  const beginFamily = () => {
    const names = playerNames(nameInputs, playerCount);
    setPlayers(names);
    setTurn(0);
    setEntries([]);
    setAward(null);
    reset('handoff');
    trackToolUse('fukuwarai', `family_${names.length}`);
  };

  const nextPlayer = () => {
    if (turn + 1 >= players.length) {
      reset('family-done');
      return;
    }
    setTurn(turn + 1);
    reset('handoff');
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    reset(m === 'family' ? 'setup' : 'ready');
  };

  // ---------------------------------------------------------------- 描画

  const outlineClass =
    phase === 'placing' ? `fw-outline fw-outline-${vis.outline}` : phase === 'handoff' || phase === 'setup' ? 'fw-outline fw-outline-none' : 'fw-outline';
  const showAllParts = phase === 'ready' || phase === 'preview' || phase === 'family-done';
  const showPlaced = phase === 'result' || (phase === 'placing' && vis.placed);
  const aimVisible = phase === 'placing' && aim !== null && selected !== null && vis.aim !== 'none';

  const best = (() => {
    const e = records.entry(variant);
    if (mode === 'daily') {
      if (!today) return [];
      const items = [];
      const b = bestScoreOf(e, today);
      if (b !== undefined) items.push({ label: '今日のベスト', value: `${b}点` });
      const s = currentStreak(e.lastClearedOn, today, e.streak);
      if (s > 0) items.push({ label: '連続', value: `${s}日` });
      return items;
    }
    if (mode === 'family' || e.bestScore === undefined) return [];
    return [{ label: `ベスト（${face.name}・${DIFFICULTY_LABEL[playDifficulty]}）`, value: `${e.bestScore}点` }];
  })();

  const statusText = (() => {
    if (phase === 'preview') return 'おぼえてね…（3秒で消えます）';
    if (phase === 'placing') return vis.count ? `${PART_KINDS.length}枚中 ${placedCount}枚` : '';
    if (phase === 'result' && result) return `${result.score.total}点 ${verdict(result.score.total)}`;
    if (phase === 'handoff') return `${turn + 1}人目／${players.length}人`;
    return '';
  })();

  const saveImage = () => {
    if (!result) return;
    const name = mode === 'family' ? players[turn] : undefined;
    const svg = resultSvgMarkup(face, placements, {
      total: result.score.total,
      playerName: name,
      includeName: mode === 'family' && includeName,
    });
    void savePng(svg, `fukuwarai-${face.id}.png`);
    trackToolUse('fukuwarai', 'save_image');
  };

  return (
    <div className={`card fw-game${dragging && vis.cursor === 'none' ? ' fw-nocursor' : ''}`}>
      <div className="fw-controls">
        <div className="seg" role="group" aria-label="遊び方">
          {MODES.map((m) => (
            <button key={m} type="button" className={m === mode ? 'active' : ''} aria-pressed={m === mode} onClick={() => changeMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {/* 顔は5種あるので、ボタンを並べず選択欄にする（スマホで設定が3段にならないように） */}
        <label className="fw-face-select">
          <span className="fw-visually-hidden">お題の顔</span>
          <select
            value={playFace}
            disabled={mode === 'daily' || (phase !== 'ready' && phase !== 'setup' && phase !== 'result')}
            onChange={(e) => {
              setFaceId(e.target.value as FaceId);
              if (mode !== 'family') reset('ready');
            }}
          >
            {FACE_IDS.map((id) => (
              <option key={id} value={id}>
                {FACES[id].name}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="難易度">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={d === playDifficulty ? 'active' : ''}
              aria-pressed={d === playDifficulty}
              disabled={mode === 'daily' || (phase !== 'ready' && phase !== 'setup' && phase !== 'result')}
              onClick={() => {
                setDifficulty(d);
                if (mode !== 'family') reset('ready');
              }}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <RecordStrip items={best} />

      <div className={`fw-main${phase === 'placing' && vis.cursor === 'none' ? ' fw-hard' : ''}`}>
        <div className="fw-paper-wrap">
          <svg
            ref={paperRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className={`fw-paper${phase === 'result' ? ' fw-reveal' : ''}`}
            role="img"
            aria-label={
              phase === 'placing'
                ? `${face.name}の顔（目かくし中）。パーツを選んでからここを押すと置けます`
                : phase === 'handoff'
                  ? '紙は伏せてあります'
                  : `${face.name}の顔`
            }
            onClick={onPaperClick}
          >
            <rect width={VIEW_W} height={VIEW_H} className="fw-paper-bg" />
            {phase === 'handoff' ? (
              <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" className="fw-paper-msg">
                （紙は伏せてあります）
              </text>
            ) : (
              <g className={outlineClass}>
                <Els els={face.outline} />
              </g>
            )}
            {showAllParts ? PART_KINDS.map((k) => <PartG key={k} face={face} kind={k} at={correctOf(face, k)} />) : null}
            {showPlaced
              ? PART_KINDS.map((k) => {
                  const p = placements[k];
                  return p ? <PartG key={k} face={face} kind={k} at={p} /> : null;
                })
              : null}
            {phase === 'result' && overlay
              ? PART_KINDS.map((k) => <PartG key={`o${k}`} face={face} kind={k} at={correctOf(face, k)} opacity={0.35} />)
              : null}
            {ghost && vis.dragging && selectedTray ? (
              <PartG face={face} kind={selectedTray.kind} at={{ ...ghost, rotation: selectedTray.rotation }} opacity={0.85} />
            ) : null}
            {aimVisible && aim ? (
              <g className="fw-aim" transform={`translate(${aim.x} ${aim.y})`}>
                {vis.aim === 'cross-part' && selectedTray ? (
                  <PartG face={face} kind={selectedTray.kind} at={{ x: 0, y: 0, rotation: selectedTray.rotation }} opacity={0.6} />
                ) : null}
                <path d={vis.aim === 'cross' ? 'M-6 0H6M0 -6V6' : 'M-14 0H14M0 -14V14'} />
              </g>
            ) : null}
          </svg>
        </div>

        <div className="fw-side">
          <div className="fw-status">
            <span className="fw-status-text">{statusText}</span>
            <span className="fw-rotate">
              <button type="button" className="btn" aria-label="左に回す" disabled={phase !== 'placing' || !selectedTray} onClick={() => rotateSelected(-1)}>
                ↺
              </button>
              <button type="button" className="btn" aria-label="右に回す" disabled={phase !== 'placing' || !selectedTray} onClick={() => rotateSelected(1)}>
                ↻
              </button>
            </span>
          </div>

          <div className="fw-tray" ref={trayRef}>
            {phase === 'placing' && placedCount < PART_KINDS.length ? (
              <div className="fw-parts" role="group" aria-label="パーツ置き場（Tabで選び、矢印で照準、Enterで置く。Q/Eで回す）">
                {tray.map((t) =>
                  placements[t.kind] ? (
                    <div key={t.kind} className="fw-slot" aria-hidden="true" />
                  ) : (
                    <button
                      key={t.kind}
                      type="button"
                      data-kind={t.kind}
                      className={`fw-part${selected === t.kind ? ' selected' : ''}`}
                      aria-pressed={selected === t.kind}
                      aria-label={`${PART_LABEL[t.kind]}（傾き${t.rotation}度）`}
                      onPointerDown={(e) => onPartPointerDown(e, t.kind)}
                      onPointerMove={onPartPointerMove}
                      onPointerUp={onPartPointerUp}
                      onPointerCancel={onPartPointerUp}
                      onClick={() => onPartClick(t.kind)}
                      onKeyDown={(e) => onPartKeyDown(e, t.kind)}
                    >
                      {/* 置き場の中ではパーツが見える。ドラッグで置き場を出たら（ふつう・むずかしい）消す */}
                      <svg
                        viewBox="-50 -30 100 60"
                        aria-hidden="true"
                        focusable="false"
                        style={{ visibility: dragging && selected === t.kind && !vis.dragging ? 'hidden' : 'visible' }}
                      >
                        <PartG face={face} kind={t.kind} at={{ x: 0, y: 0, rotation: t.rotation }} />
                      </svg>
                    </button>
                  ),
                )}
              </div>
            ) : phase === 'placing' ? (
              <div className="fw-center">
                <button type="button" className="btn btn-primary fw-big" onClick={reveal}>
                  めかくしを とる
                </button>
              </div>
            ) : phase === 'preview' ? (
              <div className="fw-center fw-hint">顔をよく見て、場所をおぼえよう</div>
            ) : phase === 'result' ? (
              <div className="fw-result">
                <p className="fw-score">
                  <strong>{result?.score.total ?? 0}</strong>点 <BestBadge improved={result?.improved ?? null} />
                  {result?.streak ? <span className="fw-sub">連続{result.streak}日</span> : null}
                </p>
                <label className="fw-check">
                  <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> 正解の顔を重ねる
                </label>
                {mode === 'family' ? (
                  <label className="fw-check">
                    <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} /> 画像に名前を入れる
                  </label>
                ) : null}
                <div className="fw-actions">
                  <button type="button" className="btn" onClick={saveImage}>
                    画像で保存
                  </button>
                  {mode === 'family' ? (
                    <button type="button" className="btn btn-primary" onClick={nextPlayer}>
                      {turn + 1 >= players.length ? '結果を見る' : '次の人へ'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={start}>
                      もう一回
                    </button>
                  )}
                </div>
              </div>
            ) : phase === 'setup' ? (
              <div className="fw-setup">
                <div className="fw-setup-row">
                  <span>人数</span>
                  <div className="seg" role="group" aria-label="人数">
                    {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
                      <button key={n} type="button" className={n === playerCount ? 'active' : ''} aria-pressed={n === playerCount} onClick={() => setPlayerCount(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fw-names">
                  {Array.from({ length: playerCount }, (_, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={12}
                      autoComplete="off"
                      aria-label={`${i + 1}人目の名前`}
                      placeholder={`${i + 1}ばん`}
                      value={nameInputs[i]}
                      onChange={(e) => setNameInputs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  ))}
                </div>
                <button type="button" className="btn btn-primary" onClick={beginFamily}>
                  順番に遊ぶ
                </button>
                <p className="fw-small">名前はこの画面の中だけで使います（保存も送信もしません）。</p>
              </div>
            ) : phase === 'handoff' ? (
              <div className="fw-center fw-handoff">
                <p>
                  次は <strong>{players[turn]}</strong> さん。スマホを渡してね
                </p>
                <button type="button" className="btn btn-primary fw-big" onClick={start}>
                  はじめる
                </button>
              </div>
            ) : phase === 'family-done' ? (
              <div className="fw-center">
                <button type="button" className="btn" onClick={() => changeMode('family')}>
                  もう一度家族で遊ぶ
                </button>
              </div>
            ) : (
              <div className="fw-center">
                <button type="button" className="btn btn-primary fw-big" onClick={start} disabled={mode === 'daily' && !daily}>
                  はじめる
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="fw-live" aria-live="polite">
        {live}
      </p>

      {phase === 'family-done' ? (
        <div className="fw-family">
          <h3>みんなの顔</h3>
          <ol className="fw-family-list">
            {ranking(entries).map(({ entry, index, rank }) => (
              <li key={index} className={award === index ? 'awarded' : ''}>
                <MiniFace face={face} placements={entry.placements} />
                <span className="fw-family-name">
                  {rank}位 {entry.name}（{entry.total}点）
                </span>
                {award === index ? <span className="fw-award">大賞</span> : null}
                <button type="button" className="btn" aria-pressed={award === index} onClick={() => setAward(index)}>
                  いちばん笑えた
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
