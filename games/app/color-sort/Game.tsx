'use client';

/**
 * 色水ソートの画面。
 *
 * 仕様: docs/features/game-color-sort.md
 *
 * ロジック（注げる条件・まとめて移動・出題）は `lib/color-sort.ts` の純関数。
 * ここは**入力（タップ2回）と描画（SVGの試験管）だけ**を持つ。
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DIFFICULTIES,
  generatePuzzle,
  isSolved,
  isStuck,
  pour,
  topColor,
  TUBE_HEIGHT,
  tubeCount,
  type Board,
  type Difficulty,
  type Tube,
} from '@/lib/color-sort';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import type { Improved } from '@/lib/records';

/** 「もどす」でさかのぼれる手数（仕様の「直近30手」） */
const UNDO_LIMIT = 30;

/** 1行に並べる試験管の本数。これを超えたら折り返す（折り返す行数から盤の高さが決まる） */
const PER_ROW = 7;

/**
 * 色水の色。**特定アプリの配色はなぞらず**、色相を離して12色そろえている。
 *
 * 並びは「模様」との組み合わせで決まっている。模様は `PATTERNS`（6種類）を
 * 色番号の6で割った余りで選ぶので、**6つ離れた色どうしが同じ模様になる**。
 * そこが似た色だと模様を出す意味が無くなるため、
 * 0と6・1と7…がはっきり違う色相になるよう並べてある。
 *
 * 明暗どちらのテーマでも地（`--surface`）から浮くよう、中間の明度でそろえる。
 */
const PALETTE = [
  '#e11d48', // 0 赤
  '#2563eb', // 1 青
  '#f59e0b', // 2 黄
  '#16a34a', // 3 緑
  '#7c3aed', // 4 紫
  '#0d9488', // 5 青緑
  '#65a30d', // 6 黄緑
  '#c2410c', // 7 橙
  '#4338ca', // 8 藍
  '#db2777', // 9 桃
  '#0891b2', // 10 水色
  '#a16207', // 11 茶
];

/** 読み上げと「見分け」の助けに使う色の名前（PALETTE と同じ並び） */
const COLOR_NAMES = [
  '赤',
  '青',
  '黄',
  '緑',
  '紫',
  '青緑',
  '黄緑',
  '橙',
  '藍',
  '桃',
  '水色',
  '茶',
];

/**
 * 色の上に重ねる模様（色覚多様性への配慮。仕様の5）。
 *
 * `<pattern>` を使わずに図形を直接置いているのは、`id` の重複と参照を避けるため
 * （試験管ごとにSVGを分けているので、defs を共有すると id を配りきる手間が出る）。
 * 帯の中に収まる形だけを使えば、切り抜き（clipPath）も要らない。
 */
const PATTERNS = ['plain', 'hstripe', 'dots', 'vstripe', 'cross', 'ring'] as const;

// ---- 試験管の寸法（SVGのユーザー座標。CSSの幅に対して相似で拡大縮小される） ----
const VIEW_W = 44;
const VIEW_H = 148;
/** ガラスの内側 */
const X0 = 4;
const X1 = 40;
const TOP = 8;
const BOTTOM = 140;
/** 底の丸み。左右の直線部が残るよう、内側の幅の半分より小さくする */
const RADIUS = 14;
/** 1段ぶんの高さ */
const UNIT = (BOTTOM - TOP) / TUBE_HEIGHT;

/** 底の丸みを含む輪郭（`fromY` から底まで）。液の最下段と試験管本体で使い回す */
function bottomShape(fromY: number): string {
  return `M${X0} ${fromY} H${X1} V${BOTTOM - RADIUS} A${RADIUS} ${RADIUS} 0 0 1 ${X1 - RADIUS} ${BOTTOM} H${X0 + RADIUS} A${RADIUS} ${RADIUS} 0 0 1 ${X0} ${BOTTOM - RADIUS} Z`;
}

/** 下から `level` 段目（0が底）の液の形 */
function segmentPath(level: number): string {
  const top = BOTTOM - (level + 1) * UNIT;
  if (level === 0) return bottomShape(top);
  return `M${X0} ${top} H${X1} V${BOTTOM - level * UNIT} H${X0} Z`;
}

/** 液の帯に重ねる模様。白の細線なので、どの色の上でも見える */
function PatternMarks({ level, color }: { level: number; color: number }) {
  const top = BOTTOM - (level + 1) * UNIT;
  const mid = top + UNIT / 2;
  const cx = (X0 + X1) / 2;
  const kind = PATTERNS[color % PATTERNS.length];
  const line = { stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2.5, strokeLinecap: 'round' as const };

  if (kind === 'hstripe') {
    return (
      <>
        <line x1={X0 + 5} y1={mid - 7} x2={X1 - 5} y2={mid - 7} {...line} />
        <line x1={X0 + 5} y1={mid + 7} x2={X1 - 5} y2={mid + 7} {...line} />
      </>
    );
  }
  if (kind === 'dots') {
    return (
      <>
        {[cx - 9, cx, cx + 9].map((x) => (
          <circle key={x} cx={x} cy={mid} r={2.6} fill="rgba(255,255,255,0.85)" />
        ))}
      </>
    );
  }
  if (kind === 'vstripe') {
    return (
      <>
        <line x1={cx - 7} y1={top + 6} x2={cx - 7} y2={top + UNIT - 6} {...line} />
        <line x1={cx + 7} y1={top + 6} x2={cx + 7} y2={top + UNIT - 6} {...line} />
      </>
    );
  }
  if (kind === 'cross') {
    return (
      <>
        <line x1={X0 + 6} y1={mid} x2={X1 - 6} y2={mid} {...line} />
        <line x1={cx} y1={top + 6} x2={cx} y2={top + UNIT - 6} {...line} />
      </>
    );
  }
  if (kind === 'ring') {
    return <circle cx={cx} cy={mid} r={7} fill="none" {...line} />;
  }
  return null;
}

/** 試験管1本。押す先そのものなので `<button>` で作る */
function TubeView({
  tube,
  index,
  selected,
  patterned,
  onSelect,
}: {
  tube: Tube;
  index: number;
  selected: boolean;
  patterned: boolean;
  onSelect: () => void;
}) {
  const contents =
    tube.length === 0
      ? '空'
      : `上から ${[...tube]
          .reverse()
          .map((c) => COLOR_NAMES[c % COLOR_NAMES.length])
          .join('・')}`;

  return (
    <button
      type="button"
      className={`cs-tube${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${index + 1}本目の試験管、${contents}`}
      onClick={onSelect}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
        {/* ガラスの内側。液が入っていない部分の地になる */}
        <path d={bottomShape(TOP)} className="cs-glass" />
        {tube.map((color, level) => (
          <g key={level}>
            <path d={segmentPath(level)} fill={PALETTE[color % PALETTE.length]} />
            {patterned && <PatternMarks level={level} color={color} />}
          </g>
        ))}
        {/* 輪郭は液の上に描く（液の縁が輪郭からはみ出して見えないように） */}
        <path d={bottomShape(TOP)} className="cs-outline" />
      </svg>
    </button>
  );
}

export default function Game() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  /** 配ったときの盤面。「最初から」で必ずここに戻す */
  const [initial, setInitial] = useState<Board>([]);
  const [board, setBoard] = useState<Board>([]);
  /** 「もどす」用。直近 UNDO_LIMIT 手ぶんだけ持つ */
  const [history, setHistory] = useState<Board[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [patterned, setPatterned] = useState(false);
  /** 連続クリア。クリアせずに別の問題へ移ったら0に戻る */
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState<{ moves: number; improved: Improved } | null>(null);

  // 記録は難易度ごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('color-sort');
  const entry = records.entry(difficulty);
  /** 1手目を指したか（プレイ数は「1手でも動かしたゲーム」だけ数える） */
  const counted = useRef(false);
  /** クリアを二重に記録しないための目印 */
  const notified = useRef(false);

  /**
   * 新しい問題を配る。
   *
   * 生成はマウント後に行う（静的書き出しのHTMLとブラウザで盤面が食い違わないように）。
   *
   * `keepStreak` は連続クリアを持ち越すかどうか。**クリアしてから次の問題へ進むときだけ
   * 持ち越す**（それが「連続クリア」の意味）。クリアせずに別の問題へ移ったときと、
   * 難易度を変えたときは切れる（記録は難易度ごとなので、またぐと数えられない）。
   */
  const deal = useCallback((next: Difficulty, keepStreak = false) => {
    const { board: dealt } = generatePuzzle(next);
    setInitial(dealt);
    setBoard(dealt);
    setHistory([]);
    setSelected(null);
    setMoves(0);
    setResult(null);
    if (!keepStreak) setStreak(0);
    counted.current = false;
    notified.current = false;
    trackToolUse('color-sort', `new-${next}`);
  }, []);

  useEffect(() => {
    deal('easy');
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // クリア判定。手数は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (board.length === 0 || notified.current || !isSolved(board)) return;
    notified.current = true;
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    trackToolUse('color-sort', `clear-${difficulty}`);
    // 連続クリアの最高記録は `bestScore`（大きいほうが良い記録）に入れる。
    // 記録の共通モジュールに専用の項目を足すほどのものではないため
    const { improved } = records.finish(
      { outcome: 'win', moves, score: nextStreak },
      difficulty,
    );
    setResult({ moves, improved });
  }, [board, difficulty, moves, records, streak]);

  /** 試験管をタップしたとき（1回目＝注ぎ元、2回目＝注ぎ先） */
  const tap = useCallback(
    (index: number) => {
      if (board.length === 0 || result) return;
      if (selected === null) {
        // 空の試験管は注ぎ元にできない（押しても何も起きない）
        if (board[index].length > 0) setSelected(index);
        return;
      }
      if (selected === index) {
        setSelected(null);
        return;
      }
      const next = pour(board, selected, index);
      if (next === board) {
        // 注げない先だった。選び直しの手間を減らすため、そこを新しい注ぎ元にする
        setSelected(board[index].length > 0 ? index : null);
        return;
      }
      if (!counted.current) {
        counted.current = true;
        records.start(difficulty);
      }
      setHistory((h) => [...h, board].slice(-UNDO_LIMIT));
      setBoard(next);
      setSelected(null);
      setMoves((m) => m + 1);
    },
    [board, selected, result, records, difficulty],
  );

  const undo = useCallback(() => {
    if (history.length === 0 || result) return;
    setBoard(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
    setMoves((m) => Math.max(0, m - 1));
  }, [history, result]);

  /** 配られた盤面に戻す（問題は変えない） */
  const restart = useCallback(() => {
    setBoard(initial);
    setHistory([]);
    setSelected(null);
    setMoves(0);
    setResult(null);
    notified.current = false;
  }, [initial]);

  if (board.length === 0) {
    return <div className="card">読み込み中…</div>;
  }

  const cleared = result !== null;
  const stuck = isStuck(board);
  const rows = Math.ceil(board.length / PER_ROW);

  return (
    <div className="card cs-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((key) => (
            <button
              key={key}
              type="button"
              className={key === difficulty ? 'active' : ''}
              aria-pressed={key === difficulty}
              onClick={() => {
                setDifficulty(key);
                deal(key);
              }}
            >
              {DIFFICULTIES[key].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={undo} disabled={history.length === 0 || cleared}>
          もどす
        </button>
        <button type="button" className="btn" onClick={restart} disabled={moves === 0}>
          最初から
        </button>
        {/* クリアしたら次の問題へ進むボタンとして目立たせる（仕様の「クリアするごとに次の盤面」） */}
        <button
          type="button"
          className={cleared ? 'btn btn-primary' : 'btn'}
          onClick={() => deal(difficulty, cleared)}
        >
          {cleared ? '次の問題へ' : '新しい問題'}
        </button>
        <label className="cs-pattern">
          <input
            type="checkbox"
            checked={patterned}
            onChange={(e) => setPatterned(e.target.checked)}
          />
          模様をつける
        </label>
      </div>

      {/* 記録は「いま選んでいる難易度」のもの */}
      <RecordStrip
        items={[
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(entry.bestMoves ? [{ label: '最少手数', value: `${entry.bestMoves}手` }] : []),
          ...(entry.bestScore ? [{ label: '連続クリア', value: `最高${entry.bestScore}回` }] : []),
        ]}
      />

      <p className="status-bar">
        <span>
          {DIFFICULTIES[difficulty].colors}色・試験管{tubeCount(difficulty)}本
        </span>
        <span>
          {moves}手{streak > 0 && `／連続${streak}回`}
        </span>
      </p>

      {/* 行数から盤の高さが決まるので、CSSに変数で渡す（インラインで幅を渡さない）*/}
      <div
        className="cs-board"
        style={{ '--cs-rows': rows } as CSSProperties}
        role="group"
        aria-label="色水ソートの盤面"
      >
        {board.map((tube, i) => (
          <TubeView
            key={i}
            tube={tube}
            index={i}
            selected={selected === i}
            patterned={patterned}
            onSelect={() => tap(i)}
          />
        ))}
      </div>

      {/* 出ても消えても盤が動かないよう、高さは常に確保しておく */}
      <p className="result-row">
        {cleared ? (
          <span style={{ color: 'var(--ok)' }}>
            🎉 クリア！{result.moves}手
            {!result.improved.moves && entry.bestMoves ? `（最少 ${entry.bestMoves}手）` : ''}
            <BestBadge improved={result.improved} />
          </span>
        ) : stuck ? (
          <span style={{ color: 'var(--danger)' }}>
            注げる先がありません。「もどす」で戻せます
          </span>
        ) : selected !== null ? (
          <span>
            {COLOR_NAMES[(topColor(board[selected]) ?? 0) % COLOR_NAMES.length]}を注ぐ先をタップ
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
      </p>

      <details className="game-tips">
        <summary>画面の見かた</summary>
        <p>
          試験管をタップすると持ち上がります。もう一度別の試験管をタップすると、
          いちばん上の色水がそこへ注がれます。注げるのは
          <strong>同じ色の上か、空の試験管だけ</strong>です。
          上に続いている同じ色はまとめて動き、注ぎ先がいっぱいになったところで止まります。
          「模様をつける」を押すと、色ごとに違う模様が重なって色の見分けがつきやすくなります。
        </p>
      </details>
    </div>
  );
}
