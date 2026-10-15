'use client';

/**
 * ヒット＆ブロー（数あて）の画面。
 *
 * 仕様: docs/features/game-hit-blow.md
 *
 * 判定・候補・CPU の推理・日替わりの答え・勝敗は、すべて `lib/hit-blow.ts`（純関数）が持つ。
 * ここは**入力（テンキー・キーボード）と描画だけ**を持つ。
 *
 * ## 高さの優先順位は テンキー ＞ 入力欄 ＞ メモ ＞ 表
 *
 * 表（`.hb-log`）だけが伸び縮みし、`height` を画面の高さから決めて中だけがスクロールする
 * （画面の約束 1）。テンキー・入力欄の高さは固定。
 *
 * ## メモはテンキーに重ねる
 *
 * 0〜9 のメモ札を 1 列に並べると、320px 幅で 1 枚が 27px ほどになり、押す先 44px（画面の約束 4）を割る。
 * そこで札はテンキーの各キーに色として重ね、「メモ」を押しているあいだはキーのタップで
 * 「無い（灰）／ある（黄）／未定」を切り替える（答えには影響しない）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  cpuGuess,
  DAILY_DIGITS,
  dailySecret,
  DIGIT_OPTIONS,
  HINT_AFTER_MOVES,
  isSolved,
  isValidCode,
  LEVEL_LABEL,
  LEVEL_ORDER,
  matchOutcome,
  MODE_LABEL,
  MODE_ORDER,
  randomCode,
  readDailyProgress,
  remainingCount,
  replay,
  score,
  shareText,
  variantOf,
  writeDailyProgress,
  type Code,
  type Digits,
  type Level,
  type MatchOutcome,
  type Mode,
  type Turn,
} from '@/lib/hit-blow';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { browserStorage, type Improved } from '@/lib/records';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';

/** CPU の 1 手の間（ms）。考えている様子が見える程度 */
const CPU_DELAY_MS = 700;

/** 対戦で CPU が隠す・推理する数の桁数 */
const CPU_DIGITS: Digits = 4;

/** メモの状態（未定 → 無い → ある → 未定） */
type Memo = 'none' | 'no' | 'yes';
const NEXT_MEMO: Record<Memo, Memo> = { none: 'no', no: 'yes', yes: 'none' };
const EMPTY_MEMO: Memo[] = Array.from({ length: 10 }, () => 'none');

/** テンキーの並び（5×2） */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** 局面。表示の出し分けはこれで決める（画面の約束 7） */
type Phase = 'loading' | 'setup' | 'playing' | 'cpu-thinking' | 'over';

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [digits, setDigits] = useState<Digits>(4);
  const [level, setLevel] = useState<Level>('normal');
  /** 次の対局で利用者が先手か。1 局ごとに交互（最初の 1 局は先手） */
  const [userFirst, setUserFirst] = useState(true);
  const [today, setToday] = useState('');

  const [phase, setPhase] = useState<Phase>('loading');
  const [secret, setSecret] = useState<Code>('');
  /** 利用者の手（今日の 1 問・練習では答えに、対戦では CPU の数に対して） */
  const [turns, setTurns] = useState<Turn[]>([]);
  /** 対戦：利用者が隠した数と、CPU の手 */
  const [userSecret, setUserSecret] = useState<Code>('');
  const [cpuTurns, setCpuTurns] = useState<Turn[]>([]);
  /** 対戦：この局で利用者が先手か（局の途中で切り替えを押しても変わらない） */
  const [userFirstNow, setUserFirstNow] = useState(true);
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'draw' | null>(null);

  const [input, setInput] = useState('');
  const [memo, setMemo] = useState<Memo[]>(EMPTY_MEMO);
  const [memoMode, setMemoMode] = useState(false);
  const [note, setNote] = useState('');
  const [hint, setHint] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [streak, setStreak] = useState<number | undefined>(undefined);

  const records = useRecords('hit-blow');
  const variant = variantOf(mode, digits, level);
  const entry = records.entry(variant);
  const counted = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const cpuLogRef = useRef<HTMLDivElement>(null);
  const cpuTimer = useRef<number | null>(null);

  /** いま入力する数の桁数 */
  const width: Digits = mode === 'daily' ? DAILY_DIGITS : mode === 'cpu' ? CPU_DIGITS : digits;

  const clearCpuTimer = () => {
    if (cpuTimer.current !== null) {
      window.clearTimeout(cpuTimer.current);
      cpuTimer.current = null;
    }
  };

  const resetBoard = useCallback(() => {
    clearCpuTimer();
    setTurns([]);
    setCpuTurns([]);
    setInput('');
    setMemo(EMPTY_MEMO);
    setMemoMode(false);
    setNote('');
    setHint(null);
    setCopied(false);
    setImproved(null);
    setOutcome(null);
    setUserSecret('');
    counted.current = false;
  }, []);

  /** 新しい局を始める。今日の 1 問は保存してある途中経過から戻す */
  const start = useCallback(
    (next: Mode, opts: { digits: Digits; firstNow: boolean; dateKey: string }) => {
      resetBoard();
      if (next === 'daily') {
        const answer = dailySecret(opts.dateKey);
        const guesses = readDailyProgress(browserStorage(), opts.dateKey);
        const restored = replay(answer, guesses);
        setSecret(answer);
        setTurns(restored);
        counted.current = restored.length > 0;
        setPhase(restored.some((t) => isSolved(t, DAILY_DIGITS)) ? 'over' : 'playing');
      } else if (next === 'practice') {
        setSecret(randomCode(opts.digits, Math.random));
        setPhase('playing');
      } else {
        // CPU の数はここで決めて、勝敗が決まるまで見せない
        setSecret(randomCode(CPU_DIGITS, Math.random));
        setUserFirstNow(opts.firstNow);
        setPhase('setup');
      }
      trackToolUse('hit-blow', `new-${next}`);
    },
    [resetBoard],
  );

  // 「今日」と答えはマウント後に決める（静的書き出しのHTMLに焼き付けない）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    start('daily', { digits: 4, firstNow: true, dateKey: key });
    return clearCpuTimer;
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新しい手が増えたら、表の最新の手が見えるように送る
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns.length]);
  useEffect(() => {
    cpuLogRef.current?.scrollTo({ top: cpuLogRef.current.scrollHeight });
  }, [cpuTurns.length]);

  /** 対戦：手数がそろったところで勝敗を見る */
  const settleMatch = useCallback(
    (mine: Turn[], cpus: Turn[], firstIsUser: boolean): MatchOutcome | null => {
      if (mine.length !== cpus.length) return null;
      const solvedAt = (list: Turn[]) => {
        const i = list.findIndex((t) => isSolved(t, CPU_DIGITS));
        return i < 0 ? null : i + 1;
      };
      const first = firstIsUser ? mine : cpus;
      const second = firstIsUser ? cpus : mine;
      const result = matchOutcome(solvedAt(first), solvedAt(second));
      if (result === null) return null;
      const userWon = (result === 'first') === firstIsUser;
      const o = result === 'draw' ? 'draw' : userWon ? 'win' : 'loss';
      setOutcome(o);
      setPhase('over');
      const r = records.finish(o === 'win' ? { outcome: o, moves: mine.length } : { outcome: o }, variant);
      setImproved(r.improved);
      trackToolUse('hit-blow', `cpu-${o}`);
      return result;
    },
    [records, variant],
  );

  /** CPU の 1 手（間を置いてから） */
  const cpuMove = useCallback(
    (mine: Turn[], cpus: Turn[], firstIsUser: boolean, hidden: Code) => {
      setPhase('cpu-thinking');
      clearCpuTimer();
      cpuTimer.current = window.setTimeout(() => {
        cpuTimer.current = null;
        // CPU に渡すのは自分の手とヒントだけ（利用者の数は渡さない）
        const guess = cpuGuess(level, cpus, Math.random, CPU_DIGITS);
        const next = [...cpus, { guess, ...score(hidden, guess) }];
        setCpuTurns(next);
        if (settleMatch(mine, next, firstIsUser) === null) setPhase('playing');
      }, CPU_DELAY_MS);
    },
    [level, settleMatch],
  );

  /** 対戦：利用者の数を決めて始める */
  const beginMatch = useCallback(
    (hidden: Code) => {
      setUserSecret(hidden);
      setInput('');
      setNote('');
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      if (userFirstNow) setPhase('playing');
      else cpuMove([], [], false, hidden);
      // 次の局は先手・後手を入れ替える
      setUserFirst(!userFirstNow);
    },
    [userFirstNow, records, variant, cpuMove],
  );

  /** 推測を出す */
  const submit = useCallback(() => {
    if (phase !== 'playing' && phase !== 'setup') return;
    if (!isValidCode(input, width)) {
      setNote(`${width}桁そろえてから「決定」`);
      return;
    }
    if (phase === 'setup') {
      beginMatch(input);
      return;
    }
    if (turns.some((t) => t.guess === input)) {
      setNote(`${input} はもう出しました`);
      return;
    }
    const fb = score(secret, input);
    const next = [...turns, { guess: input, ...fb }];
    setTurns(next);
    setInput('');
    setNote('');
    setHint(null);
    if (!counted.current) {
      counted.current = true;
      records.start(variant);
    }
    if (mode === 'daily') writeDailyProgress(browserStorage(), { dateKey: today, guesses: next.map((t) => t.guess) });

    if (mode === 'cpu') {
      if (settleMatch(next, cpuTurns, userFirstNow) === null) cpuMove(next, cpuTurns, userFirstNow, userSecret);
      return;
    }
    if (!isSolved(fb, width)) return;
    setPhase('over');
    if (mode === 'daily') {
      setStreak(nextStreak(entry.lastClearedOn, today, entry.streak));
      const r = records.finish({ outcome: 'win', moves: next.length, clearedOn: today }, variant);
      setImproved(r.improved);
      trackToolUse('hit-blow', 'daily-clear');
    } else {
      const r = records.finish({ outcome: 'win', moves: next.length }, variant);
      setImproved(r.improved);
      trackToolUse('hit-blow', `clear-practice-${width}`);
    }
  }, [
    phase,
    input,
    width,
    beginMatch,
    turns,
    secret,
    records,
    variant,
    mode,
    today,
    settleMatch,
    cpuTurns,
    userFirstNow,
    cpuMove,
    userSecret,
    entry,
  ]);

  const accepting = phase === 'playing' || phase === 'setup';
  const readyToSubmit = accepting && input.length === width;

  const pressDigit = useCallback(
    (d: string) => {
      if (memoMode && phase !== 'setup') {
        const i = Number(d);
        setMemo((m) => m.map((v, k) => (k === i ? NEXT_MEMO[v] : v)));
        return;
      }
      if (!accepting || input.includes(d) || input.length >= width) return;
      setNote('');
      setInput(input + d);
    },
    [memoMode, phase, accepting, input, width],
  );

  const erase = useCallback(() => {
    if (!accepting) return;
    setNote('');
    setInput((s) => s.slice(0, -1));
  }, [accepting]);

  // 物理キーボード：数字・Backspace・Enter
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        erase();
      } else if (e.key === 'Enter') {
        // 桁がそろっていれば、どこにフォーカスがあっても決定にする
        // （直前に押した「後手」などのボタンが Enter で押し直されて、局が始め直しになるのを防ぐ）。
        // そろっていないときはボタンの Enter をそのまま通す
        if (!readyToSubmit && target?.tagName === 'BUTTON') return;
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressDigit, erase, submit, readyToSubmit]);

  const switchMode = (m: Mode) => {
    setMode(m);
    start(m, { digits, firstNow: userFirst, dateKey: today });
  };

  const showHint = () => {
    setHint(remainingCount(turns, DAILY_DIGITS));
    trackToolUse('hit-blow', 'hint');
  };

  const copyResult = () => {
    const text = shareText({ dateKey: today, history: turns, streak: streak ?? streakNow, url: `${SITE_URL}/hit-blow/` });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('hit-blow', 'copy-result');
      },
      () => setCopied(false),
    );
  };

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const solvedDaily = mode === 'daily' && phase === 'over';

  const recordItems = useMemo(() => {
    if (mode === 'daily') {
      return [
        ...(entry.bestMoves ? [{ label: '最少', value: `${entry.bestMoves}手` }] : []),
        ...(streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
      ];
    }
    if (mode === 'practice') {
      return [
        ...(entry.wins ? [{ label: '正解', value: `${entry.wins}回` }] : []),
        ...(entry.bestMoves ? [{ label: '最少', value: `${entry.bestMoves}手` }] : []),
      ];
    }
    const decided = (entry.wins ?? 0) + (entry.losses ?? 0) + (entry.draws ?? 0);
    return decided > 0
      ? [{ label: '戦績', value: `${entry.wins ?? 0}勝${entry.losses ?? 0}敗${entry.draws ? `${entry.draws}分` : ''}` }]
      : [];
  }, [mode, entry, streakNow]);

  /** 状態の行（高さは固定。入れるのは「いま」の 1 件だけ） */
  let status: ReactNode;
  if (phase === 'loading') status = '準備しています…';
  else if (phase === 'setup') status = note || `CPUに当てさせる数（${CPU_DIGITS}桁・重複なし）を決める`;
  else if (phase === 'cpu-thinking') status = 'CPUが考えています…';
  else if (phase === 'over') {
    if (mode === 'cpu') {
      const label = outcome === 'win' ? '🎉 あなたの勝ち！' : outcome === 'loss' ? 'CPUの勝ち' : '引き分け';
      status = (
        <span style={{ fontWeight: 700, color: outcome === 'win' ? 'var(--ok)' : undefined }}>
          {label}（CPUの数 {secret}）<BestBadge improved={improved} />
        </span>
      );
    } else {
      status = (
        <span style={{ fontWeight: 700, color: 'var(--ok)' }}>
          🎉 {turns.length}手で正解！{solvedDaily && streak ? `・連続${streak}日` : ''}
          <BestBadge improved={improved} />
        </span>
      );
    }
  } else if (note) status = note;
  else if (hint !== null) status = `ヒント：残りの候補 ${hint} 通り`;
  else if (memoMode) status = 'メモ：キーで 無い（灰）→ ある（黄）→ 未定';
  else if (mode === 'cpu') status = `あなたの番（${turns.length + 1}手目）`;
  else status = `${width}桁・同じ数字は使わない。${turns.length + 1}手目`;

  const showSecretSlots = phase === 'setup';
  /** 先手・後手の切り替えに出す値。局の途中はこの局の、決着後は次の局の順 */
  const shownFirst = phase === 'over' ? userFirst : userFirstNow;
  const slots = Array.from({ length: width }, (_, i) => input[i] ?? '');

  const renderLog = (list: Turn[], ref: React.RefObject<HTMLDivElement | null>, label: string) => (
    <div className="hb-log" ref={ref} role="log" aria-label={label}>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">推測</th>
            <th scope="col" title="ヒット">H</th>
            <th scope="col" title="ブロー">B</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t, i) => (
            <tr key={i} className={isSolved(t, t.guess.length as Digits) ? 'hb-solved' : undefined}>
              <td>{i + 1}</td>
              <td className="hb-code">{t.guess}</td>
              <td>{t.hit}</td>
              <td>{t.blow}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card hb-game">
      <div className="btn-row hb-modes">
        <div className="seg" role="group" aria-label="モード">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => switchMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* モードごとの設定。行は常に置いて高さを変えない（画面の約束 1・5。スタート・先手後手は畳まない） */}
      <div className="btn-row hb-options">
        {mode === 'daily' && <span className="hb-option-text">4桁・今日は全員同じ数</span>}
        {mode === 'practice' && (
          <div className="seg" role="group" aria-label="桁数">
            {DIGIT_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={d === digits ? 'active' : ''}
                aria-pressed={d === digits}
                onClick={() => {
                  setDigits(d);
                  start('practice', { digits: d, firstNow: userFirst, dateKey: today });
                }}
              >
                {d}桁
              </button>
            ))}
          </div>
        )}
        {mode === 'cpu' && (
          <>
            <div className="seg" role="group" aria-label="CPUの強さ">
              {LEVEL_ORDER.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={l === level ? 'active' : ''}
                  aria-pressed={l === level}
                  onClick={() => {
                    setLevel(l);
                    start('cpu', { digits, firstNow: userFirst, dateKey: today });
                  }}
                >
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="先手・後手">
              {[true, false].map((f) => (
                <button
                  key={String(f)}
                  type="button"
                  className={f === shownFirst ? 'active' : ''}
                  aria-pressed={f === shownFirst}
                  onClick={() => {
                    setUserFirst(f);
                    start('cpu', { digits, firstNow: f, dateKey: today });
                  }}
                >
                  {f ? '先手' : '後手'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <RecordStrip items={recordItems} />

      {mode === 'cpu' ? (
        <>
          {/* 自分の数は切れない場所に置く（ラベルだけが「…」で縮む。#394 のレビュー） */}
          <div className="hb-match-head">
            <span className="hb-match-cell">
              <span className="hb-match-label">あなたの推理（{userFirstNow ? '先手' : '後手'}）</span>
            </span>
            <span className="hb-match-cell">
              <span className="hb-match-label">CPU →</span>
              <strong className="hb-code hb-match-secret" aria-label="あなたの数">
                {userSecret || '----'}
              </strong>
            </span>
          </div>
          <div className="hb-logs hb-logs-2">
            {renderLog(turns, logRef, 'あなたの推理')}
            {renderLog(cpuTurns, cpuLogRef, 'CPUの推理')}
          </div>
        </>
      ) : (
        <div className="hb-logs">{renderLog(turns, logRef, 'これまでの手')}</div>
      )}

      <p className="hb-status" aria-live="polite">
        {status}
      </p>

      <div className={`hb-slots${showSecretSlots ? ' hb-slots-secret' : ''}`} aria-label="入力中の数">
        {slots.map((c, i) => (
          <span key={i} className={`hb-slot${i === input.length && accepting ? ' hb-slot-next' : ''}`}>
            {c}
          </span>
        ))}
      </div>

      <div className="hb-keys" role="group" aria-label="テンキー">
        {KEYS.map((k) => {
          const m = memo[Number(k)];
          const used = input.includes(k);
          const disabled = memoMode && phase !== 'setup' ? false : !accepting || used || input.length >= width;
          return (
            <button
              key={k}
              type="button"
              className={`hb-key hb-memo-${m}${used ? ' hb-key-used' : ''}`}
              disabled={disabled}
              aria-label={m === 'none' ? k : `${k}（メモ：${m === 'no' ? '無い' : 'ある'}）`}
              onClick={() => pressDigit(k)}
            >
              {k}
            </button>
          );
        })}
      </div>

      <div className="hb-actions">
        {phase === 'over' ? (
          <>
            {solvedDaily ? (
              <button type="button" className="btn btn-primary" onClick={copyResult}>
                {copied ? 'コピーしました' : '結果をコピー'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => start(mode, { digits, firstNow: userFirst, dateKey: today })}
              >
                {mode === 'cpu' ? `次の対局（${userFirst ? '先手' : '後手'}）` : '次の問題'}
              </button>
            )}
            {solvedDaily && (
              <button type="button" className="btn" onClick={() => switchMode('practice')}>
                練習へ
              </button>
            )}
          </>
        ) : (
          <>
            {phase === 'setup' ? (
              <button
                key="auto"
                type="button"
                className="btn"
                onClick={() => beginMatch(randomCode(CPU_DIGITS, Math.random))}
              >
                おまかせ
              </button>
            ) : (
              <button
                key="memo"
                type="button"
                className={`btn hb-memo-toggle${memoMode ? ' active' : ''}`}
                aria-pressed={memoMode}
                onClick={() => setMemoMode(!memoMode)}
                disabled={phase !== 'playing' && phase !== 'cpu-thinking'}
              >
                メモ
              </button>
            )}
            {mode === 'daily' && turns.length >= HINT_AFTER_MOVES && phase === 'playing' ? (
              <button type="button" className="btn" onClick={showHint}>
                ヒント
              </button>
            ) : null}
            <button type="button" className="btn" onClick={erase} disabled={!accepting || input.length === 0}>
              消す
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={!accepting || input.length !== width}
            >
              決定
            </button>
          </>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          テンキーで数字を選んで「決定」を押すと、表に<strong>ヒット（H）</strong>と<strong>ブロー（B）</strong>の数が出ます。
          ヒットは数字も場所も合っている数、ブローは数字は合っているが場所が違う数です。
          同じ数字は使えないので、入力済みの数字のキーは押せなくなります。
          「メモ」を押しているあいだは、テンキーで数字の色を「無い（灰）→ ある（黄）→ 未定」と切り替えられます（答えには影響しません）。
          {mode === 'cpu'
            ? '対戦では、先にあなたの数を決めてから交互に当て合います。先手が当てたら、後手は同じ手数目の1手だけ打てます。'
            : mode === 'daily'
              ? `今日の1問は全員同じ数です。${HINT_AFTER_MOVES}手を超えると「ヒント」で残りの候補の数を見られます。`
              : ''}
        </p>
      </details>
    </div>
  );
}
