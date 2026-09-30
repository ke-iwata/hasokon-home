'use client';

/**
 * ターゲット計算パズルの画面。
 *
 * 仕様: docs/features/game-target-keisan.md
 *
 * 数の抽選・到達判定（部分集合 DP）・計算の弾き・採点は、すべて `lib/target-keisan.ts`（純関数）が持つ。
 * ここは**入力（タップ・キー）と描画だけ**を持つ。
 *
 * 操作は「数 → 演算 → 数」の順にタップ。結果は 2 つ目の数の場所に残り、1 つ目の場所は空く
 * （空いた枠も置いたままにして盤を動かさない）。
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  closestValue,
  combine,
  dailyPuzzles,
  DIFFICULTY_ORDER,
  formatStep,
  generate,
  initialBoard,
  invalidReason,
  isExact,
  MODE_LABEL,
  MODE_ORDER,
  OP_LABEL,
  OPS,
  shareText,
  starsFor,
  starText,
  variantOf,
  type Board,
  type Mode,
  type Op,
  type Puzzle,
} from '@/lib/target-keisan';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import type { Improved } from '@/lib/records';

/** 1 問ぶんの答え */
interface Answer {
  value: number;
  stars: number;
}

/** タイルの並び（3 列 × 2 段）。矢印キーの移動に使う */
const COLS = 3;

/** 矢印キー → 添字の増減 */
const KEY_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -COLS,
  ArrowDown: COLS,
};

/** キー → 演算（`x` も掛け算として受ける） */
const KEY_OP: Record<string, Op> = { '+': '+', '-': '-', '*': '*', x: '*', '/': '/' };

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [history, setHistory] = useState<Board[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /**
   * 今日の 3 問の ★（答えた順）。**モードを切り替えても消さない**
   * （日替わりは答えたら終わり。切り替えて戻ると解き直せる、にしない）
   */
  const [dailyStars, setDailyStars] = useState<number[]>([]);
  const dailyStarsRef = useRef<number[]>([]);
  dailyStarsRef.current = dailyStars;
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  /** 「今日」は端末のローカル日付。マウント後に決める（静的書き出しのHTMLに焼き付けない） */
  const [today, setToday] = useState('');

  const records = useRecords('target-keisan');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const counted = useRef(false);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const puzzle = puzzles[index] ?? null;
  const dailyDone = mode === 'daily' && dailyStars.length === 3;
  /** 今日の 3 問を、この端末で前に答え終えているか（記録の読み込みが済むまでは「まだ」とみなす） */
  const dailyAlreadyDone =
    mode === 'daily' && records.ready && today !== '' && entry.lastClearedOn === today && dailyStars.length === 0;
  /** 局面。表示の出し分けはこれで決める（画面の約束7） */
  const phase: 'loading' | 'playing' | 'answered' | 'finished' =
    mode === 'daily' && (dailyAlreadyDone || (dailyDone && !answer))
      ? 'finished'
      : !board || !puzzle
        ? 'loading'
        : answer
          ? 'answered'
          : 'playing';

  const loadPuzzle = useCallback((p: Puzzle | undefined) => {
    setBoard(p ? initialBoard(p.numbers) : null);
    setHistory([]);
    setSelected(null);
    setOp(null);
    setAnswer(null);
    setNote('');
  }, []);

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      // 日替わりは答えたところの続きから（答えた問題は解き直させない）
      const start = next === 'daily' ? dailyStarsRef.current.length : 0;
      setPuzzles([]);
      setIndex(start);
      setCopied(false);
      setImproved(null);
      counted.current = false;
      loadPuzzle(undefined);
      // 「作成中」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      window.setTimeout(() => {
        const made = next === 'daily' ? dailyPuzzles(dateKey) : [generate(next, Math.random)];
        setPuzzles(made);
        loadPuzzle(made[start]);
        trackToolUse('target-keisan', `new-${next}`);
      }, 0);
    },
    [loadPuzzle],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで問題が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('daily', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 答えを確定する（ぴったりなら自動、そうでなければ「これで答える」） */
  const settle = useCallback(
    (b: Board) => {
      if (!puzzle) return;
      const value = closestValue(b, puzzle.target);
      const stars = starsFor(value - puzzle.target);
      setAnswer({ value, stars });
      setSelected(null);
      setOp(null);
      setNote('');
      if (mode === 'daily') {
        const all = [...dailyStars, stars];
        setDailyStars(all);
        if (all.length === 3) {
          const total = all.reduce((s, x) => s + x, 0);
          setStreak(nextStreak(entry.lastClearedOn, today, entry.streak));
          const r = records.finish({ outcome: 'win', score: total, clearedOn: today }, variant);
          setImproved(r.improved);
          trackToolUse('target-keisan', 'daily-clear');
        }
      } else if (stars === 3) {
        const r = records.finish({ outcome: 'win', moves: b.moves.length }, variant);
        setImproved(r.improved);
        trackToolUse('target-keisan', `clear-${mode}`);
      } else {
        trackToolUse('target-keisan', `answer-${mode}`);
      }
    },
    [puzzle, mode, dailyStars, entry, today, records, variant],
  );

  const pressTile = useCallback(
    (i: number) => {
      if (!board || answer || board.slots[i] == null) return;
      setNote('');
      if (selected === null || op === null) {
        // 数を選ぶ（同じ数をもう一度押すと選び直し）
        setSelected(selected === i ? null : i);
        setOp(null);
        return;
      }
      if (selected === i) {
        setSelected(null);
        setOp(null);
        return;
      }
      const next = combine(board, selected, op, i);
      if (!next) {
        setNote(invalidReason(board.slots[selected] as number, op, board.slots[i] as number) ?? '');
        return;
      }
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      setHistory((h) => [...h, board]);
      setBoard(next);
      setOp(null);
      // 結果のタイルを選んだままにする（続けて計算しやすいように）
      setSelected(i);
      if (puzzle && isExact(next, puzzle.target)) settle(next);
    },
    [board, answer, selected, op, records, variant, puzzle, settle],
  );

  const pressOp = useCallback(
    (o: Op) => {
      if (!board || answer) return;
      if (selected === null) {
        setNote('先に数を1つ選んでください。');
        return;
      }
      setNote('');
      setOp(op === o ? null : o);
    },
    [board, answer, selected, op],
  );

  const undo = useCallback(() => {
    if (answer || history.length === 0) return;
    setBoard(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelected(null);
    setOp(null);
    setNote('');
  }, [answer, history]);

  const restart = useCallback(() => {
    if (answer || !puzzle) return;
    setBoard(initialBoard(puzzle.numbers));
    setHistory([]);
    setSelected(null);
    setOp(null);
    setNote('');
  }, [answer, puzzle]);

  const nextPuzzle = useCallback(() => {
    const n = index + 1;
    setIndex(n);
    loadPuzzle(puzzles[n]);
  }, [index, puzzles, loadPuzzle]);

  // 答えたら、次に押すボタン（次の問題・結果をコピー・新しい問題）へフォーカスを移す
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (answer) nextRef.current?.focus();
  }, [answer]);

  /** キーボード：矢印でタイルを移動、`+ - * /` で演算、Backspace で戻す */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!board || answer) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        undo();
        return;
      }
      const o = KEY_OP[e.key];
      if (o) {
        e.preventDefault();
        pressOp(o);
        return;
      }
      const step = KEY_STEP[e.key];
      if (step === undefined) return;
      const current = tileRefs.current.findIndex((el) => el === document.activeElement);
      e.preventDefault();
      // 空いた枠は飛ばして、同じ向きの次のタイルへ
      let i = current < 0 ? (selected ?? -1) : current;
      for (let k = 0; k < board.slots.length; k++) {
        i += step;
        if (i < 0 || i >= board.slots.length) {
          if (Math.abs(step) === 1) i = (i + board.slots.length) % board.slots.length;
          else return;
        }
        if (board.slots[i] != null) {
          tileRefs.current[i]?.focus();
          return;
        }
      }
    },
    [board, answer, selected, undo, pressOp],
  );

  const copyResult = useCallback(() => {
    const text = shareText({
      dateKey: today,
      stars: dailyStars,
      streak,
      url: `${SITE_URL}/target-keisan/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('target-keisan', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [today, dailyStars, streak]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const history3 = board ? board.moves.slice(-3) : [];

  const dailyTotal = dailyStars.reduce((s, x) => s + x, 0);

  /**
   * 状態の行（高さは固定）。**入れるのは「いま」の 1 件だけ**にする
   * （合計・連続は `.tk-meta` へ。詰め込むと ellipsis で「ベスト更新！」が切れた。#300 のレビュー）
   */
  let status: ReactNode;
  if (phase === 'finished') {
    status =
      dailyStars.length === 3
        ? dailyStars.map(starText).join(' ')
        : '今日の3問はこの端末で答えました。';
  } else if (phase === 'answered' && answer && puzzle) {
    const diff = answer.value - puzzle.target;
    status = (
      <span style={{ color: answer.stars === 3 ? 'var(--ok)' : undefined, fontWeight: 700 }}>
        {answer.stars === 3 ? '🎉 ぴったり！' : `答え ${answer.value}（差 ${Math.abs(diff)}）`}{' '}
        <span aria-label={`星${answer.stars}つ`}>{starText(answer.stars)}</span>
        <BestBadge improved={improved} />
      </span>
    );
  } else {
    // 計算の直後は結果のタイルを選んだままにしているので、何を選んでいるかを出す
    // （出さないと、続けて使おうとその数を押して選択を外してしまう。#300 のレビュー）
    const picked = selected !== null ? board?.slots[selected] : null;
    status =
      note ||
      (picked != null
        ? op
          ? `${picked} ${OP_LABEL[op]} …つなぐ数を選ぶ`
          : `${picked} を選んでいます。演算を選ぶ`
        : '数 → 演算 → 数の順にタップ');
  }

  return (
    <div className="card tk-game" onKeyDown={onKeyDown}>
      <div className="btn-row">
        <div className="seg" role="group" aria-label="モード">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => {
                setMode(m);
                newGame(m, today);
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <RecordStrip
        items={[
          ...(mode === 'daily' && entry.bestScore ? [{ label: '★のベスト', value: `${entry.bestScore}／9` }] : []),
          ...(mode !== 'daily' && entry.wins ? [{ label: 'ぴったり', value: `${entry.wins}回` }] : []),
          ...(mode !== 'daily' && entry.bestMoves ? [{ label: '最短', value: `${entry.bestMoves}手` }] : []),
          ...(mode === 'daily' && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      <div className="tk-head">
        <div className="tk-target" aria-live="polite">
          <span className="tk-target-label">目標</span>
          <span className="tk-target-num">{phase === 'playing' || phase === 'answered' ? puzzle?.target : '—'}</span>
        </div>
        <div className="tk-meta">
          {mode === 'daily'
            ? dailyDone || phase === 'finished'
              ? dailyStars.length === 3
                ? `合計 ★${dailyTotal}／9${streak ? `・連続${streak}日` : ''}`
                : '今日の3問 おわり'
              : `今日の1問 ${Math.min(index + 1, 3)}／3`
            : MODE_LABEL[mode]}
        </div>
      </div>

      {phase === 'finished' || phase === 'loading' || !board ? (
        <div className="tk-loading">
          {phase === 'finished'
            ? '明日また新しい3問が出ます。「やさしい」〜「むずかしい」はいつでも遊べます。'
            : '問題を作っています…'}
        </div>
      ) : (
        <>
          <div className="tk-tiles" role="group" aria-label="数のタイル。矢印キーで移動、Space・Enterで選びます">
            {board.slots.map((v, i) =>
              v === null ? (
                <div key={i} className="tk-tile tk-empty" aria-hidden="true" />
              ) : (
                <button
                  key={i}
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  type="button"
                  className={[
                    'tk-tile',
                    i === selected ? 'selected' : '',
                    puzzle && v === puzzle.target ? 'hit' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={i === selected}
                  disabled={answer !== null}
                  onClick={() => pressTile(i)}
                >
                  {v}
                </button>
              ),
            )}
          </div>

          <div className="tk-ops" role="group" aria-label="演算">
            {OPS.map((o) => (
              <button
                key={o}
                type="button"
                className={`tk-op${o === op ? ' selected' : ''}`}
                aria-pressed={o === op}
                aria-label={{ '+': '足す', '-': '引く', '*': '掛ける', '/': '割る' }[o]}
                disabled={answer !== null}
                onClick={() => pressOp(o)}
              >
                {OP_LABEL[o]}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="tk-status">{status}</p>

      {/* 式の履歴（3行まで）。答えたあとは同じ枠に解答例を出す */}
      <div className="tk-log" aria-live="polite">
        {phase === 'answered' && puzzle ? (
          <>
            <div className="tk-log-head">解答例</div>
            {puzzle.solution.map((s, k) => (
              <div key={k}>{formatStep(s)}</div>
            ))}
          </>
        ) : (
          history3.map((m, k) => <div key={k}>{formatStep(m)}</div>)
        )}
      </div>

      <div className="btn-row tk-actions">
        {phase === 'finished' ? (
          dailyStars.length === 3 ? (
            <button type="button" className="btn btn-primary" onClick={copyResult}>
              {copied ? 'コピーしました' : '結果をコピー'}
            </button>
          ) : null
        ) : phase === 'answered' ? (
          mode === 'daily' ? (
            dailyDone ? (
              <button ref={nextRef} type="button" className="btn btn-primary" onClick={copyResult}>
                {copied ? 'コピーしました' : '結果をコピー'}
              </button>
            ) : (
              <button ref={nextRef} type="button" className="btn btn-primary" onClick={nextPuzzle}>
                次の問題へ
              </button>
            )
          ) : (
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={() => newGame(mode, today)}>
              新しい問題
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn" onClick={undo} disabled={!board || history.length === 0}>
              もどす
            </button>
            <button type="button" className="btn" onClick={restart} disabled={!board || history.length === 0}>
              最初から
            </button>
            <button type="button" className="btn" onClick={() => board && settle(board)} disabled={phase !== 'playing'}>
              これで答える
            </button>
          </>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          数を1つ選び、演算を選び、もう1つ数を選ぶと計算されて、結果が2つ目の数の場所に残ります。
          <strong>途中の結果は正の整数だけ</strong>（引いて0以下・割り切れない割り算はできません）。
          ぴったりになると自動で答えになります。ならないときは「これで答える」で、
          盤にある数のうち目標にいちばん近いものが答えになります。
          {mode === 'daily'
            ? '「今日の3問」は日付から作る全員共通の問題で、1問ずつ答えたら次へ進みます（やり直しはできません）。'
            : `難易度は目標を作るのに要る最短の手数で決めています（${DIFFICULTY_ORDER.map((d) => MODE_LABEL[d]).join('・')}）。`}
        </p>
      </details>
    </div>
  );
}
