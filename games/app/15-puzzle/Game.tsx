'use client';

/**
 * 15パズルの画面。
 *
 * 仕様: docs/features/game-15-puzzle.md
 *
 * 盤・手数・履歴・解けるかの判定・ヒントはすべて `lib/fifteen.ts`（純関数）が持つ。
 * ここは**入力（タップ・スワイプ・キーボード・写真の読み込み）と描画だけ**。
 * 板の動きはCSSの `transition` に任せ、「動いている途中」の状態は持たない（画面の約束9）。
 * ヒントの光りも演出なので、ここの state に置き、`lib/` の状態には入れない。
 *
 * ## 写真
 *
 * 選んだ写真は**端末の中だけ**で扱う。canvas で盤の大きさ（正方形）に縮めてから
 * `URL.createObjectURL` で使い、新しい写真を選んだら前の URL を `revokeObjectURL` で捨てる。
 * 送信も保存もしない。`tool_use` の `photo` には画像の情報（大きさ・名前など）を一切載せない。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  dailyBoard,
  DAILY_SIZE,
  deal,
  directionFromDelta,
  directionFromKey,
  hint as hintFor,
  isSolved,
  optimalMoves,
  play,
  restart,
  shareText,
  SIZES,
  slidesToward,
  solvedBoard,
  startPlay,
  tileForDirection,
  undo,
  variantOf,
  type PlayState,
  type Size,
} from '@/lib/fifteen';
import { currentStreak, localDateKey } from '@/lib/daily';
import { trackToolUse } from '@/lib/analytics';
import { SITE_URL } from '@/lib/registry';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

type Mode = 'size' | 'daily' | 'photo';

const MODES: { id: Mode; label: string }[] = [
  { id: 'size', label: '大きさを選ぶ' },
  { id: 'daily', label: '今日の1面' },
  { id: 'photo', label: '写真' },
];

/** 写真を縮める先の一辺（px）。盤の上限 440px の高精細表示ぶん */
const PHOTO_PX = 900;

/** 板の位置（左上からの %） */
function cellStyle(index: number, n: number): CSSProperties {
  return {
    left: `${((index % n) / n) * 100}%`,
    top: `${(Math.floor(index / n) / n) * 100}%`,
    width: `${100 / n}%`,
    height: `${100 / n}%`,
  };
}

/** 写真を切った1枚ぶんの背景。`value` の板は完成形の位置の絵を持つ */
function photoStyle(url: string, value: number, n: number): CSSProperties {
  const home = value - 1;
  const r = Math.floor(home / n);
  const c = home % n;
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${n * 100}% ${n * 100}%`,
    backgroundPosition: `${(c / (n - 1)) * 100}% ${(r / (n - 1)) * 100}%`,
  };
}

/**
 * 写真を盤の大きさの正方形（中央を切り抜き）に縮め、その場限りの URL にする。
 * スマホ写真の向き（EXIF）は `imageOrientation: 'from-image'` で反映する。
 */
async function preparePhoto(file: File): Promise<string> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } else {
    // createImageBitmap の無いブラウザ。<img> も既定で EXIF の向きを反映する
    const tmp = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image'));
      img.src = tmp;
    });
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
    cleanup = () => URL.revokeObjectURL(tmp);
  }
  try {
    const side = Math.min(width, height);
    const px = Math.min(PHOTO_PX, side);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, px, px);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!blob) throw new Error('blob');
    return URL.createObjectURL(blob);
  } finally {
    cleanup();
  }
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('size');
  const [size, setSize] = useState<Size>(4);
  // 最初の盤はマウント後に配る（静的書き出しのHTMLとブラウザで乱数が食い違わないように）。
  // それまでは完成形を置いておく（完成形は押しても動かない）
  const [state, setState] = useState<PlayState>(() => startPlay(solvedBoard(4)));
  const [dealt, setDealt] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [hintAt, setHintAt] = useState<number | null>(null);
  const [peek, setPeek] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);
  const [inverted, setInverted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    moves: number;
    timeMs: number;
    improved: Improved;
    streak?: number;
  } | null>(null);

  const records = useRecords('15-puzzle');
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  const drag = useRef<{ index: number; pointerId: number; x: number; y: number } | null>(null);
  /** スワイプで動かした直後の click を無視する目印 */
  const swiped = useRef(false);
  const photoRef = useRef<string | null>(null);

  const daily = mode === 'daily';
  const n = daily ? DAILY_SIZE : size;
  const variant = variantOf(n as Size, daily);
  const entry = records.entry(variant);
  const cleared = result !== null;
  const usePhoto = mode === 'photo' && photo !== null;

  /** 3×3 だけ最短手数を出す（初回に表を作る。百 ms 程度） */
  const best = useMemo(
    () => (dealt && state.start.length === 9 ? optimalMoves(state.start) : null),
    [dealt, state.start],
  );

  /** 盤を配り直す */
  const begin = useCallback(
    (nextMode: Mode, nextSize: Size) => {
      const isDaily = nextMode === 'daily';
      const key = localDateKey();
      setToday(key);
      const board = isDaily ? dailyBoard(key) : deal(nextSize, Math.random);
      setState(startPlay(board));
      setDealt(true);
      setHintAt(null);
      setResult(null);
      setCopied(false);
      timer.reset();
      counted.current = false;
      notified.current = false;
    },
    [timer],
  );

  // 最初の 4×4 を配る（押せばすぐ始まる）
  useEffect(() => {
    begin('size', 4);
    // マウント時に一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 写真の後始末（ページを離れるときに URL を捨てる）
  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current);
    },
    [],
  );

  // 完成の判定。時間は止めた瞬間の値で固定する
  useEffect(() => {
    if (notified.current || !dealt || state.moves === 0 || !isSolved(state.board)) return;
    notified.current = true;
    const timeMs = timer.stop();
    trackToolUse('15-puzzle', `clear-${variant}`);
    const { entry: after, improved } = records.finish(
      {
        outcome: 'win',
        moves: state.moves,
        timeMs,
        ...(daily && today ? { clearedOn: today } : {}),
      },
      variant,
    );
    setHintAt(null);
    setResult({ moves: state.moves, timeMs, improved, streak: daily ? after.streak : undefined });
  }, [state.board, state.moves, dealt, daily, today, variant, records, timer]);

  /** 板を押す。動かせなければ何もしない */
  const press = useCallback(
    (index: number | null) => {
      if (index === null || cleared) return;
      const next = play(state, index);
      if (next === state) return;
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
        trackToolUse('15-puzzle', `start-${variant}`);
      }
      timer.begin();
      setHintAt(null);
      setState(next);
    },
    [cleared, state, variant, records, timer],
  );

  const onTilePointerDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    // **指を置くたびに目印を戻す。** タッチで指を動かすとブラウザは click を出さないので、
    // スワイプのあとに立てた目印が残り、次のタップが黙って捨てられていた（レビュー指摘）
    swiped.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { index, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  /** 指を離したところ。動きが小さければタップ（click に任せる） */
  const onTilePointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (start === null || start.pointerId !== e.pointerId) return;
    drag.current = null;
    const dir = directionFromDelta(e.clientX - start.x, e.clientY - start.y);
    if (dir === null) return;
    // マウスでドラッグしたときは、このあと click も来るので1回だけ無視する
    swiped.current = true;
    // 押した板が空きへ向かう向きなら、その板（とあいだの板）をすべらせる。
    // そうでなければ、その向きに動ける空きの隣の板を1枚動かす
    press(slidesToward(state.board, start.index, dir) ? start.index : tileForDirection(state.board, dir));
  };

  const onTileClick = (index: number) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    press(index);
  };

  const onBoardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = directionFromKey(e.key);
    if (dir === null) return;
    // 盤の上で矢印キーを押したときにページが動かないようにする
    e.preventDefault();
    press(tileForDirection(state.board, dir, inverted));
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    begin(next, size);
  };

  const chooseSize = (next: Size) => {
    setSize(next);
    begin(mode, next);
  };

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じ写真を選び直しても change が起きるように空にしておく
    e.target.value = '';
    if (!file) return;
    try {
      const url = await preparePhoto(file);
      if (photoRef.current) URL.revokeObjectURL(photoRef.current);
      photoRef.current = url;
      setPhoto(url);
      setPhotoError(false);
      // 画像の情報（大きさ・名前など）は送らない
      trackToolUse('15-puzzle', 'photo');
      begin('photo', size);
    } catch {
      setPhotoError(true);
    }
  };

  const showHint = () => {
    if (cleared) return;
    setHintAt(hintFor(state.board));
  };

  const copyResult = () => {
    if (!result || !today) return;
    const text = shareText({
      dateKey: today,
      moves: result.moves,
      timeMs: result.timeMs,
      streak: result.streak,
      url: `${SITE_URL}/15-puzzle/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('15-puzzle', 'copy-result');
      },
      () => setCopied(false),
    );
  };

  const streakNow = today ? currentStreak(entry.lastClearedOn, today, entry.streak) : 0;
  const tiles = state.board
    .map((value, index) => ({ value, index }))
    .filter((t) => t.value !== 0)
    .sort((a, b) => a.value - b.value);
  const numbersVisible = !usePhoto || showNumbers;

  /** 完成図の1枚 */
  const renderFace = (value: number) => (
    <span
      className={`fp-face${usePhoto ? ' fp-photo' : ''}`}
      style={usePhoto ? photoStyle(photo!, value, n) : undefined}
    >
      {numbersVisible && <span className="fp-num">{value}</span>}
    </span>
  );

  let message: ReactNode = <span>&nbsp;</span>;
  if (cleared) {
    message = (
      <span className="fp-clear">
        <span style={{ color: 'var(--ok)' }}>
          🎉 完成！
          {best !== null ? `あなたは ${result.moves} 手（最短 ${best} 手）` : `${result.moves}手`}
          {' '}
          {formatTime(result.timeMs)}
          <BestBadge improved={result.improved} />
        </span>
        {daily && (
          <button type="button" className="btn fp-copy" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
        )}
      </span>
    );
  } else if (hintAt !== null) {
    message = (
      <span>
        {n === 3
          ? 'ヒント：光っている板を動かすのが最短の一手です'
          : 'ヒント（最短とは限りません）：光っている板を動かします'}
      </span>
    );
  } else if (photoError) {
    message = <span>写真を読み込めませんでした。別の写真を選んでください</span>;
  } else if (daily) {
    message = <span className="fp-note">{today ?? ''} の1面（4×4）。同じ日は誰でも同じ盤です</span>;
  } else if (mode === 'photo' && !photo) {
    message = <span className="fp-note">「写真を選ぶ」で自分の写真が絵合わせになります（送信しません）</span>;
  }

  return (
    <div className="card fp-game">
      {/* 遊び方の種類と大きさ。**畳まない**（画面の約束5）。
          今日の1面は4×4に決まっているが、大きさの段は消さずに押せなくする（段を出し入れすると盤が動く） */}
      <div className="fp-modes">
        <div className="seg" role="group" aria-label="遊び方">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === mode ? 'active' : ''}
              aria-pressed={m.id === mode}
              onClick={() => chooseMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* 大きさの段。写真のときは同じ段に「写真を選ぶ」と「数字」を並べる
            （段を足すと盤が下がる。段の高さは CSS で固定している） */}
        <div className="fp-sizes">
          <div className="seg" role="group" aria-label="盤の大きさ">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={s === n ? 'active' : ''}
                aria-pressed={s === n}
                disabled={daily}
                onClick={() => chooseSize(s)}
              >
                {s}×{s}
              </button>
            ))}
          </div>
          {mode === 'photo' && (
            <>
              <label className="btn fp-file">
                写真を選ぶ
                <input type="file" accept="image/*" onChange={onPhoto} />
              </label>
              <label className="fp-check">
                <input
                  type="checkbox"
                  checked={showNumbers}
                  onChange={(e) => setShowNumbers(e.target.checked)}
                />
                数字
              </label>
            </>
          )}
        </div>
      </div>

      <div className="btn-row fp-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setState(undo);
            setHintAt(null);
          }}
          disabled={state.history.length === 0 || cleared}
        >
          もどす
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setState(restart);
            setHintAt(null);
            setResult(null);
            setCopied(false);
            timer.reset();
            notified.current = false;
          }}
          disabled={state.moves === 0}
        >
          やり直し
        </button>
        <button type="button" className="btn" onClick={() => begin(mode, size)}>
          {daily ? '今日の盤' : '新しい盤'}
        </button>
        <button type="button" className="btn" onClick={showHint} disabled={cleared || !dealt}>
          ヒント
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={peek}
          aria-label="完成図を見る（押しているあいだ）"
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
          onPointerLeave={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') setPeek(true);
          }}
          onKeyUp={() => setPeek(false)}
          onBlur={() => setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* 見える文字は短くする（360px幅で5つのボタンを1段・1行に収めるため） */}
          完成図
        </button>
      </div>

      <RecordStrip
        items={[
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(entry.bestMoves ? [{ label: '最少手数', value: `${entry.bestMoves}手` }] : []),
          ...(entry.bestTimeMs ? [{ label: 'ベスト', value: formatTime(entry.bestTimeMs) }] : []),
          ...(daily && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      <p className="status-bar">
        <span>
          {state.moves}手{best !== null ? ` ／ 最短 ${best}手` : ''}
        </span>
        <span>⏱ {formatTime(result?.timeMs ?? timer.ms)}</span>
      </p>

      <div
        className={`fp-board fp-n${n}`}
        role="group"
        aria-label={`15パズルの盤面（${n}×${n}）。矢印キーでも動かせます`}
        tabIndex={0}
        onKeyDown={onBoardKeyDown}
      >
        {tiles.map(({ value, index }) => (
          <button
            key={`${n}-${value}`}
            type="button"
            className={`fp-tile${hintAt === index ? ' hinted' : ''}`}
            style={cellStyle(index, n)}
            aria-label={`${value}の板`}
            tabIndex={-1}
            onPointerDown={(e) => onTilePointerDown(e, index)}
            onPointerUp={onTilePointerUp}
            onPointerCancel={(e) => {
              if (drag.current?.pointerId === e.pointerId) drag.current = null;
            }}
            onClick={() => onTileClick(index)}
          >
            {renderFace(value)}
          </button>
        ))}

        {/* 完成図。押しているあいだだけ重ねる（板の位置は動かさない） */}
        {peek && (
          <div className="fp-peek" aria-hidden="true">
            {usePhoto ? (
              <span className="fp-peek-photo" style={{ backgroundImage: `url(${photo})` }} />
            ) : (
              solvedBoard(n)
                .filter((v) => v !== 0)
                .map((v) => (
                  <span key={v} className="fp-tile" style={cellStyle(v - 1, n)}>
                    {renderFace(v)}
                  </span>
                ))
            )}
          </div>
        )}
      </div>

      {/* 出ても消えても盤が動かないよう、高さは常に確保しておく */}
      <p className="result-row fp-result" aria-live="polite">
        {message}
      </p>

      <details className="game-tips">
        <summary>画面の見かた</summary>
        <p>
          空きの隣の板を押すと空きへすべります。
          <strong>空きと同じ行・列の遠い板を押すと、あいだの板がまとめてすべり、
          手数は動いた枚数ぶん増えます</strong>。板を空きの方へはらって（スワイプして）も動きます。
          左上から順に並び、右下が空けば完成です。
          3×3では手数の右に最短手数が出ます。キーボードでは盤を選んで矢印キーで動かします
          （← で空きの右の板が左へ入ります）。
        </p>
        <p>
          <label className="fp-check">
            <input
              type="checkbox"
              checked={inverted}
              onChange={(e) => setInverted(e.target.checked)}
            />
            矢印キーの向きを反転する（← で空きが左へ動く）
          </label>
        </p>
      </details>
    </div>
  );
}
