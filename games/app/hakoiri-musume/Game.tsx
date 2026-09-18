'use client';

/**
 * 箱入り娘の画面。
 *
 * 仕様: docs/features/game-hakoiri-musume.md
 *
 * 盤の状態・手数・履歴・最短手数はすべて `lib/hakoiri-musume.ts`（純関数）が持つ。
 * ここは**入力（スワイプ／ドラッグとタップ）と描画だけ**を持つ。
 * 駒の移動アニメーションはCSSの `transition` に任せていて、
 * 「動いている途中」という状態はどこにも持たない（画面の約束9）。
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  BOARD_H,
  BOARD_W,
  DEFAULT_LEVEL_ID,
  directionFromDelta,
  isCleared,
  LEVEL_GROUPS,
  LEVELS,
  levelById,
  levelsOf,
  maxSlide,
  moveToward,
  play,
  restart,
  sizeOf,
  startLevel,
  undo,
  type Direction,
  type Level,
  type LevelGroup,
  type Piece,
  type PlayState,
} from '@/lib/hakoiri-musume';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/** 駒に出す文字。**娘だけ文字を載せる**（同じ形の駒は区別する必要がない） */
const PIECE_LABEL: Partial<Record<Piece['kind'], string>> = { daughter: '娘' };

/** 読み上げ用の駒の呼び名（盤上には出さない） */
const PIECE_NAME: Record<Piece['kind'], string> = {
  daughter: '娘',
  tall: '縦長の駒',
  wide: '横長の駒',
  small: '小さい駒',
};

/** 盤のマスを % で表す（駒の位置と大きさ） */
function cellStyle(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    left: `${(x / BOARD_W) * 100}%`,
    top: `${(y / BOARD_H) * 100}%`,
    width: `${(w / BOARD_W) * 100}%`,
    height: `${(h / BOARD_H) * 100}%`,
  };
}

export default function Game() {
  const [level, setLevel] = useState<Level>(() => levelById(DEFAULT_LEVEL_ID));
  const [state, setState] = useState<PlayState>(() => startLevel(levelById(DEFAULT_LEVEL_ID)));
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ moves: number; timeMs: number; improved: Improved } | null>(
    null,
  );

  // 記録はレベルごとに分けて持つ（docs/features/game-records.md の variant）
  const records = useRecords('hakoiri-musume');
  const entry = records.entry(level.id);
  const timer = useStopwatch();
  /** 1手目を指したか（プレイ数は「1手でも動かしたゲーム」だけ数える） */
  const counted = useRef(false);
  /** クリアを二重に記録しないための目印 */
  const notified = useRef(false);
  /** スワイプの始点 */
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);

  const cleared = result !== null;

  /** レベルを始める（同じレベルを選び直したときも最初から） */
  const begin = useCallback(
    (next: Level) => {
      setLevel(next);
      setState(startLevel(next));
      setSelected(null);
      setResult(null);
      timer.reset();
      counted.current = false;
      notified.current = false;
      trackToolUse('hakoiri-musume', `start-${next.id}`);
    },
    [timer],
  );

  // クリア判定。時間は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (notified.current || !isCleared(state.board)) return;
    notified.current = true;
    const timeMs = timer.stop();
    trackToolUse('hakoiri-musume', `clear-${level.id}`);
    const { improved } = records.finish({ outcome: 'win', moves: state.moves, timeMs }, level.id);
    setResult({ moves: state.moves, timeMs, improved });
  }, [state.board, state.moves, level.id, records, timer]);

  /** 1手指す。空振り（動かせない操作）では手数も履歴も増えない */
  const move = useCallback(
    (id: string, dir: Direction, steps: number) => {
      if (cleared) return;
      const next = play(state, id, dir, steps);
      setSelected(null);
      if (next === state) return;
      if (!counted.current) {
        // プレイ数と時間は「1手目を指したとき」から数える
        counted.current = true;
        records.start(level.id);
        timer.begin();
      }
      setState(next);
    },
    [cleared, state, level.id, records, timer],
  );

  /** 駒を押したところ。ここから指を滑らせるとスワイプになる */
  const onPiecePointerDown = (e: PointerEvent<HTMLButtonElement>, piece: Piece) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: piece.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  /**
   * 指を離したところ。**離した位置ではなく動かした方向**で向きを決める。
   * 動きが小さければスワイプではなくタップ（駒を選ぶ）として扱う。
   */
  const onPiecePointerUp = (e: PointerEvent<HTMLButtonElement>, piece: Piece) => {
    const start = drag.current;
    drag.current = null;
    if (start === null || start.pointerId !== e.pointerId || start.id !== piece.id) return;
    const dir = directionFromDelta(e.clientX - start.x, e.clientY - start.y);
    if (dir === null) {
      // タップ：選ぶ／選び直す
      setSelected((current) => (current === piece.id ? null : piece.id));
      return;
    }
    // スワイプ：空きが続くかぎりその方向へ（何マス動いても1手）
    move(piece.id, dir, maxSlide(state.board, piece.id, dir));
  };

  /** 空きマスをタップしたとき（駒を選んでから動かす操作） */
  const onCellTap = (x: number, y: number) => {
    if (selected === null || cleared) return;
    const step = moveToward(state.board, selected, x, y);
    if (step === null) {
      setSelected(null);
      return;
    }
    move(step.id, step.dir, step.steps);
  };

  const cells = Array.from({ length: BOARD_W * BOARD_H }, (_, i) => ({
    x: i % BOARD_W,
    y: Math.floor(i / BOARD_W),
  }));
  const selectedKind = state.board.find((piece) => piece.id === selected)?.kind ?? null;

  return (
    <div className="card hm-game">
      {/* レベルは畳まない（画面の約束5）。区分で1段、その中の面で1段の計2段。
          **面が1つしかない区分（標準）でも段は置く**（条件で段を出し入れすると、
          切り替えた瞬間に盤の位置が動く。画面の約束1） */}
      <div className="hm-levels">
        <div className="seg" role="group" aria-label="レベルの種類">
          {(Object.keys(LEVEL_GROUPS) as LevelGroup[]).map((group) => (
            <button
              key={group}
              type="button"
              className={group === level.group ? 'active' : ''}
              aria-pressed={group === level.group}
              onClick={() => begin(levelsOf(group)[0])}
            >
              {LEVEL_GROUPS[group].label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="何面目">
          {levelsOf(level.group).map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={item.id === level.id ? 'active' : ''}
              aria-pressed={item.id === level.id}
              aria-label={`${item.name}（最短${item.minMoves}手）`}
              onClick={() => begin(item)}
            >
              {levelsOf(level.group).length === 1 ? LEVEL_GROUPS[level.group].label : `${i + 1}面`}
            </button>
          ))}
        </div>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setState(undo);
            setSelected(null);
          }}
          disabled={state.history.length === 0 || cleared}
        >
          1手もどす
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setState(restart);
            setSelected(null);
            setResult(null);
            timer.reset();
            notified.current = false;
          }}
          disabled={state.moves === 0}
        >
          最初から
        </button>
      </div>

      {/* 記録は「いま選んでいるレベル」のもの */}
      <RecordStrip
        items={[
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(entry.bestMoves ? [{ label: '最少手数', value: `${entry.bestMoves}手` }] : []),
          ...(entry.bestTimeMs
            ? [{ label: 'ベストタイム', value: formatTime(entry.bestTimeMs) }]
            : []),
        ]}
      />

      <p className="status-bar">
        <span>{level.name}</span>
        <span>
          {state.moves}手 ／ 最短 {level.minMoves}手{'　'}⏱ {formatTime(result?.timeMs ?? timer.ms)}
        </span>
      </p>

      <div className="hm-board" role="group" aria-label="箱入り娘の盤面">
        {/* 空きマスの押し先。駒の下に敷く（駒を選んでから行き先を押す操作） */}
        {cells.map(({ x, y }) => (
          <button
            key={`${x}-${y}`}
            type="button"
            className="hm-cell"
            style={cellStyle(x, y, 1, 1)}
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => onCellTap(x, y)}
          />
        ))}

        {state.board.map((piece) => {
          const { w, h } = sizeOf(piece);
          return (
            <button
              key={piece.id}
              type="button"
              className={`hm-piece hm-${piece.kind}${selected === piece.id ? ' selected' : ''}`}
              style={cellStyle(piece.x, piece.y, w, h)}
              aria-pressed={selected === piece.id}
              aria-label={`${PIECE_NAME[piece.kind]}、左から${piece.x + 1}・上から${piece.y + 1}`}
              onPointerDown={(e) => onPiecePointerDown(e, piece)}
              onPointerUp={(e) => onPiecePointerUp(e, piece)}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <span aria-hidden="true">{PIECE_LABEL[piece.kind] ?? ''}</span>
            </button>
          );
        })}

        {/* 出口。下辺の中央2マスに印を置く（盤の外側に線で示す） */}
        <span className="hm-exit" aria-hidden="true" />
      </div>

      {/* 出ても消えても盤が動かないよう、高さは常に確保しておく */}
      <p className="result-row">
        {cleared ? (
          <span style={{ color: 'var(--ok)' }}>
            🎉 クリア！{result.moves}手
            {result.moves > level.minMoves
              ? `（最短より${result.moves - level.minMoves}手多い）`
              : '（最短です！）'}
            <BestBadge improved={result.improved} />
          </span>
        ) : selected !== null ? (
          <span>{PIECE_NAME[selectedKind ?? 'small']}を、動かしたい方向へはらうか行き先をタップ</span>
        ) : (
          <span>&nbsp;</span>
        )}
      </p>

      <details className="game-tips">
        <summary>画面の見かた</summary>
        <p>
          駒を<strong>動かしたい方向へはらう（スワイプ・ドラッグ）</strong>と、
          空いているところまで滑ります。何マス滑っても1手です。
          はらうのが難しいときは、駒をタップして選んでから
          <strong>行き先の空いているマスをタップ</strong>しても動かせます。
          <strong>「娘」と書かれた大きな駒を、盤の下の出口（太い線のところ）まで
          下ろせばクリア</strong>です。手数の右の「最短」は、この配置を解くのに
          最低限かかる手数です。
        </p>
      </details>
    </div>
  );
}
