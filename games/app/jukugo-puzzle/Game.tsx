'use client';

/**
 * 熟語パズル（漢字の穴埋め）の画面。
 *
 * 仕様: docs/features/game-jukugo-anaume.md
 *
 * 出題・別解・誤答・ヒント・読み入力の候補・共有文は `lib/jukugo/`（純関数）が持つ。
 * ここは**入力と描画だけ**。
 *
 * ## 高さを動かさない
 *
 * 状態の行（`.jk-status`）・答える場所（`.jk-answer`）・解説（`.jk-explain`）は `height` で
 * 行数ぶんを確保し、4択と読み入力を切り替えても、解いて解説が出ても盤が動かない（画面の約束 1）。
 *
 * ## スマホで読み入力の欄に自動フォーカスしない
 *
 * キーボードが出て盤が隠れる。既定は4択で、読み入力は切り替えたときだけ（仕様書）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { dailyPuzzle, latestLexicon } from '@/lib/jukugo/daily';
import {
  generatePuzzle,
  isCorrect,
  MAX_HINTS,
  meaningHint,
  readingCandidates,
  readingHint,
  SLOTS,
  TIER_LABEL,
  TIER_ORDER,
  type Puzzle,
  type Slot,
  type Tier,
} from '@/lib/jukugo/generate';
import {
  EMPTY_ATTEMPT,
  isFinished,
  isSolved,
  MODE_LABEL,
  MODE_ORDER,
  readDailyAttempt,
  shareText,
  solvedOnTry,
  tryChar,
  variantOf,
  writeDailyAttempt,
  type Attempt,
  type InputMethod,
  type Mode,
} from '@/lib/jukugo/session';
import { browserStorage, type Improved } from '@/lib/records';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';

const SLUG = 'jukugo-puzzle';

/** 練習で、直近に出した真ん中の字をこの数だけ避ける */
const PRACTICE_AVOID = 12;

/** 盤の矢印（上・左の字から真ん中へ、真ん中から下・右の字へ） */
const ARROW: Record<Slot, string> = { top: '↓', left: '→', bottom: '↓', right: '→' };

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [tier, setTier] = useState<Tier>('sho');
  const [method, setMethod] = useState<InputMethod>('choice');
  const [today, setToday] = useState('');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [attempt, setAttempt] = useState<Attempt>(EMPTY_ATTEMPT);
  const [reading, setReading] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  /** れんしゅう：いま何問続けて正解しているか（記録せず、画面上だけ） */
  const [run, setRun] = useState(0);
  /** きょうの1問：解いた直後の連続日数（記録の更新を待たずに出す） */
  const [streak, setStreak] = useState<number | undefined>(undefined);

  const records = useRecords(SLUG);
  const variant = variantOf(mode, tier);
  const entry = records.entry(variant);
  const recent = useRef<string[]>([]);
  const lex = useMemo(() => latestLexicon(), []);

  /** 問題を出す。きょうの1問は保存してある途中経過から戻す */
  const load = useCallback(
    (nextMode: Mode, nextTier: Tier, dateKey: string) => {
      setReading('');
      setNote('');
      setCopied(false);
      setImproved(null);
      setStreak(undefined);
      if (nextMode === 'daily') {
        const p = dailyPuzzle(dateKey, nextTier);
        setPuzzle(p);
        setAttempt(readDailyAttempt(browserStorage(), dateKey, nextTier));
      } else {
        const p = generatePuzzle(lex, nextTier, Math.random, { avoid: new Set(recent.current) });
        recent.current = [...recent.current, p.answer].slice(-PRACTICE_AVOID);
        setPuzzle(p);
        setAttempt(EMPTY_ATTEMPT);
      }
    },
    [lex],
  );

  // 「今日」と問題はマウント後に決める（静的書き出しの HTML に焼き付けない）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    load('daily', 'sho', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = puzzle !== null && isFinished(puzzle, attempt);
  const solved = puzzle !== null && isSolved(puzzle, attempt);

  const save = (next: Attempt) => {
    setAttempt(next);
    if (mode === 'daily') writeDailyAttempt(browserStorage(), today, tier, next);
  };

  /** 字を1つ試す（4択のボタン・読み入力の候補から） */
  const pick = (ch: string) => {
    if (!puzzle || finished) return;
    if (attempt.tries.includes(ch)) return;
    const first = attempt.tries.length === 0 && !attempt.revealed;
    const next = tryChar(puzzle, attempt, ch);
    if (first) records.start(variant);
    save(next);
    const ok = isCorrect(puzzle, ch);
    if (mode === 'daily') {
      if (!ok) {
        setNote(`×「${ch}」ではありません。もう一度`);
        return;
      }
      setNote('');
      setStreak(nextStreak(entry.lastClearedOn, today, entry.streak));
      const r = records.finish({ outcome: 'win', clearedOn: today }, variant);
      setImproved(r.improved);
      trackToolUse(SLUG, `daily-clear-${tier}`);
      return;
    }
    // れんしゅう：1回目で正解したら連続正解を伸ばす。1回目を外したら連続は切れる
    if (first) {
      if (ok) {
        const n = run + 1;
        setRun(n);
        const r = records.finish({ outcome: 'win', score: n }, variant);
        setImproved(r.improved);
      } else {
        setRun(0);
        records.finish({ outcome: 'loss' }, variant);
      }
    }
    setNote(ok ? '' : `×「${ch}」ではありません。もう一度`);
    if (ok) trackToolUse(SLUG, `practice-clear-${tier}`);
  };

  const showHint = () => {
    if (!puzzle || finished || attempt.hints >= MAX_HINTS) return;
    save({ ...attempt, hints: attempt.hints + 1 });
    setNote('');
    trackToolUse(SLUG, 'hint');
  };

  const reveal = () => {
    if (!puzzle || finished) return;
    const first = attempt.tries.length === 0;
    if (first) records.start(variant);
    save({ ...attempt, revealed: true });
    setNote('');
    if (mode === 'daily') records.finish({ outcome: 'loss' }, variant);
    else if (first) {
      setRun(0);
      records.finish({ outcome: 'loss' }, variant);
    }
    trackToolUse(SLUG, `reveal-${mode}`);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setRun(0);
    load(m, tier, today);
  };

  const switchTier = (t: Tier) => {
    setTier(t);
    setRun(0);
    load(mode, t, today);
  };

  const copyResult = () => {
    if (!puzzle) return;
    const text = shareText({
      dateKey: today,
      puzzle,
      attempt,
      streak: streak ?? streakNow,
      url: `${SITE_URL}/${SLUG}/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse(SLUG, 'copy-result');
      },
      () => setCopied(false),
    );
  };

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);

  const recordItems = useMemo(() => {
    if (mode === 'daily') {
      return [
        ...(entry.wins ? [{ label: '正解', value: `${entry.wins}日` }] : []),
        ...(streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
      ];
    }
    return [
      ...(entry.wins ? [{ label: '正解', value: `${entry.wins}問` }] : []),
      ...(entry.bestScore ? [{ label: '最高', value: `${entry.bestScore}問連続` }] : []),
    ];
  }, [mode, entry, streakNow]);

  const candidates = useMemo(
    () => (puzzle && method === 'reading' ? readingCandidates(lex, puzzle, reading) : []),
    [lex, puzzle, method, reading],
  );

  /** 真ん中に出す字。解けたら選んだ字（別解でも）、答えを見たら答え */
  const solvedWith = puzzle && solved ? attempt.tries.find((c) => isCorrect(puzzle, c)) : undefined;
  const centerChar = solvedWith ?? (finished && puzzle ? puzzle.answer : '');

  // 状態の行（高さは固定。入れるのは「いま」の1件だけ）
  let status: React.ReactNode;
  if (!puzzle) status = '準備しています…';
  else if (solved) {
    const n = solvedOnTry(puzzle, attempt);
    const alt = solvedWith !== puzzle.answer;
    status = (
      <span className="jk-status-ok">
        ○ 正解！{n !== null && n > 1 ? `（${n}回目）` : ''}
        {alt ? `「${solvedWith}」は別解。表の答えは「${puzzle.answer}」` : ''}
        {mode === 'daily' && streak ? `・連続${streak}日` : ''}
        {mode === 'practice' && run > 0 ? `・${run}問連続` : ''}
        <BestBadge improved={improved} />
      </span>
    );
  } else if (attempt.revealed) status = `答えは「${puzzle.answer}」`;
  else if (attempt.hints >= 1) status = readingHint(puzzle).text;
  else if (note) status = <span className="jk-status-ng">{note}</span>;
  else status = mode === 'practice' && run > 0 ? `いま${run}問連続で正解中` : '真ん中に入る漢字は？';

  // 2行目：2回目のヒント（意味）。ヒントを出したあとの「×」はここに出す
  let sub: React.ReactNode = null;
  if (puzzle && !finished && attempt.hints >= 2) sub = meaningHint(puzzle).text;
  else if (puzzle && !finished && attempt.hints >= 1 && note) sub = <span className="jk-status-ng">{note}</span>;
  const hintLines = sub ? <p className="jk-hint-sub">{sub}</p> : null;

  const cell = (slot: Slot) => (
    <span className={`jk-cell jk-${slot}`} aria-label={`${slot === 'top' ? '上' : slot === 'left' ? '左' : slot === 'bottom' ? '下' : '右'}の字`}>
      {puzzle?.clues[slot] ?? ''}
    </span>
  );

  return (
    <div className="card jk-game">
      <div className="btn-row jk-modes">
        <div className="seg" role="group" aria-label="モード">
          {MODE_ORDER.map((m) => (
            <button key={m} type="button" className={m === mode ? 'active' : ''} aria-pressed={m === mode} onClick={() => switchMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="段">
          {TIER_ORDER.map((t) => (
            <button key={t} type="button" className={t === tier ? 'active' : ''} aria-pressed={t === tier} onClick={() => switchTier(t)}>
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <RecordStrip items={recordItems} />

      <div className="jk-board" role="group" aria-label="盤（上・左の字は「その字＋□」、下・右の字は「□＋その字」で熟語になる）">
        {cell('top')}
        <span className="jk-arrow jk-a-top" aria-hidden="true">{ARROW.top}</span>
        {cell('left')}
        <span className="jk-arrow jk-a-left" aria-hidden="true">{ARROW.left}</span>
        <span className={`jk-cell jk-center${finished ? ' jk-center-done' : ''}`} aria-label="真ん中の字">
          {centerChar || '？'}
        </span>
        <span className="jk-arrow jk-a-right" aria-hidden="true">{ARROW.right}</span>
        {cell('right')}
        <span className="jk-arrow jk-a-bottom" aria-hidden="true">{ARROW.bottom}</span>
        {cell('bottom')}
      </div>

      <div className="jk-status" aria-live="polite">
        <p>{status}</p>
        {hintLines}
      </div>

      <div className="jk-answer">
        {method === 'choice' ? (
          <div className="jk-choices" role="group" aria-label="4択">
            {(puzzle?.choices ?? ['', '', '', '']).map((c, i) => {
              const tried = attempt.tries.includes(c);
              const ok = puzzle !== null && isCorrect(puzzle, c);
              const mark = tried || (finished && ok) ? (ok ? '○' : '×') : '';
              return (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  className={`jk-choice${mark === '○' ? ' jk-choice-ok' : mark === '×' ? ' jk-choice-ng' : ''}`}
                  disabled={!puzzle || finished || tried}
                  aria-label={mark ? `${c}（${mark === '○' ? '正解' : 'ちがう'}）` : c}
                  onClick={() => pick(c)}
                >
                  <span className="jk-choice-char">{c}</span>
                  {mark && <span className="jk-choice-mark" aria-hidden="true">{mark}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="jk-reading">
            {/* autoFocus は付けない（スマホでキーボードが出て盤が隠れる。仕様書） */}
            <input
              className="jk-reading-input"
              type="text"
              inputMode="text"
              lang="ja"
              aria-label="真ん中の字の読み（ひらがな）"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="読み（例：びょう）"
              value={reading}
              disabled={!puzzle || finished}
              onChange={(e) => setReading(e.target.value)}
            />
            <div className="jk-candidates" role="group" aria-label="候補の字">
              {reading.trim() && candidates.length === 0 ? (
                <span className="jk-candidates-empty">その読みの字はありません</span>
              ) : null}
              {candidates.map((c) => {
                const tried = attempt.tries.includes(c);
                const ok = puzzle !== null && isCorrect(puzzle, c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`jk-candidate${tried ? (ok ? ' jk-choice-ok' : ' jk-choice-ng') : ''}`}
                    disabled={!puzzle || finished || tried}
                    onClick={() => pick(c)}
                  >
                    {c}
                    {tried && <span className="jk-choice-mark" aria-hidden="true">{ok ? '○' : '×'}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="jk-actions">
        <div className="seg" role="group" aria-label="解き方">
          {(['choice', 'reading'] as const).map((m) => (
            <button key={m} type="button" className={m === method ? 'active' : ''} aria-pressed={m === method} onClick={() => setMethod(m)}>
              {m === 'choice' ? '4択' : '読み'}
            </button>
          ))}
        </div>
        {finished ? (
          mode === 'daily' ? (
            <>
              <button type="button" className="btn btn-primary" onClick={copyResult}>
                {copied ? 'コピーしました' : '結果をコピー'}
              </button>
              <button type="button" className="btn" onClick={() => switchMode('practice')}>
                れんしゅうへ
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => load('practice', tier, today)}>
              次の問題
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn" onClick={showHint} disabled={!puzzle || attempt.hints >= MAX_HINTS}>
              ヒント{attempt.hints > 0 ? `（${attempt.hints}/${MAX_HINTS}）` : ''}
            </button>
            <button type="button" className="btn" onClick={reveal} disabled={!puzzle}>
              答えを見る
            </button>
          </>
        )}
      </div>

      <div className="jk-explain" aria-live="polite">
        {puzzle && finished ? (
          <>
            <ul>
              {SLOTS.map((s) => {
                const w = puzzle.words[s];
                return (
                  <li key={s}>
                    <strong>{w.word}</strong>（{w.reading}）{w.meaning}
                  </li>
                );
              })}
            </ul>
            {puzzle.alternatives.length > 0 && (
              <p className="jk-alt">別解：{puzzle.alternatives.join('・')}（どれも正解）</p>
            )}
          </>
        ) : (
          <p className="jk-explain-empty">解くと、4つの熟語の読みと意味が出ます。</p>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          真ん中の「？」に漢字を1字入れて、上下左右の字とそれぞれ二字熟語を作ります。
          上と左の字は「その字＋□」（矢印の向きに読む）、下と右の字は「□＋その字」です。
          4択か、真ん中の字の読み（ひらがな）を打って出てくる候補から選びます。
          ヒントは2回まで：1回目は熟語を1つ添えて□の読みの最初の1字、2回目は別の熟語の意味です。
          4つとも熟語になる字が答えのほかにもあれば、それも正解（別解）にします。
        </p>
      </details>
    </div>
  );
}
